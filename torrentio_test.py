import requests

try:
    resp = requests.get('https://torrentio.strem.fun/stream/series/tt0944947:1:1.json', timeout=10)
    data = resp.json()
    print("Found streams:", len(data.get('streams', [])))
    for s in data.get('streams', [])[:5]:
        title = s.get('title', '')
        name = s.get('name', '')
        info_hash = s.get('infoHash', '')
        
        # Example: "\n\ud83d\udc64 826 \ud83d\udcbe 841.06 MB \u2699\ufe0f ThePirateBay"
        parts = title.replace('\n', ' ').split()
        seeders = 0
        for i, word in enumerate(parts):
            if '\ud83d\udc64' in word or '👤' in word:
                if i+1 < len(parts) and parts[i+1].isdigit():
                    seeders = int(parts[i+1])
        
        print(f"Name: {name}")
        print(f"Title: {title.strip()}")
        print(f"Hash: {info_hash}")
        print(f"Seeders: {seeders}")
        print("---")
except Exception as e:
    print("Error:", e)
