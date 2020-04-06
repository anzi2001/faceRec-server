import os
import numpy


def getFilePathsWithLabels(mainDir,backToDir):
    pathList = []
    labelList = []
    os.chdir(mainDir)
    dirs = os.listdir(".")
    dirs.sort()
    i = 0
    for i, folder in enumerate(dirs):
        if os.path.isdir(folder):
            print(f"folder is {folder} label is {i}")
            os.chdir(folder)
            for file in os.listdir("."):
                p = os.path.abspath(file)
                pathList.append(p)
                labelList.append(i)
            os.chdir("../")
    os.chdir(backToDir)
    return (pathList, labelList),i+1


def getSingleFolder(mainDir, childDir):
    pathList = []
    os.chdir(mainDir)
    os.chdir(childDir)
    for file in os.listdir("."):
        p = os.path.abspath(file)
        pathList.append(p)
    return pathList
