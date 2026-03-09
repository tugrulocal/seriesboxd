import requests
import re

r = requests.get('https://www.2embed.cc/embedtv/1399&s=1&e=1', headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
print("Status:", r.status_code)

# Extract all URLs referenced in JS calls
urls = re.findall(r"go\('([^']+)'\)", r.text)
print("\nJS go() URLs:")
for u in urls:
    print(" ", u[:200])

# Extract iframe src
iframes = re.findall(r'src=["\'](https[^"\']+)["\']', r.text)
print("\nIframe SRCs:")
for i in iframes:
    print(" ", i[:200])

# look for vpls references
print("\nVPLS lines:")
for line in r.text.split('\n'):
    if 'vpls' in line.lower() or 'boba' in line.lower() or 'viet' in line.lower():
        print(" ", line.strip()[:200])
