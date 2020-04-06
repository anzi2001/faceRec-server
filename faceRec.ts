import * as tf from "@tensorflow/tfjs-node"
import sharp from "sharp"
import fs from "fs"
import discord, { TextChannel } from "discord.js"
import tls from "tls"
import ws from "ws"
import {spawn} from "child_process"
const client = new discord.Client();
const https = require("https").createServer({
	key: fs.readFileSync("/etc/letsencrypt/live/kocjancic.ddns.net/privkey.pem"),
	cert: fs.readFileSync("/etc/letsencrypt/live/kocjancic.ddns.net/fullchain.pem")
});

interface faceObject {
	[key: number]: string;
}

console.log(`simd is ${sharp.simd()}`);
console.log(`concurrency is ${sharp.concurrency()}`);

let model: tf.LayersModel;
let sendChannel: discord.TextChannel;
let faceNames: faceObject;
async function setupFunction() {
	model = await tf.loadLayersModel("file://" + __dirname + "/CNNCropped/model.json");
	faceNames = JSON.parse(await fs.promises.readFile("faces.json", "utf-8"));
	await client.login(await fs.promises.readFile("faceRec_token.key", "utf8"))
}
setupFunction();


let ffmpeg = spawn("ffmpeg",[
	"-framerate",
	"20",
	"-i",
	"-",
	"-c",
	"copy",
	"securityRecording.mp4"
])
ffmpeg.stdout.on("data",data=>{
	console.log(data.toString())
})
ffmpeg.stderr.on("data",data=>{
	console.log(data.toString())
})

tls.createServer({
	key: fs.readFileSync("/etc/letsencrypt/live/kocjancic.ddns.net/privkey.pem"),
	cert: fs.readFileSync("/etc/letsencrypt/live/kocjancic.ddns.net/fullchain.pem")
}, socket => {
	socket.on("data", (buff: Buffer) => {
		console.log("got video data");
		//TODO add ffmpeg transcoding from h264 640x480 20fps
		//Crashes because the file already exists
		//one solution is to have securityRecording.mp4 as base recording and have a second one that is written live
		//once the writing to the second recording ends, append the second one to securityRecording
		//and delete the second recording
		ffmpeg.stdin.write(buff,(err)=>{
			if(err) throw err
		})
	});
	socket.on("close", () => {
		console.log("socket closed")
		//when recording stops socket doesn't close, will have to send something 
		//ffmpeg.stdin.end()
	});
	socket.on("error", err => {
		console.log(err);
		//ffmpeg.stdin.end()

	})
}).listen(3001);

let recognizedFaces: string[] = [];
let recognizedFacesBuffer: Buffer[] = [];

const wss = new ws.Server({
	server: https
});

wss.on("connection", async ws => {
	ws.on("message", async (data: Buffer) => {
		//periodically, update the face recognition model
		if (data.toString() == "updateModel") {
			model = await tf.loadLayersModel("file://" + __dirname + "/CNNCropped/model.json")
			console.log("model reloaded with new data")
		}
		else if(data.toString().startsWith("ip/")){
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
				const image = await sharp(data, {
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
				console.log("faceBuffer is " + recognizedFacesBuffer.length)

				//send image as attachment with time as its name
				const imageTime = new Date().getTime().toString();
				const attachment = new discord.Attachment(image, `${imageTime}.jpg`);
				const embed = new discord.RichEmbed()
					.attachFile(attachment)
					.setImage("attachment://" + imageTime);
				sendChannel.send(`${faceNames[mostLikelyPrediction[0]]} is at the door. Is the guess correct?`, { embed: embed });
			}
		}
	});
	ws.on("error", (err: Error) => {
		console.error(err)
	})
});

client.on("message", async (message: discord.Message) => {
	if (message.content.startsWith("!faceRecBot")) {
		let split = message.content.split(" ");
		if (split[1] == "yes") {
			for (let i = 0; i < recognizedFacesBuffer.length; i++) {
				let imageTime = new Date().getTime().toString() + i.toString();
				writeImageFile(recognizedFaces[i], imageTime, recognizedFacesBuffer[i])
			}
			recognizedFacesBuffer = [];
			recognizedFaces = []
			sendChannel.send("Images are correct, got it")
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
					let imageTime = new Date().getTime().toString()
					writeImageFile(singleMessage, imageTime, recognizedFacesBuffer[index])
					console.log("length of buffer images is " + recognizedFacesBuffer.length)
					sendChannel.send(`images have been written to the correct name`)

				} else {
					console.log("is not in wrongValues")
					let imageTime = new Date().getTime().toString()
					writeImageFile(recognizedFaces[index], imageTime, recognizedFacesBuffer[index])
				}
			}
			console.log("buffer cleared")
			recognizedFacesBuffer = [];
			recognizedFaces = []
		}
	}
})

function writeImageFile(mapName: string, imageName: string, image: Buffer) {
	fs.stat(`tempImages/${mapName}`, async (err, _) => {
		if (err != null) {
			console.log("folder doesnt exist, create it");
			fs.mkdirSync(`tempImages/${mapName}`)

		}
		await fs.promises.writeFile(`tempImages/${mapName}/${imageName}.jpg`, image)
	})
}

client.on("ready", () => {
	sendChannel = client.channels.get("599238758017269792") as TextChannel;
	sendChannel.send("I have connected")
});
https.listen(3000);