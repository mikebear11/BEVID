"""Adaptateur RappelConso GTIN — data.economie.gouv.fr
Sans clé, ~ 18 000 fiches, MAJ horaire, licence ouverte.
"""
from .http_client import fetch_json

RC_URL = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso-v2-gtin-trie/records"


async def fetch_recent(since_iso: str, db=None, limit_per_page: int = 100) -> list[dict]:
    """Rappels dont date_publication >= since_iso."""
    where = f"date_publication>='{since_iso}'"
    all_results = []
    offset = 0
    while True:
        payload = await fetch_json(
            RC_URL, source="rappelconso", db=db, kind="veille",
            params={"where": where, "limit": limit_per_page, "offset": offset,
                    "order_by": "date_publication DESC"},
        )
        results = payload.get("results", [])
        all_results.extend(results)
        total = payload.get("total_count", 0)
        offset += limit_per_page
        if offset >= total or offset >= 5000 or not results:
            break
    return all_results


async def fetch_by_gtin(gtin: str, db=None) -> list[dict]:
    where = f"gtin='{gtin}'"
    payload = await fetch_json(
        RC_URL, source="rappelconso", db=db, kind="gtin-lookup",
        params={"where": where, "limit": 50},
    )
    return payload.get("results", [])
