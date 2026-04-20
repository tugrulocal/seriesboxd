import asyncio
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

async def get_stream_url(imdb_id=None, tmdb_id=None, season=None, episode=None):
    urls_to_try = []
    if imdb_id:
        urls_to_try.append(f"https://multiembed.mov/?video_id={imdb_id}&s={season}&e={episode}")
    if tmdb_id:
        urls_to_try.append(f"https://vidsrc.me/embed/tv?tmdb={tmdb_id}&season={season}&episode={episode}")
        
    stream_url = None
    subtitle_urls = []
    
    async with Stealth().use_async(async_playwright()) as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 720}
        )
        
        for url in urls_to_try:
            if stream_url:
                break
                
            print(f"Testing stealth scraper on: {url}")
            page = await context.new_page()

            async def handle_request(request):
                nonlocal stream_url
                if ".m3u8" in request.url and stream_url is None:
                    print(f"FOUND M3U8: {request.url}")
                    stream_url = request.url
                elif (".vtt" in request.url or ".srt" in request.url) and request.url not in subtitle_urls:
                    subtitle_urls.append(request.url)

            page.on("request", handle_request)
            
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=15000)
                await page.wait_for_timeout(3000)
                
                # Check for iframes
                frames = page.frames
                if len(frames) > 1:
                    print(f"Found {len(frames)} frames. Checking child frames...")
                
                # Click center just in case
                if not stream_url:
                    try:
                        await page.mouse.click(640, 360)
                        await page.wait_for_timeout(3000)
                    except Exception as e:
                        print(f"Click error: {e}")
                
            except Exception as e:
                print(f"Error testing {url}: {e}")
            finally:
                await page.close()
                
        await browser.close()
        
    return {"stream": stream_url, "subtitles": subtitle_urls}

if __name__ == "__main__":
    res = asyncio.run(get_stream_url(imdb_id="tt0944947", tmdb_id="1399", season=1, episode=1))
    print(f"\nFinal Result: {res}")
