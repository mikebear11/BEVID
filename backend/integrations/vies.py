"""Adaptateur VIES — validation TVA intracommunautaire (POST).
Service européen ouvert, sans clé.
"""
import re
import httpx
import logging
import time
import uuid
from datetime import datetime, timezone

VIES_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number"
USER_AGENT = "BEVID/1.0 (support@bevid.fr) - CRM Boisson"
LOG = logging.getLogger("integrations.vies")


async def check_vat(vat_number: str, db=None) -> dict:
    vat = re.sub(r"\s+", "", (vat_number or "")).upper()
    if len(vat) < 4:
        return {"valid": False, "error": "N° TVA trop court"}
    country = vat[:2]
    number = vat[2:]
    if not country.isalpha() or not number:
        return {"valid": False, "error": "Format invalide"}
    run_id = str(uuid.uuid4())
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                VIES_URL,
                json={"countryCode": country, "vatNumber": number},
                headers={"User-Agent": USER_AGENT, "Content-Type": "application/json"},
            )
            r.raise_for_status()
            payload = r.json()
    except Exception as e:
        if db is not None:
            try:
                await db.ingestion_runs.insert_one({
                    "id": run_id, "source": "vies", "kind": "vat-check",
                    "url": VIES_URL, "started_at": datetime.now(timezone.utc).isoformat(),
                    "duration_ms": int((time.monotonic() - started) * 1000),
                    "status": "error", "error": str(e)[:200], "records": 0,
                })
            except Exception:
                pass
        return {"valid": False, "error": f"vies unreachable: {e}"}
    if db is not None:
        try:
            await db.ingestion_runs.insert_one({
                "id": run_id, "source": "vies", "kind": "vat-check",
                "url": VIES_URL, "started_at": datetime.now(timezone.utc).isoformat(),
                "duration_ms": int((time.monotonic() - started) * 1000),
                "status": "ok", "records": 1,
            })
        except Exception:
            pass
    return {
        "valid": bool(payload.get("valid")),
        "name": payload.get("name") or "",
        "address": payload.get("address") or "",
        "country_code": country, "vat_number": vat,
        "request_date": payload.get("requestDate"),
    }
