from gpiozero import MotionSensor
from picamera import PiCamera
import socket
import time
import numpy as np
import asyncio
import cv2 as cv
import websockets

client = socket.socket()
client.connect(("kocjancic.ddns.net", 3001))
connection = client.makefile('wb')

face_cascade_name = "/usr/lib/python3.7/site-packages/cv2/data/haarcascade_frontalface_alt.xml"
face_cascade = cv.CascadeClassifier()

if not face_cascade.load(cv.samples.findFile(face_cascade_name)):
    print('--(!)Error loading face cascade')
    exit(0)

pir = MotionSensor(4)

camera = PiCamera()
camera.resolution = (640, 480)
camera.framerate = 20
camera.start_preview()
time.sleep(2)
imageArray = np.empty((480, 640, 3), dtype=np.uint8)


async def recordAndCapture():
    websocket : websockets.WebSocketClientProtocol = await websockets.connect("wss://kocjancic.ddns.net:3000")
    while True:
        pir.wait_for_motion()
        camera.start_recording(connection, format='h264')
        while pir.motion_detected:
            recordSession(websocket)
        camera.stop_recording()
        await websocket.send(0)

async def recordSession(websocket):
    for i in range(3):
        camera.wait_recording(2)
        camera.capture(imageArray, 'bgr')
        faceFrames = detectAndDisplay(imageArray)
		
        for i in range(len(faceFrames)):
            await websocket.send(faceFrames[i])


def detectAndDisplay(frame):
    faceimg = []
    faces = face_cascade.detectMultiScale(frame)
    for i, (x, y, w, h) in enumerate(faces):
        faceimg.append(frame[y:y+h, x:x+w])
    return faceimg


loop = asyncio.get_event_loop()
loop.run_until_complete(recordAndCapture())
