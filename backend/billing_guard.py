"""Middleware paywall — Lot 4 P4.3.

Intercepte les mutations HTTP (POST/PUT/DELETE/PATCH) sur `/api/*` et renvoie
`HTTP 402 Payment Required` quand l'organisation courante est en état
`read_only` ou `suspended`.

Le calcul de l'état effectif est délégué à `server._compute_effective_status`
mais le middleware n'importe pas server (cycle) — il lit `org_id` depuis le
cookie JWT ou le header Authorization et récupère l'org via Motor.

Exemptions : auth, billing, sync/push (file offline pré-expiration), reporting
d'erreurs, profil, RGPD (export/delete garantit la récupération des données),
webhooks, cron.

**Hook audit 5×404** : le middleware garde un compteur mémoire par (user_id,
minute-2) des mutations qui ont abouti à 404. Au-delà de 5 dans une fenêtre
glissante de 2 minutes, un événement `suspicious_404_burst` est journalisé
dans `audit_logs` — typiquement un ancien membre qui garde un lien après
désaffectation.
"""
import os, re, jwt, uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient


# Chemins exemptés (regex sur le path complet). Un client en lecture seule doit
# TOUJOURS pouvoir : se connecter, payer, exporter, corriger son profil,
# rapporter une erreur, et synchroniser la file offline créée avant expiration.
EXEMPT_PATH_PATTERNS = [
    re.compile(r"^/api/auth(/|$)"),
    re.compile(r"^/api/billing(/|$)"),
    re.compile(r"^/api/stripe(/|$)"),
    re.compile(r"^/api/me/profile$"),
    re.compile(r"^/api/errors$"),
    re.compile(r"^/api/sync/push$"),
    re.compile(r"^/api/rgpd(/|$)"),
    re.compile(r"^/api/cron(/|$)"),
    re.compile(r"^/api/public(/|$)"),
    re.compile(r"^/api/webhook", re.I),
    re.compile(r"^/api/config(/|$)"),
    re.compile(r"^/api/audit(/|$)"),
]
MUTATION_METHODS = {"POST", "PUT", "DELETE", "PATCH"}
JWT_SECRET = os.environ.get("JWT_SECRET", "")
JWT_ALGO = "HS256"

# Audit hook : deque des timestamps de mutations 404 par user_id
_404_BURST_WINDOW_SEC = 120
_404_BURST_THRESHOLD = 5
_404_events: dict = defaultdict(lambda: deque(maxlen=20))
_404_last_alert: dict = {}  # user_id -> ts pour éviter le spam d'audit_logs

_client = None
_db = None


def _get_db():
    global _client, _db
    if _db is None:
        _client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        _db = _client[os.environ["DB_NAME"]]
    return _db


def _extract_token(request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return request.cookies.get("bevid_auth") or None


def _read_only_days_after_trial() -> int:
    try:
        from billing_config import READ_ONLY_DAYS_AFTER_TRIAL
        return READ_ONLY_DAYS_AFTER_TRIAL
    except Exception:
        return 15


def _effective_status_from_org(org: dict) -> str:
    """Copie autonome de la logique côté server.py, enrichie de `past_due`.

    Cycle : trial → active → past_due → read_only (15j) → suspended.
    - `past_due` = statut Stripe transmis via webhook (billing_status_stripe)
    - `read_only` = essai expiré depuis < READ_ONLY_DAYS_AFTER_TRIAL jours OU past_due depuis > 3 jours
    - `suspended` = essai expiré depuis > READ_ONLY_DAYS_AFTER_TRIAL jours
    """
    if org.get("billing_exempt") is True:
        return "active"
    stripe_status = (org.get("billing_status_stripe") or "").lower()
    if stripe_status == "past_due":
        return "past_due"
    if stripe_status in ("canceled", "unpaid"):
        return "suspended"

    now = datetime.now(timezone.utc)
    if org.get("status") == "active":
        return "active"
    trial_ends = org.get("trial_ends_at")
    if not trial_ends:
        return org.get("status") or "trial"
    try:
        te = datetime.fromisoformat(trial_ends.replace("Z", "+00:00"))
    except Exception:
        return org.get("status") or "trial"
    if now < te:
        return "trial"
    days_over = (now - te).days
    if days_over < _read_only_days_after_trial():
        return "read_only"
    return "suspended"


async def _get_effective_status(org_id: str) -> str | None:
    """Lecture systématique en base (find_one indexé sur `id`). Pas de cache :
    on privilégie la fraîcheur (transitions read_only/suspended/past_due doivent
    prendre effet immédiatement après webhook Stripe ou expiration d'essai)."""
    db = _get_db()
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        return None
    return _effective_status_from_org(org)


def invalidate_status(org_id: str) -> None:
    """Compat : aucune action, le middleware lit toujours la valeur fraîche."""
    return None


class BillingGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        method = request.method.upper()
        path = request.url.path
        if method not in MUTATION_METHODS or not path.startswith("/api/"):
            return await call_next(request)
        for pat in EXEMPT_PATH_PATTERNS:
            if pat.search(path):
                return await call_next(request)
        # Récupère user_id + org_id depuis le JWT (sans lever d'exception : pas d'auth → laisser passer)
        token = _extract_token(request)
        user_id = None
        org_id = None
        if token:
            try:
                payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
                user_id = payload.get("sub")
                org_id = payload.get("org")
            except jwt.PyJWTError:
                pass
        if org_id:
            eff = await _get_effective_status(org_id)
            if eff in ("read_only", "suspended"):
                return JSONResponse(
                    status_code=402,
                    content={
                        "error": "billing_blocked",
                        "effective_status": eff,
                        "detail": (
                            "Votre abonnement est en lecture seule. Régularisez la facturation depuis /billing pour reprendre les modifications."
                            if eff == "read_only"
                            else "Votre abonnement est suspendu. Contactez le support ou régularisez depuis /billing."
                        ),
                    },
                )
        # Appel normal — puis hook audit si mutation 404
        response = await call_next(request)
        if response.status_code == 404 and user_id and org_id:
            await _record_404_burst(user_id, org_id, method, path)
        return response


async def _record_404_burst(user_id: str, org_id: str, method: str, path: str) -> None:
    """Journalise un événement `suspicious_404_burst` si un même user cumule
    ≥ 5 mutations 404 en 2 minutes. Cooldown de 10 min entre 2 alertes pour un
    même user (on ne veut pas noyer les audit_logs)."""
    now_ts = datetime.now(timezone.utc).timestamp()
    dq = _404_events[user_id]
    dq.append(now_ts)
    # Purge événements plus anciens que la fenêtre
    while dq and (now_ts - dq[0]) > _404_BURST_WINDOW_SEC:
        dq.popleft()
    if len(dq) < _404_BURST_THRESHOLD:
        return
    last = _404_last_alert.get(user_id, 0)
    if (now_ts - last) < 600:  # cooldown 10 min
        return
    _404_last_alert[user_id] = now_ts
    try:
        db = _get_db()
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "user_id": user_id,
            "action": "suspicious_404_burst",
            "details": {
                "count_in_window": len(dq),
                "window_sec": _404_BURST_WINDOW_SEC,
                "last_method": method,
                "last_path": path,
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        # Un log manqué ne doit jamais casser la requête
        pass
