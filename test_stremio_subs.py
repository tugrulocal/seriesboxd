import json
import urllib.request

url = "https://opensubtitles-v3.strem.io/subtitles/series/tt0944947:1:1.json"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        subs = data.get("subtitles", [])
        langs = set([s.get("lang") for s in subs])
        print("Languages found:", langs)
        tr_subs = [s for s in subs if s.get("lang") == "tur"]
        en_subs = [s for s in subs if s.get("lang") == "eng"]
        print(f"Found {len(tr_subs)} TR and {len(en_subs)} EN subs")
        if tr_subs:
            print("First TR sub:", json.dumps(tr_subs[0], indent=2))
except Exception as e:
    print("Error:", e)
