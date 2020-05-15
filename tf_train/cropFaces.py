import cv2 as cv
import fileDirTest as fdt
import genericTensorFunctions as gtf
import os
import json

face_cascade_name = "/usr/lib/python3.8/site-packages/cv2/data/haarcascade_frontalface_alt.xml"
face_cascade = cv.CascadeClassifier()

def detectAndDisplay(image):
    faceimg = []
    faces  = face_cascade.detectMultiScale(image)
    for x, y, w, h in faces:
        faceimg.append(image[y:y+h, x:x+w])
    return faceimg

if not face_cascade.load(cv.samples.findFile(face_cascade_name)):
    print('--(!)Error loading face cascade')
    exit(0)

facesDict = {}
with open("../faces.json","r") as file:
	facesDict = json.load(file)
print(facesDict)
imagePaths, imageLabels, numberOfPeople = fdt.getFilePathsWithLabels("cropFaces/",os.getcwd(),writeToJson=False)
print(imageLabels)

path : str
for i,path in enumerate(imagePaths):
	image = gtf.numpy_load_image(path,1024)
	faces = detectAndDisplay(image)
	imageName = path.split("/").pop().split(".")[0]
	for j, face in enumerate(faces):
		print("found face")
		bgrface = cv.cvtColor(face,cv.COLOR_RGB2BGR)
		cv.imwrite(f"../tempImages/{facesDict[str(imageLabels[i])]}/{imageName+str(j)}.jpg",bgrface)
	print(imageName)

