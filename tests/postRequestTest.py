import aiohttp
import asyncio
import time

async def post():
	session = aiohttp.ClientSession()
	for i in range(3):
		print(await send(session,"https://kocjancic.ddns.net:3000"))
	await session.close()



async def send(session:aiohttp.ClientSession,url):
	resp:aiohttp.ClientResponse= session.get(url)
	return await resp.text()
	#async with session.get(url) as resp:
	#	return await resp.text()


loop = asyncio.get_event_loop()
loop.run_until_complete(post())