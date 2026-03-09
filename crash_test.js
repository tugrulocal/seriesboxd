const { exec } = require('child_process');
const http = require('http');

const engine = exec('node torrent_engine.js');

engine.stdout.on('data', console.log);
engine.stderr.on('data', console.error);

setTimeout(() => {
    console.log("Sending request...");
    const magnet = 'magnet:?xt=urn:btih:cd3188b38f65e16d82fbbec5fd4cb5a971cfd20f&dn=Game+of+Thrones+Seasons+1+to+8+The+Complete+Box+Set%2FSeries+%5BEnglish+Subs%5D%5BNVEnc+H265+1080p%5D%5BAAC+6Ch%5D&tr=http%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&fileIdx=2';

    http.get(`http://127.0.0.1:8001/stream?magnet=${encodeURIComponent(magnet)}`, (res) => {
        console.log("Response status:", res.statusCode);
    }).on('error', (e) => {
        console.log("Request error:", e.message);
    });
}, 2000);

setTimeout(() => {
    engine.kill();
    process.exit(0);
}, 20000);
