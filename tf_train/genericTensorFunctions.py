import cv2 as cv


def numpy_load_image(imgPath, resizeSize):
    image = cv.imread(imgPath)
    image = cv.cvtColor(image, cv.COLOR_BGR2RGB)
    image = cv.resize(image, (resizeSize, resizeSize))
    return image
