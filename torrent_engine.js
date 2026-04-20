const express = require('express');
const app = express();

(async () => {
    // WebTorrent is an ESM module, so we must import it asynchronously
    const { default: WebTorrent } = await import('webtorrent');
    const client = new WebTorrent({
        maxConns: 100,
        utp: false, // Prevents EACCES bind errors on Windows
    });

    process.on('uncaughtException', (err) => {
        console.error('Uncaught Exception:', err.message);
    });

    process.on('unhandledRejection', (err) => {
        console.error('Unhandled Rejection:', err.message);
    });

    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        next();
    });

    let torrentCache = {};

    app.get('/stream', async (req, res) => {
        const magnet = req.query.magnet;
        if (!magnet) return res.status(400).send('Missing magnet');

        // Extract fileIdx if it exists as a separate query param OR inside the magnet string
        let fileIdx = req.query.fileIdx;
        if (!fileIdx && magnet.includes('&fileIdx=')) {
            const params = new URLSearchParams(magnet.substring(magnet.indexOf('?')));
            fileIdx = params.get('fileIdx');
        }

        if (torrentCache[magnet]) {
            serveTorrent(torrentCache[magnet], fileIdx, req, res);
        } else {
            console.log("Adding torrent to engine...");

            let torrentSource = magnet;
            const match = magnet.match(/xt=urn:btih:([^&]+)/i);
            const infoHash = match ? match[1].toUpperCase() : null;

            if (infoHash) {
                const caches = [
                    `https://itorrents.org/torrent/${infoHash}.torrent`,
                    `https://btcache.me/torrent/${infoHash}`
                ];

                for (const url of caches) {
                    try {
                        console.log(`[${infoHash}] Fetching .torrent from cache: ${url}`);
                        const controller = new AbortController();
                        const timeout = setTimeout(() => controller.abort(), 4000);
                        const fetchRes = await fetch(url, {
                            headers: { 'User-Agent': 'Mozilla/5.0' },
                            signal: controller.signal
                        });
                        clearTimeout(timeout);

                        if (fetchRes.ok) {
                            const arrayBuf = await fetchRes.arrayBuffer();
                            torrentSource = Buffer.from(arrayBuf);
                            console.log(`[${infoHash}] Cache HIT!`);
                            break;
                        }
                    } catch (e) {
                        console.log(`[${infoHash}] Cache MISS: ${e.message}`);
                    }
                }
            }

            client.add(torrentSource, { path: './downloads' }, (torrent) => {
                console.log(`[${torrent.infoHash}] Torrent READY event. Files: ${torrent.files.length}`);
                torrentCache[magnet] = torrent;
                serveTorrent(torrent, fileIdx, req, res);
            });

            // Add event listeners to the most recently added torrent (hacky but works for singleton requests)
            const activeTorrent = client.torrents.find(t => t.magnetURI === magnet || magnet.includes(t.infoHash));
            if (activeTorrent) {
                activeTorrent.on('infoHash', () => console.log(`[${activeTorrent.infoHash}] Info hash resolved.`));
                activeTorrent.on('metadata', () => console.log(`[${activeTorrent.infoHash}] Metadata downloaded completely.`));
                activeTorrent.on('warning', (err) => console.log(`[${activeTorrent.infoHash}] WARNING:`, err.message));

                let lastLog = 0;
                activeTorrent.on('download', (bytes) => {
                    const now = Date.now();
                    if (now - lastLog > 5000) {
                        console.log(`[${activeTorrent.infoHash}] Downloading: ${(activeTorrent.progress * 100).toFixed(1)}% | Speed: ${(activeTorrent.downloadSpeed / 1024).toFixed(1)} KB/s | Peers: ${activeTorrent.numPeers}`);
                        lastLog = now;
                    }
                });
            }
        }
    });

    function serveTorrent(torrent, fileIdx, req, res) {
        let file;
        if (fileIdx !== undefined && fileIdx !== null) {
            file = torrent.files[parseInt(fileIdx)];
        } else {
            file = torrent.files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.mkv') || f.name.endsWith('.avi') || f.name.endsWith('.webm'));
        }

        if (!file) {
            console.log("Video not found. Total files:", torrent.files.length);
            return res.status(404).send('Video not found');
        }

        console.log("Serving file:", file.name);

        const range = req.headers.range;
        const fileSize = file.length;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(206, head);
            const stream = file.createReadStream({ start, end });
            stream.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(200, head);
            const stream = file.createReadStream();
            stream.pipe(res);
        }
    }

    app.listen(8001, () => {
        console.log("Torrent Proxy Engine running on 8001");
    });
})();
