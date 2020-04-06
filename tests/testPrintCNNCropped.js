
(async () => {
	"use strict"
	const tf = require("@tensorflow/tfjs-node")
	const sharp = require("sharp")
	const model = await tf.loadLayersModel("file://" + __dirname + "/CNCropped/model.json")
	console.log("loaded model")
	
	const image = await sharp("00100sPORTRAIT_00100_BURST20190209154018668_COVER.jpg")
		.resize(256, 256)
		.raw()
		.toBuffer()
	console.time("time")
	const prediction = await  model.predict(tf.tensor4d(image, [1,256, 256, 3]).div(255.0)).data()
	const value = await tf.argMax(prediction).data()
	console.timeEnd("time")
	console.log(value[0])
})()
