import tensorflow as tf
import tensorflowjs as tfjs
import numpy
import fileDirTest as fDT
from genericTensorFunctions import numpy_load_image
import websockets
import asyncio
import os
import time


async def updateModel():
	async with websockets.connect("wss://kocjancic.ddns.net:3000") as websocket:
		await websocket.send("updateModel")


class threshHoldCallback(tf.keras.callbacks.Callback):
    times = 0

    def on_epoch_end(self, epoch, logs=None):
        if logs is None:
            logs = {}
        if self.times >= 2:
            self.model.stop_training = True
        if logs.get("sparse_categorical_accuracy") >= 1.0:
            self.times += 1
        else:
            self.times = 0

print(tf.version.VERSION)

(imagePaths, imageLabels),i = fDT.getFilePathsWithLabels("../tempImages",os.getcwd())
print(i)
print(os.getcwd())

readyImages = numpy.empty([len(imageLabels), 256, 256, 3], numpy.int32)
for index, path in enumerate(imagePaths):
    readyImages[index] = numpy_load_image(path, 256)
readyImages = readyImages / 255.0
print(f"image shape is {readyImages.shape}")
del imagePaths

model = tf.keras.Sequential([
    tf.keras.layers.Conv2D(filters=32, kernel_size=(5, 5), input_shape=(256, 256, 3), activation='relu', strides=2),
    tf.keras.layers.MaxPooling2D(2, 2),
    tf.keras.layers.Conv2D(64, (5, 5), activation='relu', strides=2),
    tf.keras.layers.MaxPooling2D(4, 4),
    tf.keras.layers.Flatten(),
    tf.keras.layers.Dense(256, activation='relu'),
    tf.keras.layers.Dense(i, activation='softmax')
])
model.compile(optimizer=tf.keras.optimizers.Adam(),
              loss=tf.keras.losses.SparseCategoricalCrossentropy(),
              metrics=[tf.keras.metrics.SparseCategoricalAccuracy()])
print(imageLabels)
model.fit(readyImages, numpy.array(imageLabels), epochs=50, callbacks=[threshHoldCallback()])

model.save("models/CNNCropped.h5", overwrite=True, include_optimizer=True)

tfjs.converters.save_keras_model(model,"../CNNCropped")
asyncio.get_event_loop().run_until_complete(updateModel())
