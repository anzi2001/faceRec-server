import os
import numpy
import json
from typing import List
from typing import Tuple

def getFilePathsWithLabels(mainDir,backToDir,writeToJson = True) -> Tuple[List[str],List[str], int]:
    pathList = []
    labelList = []
    os.chdir(mainDir)
    dirs = os.listdir(".")
    dirs.sort()
    faces = {}
    i = 0
    for i, folder in enumerate(dirs):
        if os.path.isdir(folder):
            print(f"folder is {folder} label is {i}")
            faces[i] = folder
            os.chdir(folder)
            for file in os.listdir("."):
                p = os.path.abspath(file)
                pathList.append(p)
                labelList.append(i)
            os.chdir("../")
    if(writeToJson):
        with open("../faces.json",'w') as file:
            json.dump(faces,file,ensure_ascii=False)
    os.chdir(backToDir)
    return pathList, labelList,i+1


def getSingleFolder(mainDir, childDir):
    pathList = []
    os.chdir(mainDir)
    os.chdir(childDir)
    for file in os.listdir("."):
        p = os.path.abspath(file)
        pathList.append(p)
    return pathList
