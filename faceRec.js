"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tf = __importStar(require("@tensorflow/tfjs-node"));
const sharp_1 = __importDefault(require("sharp"));
const fs_1 = __importDefault(require("fs"));
const discord_js_1 = __importDefault(require("discord.js"));
const tls_1 = __importDefault(require("tls"));
const ws_1 = __importDefault(require("ws"));
const child_process_1 = require("child_process");
const client = new discord_js_1.default.Client();
const https = require("https").createServer({
    key: fs_1.default.readFileSync("/etc/letsencrypt/live/kocjancic.ddns.net/privkey.pem"),
    cert: fs_1.default.readFileSync("/etc/letsencrypt/live/kocjancic.ddns.net/fullchain.pem")
});
console.log(`simd is ${sharp_1.default.simd()}`);
console.log(`concurrency is ${sharp_1.default.concurrency()}`);
let model;
let sendChannel;
let faceNames;
async function setupFunction() {
    model = await tf.loadLayersModel("file://" + __dirname + "/CNNCropped/model.json");
    faceNames = JSON.parse(await fs_1.default.promises.readFile("faces.json", "utf-8"));
    await client.login(await fs_1.default.promises.readFile("faceRec_token.key", "utf8"));
}
setupFunction();
let ffmpeg = child_process_1.spawn("ffmpeg", [
    "-framerate",
    "20",
    "-i",
    "-",
    "-c",
    "copy",
    "securityRecording.mp4"
]);
ffmpeg.stdout.on("data", data => {
    console.log(data.toString());
});
ffmpeg.stderr.on("data", data => {
    console.log(data.toString());
});
tls_1.default.createServer({
    key: fs_1.default.readFileSync("/etc/letsencrypt/live/kocjancic.ddns.net/privkey.pem"),
    cert: fs_1.default.readFileSync("/etc/letsencrypt/live/kocjancic.ddns.net/fullchain.pem")
}, socket => {
    socket.on("data", (buff) => {
        console.log("got video data");
        //TODO add ffmpeg transcoding from h264 640x480 20fps
        //Crashes because the file already exists
        //one solution is to have securityRecording.mp4 as base recording and have a second one that is written live
        //once the writing to the second recording ends, append the second one to securityRecording
        //and delete the second recording
        ffmpeg.stdin.write(buff, (err) => {
            if (err)
                throw err;
        });
    });
    socket.on("close", () => {
        console.log("socket closed");
        //when recording stops socket doesn't close, will have to send something 
        //ffmpeg.stdin.end()
    });
    socket.on("error", err => {
        console.log(err);
        //ffmpeg.stdin.end()
    });
}).listen(3001);
let recognizedFaces = [];
let recognizedFacesBuffer = [];
const wss = new ws_1.default.Server({
    server: https
});
wss.on("connection", async (ws) => {
    ws.on("message", async (data) => {
        //periodically, update the face recognition model
        if (data.toString() == "updateModel") {
            model = await tf.loadLayersModel("file://" + __dirname + "/CNNCropped/model.json");
            console.log("model reloaded with new data");
        }
        else if (data.toString().startsWith("ip/")) {
            let ip = data.toString().split("/")[1];
            sendChannel.send(`piCamera connected with an ip of ${ip}`);
        }
        else {
            const prediction = await model.predict(tf.tensor4d(data, [1, 256, 256, 3]).div(255.0)).data();
            const mostLikelyPrediction = await tf.argMax(prediction).data();
            console.log(mostLikelyPrediction[0]);
            console.log(faceNames[mostLikelyPrediction[0]]);
            if (!recognizedFaces.includes(faceNames[mostLikelyPrediction[0]])) {
                //resize raw image and reduce quality for discord sending
                const image = await sharp_1.default(data, {
                    raw: {
                        width: 256,
                        height: 256,
                        channels: 3
                    }
                })
                    .jpeg({
                    quality: 90,
                    chromaSubsampling: "4:4:4"
                })
                    .toBuffer();
                //add face to list of recognized faces
                recognizedFaces.push(faceNames[mostLikelyPrediction[0]]);
                recognizedFacesBuffer.push(image);
                console.log("faceBuffer is " + recognizedFacesBuffer.length);
                //send image as attachment with time as its name
                const imageTime = new Date().getTime().toString();
                const attachment = new discord_js_1.default.Attachment(image, `${imageTime}.jpg`);
                const embed = new discord_js_1.default.RichEmbed()
                    .attachFile(attachment)
                    .setImage("attachment://" + imageTime);
                sendChannel.send(`${faceNames[mostLikelyPrediction[0]]} is at the door. Is the guess correct?`, { embed: embed });
            }
        }
    });
    ws.on("error", (err) => {
        console.error(err);
    });
});
client.on("message", async (message) => {
    if (message.content.startsWith("!faceRecBot")) {
        let split = message.content.split(" ");
        if (split[1] == "yes") {
            for (let i = 0; i < recognizedFacesBuffer.length; i++) {
                let imageTime = new Date().getTime().toString() + i.toString();
                writeImageFile(recognizedFaces[i], imageTime, recognizedFacesBuffer[i]);
            }
            recognizedFacesBuffer = [];
            recognizedFaces = [];
            sendChannel.send("Images are correct, got it");
        }
        else {
            sendChannel.send("which of these images is not correct?(e.g. 1 2 3 5)");
            const wrongValues = await sendChannel.awaitMessages(m => m.author.id == message.author.id, { maxMatches: 1 });
            const wrongValuesArray = wrongValues.first().content.split(" ").map(val => parseInt(val) - 1);
            for (let index = 0; index < recognizedFaces.length; index++) {
                if (wrongValuesArray.indexOf(index) != -1) {
                    sendChannel.send(`what's the name of ${index + 1}?`);
                    const messages = await sendChannel.awaitMessages(m => m.author.id == message.author.id, { maxMatches: 1 });
                    const singleMessage = messages.first().content;
                    let imageTime = new Date().getTime().toString();
                    writeImageFile(singleMessage, imageTime, recognizedFacesBuffer[index]);
                    console.log("length of buffer images is " + recognizedFacesBuffer.length);
                    sendChannel.send(`images have been written to the correct name`);
                }
                else {
                    console.log("is not in wrongValues");
                    let imageTime = new Date().getTime().toString();
                    writeImageFile(recognizedFaces[index], imageTime, recognizedFacesBuffer[index]);
                }
            }
            console.log("buffer cleared");
            recognizedFacesBuffer = [];
            recognizedFaces = [];
        }
    }
});
function writeImageFile(mapName, imageName, image) {
    fs_1.default.stat(`tempImages/${mapName}`, async (err, _) => {
        if (err != null) {
            console.log("folder doesnt exist, create it");
            fs_1.default.mkdirSync(`tempImages/${mapName}`);
        }
        await fs_1.default.promises.writeFile(`tempImages/${mapName}/${imageName}.jpg`, image);
    });
}
client.on("ready", () => {
    sendChannel = client.channels.get("599238758017269792");
    sendChannel.send("I have connected");
});
https.listen(3000);
