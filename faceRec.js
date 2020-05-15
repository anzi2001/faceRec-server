"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
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
    model = await tf.loadLayersModel(`file://${__dirname}/CNNCropped/model.json`);
    faceNames = JSON.parse(await fs_1.default.promises.readFile("faces.json", "utf-8"));
    await client.login(await fs_1.default.promises.readFile("faceRec_token.key", "utf8"));
}
setupFunction();
let ffmpeg;
let streamOpened = false;
tls_1.default.createServer({
    key: fs_1.default.readFileSync("/etc/letsencrypt/live/kocjancic.ddns.net/privkey.pem"),
    cert: fs_1.default.readFileSync("/etc/letsencrypt/live/kocjancic.ddns.net/fullchain.pem")
}, socket => {
    socket.on("data", (buff) => {
        if (!streamOpened) {
            ffmpeg = child_process_1.spawn("ffmpeg", [
                "-fflags",
                "+genpts",
                "-framerate",
                "20",
                "-i",
                "-",
                "-c",
                "copy",
                `${newFormattedDate()}.mp4`
            ]);
            ffmpeg.stdout.on("data", data => {
                console.log(data.toString());
            });
            ffmpeg.stderr.on("data", data => {
                console.log(data.toString());
            });
            ffmpeg.stdin.on("end", () => {
                ffmpeg.kill("SIGINT");
                streamOpened = false;
            });
            streamOpened = true;
        }
        ffmpeg.stdin.write(buff, (err) => {
            if (err)
                throw err;
        });
    });
    socket.on("close", () => {
        console.log("ffmpeg stdin stream closed");
        ffmpeg.stdin.end();
        streamOpened = false;
    });
    socket.on("error", err => {
        console.log("ffmpeg stdin stream closed");
        console.log(err);
        ffmpeg.stdin.end();
        streamOpened = false;
    });
}).listen(3001);
function newFormattedDate() {
    const date = new Date();
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}-${date.getMilliseconds()}`;
}
let recognizedFaces = [];
let recognizedFacesBuffer = [];
const wss = new ws_1.default.Server({
    server: https
});
wss.on("connection", async (ws) => {
    ws.on("message", async (data) => {
        //periodically, update the face recognition model
        if (data.toString() == "updateModel") {
            model = await tf.loadLayersModel(`file://${__dirname}/CNNCropped/model.json`);
            console.log("model reloaded with new data");
        }
        else if (data.toString().startsWith("ip/")) {
            const ip = data.toString().split("/")[1];
            sendChannel.send(`piCamera connected with an ip of ${ip}`);
        }
        else {
            const tensorData = tf.tensor4d(data, [1, 256, 256, 3]);
            const prediction = await model.predict(tensorData.div(255.0)).data();
            tensorData.dispose();
            const mostLikelyPrediction = await tf.argMax(prediction).data();
            console.log(faceNames[mostLikelyPrediction[0]]);
            if (!recognizedFaces.includes(faceNames[mostLikelyPrediction[0]])) {
                //resize raw image and reduce quality for discord sending
                const image = await sharp_1.default(data, {
                    raw: {
                        width: 256,
                        height: 256,
                        channels: 3
                    }
                }).jpeg({
                    quality: 90,
                    chromaSubsampling: "4:4:4"
                }).toBuffer();
                //add face to list of recognized faces
                recognizedFaces.push(faceNames[mostLikelyPrediction[0]]);
                recognizedFacesBuffer.push(image);
                console.log("faceBuffer is " + recognizedFacesBuffer.length);
                //send image as attachment with time as its name
                const imageTime = new Date().getTime().toString();
                const attahcment = new discord_js_1.default.MessageAttachment(image, `${imageTime}.jpg`);
                sendChannel.send(`${faceNames[mostLikelyPrediction[0]]} is at the door. Is the guess correct?`, attahcment);
            }
        }
    });
    ws.on("error", (err) => {
        console.error(err);
    });
});
client.on("message", async (message) => {
    if (message.content.startsWith("!faceRecBot")) {
        const split = message.content.split(" ");
        if (split[1] == "yes") {
            recognizedFacesBuffer.forEach((faceBuffer, i) => {
                const imageTime = new Date().getTime().toString() + i.toString();
                writeImageFile(recognizedFaces[i], imageTime, faceBuffer);
            });
            sendChannel.send("Images are correct, got it");
        }
        else {
            sendChannel.send("which of these images is not correct?(e.g. 1 2 3 5)");
            const wrongValues = await sendChannel.awaitMessages(m => m.author.id == message.author.id, { max: 1 });
            const wrongValuesArray = wrongValues.first().content.split(" ").map((val) => parseInt(val) - 1);
            recognizedFacesBuffer.forEach(async (faceBuffer, index) => {
                const imageTime = new Date().getTime().toString();
                if (wrongValuesArray.includes(index)) {
                    sendChannel.send(`what's the name of image ${index + 1}?`);
                    const messages = await sendChannel.awaitMessages(m => m.author.id == message.author.id, { max: 1 });
                    const singleMessage = messages.first().content;
                    writeImageFile(singleMessage, imageTime, faceBuffer);
                    console.log("length of buffer images is " + recognizedFacesBuffer.length);
                    sendChannel.send(`images have been written to the correct name`);
                }
                else {
                    console.log("is not in wrongValues");
                    writeImageFile(recognizedFaces[index], imageTime, faceBuffer);
                }
            });
            console.log("buffer cleared");
        }
        recognizedFacesBuffer = [];
        recognizedFaces = [];
    }
});
async function writeImageFile(mapName, imageName, image) {
    const existsPromise = fs_1.default.promises.stat(`tempImages/${mapName}`);
    existsPromise.catch(err => {
        if (err != null) {
            console.log("folder doesnt exist, create it");
            fs_1.default.mkdirSync(`tempImages/${mapName}`);
        }
    });
    await existsPromise;
    await fs_1.default.promises.writeFile(`tempImages/${mapName}/${imageName}.jpg`, image);
}
client.on("ready", () => {
    sendChannel = client.channels.cache.get("599238758017269792");
    sendChannel.send("I have connected");
});
https.listen(3000);
