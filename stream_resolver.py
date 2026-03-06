"""
Stream resolver: Uses Playwright to intercept m3u8 network requests from VidSrc.
Returns the raw m3u8 URL which can then be proxied through our CORS endpoint.
"""
import asyncio
import sys
import json

async def resolve_m3u8(tmdb_id: int, season: int, episode: int, timeout_ms: int = 15000):
    """
    Opens VidSrc embed in headless browser, intercepts network requests,
    returns the first m3u8 URL found.
    """
    from playwright.async_api import async_playwright
    
    m3u8_urls = []
    referer_map = {}
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 720},
            java_script_enabled=True
        )
        
        page = await context.new_page()
        
        # Intercept ALL network requests for m3u8
        async def handle_response(response):
            url = response.url
            if ".m3u8" in url or "master" in url.lower() or "playlist" in url.lower() or "index.m3u8" in url:
                try:
                    headers = response.headers
                    m3u8_urls.append({
                        "url": url,
                        "status": response.status,
                        "content_type": headers.get("content-type", ""),
                    })
                except:
                    m3u8_urls.append({"url": url, "status": 0})
            # Also capture /is_vip_str.php responses
            if "is_vip_str" in url or "source" in url.lower():
                try:
                    body = await response.text()
                    if ".m3u8" in body or "http" in body:
                        referer_map[url] = body[:500]
                except:
                    pass
        
        page.on("response", handle_response)
        
        # Try multiple VidSrc domains
        urls_to_try = [
            f"https://vidsrc.me/embed/tv?tmdb={tmdb_id}&season={season}&episode={episode}",
            f"https://vidsrc.icu/embed/tv/{tmdb_id}/{season}/{episode}",
        ]
        
        for embed_url in urls_to_try:
            try:
                print(f"Trying: {embed_url}", file=sys.stderr)
                await page.goto(embed_url, wait_until="networkidle", timeout=timeout_ms)
                # Wait a bit more for lazy-loaded streams
                await page.wait_for_timeout(3000)
                
                if m3u8_urls:
                    break
                    
                # Try clicking play button if visible
                try:
                    play_btn = page.locator("button, .play-btn, [class*='play'], .vjs-big-play-button")
                    if await play_btn.count() > 0:
                        await play_btn.first.click()
                        await page.wait_for_timeout(3000)
                except:
                    pass
                    
                if m3u8_urls:
                    break
                    
            except Exception as e:
                print(f"Error with {embed_url}: {e}", file=sys.stderr)
                continue
        
        await browser.close()
    
    result = {
        "m3u8_urls": m3u8_urls,
        "referer_data": referer_map,
        "success": len(m3u8_urls) > 0
    }
    return result


if __name__ == "__main__":
    # Test with Game of Thrones S1E1
    tmdb_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1399
    season = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    episode = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    
    result = asyncio.run(resolve_m3u8(tmdb_id, season, episode))
    print(json.dumps(result, indent=2))
