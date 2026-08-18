"""Adaptateur API Recherche d'entreprises — recherche-entreprises.api.gouv.fr
Sans clé, licence ouverte. Limite officielle : 7 req/s.
"""
from .http_client import fetch_json

RE_URL = "https://recherche-entreprises.api.gouv.fr/search"
RE_NEARBY = "https://recherche-entreprises.api.gouv.fr/near_point"


async def get_by_siren(siren: str, db=None) -> dict | None:
    payload = await fetch_json(
        RE_URL, source="recherche-entreprises", db=db, kind="enrichissement",
        params={"q": siren, "page": 1, "per_page": 1},
    )
    results = payload.get("results") or []
    return results[0] if results else None


async def search_nearby(lat: float, lng: float, radius_km: float,
                       activite_principale: list[str] | None = None,
                       per_page: int = 25, db=None) -> list[dict]:
    """Recherche géographique — max 50 km, per_page ≤ 25 (limite officielle)."""
    per_page = min(per_page, 25)
    radius_km = min(radius_km, 50)
    params = {
        "lat": lat, "long": lng, "radius": radius_km,
        "page": 1, "per_page": per_page, "etat_administratif": "A",
    }
    if activite_principale:
        params["activite_principale"] = ",".join(activite_principale)
    payload = await fetch_json(
        RE_NEARBY, source="recherche-entreprises", db=db, kind="prospection",
        params=params,
    )
    return payload.get("results") or []


def extract_gps(record: dict) -> tuple[float | None, float | None]:
    """Extrait lat/lng depuis un record recherche-entreprises."""
    sup = record.get("siege") or {}
    lat = sup.get("latitude")
    lng = sup.get("longitude")
    try:
        return (float(lat), float(lng)) if lat and lng else (None, None)
    except (ValueError, TypeError):
        return (None, None)


def extract_naf(record: dict) -> tuple[str, str]:
    """Retourne (naf_actuel, naf_2025)."""
    naf = record.get("activite_principale") or ""
    naf25 = record.get("activite_principale_naf25") or ""  # champ officiel API
    return (naf, naf25)
