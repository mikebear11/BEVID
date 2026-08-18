"""Adaptateur Base Adresse Nationale — géocodage + normalisation d'adresse.

API libre, sans clé. https://adresse.data.gouv.fr/api-doc/adresse
Rate limit : 50 req/s (on reste très en dessous via http_client source="ban").
"""
from .http_client_ext import fetch_json_optional_auth

BAN_SEARCH = "https://api-adresse.data.gouv.fr/search/"


async def geocode(adresse: str, code_postal: str | None = None, db=None) -> dict | None:
    """Géocode une adresse. Retourne le meilleur match (score le plus élevé) ou None."""
    q = adresse.strip()
    if code_postal:
        q = f"{q} {code_postal}".strip()
    if not q:
        return None
    payload = await fetch_json_optional_auth(
        BAN_SEARCH, source="ban", db=db, kind="enrichissement-ban",
        params={"q": q, "limit": 1, "autocomplete": 0},
    )
    features = (payload or {}).get("features") or []
    if not features:
        return None
    f = features[0]
    props = f.get("properties") or {}
    coords = (f.get("geometry") or {}).get("coordinates") or [None, None]
    return {
        "adresse_ligne": props.get("label"),
        "code_postal": props.get("postcode"),
        "commune": props.get("city"),
        "insee_commune": props.get("citycode"),
        "lng": coords[0],
        "lat": coords[1],
        "score_geocodage": props.get("score"),
    }
