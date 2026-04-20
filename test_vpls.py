import requests
import re

# Check if there's source param support in VPLS player
r = requests.get(
    'https://streamsrcs.2embed.cc/vpls-tv?tmdb=1399&s=1&e=1',
    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
)
print("Status:", r.status_code)
text = r.text

# Look for source/cdn/boba/wink references
print("\n=== Boba/Wink/source params ===")
for line in text.split('\n'):
    l = line.lower()
    if any(x in l for x in ['boba', 'wink', 'source', 'cdn', 'provider', 'server', 'var s', 'default']):
        stripped = line.strip()
        if stripped:
            print(stripped[:300])

# Find JS variables
print("\n=== JS Config ===")
configs = re.findall(r'(?:var|let|const)\s+\w+\s*=\s*[{\["\'][^;]{0,200}', text)
for c in configs[:10]:
    print(c[:200])
