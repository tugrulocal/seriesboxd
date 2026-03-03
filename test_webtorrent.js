(async () => {
    const { default: WebTorrent } = await import('webtorrent');
    const client = new WebTorrent({ maxConns: 100 });

    const magnet = 'magnet:?xt=urn:btih:cd3188b38f65e16d82fbbec5fd4cb5a971cfd20f&dn=Game+of+Thrones+Seasons+1+to+8+The+Complete+Box+Set%2FSeries+%5BEnglish+Subs%5D%5BNVEnc+H265+1080p%5D%5BAAC+6Ch%5D';

    console.log("Adding torrent...");
    client.add(magnet, { path: './downloads' }, (torrent) => {
        console.log("Torrent ready.");
        console.log("Files found:", torrent.files.length);
        const videoFiles = torrent.files.filter(f => f.name.endsWith('.mp4') || f.name.endsWith('.mkv') || f.name.endsWith('.avi') || f.name.endsWith('.webm'));
        console.log("Video files:", videoFiles.length);
        if (videoFiles.length > 0) {
            console.log("First video file:", videoFiles[0].name);
            console.log("File length:", videoFiles[0].length);
        }
        process.exit(0);
    });

    // Timeout after 15s
    setTimeout(() => {
        console.log("Timeout waiting for torrent metadata.");
        process.exit(1);
    }, 15000);
})();
