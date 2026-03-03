import subprocess
import os
import atexit
import requests
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter()

# Start the Node.js torrent streaming engine in the background
NODE_SCRIPT = os.path.join(os.path.dirname(__file__), "torrent_engine.js")

log_path = os.path.join(os.path.dirname(__file__), "proxy_log.txt")
try:
    log_file = open(log_path, "w")
    node_process = subprocess.Popen(["node", NODE_SCRIPT], stdout=log_file, stderr=subprocess.STDOUT)
except Exception as e:
    print("Warning: Could not start Node.js torrent_engine.js. Ensure node is installed.")
    node_process = None

def cleanup():
    if node_process:
        node_process.terminate()

atexit.register(cleanup)

@router.get("/video-stream")
def video_stream(request: Request, magnet: str):
    """
    Proxies the video stream from the local Node.js proxy to the frontend.
    This hides the Node server from the client and handles TCP/UDP streaming natively.
    """
    if not node_process:
        raise HTTPException(status_code=500, detail="Torrent engine could not be started on backend.")
        
    headers = {}
    if "range" in request.headers:
        headers["Range"] = request.headers["range"]
        
    node_url = f"http://127.0.0.1:8001/stream?magnet={requests.utils.quote(magnet)}"
    
    try:
        r = requests.get(node_url, headers=headers, stream=True)
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail="Could not connect to the torrent engine proxy.")
        
    resp_headers = dict(r.headers)
    # Remove hop-by-hop or content-encoding headers that might interfere with streaming
    resp_headers.pop("transfer-encoding", None)
    resp_headers.pop("content-encoding", None)
    
    # We yield chunks of 1MB from the proxy to the browser natively
    return StreamingResponse(
        r.iter_content(chunk_size=1024 * 1024),
        status_code=r.status_code,
        headers=resp_headers
    )

import urllib.parse
from fastapi import Response

@router.get("/video-stream.m3u")
def get_m3u_playlist(magnet: str):
    """
    VLC gibi harici medya oynatıcılarında açılabilmesi için m3u formatında playlist döner.
    """
    stream_url = f"http://127.0.0.1:8001/stream?magnet={urllib.parse.quote_plus(magnet)}"
    m3u_content = f"#EXTM3U\n#EXTINF:-1, SeriesBoxd Stream\n{stream_url}\n"
    
    return Response(
        content=m3u_content,
        media_type="application/vnd.apple.mpegurl",
        headers={"Content-Disposition": "attachment; filename=\"play_in_vlc.m3u\""}
    )
