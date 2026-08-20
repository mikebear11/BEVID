"""Routes de télémétrie publiques (aucune authentification requise).

- POST /api/errors — ErrorBoundary et fetch keepalive côté front, rate-limité,
  PII scrubbée avant persistance MongoDB.
- POST /api/csp-report — rapports de violation CSP émis par le navigateur,
  rate-limité, journalisés côté serveur uniquement (pas de persistance).

Extraites de server.py (Lot 5 P4 — phase 1 du découpage). Le module ne dépend
d'aucun autre module maison à part `rate_limit` et les fonctions injectées via
`build_router()` — ce qui empêche toute dépendance circulaire avec server.py.
"""

from __future__ import annotations

import hashlib
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Callable

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel


class ErrorReport(BaseModel):
    message: str = ""
    stack: str = ""
    url: str = ""
    user_agent: str = ""


def _scrub_pii(text: str) -> str:
    """Retire emails, JWTs, headers Authorization avant persistance."""
    if not text:
        return ""
    t = re.sub(r"[\w.+-]+@[\w-]+\.[\w.-]+", "[email]", text)
    t = re.sub(r"eyJ[A-Za-z0-9_\-\.]+", "[token]", t)
    t = re.sub(r"Bearer\s+\S+", "Bearer [token]", t, flags=re.I)
    return t[:4000]


def build_router(
    *,
    db,
    client_ip_fn: Callable[[Request], str],
    rate_limit_check: Callable[..., None],
    rate_limit_record: Callable[..., None],
) -> APIRouter:
    """Fabrique le routeur avec injection des dépendances runtime.

    Args:
        db: instance Motor de la base MongoDB (utilisée pour `db.error_reports`).
        client_ip_fn: fonction extrayant l'IP client respectant TRUSTED_PROXIES.
        rate_limit_check: `_rate_limit_check` de server.py — lève 429 si dépassement.
        rate_limit_record: `_rate_limit_record` de server.py — enregistre la tentative.
    """
    router = APIRouter()

    @router.post("/csp-report")
    async def report_csp_violation(request: Request):
        """Endpoint de rapport CSP (envoi navigateur, `application/csp-report`).

        - Rate limité : 60 rapports / 15 min par IP (les navigateurs peuvent en
          émettre plusieurs par chargement de page).
        - Corps tronqué à 4 Ko, journalisé côté fichier serveur uniquement.
        - Aucune persistance MongoDB : usage strict d'observation avant bascule
          CSP bloquante pleinement effective.
        - Silencieux si rate-limité (204) — n'informe jamais le navigateur d'un rejet.
        """
        ip = client_ip_fn(request)
        try:
            rate_limit_check(kind="csp-report", ip=ip, email="", max_attempts=60, window_min=15)
            rate_limit_record(kind="csp-report", ip=ip, email="")
        except HTTPException:
            return Response(status_code=204)
        try:
            raw = (await request.body())[:4096]
            logging.getLogger("bevid.csp").info(
                "csp-violation ip=%s body=%s",
                ip[:32],
                raw.decode("utf-8", "ignore")[:2000],
            )
        except Exception:
            pass
        return Response(status_code=204)

    @router.post("/errors")
    async def report_error(data: ErrorReport, request: Request):
        """Réceptionne les erreurs frontend, tronquées et anonymisées.

        - Rate limité : 20 rapports / 15 min par IP.
        - PII scrubbée avant écriture (emails, JWT, Bearer tokens).
        - Si SENTRY_DSN est défini côté serveur, un hook Sentry peut prendre le relais.
        """
        ip = client_ip_fn(request)
        rate_limit_check(kind="errors", ip=ip, email="", max_attempts=20, window_min=15)
        rate_limit_record(kind="errors", ip=ip, email="")

        doc = {
            "id": str(uuid.uuid4()),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "ip_hash": hashlib.sha256(ip.encode()).hexdigest()[:12],
            "message": _scrub_pii(data.message)[:500],
            "stack": _scrub_pii(data.stack)[:4000],
            "url": _scrub_pii(data.url)[:500],
            "user_agent": (data.user_agent or "")[:200],
        }
        import os
        if os.environ.get("SENTRY_DSN", "").strip():
            logging.getLogger("bevid.errors").warning(
                "sentry-would-send %s %s", doc["message"][:80], doc["url"]
            )
        try:
            await db.error_reports.insert_one(doc)
        except Exception:
            pass
        return {"ok": True, "id": doc["id"]}

    return router
