import requests
import urllib.parse
import time

magnet = 'magnet:?xt=urn:btih:cd3188b38f65e16d82fbbec5fd4cb5a971cfd20f&dn=Game+of+Thrones+Seasons+1+to+8+The+Complete+Box+Set%2FSeries+%5BEnglish+Subs%5D%5BNVEnc+H265+1080p%5D%5BAAC+6Ch%5D&tr=http%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&fileIdx=2'

url = f"http://127.0.0.1:8001/stream?magnet={urllib.parse.quote_plus(magnet)}"

print("Fetching from:", url)

headers = {"Range": "bytes=0-100"}
for i in range(10): # Wait up to 10 seconds for torrent engine to fetch metadata
    try:
        resp = requests.get(url, headers=headers, timeout=5)
        print("Status code:", resp.status_code)
        print("Headers:", resp.headers)
        if resp.status_code in [200, 206]:
            print("Success!")
            break
        elif resp.status_code == 404:
            print("Video not found according to backend")
            break
    except requests.exceptions.RequestException as e:
        print("Request failed:", e)
    print(f"Waiting 2s... (attempt {i+1}/10)")
    time.sleep(2)
