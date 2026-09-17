"""Captures boutiques (N8) sur l'organisation démo — formats exigés par Apple / Google.
Usage : python3 scripts/native/store-screenshots.py   → memory/mobile/store/<format>/<écran>.png
"""
import asyncio, os, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = next((l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL=")), "")
OUT = Path("/app/memory/mobile/store")
FORMATS = {  # (largeur CSS, hauteur CSS, facteur) → pixels exigés
    "iphone-6.7-1290x2796": (430, 932, 3),
    "iphone-6.5-1284x2778": (428, 926, 3),
    "ipad-13-2064x2752": (1032, 1376, 2),
    "android-phone-1080x1920": (360, 640, 3),
    "android-tablet-1600x2560": (800, 1280, 2),
}
ETAB = "c95c79ac-0e58-4849-a41b-5b0040622d18"
SCREENS = [("terrain", "/terrain"), ("fiche-client", f"/etab/{ETAB}"), ("note-visite", f"/etab/{ETAB}/visite"), ("commande", f"/etab/{ETAB}/commande"), ("clients", "/clients")]


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        for name, (w, h, scale) in FORMATS.items():
            ctx = await browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=scale, geolocation={"latitude": 43.331, "longitude": 5.105}, permissions=["geolocation"], locale="fr-FR")
            page = await ctx.new_page()
            await page.goto(f"{BASE}/login", wait_until="networkidle")
            await page.fill("input[type=email]", "commercial.demo@bevidcrm.fr")
            await page.fill("input[type=password]", "Commercial!2026Demo")
            await page.click("button[type=submit]", force=True)
            await page.wait_for_timeout(3500)
            try:
                await page.get_by_text("Refuser").first.click(timeout=1500)
            except Exception:
                pass
            d = OUT / name
            d.mkdir(parents=True, exist_ok=True)
            for sname, path in SCREENS:
                await page.goto(f"{BASE}{path}", wait_until="load")
                await page.wait_for_timeout(2500)
                await page.screenshot(path=str(d / f"{sname}.png"))
                print(name, sname, "OK")
            await ctx.close()
        await browser.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
