"""Wrapper minimal autour de http_client existant, permettant de passer des headers custom.
Réutilise le rate-limiter global. Toutes les nouvelles sources doivent passer par ici.
"""
from typing import Optional
from integrations.http_client import fetch_json


async def fetch_json_optional_auth(
    url: str,
    *,
    source: str,
    db=None,
    kind: str = "query",
    params: Optional[dict] = None,
    headers: Optional[dict] = None,
    timeout: float = 30.0,
    max_retries: int = 3,
) -> dict:
    """Passe simplement à `fetch_json` — expose une API stable pour l'enrichissement."""
    return await fetch_json(
        url, source=source, db=db, kind=kind,
        params=params, headers=headers, timeout=timeout, max_retries=max_retries,
    )
