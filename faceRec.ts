import * as tf from "@tensorflow/tfjs-node"
import sharp from "sharp"
import fs from "fs"
import discord, { TextChannel,AwaitMessagesOptions } from "discord.js"
import tls from "tls"
import ws from "ws"
import {spawn,ChildProcessWithoutNullStreams} from "child_process"
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
	model = await tf.loadLayersModel(`file://${__dirname}/CNNCropped/model.json`);
	faceNames = JSON.parse(await fs.promises.readFile("faces.json", "utf-8"));
	await client.login(await fs.promises.readFile("faceRec_token.key", "utf8"))
}
setupFunction();


let ffmpeg : ChildProcessWithoutNullStreams;

let streamOpened : boolean = false;
tls.createServer({
	key: fs.readFileSync("/etc/letsencrypt/live/kocjancic.ddns.net/privkey.pem"),
	cert: fs.readFileSync("/etc/letsencrypt/live/kocjancic.ddns.net/fullchain.pem")
}, socket => {
	socket.on("data", (buff: Buffer) => {
		if(!streamOpened){
			ffmpeg = spawn("ffmpeg",[
				"-fflags",
				"+genpts",
				"-framerate",
				"20",
				"-i",
				"-",
				"-c",
				"copy",
				`${newFormattedDate()}.mp4`
			])
			ffmpeg.stdout.on("data",data=>{
				console.log(data.toString())
			})
			ffmpeg.stderr.on("data",data=>{
				console.log(data.toString())
			})
			ffmpeg.stdin.on("end",()=>{
				ffmpeg.kill("SIGINT");
				streamOpened = false;
			})
			streamOpened = true;
		}
		ffmpeg.stdin.write(buff,(err)=>{
			if(err) throw err
		})
	});
	socket.on("close", () => { 
		console.log("ffmpeg stdin stream closed");
		ffmpeg.stdin.end()
		streamOpened = false;
	});
	socket.on("error", err => {
		console.log("ffmpeg stdin stream closed");
		console.log(err);
		ffmpeg.stdin.end();
		streamOpened = false;

	})
}).listen(3001);

function newFormattedDate() : string{
	const date = new Date();
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}-${date.getMilliseconds()}`;
}

let recognizedFaces: string[] = [];
let recognizedFacesBuffer: Buffer[] = [];

const wss = new ws.Server({
	server: https
});

wss.on("connection", async ws => {
	ws.on("message", async (data: Buffer) => {
		//periodically, update the face recognition model
		if (data.toString() == "updateModel") {
			model = await tf.loadLayersModel(`file://${__dirname}/CNNCropped/model.json`)
			console.log("model reloaded with new data")
		}
		else if(data.toString().startsWith("ip/")){
			const ip = data.toString().split("/")[1];
			sendChannel.send(`piCamera connected with an ip of ${ip}`);
		}
		else {
			const tensorData = tf.tensor4d(data,[1,256,256,3])
			const prediction = await model.predict(tensorData.div(255.0)).data();
			tensorData.dispose()
			const mostLikelyPrediction = await tf.argMax(prediction).data();
			console.log(faceNames[mostLikelyPrediction[0]]);
			if (!recognizedFaces.includes(faceNames[mostLikelyPrediction[0]])) {
				//resize raw image and reduce quality for discord sending
				const image = await sharp(data, {
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
				console.log("faceBuffer is " + recognizedFacesBuffer.length)

				//send image as attachment with time as its name
				const imageTime = new Date().getTime().toString();
				const attahcment = new discord.MessageAttachment(image,`${imageTime}.jpg`);
				sendChannel.send(`${faceNames[mostLikelyPrediction[0]]} is at the door. Is the guess correct?`,attahcment);
			}
		}
	});
	ws.on("error", (err: Error) => {
		console.error(err)
	})
});

client.on("message", async (message: discord.Message) => {
	if (message.content.startsWith("!faceRecBot")) {
		const split = message.content.split(" ");
		if (split[1] == "yes") {
			recognizedFacesBuffer.forEach((faceBuffer,i)=>{
				const imageTime = new Date().getTime().toString() + i.toString();
				writeImageFile(recognizedFaces[i], imageTime, faceBuffer)
			})
			sendChannel.send("Images are correct, got it")
		}else {
			sendChannel.send("which of these images is not correct?(e.g. 1 2 3 5)");
			const wrongValues = await sendChannel.awaitMessages(m => m.author.id == message.author.id, { max: 1 });
			const wrongValuesArray = wrongValues.first()!.content.split(" ").map((val: string) => parseInt(val) - 1);
			recognizedFacesBuffer.forEach(async (faceBuffer,index)=>{
				const imageTime = new Date().getTime().toString()
				if (wrongValuesArray.includes(index)) {
					sendChannel.send(`what's the name of image ${index + 1}?`);
					const messages = await sendChannel.awaitMessages(m => m.author.id == message.author.id,{ max: 1 });
					const singleMessage = messages.first()!.content;
					writeImageFile(singleMessage, imageTime, faceBuffer)
					console.log("length of buffer images is " + recognizedFacesBuffer.length)
					sendChannel.send(`images have been written to the correct name`)

				} else {
					console.log("is not in wrongValues")
					writeImageFile(recognizedFaces[index], imageTime, faceBuffer)
				}
			})
			console.log("buffer cleared")
		}
		recognizedFacesBuffer = [];
		recognizedFaces = []
	}
})

async function writeImageFile(mapName: string, imageName: string, image: Buffer) {
	const existsPromise = fs.promises.stat(`tempImages/${mapName}`)
	existsPromise.catch(err=>{
		if (err != null) {
			console.log("folder doesnt exist, create it");
			fs.mkdirSync(`tempImages/${mapName}`)
		}
	})
	await existsPromise
	await fs.promises.writeFile(`tempImages/${mapName}/${imageName}.jpg`, image)
}

client.on("ready", () => {
	sendChannel = client.channels.cache.get("599238758017269792") as TextChannel;
	sendChannel.send("I have connected")
});
https.listen(3000);