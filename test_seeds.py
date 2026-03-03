import requests
from bs4 import BeautifulSoup
import urllib.parse
import json

def test():
    query = "The Last of Us S01E01"
    
    print("--- APIBay ---")
    url = f"https://apibay.org/q.php?q={urllib.parse.quote_plus(query)}"
    resp = requests.get(url, timeout=5)
    print(json.dumps(resp.json()[:2], indent=2))
    
    print("\n--- 1337x ---")
    url = f"https://1337x.to/search/{urllib.parse.quote_plus(query)}/1/"
    headers = {"User-Agent": "Mozilla/5.0"}
    resp = requests.get(url, headers=headers, timeout=5)
    soup = BeautifulSoup(resp.text, 'html.parser')
    rows = soup.select("tbody tr")
    for row in rows[:2]:
        name = row.select_one(".name").text.strip()
        seeds = row.select_one(".seeds").text.strip()
        print(f"Name: {name}, Seeds: {seeds}")

    print("\n--- BitSearch ---")
    url = f"https://bitsearch.to/search?q={urllib.parse.quote_plus(query)}"
    resp = requests.get(url, headers=headers, timeout=5)
    soup = BeautifulSoup(resp.text, 'html.parser')
    items = soup.select('li.search-result')
    for item in items[:2]:
        title = item.select_one('h5.title').text.strip()
        stats = item.select('div.stats div')
        # Check stat divs for seeder icon
        seeds = "0"
        for stat in stats:
            if 'Seeder' in stat.get('title', '') or stat.select_one('img[alt="Seeder"]'):
                seeds = stat.text.strip()
        print(f"Name: {title}, Seeds: {seeds}")

test()
