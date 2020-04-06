
(async () => {
	"use strict"
	const tf = require("@tensorflow/tfjs-node")
	const sharp = require("sharp")
	const model = await tf.loadLayersModel("file://" + __dirname + "/MobileNetV2/model.json")
	console.log("loaded model")
	
	const image = await sharp("00100sPORTRAIT_00100_BURST20190209154018668_COVER.jpg")
		.resize(224, 224)
		.raw()
		.toBuffer()
	console.time("time")
	const prediction = await  model.predict(tf.tensor4d(image, [1,224, 224, 3]).div(255.0)).data()
	const value = await tf.argMax(prediction).data()
	console.timeEnd("time")
	console.log(value[0])
})()
