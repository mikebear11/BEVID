"""Client HTTP unifié avec rate limiter par source + tracing dans ingestion_runs.
Aucun autre module ne fait d'appel externe.
"""
import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx

USER_AGENT = "BEVID/1.0 (support@bevid.fr) - CRM Boisson"
LOG = logging.getLogger("integrations.http")

# Limiteurs paramétrables (au lieu de valeurs en dur)
RATE_LIMITS = {
    "bodacc": 7.0,                    # /sec - pas de limite officielle mais on reste courtois
    "recherche-entreprises": 7.0,     # /sec - limite officielle
    "rappelconso": 5.0,               # /sec - opendata
    "insee-melodi": 0.5,              # 30/min
    "datatourisme": 0.2,              # 1000/heure ~ 0.27/s, on reste sous
    "meteofrance": 1.0,
    "vies": 0.5,
}

_locks: dict[str, asyncio.Lock] = {}
_last_call: dict[str, float] = {}


async def _throttle(source: str):
    """Attend le respect du rate limit `source`."""
    rps = RATE_LIMITS.get(source, 1.0)
    interval = 1.0 / rps
    lock = _locks.setdefault(source, asyncio.Lock())
    async with lock:
        last = _last_call.get(source, 0.0)
        now = time.monotonic()
        wait = interval - (now - last)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call[source] = time.monotonic()


async def fetch_json(
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
    """
    GET JSON depuis une API publique.
    - rate limité par source
    - retries backoff jitter sur 5xx / 429
    - trace dans ingestion_runs (si db fourni)
    """
    run_id = str(uuid.uuid4())
    started = time.monotonic()
    started_iso = datetime.now(timezone.utc).isoformat()
    err: Optional[str] = None
    status_code: Optional[int] = None
    payload: Optional[dict] = None

    merged_headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if headers:
        merged_headers.update(headers)

    for attempt in range(max_retries):
        await _throttle(source)
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                r = await client.get(url, params=params, headers=merged_headers)
                status_code = r.status_code
                if r.status_code == 429 or r.status_code >= 500:
                    # backoff jitter
                    delay = min(2 ** attempt + (0.1 * attempt), 30)
                    LOG.warning(f"{source} {r.status_code} attempt {attempt+1} — retry in {delay:.1f}s")
                    await asyncio.sleep(delay)
                    continue
                r.raise_for_status()
                payload = r.json()
                break
        except httpx.HTTPStatusError as e:
            err = f"HTTP {e.response.status_code}: {e.response.text[:200]}"
            break
        except Exception as e:
            err = f"{type(e).__name__}: {e}"
            if attempt == max_retries - 1:
                break
            await asyncio.sleep(min(2 ** attempt, 10))

    duration = time.monotonic() - started
    if db is not None:
        try:
            await db.ingestion_runs.insert_one({
                "id": run_id, "source": source, "kind": kind,
                "url": url, "params": params or {},
                "started_at": started_iso, "duration_ms": int(duration * 1000),
                "status": "ok" if payload is not None else "error",
                "http_status": status_code, "error": err,
                "records": len(payload.get("results", []) if isinstance(payload, dict) else []),
            })
        except Exception as e:
            LOG.error(f"ingestion_runs write failed: {e}")

    if payload is None:
        raise RuntimeError(f"{source} unreachable: {err or 'unknown'}")
    return payload
