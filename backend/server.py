from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Request, Query, Header, Response
from fastapi.responses import StreamingResponse, RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, uuid, jwt, bcrypt, io, csv, base64
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
from emergentintegrations.llm.chat import LlmChat, UserMessage
import httpx, stripe, re, ipaddress
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from twilio.rest import Client as TwilioClient
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# ---------- Rate limiter (in-memory, sliding window) ----------
from rate_limit import check as _rl_check, check_progressive as _rl_check_progressive, record as _rl_record, clear as _rl_clear


# ---------- Trusted proxies : ne fait confiance à X-Forwarded-For que si le hop
# immédiat provient d'un proxy connu (env TRUSTED_PROXIES, liste CIDR/IP séparée
# par virgules). Sinon on ignore l'en-tête et on prend l'IP de la socket.
def _parse_trusted_proxies() -> list:
    raw = os.environ.get("TRUSTED_PROXIES", "").strip()
    if not raw:
        return []
    nets = []
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        try:
            nets.append(ipaddress.ip_network(entry, strict=False))
        except ValueError:
            logging.getLogger("bevid.security").warning("TRUSTED_PROXIES: entrée invalide %r", entry)
    return nets


_TRUSTED_PROXIES = _parse_trusted_proxies()


def _is_trusted(ip_str: str) -> bool:
    if not _TRUSTED_PROXIES:
        return False
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return any(addr in net for net in _TRUSTED_PROXIES)


def _client_ip(request: Request) -> str:
    """Retourne l'IP client réelle.

    Règle : si le hop TCP (request.client.host) est dans TRUSTED_PROXIES,
    on peut prendre l'IP suivante dans X-Forwarded-For (chaîne right-to-left).
    Sinon on retourne le hop TCP direct — X-Forwarded-For est ignoré, un attaquant
    ne peut donc pas forger l'en-tête pour contourner le rate limit.
    """
    socket_ip = request.client.host if request.client else "unknown"
    if not _TRUSTED_PROXIES or not _is_trusted(socket_ip):
        return socket_ip
    # Le hop immédiat est un proxy de confiance : on peut consulter XFF.
    xff = request.headers.get("x-forwarded-for", "").strip()
    if not xff:
        return socket_ip
    chain = [ip.strip() for ip in xff.split(",") if ip.strip()]
    # Parcours right-to-left, on saute les proxies de confiance, on retourne
    # la première IP non-trusted rencontrée.
    for candidate in reversed(chain):
        if not _is_trusted(candidate):
            try:
                ipaddress.ip_address(candidate)  # valide
                return candidate
            except ValueError:
                continue
    return socket_ip


def _rate_limit_check(kind: str, ip: str, email: str, max_attempts: int, window_min: int) -> None:
    """Vérifie 2 clés indépendantes (IP + email) et lève 429 si dépassement.

    Utilisé pour /auth/register (5/15) et /auth/forgot-password (3/15). Pour
    /auth/login, voir _rate_limit_check_login() qui applique une stratégie
    progressive par compte.
    """
    for key in (f"ip:{ip}", f"email:{email}"):
        allowed, retry_after = _rl_check(kind, key, max_attempts, window_min)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=_human_retry_message(retry_after),
                headers={"Retry-After": str(retry_after)},
            )


def _human_retry_message(retry_after_sec: int) -> str:
    """Formate la durée en minutes, vouvoiement."""
    minutes = max(1, (retry_after_sec + 59) // 60)
    unite = "minute" if minutes == 1 else "minutes"
    return f"Trop de tentatives. Réessayez dans {minutes} {unite}."


def _rate_limit_check_login(ip: str, email: str) -> None:
    """Stratégie de login :
    1) IP : garde-fou très permissif (100 échecs / 15 min) — laisse passer le NAT.
    2) Email : blocage progressif par compte, délais 1s/2s/4s/8s, hard cap à 5.

    Le message utilisateur est en minutes et au vouvoiement.
    """
    # Garde-fou IP — permissif pour ne pas bloquer les NAT
    allowed_ip, retry_ip = _rl_check("login_ip", f"ip:{ip}", max_attempts=100, window_min=15)
    if not allowed_ip:
        raise HTTPException(
            status_code=429,
            detail=_human_retry_message(retry_ip),
            headers={"Retry-After": str(retry_ip)},
        )
    # Blocage progressif par compte
    allowed, retry, attempts = _rl_check_progressive(
        kind="login", key=f"email:{email}", hard_cap=5, window_min=15,
        delays=(0, 1, 2, 4, 8),
    )
    if not allowed:
        # Sous 60s : message en secondes ; sinon minutes.
        if retry <= 60:
            msg = f"Trop de tentatives rapides. Patientez {retry} seconde{'s' if retry > 1 else ''}."
        else:
            msg = _human_retry_message(retry)
        raise HTTPException(
            status_code=429,
            detail=msg,
            headers={"Retry-After": str(retry), "X-RateLimit-Attempts": str(attempts)},
        )


def _rate_limit_record(kind: str, ip: str, email: str) -> None:
    _rl_record(kind, f"ip:{ip}")
    _rl_record(kind, f"email:{email}")


def _rate_limit_record_login(ip: str, email: str) -> None:
    """Enregistre un échec de login sur les deux compteurs distincts."""
    _rl_record("login_ip", f"ip:{ip}")
    _rl_record("login", f"email:{email}")


def _rate_limit_clear(kind: str, ip: str, email: str) -> None:
    _rl_clear(kind, f"ip:{ip}")
    _rl_clear(kind, f"email:{email}")


def _rate_limit_clear_login(ip: str, email: str) -> None:
    """Purge les compteurs de login sur succès."""
    _rl_clear("login_ip", f"ip:{ip}")
    _rl_clear("login", f"email:{email}")

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
JWT_SECRET = os.environ.get('JWT_SECRET', 'crm-boisson-secret-2026-change-me')
JWT_ALGO = "HS256"

client = AsyncIOMotorClient(MONGO_URL)
db_raw = client[DB_NAME]
# Wrapper multi-tenant : filtre org_id automatique sur les collections métier
from scoped_db import TenantDB, set_current_org, get_current_org, SCOPED_COLLECTIONS
from tenant_bootstrap import run_tenant_migration, ensure_demo_org, ensure_owner_of_demo, DEMO_ORG_SLUG
db = TenantDB(db_raw)

app = FastAPI(title="CRM Boisson API")
api_router = APIRouter(prefix="/api")
# auto_error=False : on tolère l'absence de Bearer et on retombera sur le cookie httpOnly.
security = HTTPBearer(auto_error=False)

# ---------- Cookie httpOnly d'authentification ----------
AUTH_COOKIE_NAME = "bevid_auth"
AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 90  # 90 jours, aligné sur la durée du JWT

def _set_auth_cookie(response: Response, token: str) -> None:
    """Pose la cookie httpOnly, Secure, SameSite=Lax."""
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=AUTH_COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )

def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=AUTH_COOKIE_NAME, path="/")


# ---------- Gestionnaire 422 : message court, par champ, sans détail Pydantic ----------
FIELD_MESSAGES_FR = {
    "value_error.email": "Adresse email invalide.",
    "value_error.missing": "Champ requis.",
    "value_error.any_str.min_length": "Trop court.",
    "value_error.const": "Valeur non autorisée.",
    "value_error.enum": "Valeur non autorisée.",
    "type_error.bool": "Doit être vrai ou faux.",
    "type_error.str": "Doit être du texte.",
    "type_error.integer": "Doit être un nombre entier.",
    "type_error.float": "Doit être un nombre.",
    "value_error.jsondecode": "Format invalide.",
    "missing": "Champ requis.",
    "string_too_short": "Trop court.",
    "value_error": "Valeur invalide.",
}


def _friendly_message(err: dict) -> str:
    t = err.get("type", "")
    msg = (err.get("msg") or "").lower()
    loc = err.get("loc", [])
    # 1) Détections spécifiques d'abord — avant tout fallback générique
    if "email" in msg or "email" in [str(l) for l in loc] or t == "value_error.email":
        return "Adresse email invalide."
    # 2) Fallback via table de mapping
    if t in FIELD_MESSAGES_FR:
        return FIELD_MESSAGES_FR[t]
    if "missing" in t:
        return "Champ requis."
    return "Valeur invalide."


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    """Convertit toute erreur Pydantic en réponse propre :
       { errors: { field: "message court" } } — jamais de détail technique."""
    errors: dict[str, str] = {}
    for e in exc.errors():
        loc = e.get("loc", [])
        # Retire le préfixe "body"/"query"/"path"
        field_parts = [str(p) for p in loc if p not in ("body", "query", "path")]
        field = field_parts[-1] if field_parts else "form"
        errors[field] = _friendly_message(e)
    return JSONResponse(status_code=422, content={"errors": errors})

# ---------- MODELS ----------
def now_iso():
    return datetime.now(timezone.utc).isoformat()

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    password_confirm: str
    name: str
    language: Literal["fr", "en", "es", "de"] = "fr"
    accept_terms: bool = False
    # NOTE : le rôle n'est PLUS accepté depuis le payload public.
    # Tout compte créé via l'endpoint public est FORCÉ à "commercial".

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    role: str = "commercial"
    language: str = "fr"
    active: bool = True
    must_reset: bool = False
    org_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)

class Client(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: Literal["bar", "restaurant", "caviste", "supermarche", "hotel", "autre"] = "bar"
    contact_name: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    city: Optional[str] = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    notes: Optional[str] = ""
    status: Literal["prospect", "actif", "inactif", "vip"] = "prospect"
    assigned_to: Optional[str] = None
    # === Banking / KYB ===
    iban: Optional[str] = ""
    bic: Optional[str] = ""
    siret: Optional[str] = ""
    siren: Optional[str] = ""
    tva_intra: Optional[str] = ""
    kbis_path: Optional[str] = None
    rib_path: Optional[str] = None
    owner_id: str
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)

class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: Literal["vin", "biere", "spiritueux", "soft", "eau", "autre"] = "vin"
    sku: Optional[str] = ""
    price: float = 0.0
    stock: int = 0
    unit: str = "bouteille"
    # Tarification volumétrique (bière surtout)
    volume_liters: Optional[float] = None
    hecto_tiers: List[dict] = []
    # DRM (Déclaration Récapitulative Mensuelle)
    abv_pct: Optional[float] = None            # degré alcoolique (ex 5.5 pour 5.5%)
    alcohol_type: Optional[str] = None         # 'biere' | 'vin' | 'spiritueux' | None (soft/eau)
    owner_id: str
    created_at: str = Field(default_factory=now_iso)

class OrderLine(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    unit_price: float

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    client_name: str
    lines: List[OrderLine] = []
    total: float = 0.0
    status: Literal["brouillon", "confirme", "livre", "annule"] = "confirme"
    delivery_date: Optional[str] = None
    notes: Optional[str] = ""
    agent_id: str
    owner_id: str
    client_uuid: Optional[str] = None  # idempotence pour resync offline
    created_at: str = Field(default_factory=now_iso)

class Tour(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    date: str
    agent_id: str
    client_ids: List[str] = []
    status: Literal["planifiee", "en_cours", "terminee"] = "planifiee"
    owner_id: str
    created_at: str = Field(default_factory=now_iso)

class Activity(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    agent_id: str
    type: Literal["appel", "visite", "email", "note", "commande"] = "note"
    content: str
    owner_id: str
    created_at: str = Field(default_factory=now_iso)

# ---------- AUTH ----------
def hash_password(pwd: str) -> str:
    return bcrypt.hashpw(pwd.encode(), bcrypt.gensalt()).decode()

def verify_password(pwd: str, hashed: str) -> bool:
    return bcrypt.checkpw(pwd.encode(), hashed.encode())

def create_token(user_id: str, org_id: Optional[str] = None) -> str:
    # Session longue (90j) pour éviter les reconnexions terrain
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=90)}
    if org_id:
        payload["org"] = org_id
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    # 1) Priorité au Bearer explicite (utile pour les clients API, tests, curl)
    token = credentials.credentials if credentials and credentials.credentials else None
    # 2) Fallback sur la cookie httpOnly posée à la connexion
    if not token:
        token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        raise HTTPException(401, "Non authentifié")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload.get("sub")
        # IMPORTANT : lookup direct sur db_raw pour retrouver l'utilisateur SANS
        # scope (l'org n'est pas encore posé dans le contextvar).
        user = await db_raw.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        if not user:
            raise HTTPException(401, "Utilisateur introuvable")
        # Positionne le contextvar org : TOUTES les requêtes DB via `db` seront
        # désormais automatiquement filtrées par org_id.
        set_current_org(user.get("org_id"))
        return user
    except jwt.PyJWTError:
        raise HTTPException(401, "Token invalide")

@api_router.post("/auth/register")
async def register(data: UserRegister, request: Request, response: Response):
    # Vérifie le rate limit AVANT tout traitement (par IP + email)
    ip = _client_ip(request)
    _rate_limit_check(kind="register", ip=ip, email=data.email.lower(), max_attempts=5, window_min=15)

    # Règles serveur (répliquées par le frontend)
    errors: dict[str, str] = {}
    if len(data.password) < 10:
        errors["password"] = "Le mot de passe doit contenir au moins 10 caractères."
    if data.password != data.password_confirm:
        errors["password_confirm"] = "Les deux mots de passe ne correspondent pas."
    if not data.accept_terms:
        errors["accept_terms"] = "Vous devez accepter les CGU et la politique de confidentialité."
    if not data.name or not data.name.strip():
        errors["name"] = "Nom requis."
    if errors:
        return JSONResponse(status_code=422, content={"errors": errors})

    # Lookup direct sur db_raw : on cherche dans toutes les orgs
    existing = await db_raw.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(400, "Email déjà utilisé")

    # Multi-tenant : chaque inscription publique crée SA propre organisation.
    # L'auteur devient owner+manager. Aucun rejoint d'org existante en public.
    org_id = str(uuid.uuid4())
    org_name = (data.name or "").strip() or data.email.split("@")[0]
    org_slug_base = re.sub(r"[^a-z0-9]+", "-", org_name.lower()).strip("-") or "org"
    # Slug unique
    slug = org_slug_base
    n = 2
    while await db_raw.organizations.find_one({"slug": slug}):
        slug = f"{org_slug_base}-{n}"; n += 1
    trial_ends = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    org_doc = {
        "id": org_id,
        "name": f"{org_name} · CRM",
        "slug": slug,
        "created_at": now_iso(),
        "owner_user_id": None,   # rempli ci-dessous
        "plan": "pro",           # essai sur le forfait Pro
        "trial_ends_at": trial_ends,
        "status": "trial",
    }
    await db_raw.organizations.insert_one(org_doc)

    # Rôle forcé manager pour le créateur d'org (privilège limité à SON org)
    user = User(email=data.email, name=data.name, role="manager", language=data.language)
    doc = user.model_dump()
    doc["password"] = hash_password(data.password)
    doc["terms_accepted_at"] = now_iso()
    doc["terms_accepted_ip"] = ip
    doc["org_id"] = org_id
    await db_raw.users.insert_one(doc)
    # Owner de l'org = ce user
    await db_raw.organizations.update_one({"id": org_id}, {"$set": {"owner_user_id": user.id}})

    token = create_token(user.id, org_id)
    _set_auth_cookie(response, token)
    set_current_org(org_id)
    out = user.model_dump()
    out["org_id"] = org_id
    org_doc.pop("_id", None)
    return {"token": token, "user": out, "organization": org_doc}

@api_router.put("/auth/language")
async def update_language(data: dict, user=Depends(get_current_user)):
    lang = data.get("language", "fr")
    if lang not in ("fr", "en", "es", "de"):
        raise HTTPException(422, "Langue non supportée")
    await db.users.update_one({"id": user["id"]}, {"$set": {"language": lang}})
    return {"language": lang}

@api_router.post("/auth/login")
async def login(data: UserLogin, request: Request, response: Response):
    ip = _client_ip(request)
    email_norm = data.email.strip().lower()
    _rate_limit_check_login(ip=ip, email=email_norm)

    # Lookup direct sur db_raw : cross-org lookup par email
    doc = await db_raw.users.find_one({"email": email_norm})
    if not doc or not verify_password(data.password, doc["password"]):
        _rate_limit_record_login(ip=ip, email=email_norm)
        raise HTTPException(401, "Identifiants invalides")
    _rate_limit_clear_login(ip=ip, email=email_norm)
    org_id = doc.get("org_id")
    token = create_token(doc["id"], org_id)
    _set_auth_cookie(response, token)
    set_current_org(org_id)
    doc.pop("password", None)
    doc.pop("_id", None)
    return {"token": token, "user": doc}


@api_router.post("/auth/logout")
async def logout(response: Response):
    """Efface la cookie d'authentification. Idempotent : ne renvoie jamais d'erreur."""
    _clear_auth_cookie(response)
    return {"ok": True}


# ---------- Multi-tenant : Organisations & Invitations ----------
class OrgInvitationCreate(BaseModel):
    email: EmailStr
    role: Literal["manager", "commercial"] = "commercial"


def _generate_invitation_token() -> str:
    return uuid.uuid4().hex + uuid.uuid4().hex[:16]


@api_router.get("/org/current")
async def get_current_org_info(user=Depends(get_current_user)):
    """Retourne l'organisation courante du user connecté."""
    org_id = user.get("org_id")
    if not org_id:
        raise HTTPException(404, "Aucune organisation rattachée")
    org = await db_raw.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(404, "Organisation introuvable")
    return org


@api_router.post("/org/invitations")
async def create_invitation(data: OrgInvitationCreate, user=Depends(get_current_user)):
    """Manager uniquement : crée un jeton d'invitation à usage unique, valable 7 jours.
    Envoi email = à brancher via Resend/Twilio (P5). Ici on retourne le lien pour test.
    """
    if user.get("role") != "manager":
        raise HTTPException(403, "Réservé aux managers")
    org_id = user.get("org_id")
    if not org_id:
        raise HTTPException(400, "Compte sans organisation")
    token = _generate_invitation_token()
    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "email": data.email.lower(),
        "role": data.role,
        "token": token,
        "created_at": now_iso(),
        "created_by": user["id"],
        "expires_at": expires_at,
        "accepted_at": None,
        "accepted_by": None,
        "revoked_at": None,
    }
    await db_raw.invitations.insert_one(doc)
    doc.pop("_id", None)
    return {"invitation": doc}


@api_router.get("/org/invitations")
async def list_invitations(user=Depends(get_current_user)):
    if user.get("role") != "manager":
        raise HTTPException(403, "Réservé aux managers")
    org_id = user.get("org_id")
    items = await db_raw.invitations.find(
        {"org_id": org_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return items


@api_router.post("/org/invitations/{inv_id}/revoke")
async def revoke_invitation(inv_id: str, user=Depends(get_current_user)):
    if user.get("role") != "manager":
        raise HTTPException(403, "Réservé aux managers")
    res = await db_raw.invitations.update_one(
        {"id": inv_id, "org_id": user.get("org_id"), "accepted_at": None},
        {"$set": {"revoked_at": now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Invitation introuvable ou déjà acceptée")
    return {"ok": True}


class InvitationAccept(BaseModel):
    token: str
    password: str
    name: Optional[str] = None


@api_router.post("/auth/accept-invitation")
async def accept_invitation(data: InvitationAccept, request: Request, response: Response):
    inv = await db_raw.invitations.find_one({"token": data.token, "_id": {"$exists": True}}) \
          or await db_raw.invitations.find_one({"token": data.token})
    if not inv:
        raise HTTPException(404, "Invitation introuvable")
    if inv.get("accepted_at"):
        raise HTTPException(400, "Invitation déjà utilisée")
    if inv.get("revoked_at"):
        raise HTTPException(400, "Invitation révoquée")
    if inv.get("expires_at") and inv["expires_at"] < now_iso():
        raise HTTPException(400, "Invitation expirée")
    if len(data.password) < 10:
        return JSONResponse(status_code=422, content={"errors": {"password": "10 caractères minimum."}})

    existing = await db_raw.users.find_one({"email": inv["email"]})
    if existing:
        raise HTTPException(400, "Email déjà utilisé")

    user = User(
        email=inv["email"],
        name=(data.name or inv["email"].split("@")[0]),
        role=inv["role"],
        language="fr",
    )
    doc = user.model_dump()
    doc["password"] = hash_password(data.password)
    doc["org_id"] = inv["org_id"]
    doc["invited_by"] = inv.get("created_by")
    await db_raw.users.insert_one(doc)

    # Jeton d'invitation invalidé (usage unique)
    await db_raw.invitations.update_one(
        {"id": inv["id"]},
        {"$set": {"accepted_at": now_iso(), "accepted_by": user.id}},
    )

    token = create_token(user.id, inv["org_id"])
    _set_auth_cookie(response, token)
    set_current_org(inv["org_id"])
    out = user.model_dump()
    out["org_id"] = inv["org_id"]
    return {"token": token, "user": out}


@api_router.get("/org/members")
async def list_org_members(user=Depends(get_current_user)):
    """Liste les membres de l'org courante (managers voient tout, commerciaux se voient)."""
    org_id = user.get("org_id")
    if not org_id:
        return []
    members = await db_raw.users.find(
        {"org_id": org_id},
        {"_id": 0, "password": 0},
    ).sort("created_at", 1).to_list(500)
    return members


# ---------- Reporting d'erreurs client (ErrorBoundary / fetch keepalive) ----------
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


@api_router.post("/errors")
async def report_error(data: ErrorReport, request: Request):
    """Réceptionne les erreurs frontend, tronquées et anonymisées.

    - Rate limité : 20 rapports / 15 min par IP.
    - PII scrubbée avant écriture (emails, JWT, Bearer tokens).
    - Si SENTRY_DSN est défini côté serveur, un hook Sentry peut prendre le relais.
    """
    ip = _client_ip(request)
    _rate_limit_check(kind="errors", ip=ip, email="", max_attempts=20, window_min=15)
    _rate_limit_record(kind="errors", ip=ip, email="")

    import hashlib
    doc = {
        "id": str(uuid.uuid4()),
        "created_at": now_iso(),
        "ip_hash": hashlib.sha256(ip.encode()).hexdigest()[:12],
        "message": _scrub_pii(data.message)[:500],
        "stack": _scrub_pii(data.stack)[:4000],
        "url": _scrub_pii(data.url)[:500],
        "user_agent": (data.user_agent or "")[:200],
    }
    # Hook Sentry — désactivé tant que SENTRY_DSN n'est pas défini
    sentry_dsn = os.environ.get("SENTRY_DSN", "").strip()
    if sentry_dsn:
        # Point d'intégration : si le DSN est là un jour, brancher sentry_sdk ici.
        # Pour ne pas ajouter de dépendance externe non désirée, on log simplement.
        logging.getLogger("bevid.errors").warning(
            "sentry-would-send %s %s", doc["message"][:80], doc["url"]
        )
    try:
        await db.error_reports.insert_one(doc)
    except Exception:
        pass
    return {"ok": True, "id": doc["id"]}

@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user

# ---------- CLIENTS ----------
@api_router.get("/clients")
async def list_clients(user=Depends(get_current_user)):
    query = {} if user["role"] == "manager" else {"$or": [{"owner_id": user["id"]}, {"assigned_to": user["id"]}]}
    items = await db.clients.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items

@api_router.post("/clients")
async def create_client(data: dict, user=Depends(get_current_user)):
    data["owner_id"] = user["id"]
    if not data.get("assigned_to"):
        data["assigned_to"] = user["id"]
    c = Client(**data)
    await db.clients.insert_one(c.model_dump())
    return c.model_dump()

@api_router.get("/clients/{client_id}")
async def get_client(client_id: str, user=Depends(get_current_user)):
    c = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Client introuvable")
    return c

@api_router.put("/clients/{client_id}")
async def update_client(client_id: str, data: dict, user=Depends(get_current_user)):
    data["updated_at"] = now_iso()
    data.pop("id", None); data.pop("_id", None); data.pop("owner_id", None)
    res = await db.clients.update_one({"id": client_id}, {"$set": data})
    if res.matched_count == 0:
        raise HTTPException(404, "Client introuvable")
    return await db.clients.find_one({"id": client_id}, {"_id": 0})

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user=Depends(get_current_user)):
    res = await db.clients.delete_one({"id": client_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Client introuvable")
    return {"ok": True}

# ---------- PRODUCTS ----------
@api_router.get("/products")
async def list_products(user=Depends(get_current_user)):
    items = await db.products.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    return items

@api_router.post("/products")
async def create_product(data: dict, user=Depends(get_current_user)):
    data["owner_id"] = user["id"]
    p = Product(**data)
    await db.products.insert_one(p.model_dump())
    return p.model_dump()

@api_router.put("/products/{pid}")
async def update_product(pid: str, data: dict, user=Depends(get_current_user)):
    data.pop("id", None); data.pop("_id", None)
    await db.products.update_one({"id": pid}, {"$set": data})
    return await db.products.find_one({"id": pid}, {"_id": 0})

@api_router.delete("/products/{pid}")
async def delete_product(pid: str, user=Depends(get_current_user)):
    await db.products.delete_one({"id": pid})
    return {"ok": True}

# ---------- ORDERS ----------
@api_router.get("/orders")
async def list_orders(user=Depends(get_current_user)):
    query = {} if user["role"] == "manager" else {"agent_id": user["id"]}
    items = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items

@api_router.post("/orders")
async def create_order(data: dict, user=Depends(get_current_user)):
    # Idempotence pour resync offline : même client_uuid → renvoie l'existant
    cu = data.get("client_uuid")
    if cu:
        existing = await db.orders.find_one({"client_uuid": cu}, {"_id": 0})
        if existing:
            return existing
    data["owner_id"] = user["id"]
    data["agent_id"] = data.get("agent_id") or user["id"]
    if not data.get("client_name") and data.get("client_id"):
        c = await db.clients.find_one({"id": data["client_id"]}, {"_id": 0})
        if c:
            data["client_name"] = c["name"]
        else:
            raise HTTPException(422, "client_id introuvable")
    # Détection conflits au resync : credit_status devenu rouge ou stock insuffisant
    conflicts = []
    est = await db.establishments.find_one({"id": data.get("client_id")}, {"_id": 0})
    if est and est.get("credit_status") == "rouge":
        conflicts.append({"type": "credit_red", "detail": "Établissement passé rouge entre-temps"})
    for line in data.get("lines", []):
        p = await db.products.find_one({"id": line["product_id"]}, {"_id": 0})
        if p and (p.get("stock") or 0) < line["quantity"]:
            conflicts.append({"type": "stock", "detail": f"Stock insuffisant pour {p['name']} : {p.get('stock', 0)} < {line['quantity']}"})
    total = sum(l["quantity"] * l["unit_price"] for l in data.get("lines", []))
    data["total"] = total
    inline_sig = data.pop("signature_data_url", None)
    inline_gps = data.pop("signature_gps", None)
    inline_signed_at = data.pop("signature_signed_at", None)
    o = Order(**data)
    doc = o.model_dump()
    if inline_sig:
        doc["signature"] = inline_sig
        doc["signature_gps"] = inline_gps
        doc["signature_signed_at"] = inline_signed_at
    if conflicts:
        doc["has_conflict"] = True
        doc["conflict_reasons"] = conflicts
    await db.orders.insert_one(doc)
    for line in o.lines:
        await db.products.update_one({"id": line.product_id}, {"$inc": {"stock": -line.quantity}})
    await db.activities.insert_one(Activity(
        client_id=o.client_id, agent_id=o.agent_id, type="commande",
        content=f"Commande {o.id[:8]} - {total:.2f}€", owner_id=user["id"]
    ).model_dump())
    # trace conflit pour le manager (server-wins, mais visible)
    for c in conflicts:
        await log_conflict("order", o.id, c["detail"], {"client_id": o.client_id, "client_name": o.client_name, "total": total, "reason_type": c["type"]})
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.put("/orders/{oid}")
async def update_order(oid: str, data: dict, user=Depends(get_current_user)):
    data.pop("id", None); data.pop("_id", None)
    await db.orders.update_one({"id": oid}, {"$set": data})
    return await db.orders.find_one({"id": oid}, {"_id": 0})

# ---------- TOURS ----------
@api_router.get("/tours")
async def list_tours(user=Depends(get_current_user)):
    query = {} if user["role"] == "manager" else {"agent_id": user["id"]}
    items = await db.tours.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return items

@api_router.post("/tours")
async def create_tour(data: dict, user=Depends(get_current_user)):
    data["owner_id"] = user["id"]
    data["agent_id"] = data.get("agent_id") or user["id"]
    t = Tour(**data)
    await db.tours.insert_one(t.model_dump())
    return t.model_dump()

@api_router.put("/tours/{tid}")
async def update_tour(tid: str, data: dict, user=Depends(get_current_user)):
    data.pop("id", None); data.pop("_id", None)
    await db.tours.update_one({"id": tid}, {"$set": data})
    return await db.tours.find_one({"id": tid}, {"_id": 0})

# ---------- ACTIVITIES ----------
@api_router.get("/activities")
async def list_activities(client_id: Optional[str] = None, user=Depends(get_current_user)):
    q = {"client_id": client_id} if client_id else {}
    items = await db.activities.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

@api_router.post("/activities")
async def create_activity(data: dict, user=Depends(get_current_user)):
    data["owner_id"] = user["id"]
    data["agent_id"] = data.get("agent_id") or user["id"]
    a = Activity(**data)
    await db.activities.insert_one(a.model_dump())
    return a.model_dump()

# ---------- AGENTS ----------
@api_router.get("/agents")
async def list_agents(user=Depends(get_current_user)):
    items = await db.users.find({}, {"_id": 0, "password": 0}).to_list(500)
    return items

# ---------- DASHBOARD / REPORTS ----------
@api_router.get("/dashboard/kpis")
async def kpis(user=Depends(get_current_user)):
    is_mgr = user["role"] == "manager"
    order_q = {} if is_mgr else {"agent_id": user["id"]}
    client_q = {} if is_mgr else {"$or": [{"owner_id": user["id"]}, {"assigned_to": user["id"]}]}
    orders = await db.orders.find(order_q, {"_id": 0}).to_list(5000)
    clients = await db.clients.find(client_q, {"_id": 0}).to_list(5000)
    total_ca = sum(o.get("total", 0) for o in orders)
    active_clients = len([c for c in clients if c.get("status") == "actif"])
    vip = len([c for c in clients if c.get("status") == "vip"])
    # revenue by month (last 6)
    from collections import defaultdict
    by_month = defaultdict(float)
    for o in orders:
        m = o.get("created_at", "")[:7]
        by_month[m] += o.get("total", 0)
    chart = [{"month": k, "ca": round(v, 2)} for k, v in sorted(by_month.items())][-6:]
    # top products
    prod_stats = defaultdict(lambda: {"qty": 0, "ca": 0.0, "name": ""})
    for o in orders:
        for l in o.get("lines", []):
            prod_stats[l["product_id"]]["qty"] += l["quantity"]
            prod_stats[l["product_id"]]["ca"] += l["quantity"] * l["unit_price"]
            prod_stats[l["product_id"]]["name"] = l["product_name"]
    top_products = sorted(
        [{"name": v["name"], "qty": v["qty"], "ca": round(v["ca"], 2)} for v in prod_stats.values()],
        key=lambda x: x["ca"], reverse=True
    )[:5]
    return {
        "total_ca": round(total_ca, 2),
        "orders_count": len(orders),
        "clients_count": len(clients),
        "active_clients": active_clients,
        "vip_clients": vip,
        "chart": chart,
        "top_products": top_products,
    }

@api_router.get("/reports/agents-performance")
async def agent_perf(user=Depends(get_current_user)):
    if user["role"] != "manager":
        # only own performance
        agents = [user]
    else:
        agents = await db.users.find({}, {"_id": 0, "password": 0}).to_list(500)
    result = []
    for a in agents:
        orders = await db.orders.find({"agent_id": a["id"]}, {"_id": 0}).to_list(5000)
        clients = await db.clients.count_documents({"assigned_to": a["id"]})
        ca = sum(o.get("total", 0) for o in orders)
        result.append({
            "agent_id": a["id"],
            "name": a["name"],
            "role": a.get("role", "commercial"),
            "orders": len(orders),
            "ca": round(ca, 2),
            "clients": clients,
            "avg_order": round(ca / len(orders), 2) if orders else 0,
        })
    result.sort(key=lambda x: x["ca"], reverse=True)
    return result

# ---------- AI ASSISTANT ----------
class AIRequest(BaseModel):
    prompt: str
    context: Optional[str] = ""
    model: Optional[str] = "claude-sonnet-5"  # or gpt-5.4, gemini-3.1-pro-preview

@api_router.post("/ai/ask")
async def ai_ask(req: AIRequest, user=Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "Clé LLM manquante")
    provider_map = {
        "claude-sonnet-5": ("anthropic", "claude-sonnet-5"),
        "claude-sonnet-4-6": ("anthropic", "claude-sonnet-4-6"),
        "gpt-5.4": ("openai", "gpt-5.4"),
        "gemini-3.1-pro-preview": ("gemini", "gemini-3.1-pro-preview"),
    }
    provider, model_name = provider_map.get(req.model, ("anthropic", "claude-sonnet-5"))
    system_msg = (
        "Tu es l'assistant IA d'un CRM spécialisé dans la distribution de boissons. "
        "Tu aides les commerciaux à mieux gérer leurs comptes bars, restaurants, cavistes. "
        "Réponds en français, sois concis, actionnable et professionnel. "
        "Propose toujours des actions concrètes (next steps) numérotées."
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"crm-{user['id']}-{uuid.uuid4().hex[:8]}",
        system_message=system_msg,
    ).with_model(provider, model_name)
    full_prompt = f"CONTEXTE:\n{req.context}\n\nQUESTION/TÂCHE:\n{req.prompt}" if req.context else req.prompt
    try:
        reply = await chat.send_message(UserMessage(text=full_prompt))
        return {"answer": reply, "model": model_name}
    except Exception as e:
        logging.exception("AI error")
        raise HTTPException(500, f"Erreur IA: {str(e)}")

@api_router.post("/ai/account-insight")
async def account_insight(data: dict, user=Depends(get_current_user)):
    """Génère une analyse pour un compte client."""
    client_id = data.get("client_id")
    model = data.get("model", "claude-sonnet-5")
    c = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Client introuvable")
    orders = await db.orders.find({"client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    activities = await db.activities.find({"client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(20)
    context = f"CLIENT: {c['name']} ({c['type']}) - Statut: {c['status']}\n"
    context += f"Ville: {c.get('city', 'N/A')} - Contact: {c.get('contact_name', 'N/A')}\n"
    context += f"Notes: {c.get('notes', '')}\n\n"
    context += f"COMMANDES ({len(orders)}):\n"
    total_ca = sum(o.get("total", 0) for o in orders)
    context += f"CA total: {total_ca:.2f}€\n"
    for o in orders[:5]:
        context += f"- {o.get('created_at', '')[:10]} : {o.get('total', 0):.2f}€ ({len(o.get('lines', []))} lignes)\n"
    context += f"\nDERNIÈRES ACTIVITÉS:\n"
    for a in activities[:5]:
        context += f"- {a.get('type')}: {a.get('content', '')[:100]}\n"
    prompt = (
        "Analyse ce compte client et fournis: "
        "1) Un diagnostic (santé du compte, tendance) en 2 phrases. "
        "2) 3 recommandations d'actions concrètes prioritaires pour le commercial. "
        "3) Une opportunité de croissance (upsell/cross-sell). "
        "Format: sections claires avec titres en gras."
    )
    req = AIRequest(prompt=prompt, context=context, model=model)
    return await ai_ask(req, user)

# ---------- VOICE PARSE ----------
class VoiceParseRequest(BaseModel):
    transcript: str
    intent: Literal["client", "activity", "order_note"] = "client"

@api_router.post("/ai/parse-voice")
async def parse_voice(req: VoiceParseRequest, user=Depends(get_current_user)):
    """Extrait des champs structurés depuis une transcription vocale."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "Clé LLM manquante")
    if req.intent == "client":
        prompt = (
            "Extrait de ce texte les informations client au format JSON strict avec ces clés: "
            "name (nom établissement), type (bar|restaurant|caviste|supermarche|hotel|autre), "
            "contact_name, phone, email, address, city, notes. "
            "Si une info est absente, mets une chaîne vide. Retourne UNIQUEMENT le JSON, sans markdown.\n\n"
            f"TEXTE: {req.transcript}"
        )
    elif req.intent == "activity":
        prompt = (
            "Extrait au format JSON: type (appel|visite|email|note), content (résumé). "
            "Retourne UNIQUEMENT le JSON.\n\n"
            f"TEXTE: {req.transcript}"
        )
    else:
        prompt = f"Résume en une note commerciale concise:\n{req.transcript}"
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"parse-{uuid.uuid4().hex[:8]}",
        system_message="Tu es un extracteur de données précis. Réponds uniquement le JSON demandé."
    ).with_model("anthropic", "claude-sonnet-5")
    try:
        reply = await chat.send_message(UserMessage(text=prompt))
        # try to parse JSON
        import json, re
        clean = re.sub(r'```json|```', '', reply).strip()
        try:
            parsed = json.loads(clean)
            return {"parsed": parsed, "raw": reply}
        except Exception:
            return {"parsed": None, "raw": reply}
    except Exception as e:
        raise HTTPException(500, f"Erreur parse: {str(e)}")

# ---------- SEED (dev) ----------
@api_router.post("/seed/demo")
async def seed_demo(user=Depends(get_current_user)):
    """Ajoute des données de démo pour l'utilisateur courant."""
    demo_products = [
        {"name": "Château Margaux 2018", "category": "vin", "price": 89.0, "stock": 120, "sku": "VIN-CM18"},
        {"name": "Bière IPA Artisanale 33cl", "category": "biere", "price": 3.5, "stock": 800, "sku": "BR-IPA33"},
        {"name": "Whisky Highland 12 ans", "category": "spiritueux", "price": 45.0, "stock": 60, "sku": "SP-HL12"},
        {"name": "Perrier 1L", "category": "eau", "price": 1.8, "stock": 500, "sku": "EAU-P1L"},
        {"name": "Coca-Cola 33cl", "category": "soft", "price": 1.2, "stock": 1200, "sku": "SFT-COK33"},
        {"name": "Champagne Brut Prestige", "category": "vin", "price": 42.0, "stock": 150, "sku": "VIN-CHP"},
    ]
    demo_clients = [
        {"name": "Le Petit Bistrot", "type": "restaurant", "city": "Paris", "contact_name": "Marc Dubois", "phone": "0612345678", "status": "actif"},
        {"name": "Bar Le Central", "type": "bar", "city": "Lyon", "contact_name": "Sophie Martin", "phone": "0623456789", "status": "vip"},
        {"name": "Cave du Marché", "type": "caviste", "city": "Bordeaux", "contact_name": "Jean Legrand", "phone": "0634567890", "status": "actif"},
        {"name": "Hôtel Belvédère", "type": "hotel", "city": "Nice", "contact_name": "Anna Rossi", "phone": "0645678901", "status": "prospect"},
        {"name": "Supermarché Frais", "type": "supermarche", "city": "Marseille", "contact_name": "Karim Benali", "phone": "0656789012", "status": "actif"},
    ]
    created_products = []
    for p in demo_products:
        p["owner_id"] = user["id"]
        prod = Product(**p)
        await db.products.insert_one(prod.model_dump())
        created_products.append(prod.model_dump())
    created_clients = []
    for c in demo_clients:
        c["owner_id"] = user["id"]
        c["assigned_to"] = user["id"]
        cli = Client(**c)
        await db.clients.insert_one(cli.model_dump())
        created_clients.append(cli.model_dump())
    # a few orders
    import random
    for cli in created_clients[:4]:
        for _ in range(random.randint(1, 3)):
            picks = random.sample(created_products, k=min(3, len(created_products)))
            lines = [OrderLine(product_id=p["id"], product_name=p["name"], quantity=random.randint(2, 20), unit_price=p["price"]).model_dump() for p in picks]
            total = sum(l["quantity"] * l["unit_price"] for l in lines)
            o = Order(client_id=cli["id"], client_name=cli["name"], lines=lines, total=total, agent_id=user["id"], owner_id=user["id"])
            await db.orders.insert_one(o.model_dump())
    return {"ok": True, "products": len(created_products), "clients": len(created_clients)}

# ---------- GEOCODING ----------
@api_router.post("/clients/{cid}/geocode")
async def geocode_client(cid: str, user=Depends(get_current_user)):
    c = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Client introuvable")
    query = ", ".join([x for x in [c.get("address"), c.get("city")] if x]) or c.get("name", "")
    if not query:
        raise HTTPException(400, "Adresse manquante")
    async with httpx.AsyncClient(timeout=10.0) as hx:
        r = await hx.get("https://nominatim.openstreetmap.org/search",
                         params={"q": query, "format": "json", "limit": 1},
                         headers={"User-Agent": "BEVIDCRM/1.0"})
    results = r.json() if r.status_code == 200 else []
    if not results:
        raise HTTPException(404, "Adresse introuvable")
    lat, lng = float(results[0]["lat"]), float(results[0]["lon"])
    await db.clients.update_one({"id": cid}, {"$set": {"lat": lat, "lng": lng, "updated_at": now_iso()}})
    return {"lat": lat, "lng": lng}

@api_router.post("/clients/geocode-all")
async def geocode_all(user=Depends(get_current_user)):
    q = {} if user["role"] == "manager" else {"$or": [{"owner_id": user["id"]}, {"assigned_to": user["id"]}]}
    q["$and"] = [{"$or": [{"lat": None}, {"lat": {"$exists": False}}]}]
    clients = await db.clients.find(q, {"_id": 0}).to_list(200)
    updated = 0
    async with httpx.AsyncClient(timeout=15.0) as hx:
        for c in clients[:30]:  # rate limit
            query = ", ".join([x for x in [c.get("address"), c.get("city")] if x]) or c.get("name", "")
            if not query:
                continue
            try:
                r = await hx.get("https://nominatim.openstreetmap.org/search",
                                 params={"q": query, "format": "json", "limit": 1},
                                 headers={"User-Agent": "BEVIDCRM/1.0"})
                results = r.json() if r.status_code == 200 else []
                if results:
                    await db.clients.update_one({"id": c["id"]},
                        {"$set": {"lat": float(results[0]["lat"]), "lng": float(results[0]["lon"])}})
                    updated += 1
            except Exception:
                pass
    return {"updated": updated, "total_processed": min(len(clients), 30)}

# ---------- PDF ORDER ----------
def _build_order_pdf_bytes(o: dict, c: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=40, bottomMargin=40, leftMargin=50, rightMargin=50)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('T', parent=styles['Title'], textColor=colors.HexColor("#4A154B"), fontSize=26, spaceAfter=6)
    over_style = ParagraphStyle('O', parent=styles['Normal'], fontSize=8, textColor=colors.grey, spaceAfter=20)
    elems = []
    elems.append(Paragraph("BON DE COMMANDE", over_style))
    elems.append(Paragraph(f"BEVID · Commande #{o['id'][:8].upper()}", title_style))
    elems.append(Paragraph(f"Date: {o.get('created_at','')[:10]}", styles['Normal']))
    elems.append(Spacer(1, 16))
    elems.append(Paragraph(f"<b>Client:</b> {o.get('client_name','')}", styles['Normal']))
    if c.get('address') or c.get('city'):
        elems.append(Paragraph(f"{c.get('address','')}, {c.get('city','')}", styles['Normal']))
    if c.get('contact_name'):
        elems.append(Paragraph(f"Contact: {c.get('contact_name')} · {c.get('phone','')}", styles['Normal']))
    elems.append(Spacer(1, 20))
    data = [["Produit", "Qté", "PU (€)", "Total (€)"]]
    for l in o.get("lines", []):
        tot = l["quantity"] * l["unit_price"]
        data.append([l["product_name"], str(l["quantity"]), f"{l['unit_price']:.2f}", f"{tot:.2f}"])
    data.append(["", "", "TOTAL", f"{o.get('total',0):.2f} €"])
    t = Table(data, colWidths=[260, 50, 70, 80])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#4A154B")),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('ALIGN', (1,0), (-1,-1), 'RIGHT'),
        ('GRID', (0,0), (-1,-2), 0.5, colors.HexColor("#E7E4DF")),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#F7F5F2")),
        ('FONTNAME', (2,-1), (-1,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (2,-1), (-1,-1), colors.HexColor("#2D5A4C")),
        ('FONTSIZE', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 8),
    ]))
    elems.append(t)
    if o.get("notes"):
        elems.append(Spacer(1, 18))
        elems.append(Paragraph(f"<b>Notes:</b> {o['notes']}", styles['Normal']))
    elems.append(Spacer(1, 40))
    sig_b64 = o.get("signature")
    if sig_b64 and sig_b64.startswith("data:image"):
        try:
            b = base64.b64decode(sig_b64.split(",", 1)[1])
            img = RLImage(io.BytesIO(b), width=180, height=70)
            elems.append(Paragraph("Signature client:", styles['Normal']))
            elems.append(img)
        except Exception:
            pass
    else:
        elems.append(Paragraph("Signature client: ____________________________", styles['Normal']))
    doc.build(elems)
    buf.seek(0)
    return buf.getvalue()

@api_router.get("/orders/{oid}/pdf")
async def order_pdf(oid: str, user=Depends(get_current_user)):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Commande introuvable")
    c = await db.clients.find_one({"id": o["client_id"]}, {"_id": 0}) or {}
    buf = io.BytesIO(_build_order_pdf_bytes(o, c))
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="commande-{o["id"][:8]}.pdf"'})

@api_router.post("/orders/{oid}/signature")
async def order_signature(oid: str, data: dict, user=Depends(get_current_user)):
    sig = data.get("signature", "")
    await db.orders.update_one({"id": oid}, {"$set": {"signature": sig, "signed_at": now_iso()}})
    return {"ok": True}

# ---------- LOW STOCK ALERTS ----------
@api_router.get("/alerts/low-stock")
async def low_stock(threshold: int = 20, user=Depends(get_current_user)):
    items = await db.products.find({"stock": {"$lt": threshold}}, {"_id": 0}).sort("stock", 1).to_list(200)
    return {"threshold": threshold, "items": items, "count": len(items)}

# ---------- CSV BULK IMPORT ----------
@api_router.post("/clients/bulk-import")
async def bulk_import(file: UploadFile = File(...), user=Depends(get_current_user)):
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    created = 0
    errors = []
    for i, row in enumerate(reader, start=2):
        try:
            data = {
                "name": (row.get("name") or row.get("nom") or "").strip(),
                "type": (row.get("type") or "bar").strip().lower(),
                "contact_name": (row.get("contact_name") or row.get("contact") or "").strip(),
                "phone": (row.get("phone") or row.get("telephone") or "").strip(),
                "email": (row.get("email") or "").strip(),
                "city": (row.get("city") or row.get("ville") or "").strip(),
                "address": (row.get("address") or row.get("adresse") or "").strip(),
                "status": (row.get("status") or "prospect").strip().lower(),
                "notes": (row.get("notes") or "").strip(),
                "owner_id": user["id"],
                "assigned_to": user["id"],
            }
            if not data["name"]:
                errors.append(f"Ligne {i}: nom manquant")
                continue
            if data["type"] not in ["bar", "restaurant", "caviste", "supermarche", "hotel", "autre"]:
                data["type"] = "autre"
            if data["status"] not in ["prospect", "actif", "inactif", "vip"]:
                data["status"] = "prospect"
            c = Client(**data)
            await db.clients.insert_one(c.model_dump())
            created += 1
        except Exception as e:
            errors.append(f"Ligne {i}: {str(e)[:80]}")
    return {"created": created, "errors": errors[:10], "total_errors": len(errors)}

# ---------- FOLLOW-UPS / RELANCES ----------
@api_router.get("/alerts/follow-ups")
async def follow_ups(user=Depends(get_current_user)):
    """Clients à relancer: prospects sans commande, clients actifs sans activité récente."""
    from datetime import datetime as _dt
    is_mgr = user["role"] == "manager"
    q = {} if is_mgr else {"$or": [{"owner_id": user["id"]}, {"assigned_to": user["id"]}]}
    clients = await db.clients.find(q, {"_id": 0}).to_list(2000)
    now = datetime.now(timezone.utc)
    alerts = []
    for c in clients:
        cid = c["id"]
        last_order = await db.orders.find_one({"client_id": cid}, {"_id": 0, "created_at": 1}, sort=[("created_at", -1)])
        last_activity = await db.activities.find_one({"client_id": cid}, {"_id": 0, "created_at": 1}, sort=[("created_at", -1)])
        last_touch = None
        for x in [last_order, last_activity]:
            if x and x.get("created_at"):
                try:
                    d = _dt.fromisoformat(x["created_at"].replace("Z", "+00:00"))
                    if not last_touch or d > last_touch:
                        last_touch = d
                except Exception:
                    pass
        days_since = (now - last_touch).days if last_touch else 999
        reason = None; priority = "low"
        if c.get("status") == "prospect" and not last_order:
            reason = "Prospect sans commande"
            priority = "high" if days_since > 14 else "medium"
        elif c.get("status") == "vip" and days_since > 21:
            reason = f"VIP silencieux depuis {days_since}j"
            priority = "high"
        elif c.get("status") == "actif" and days_since > 45:
            reason = f"Client actif sans contact depuis {days_since}j"
            priority = "medium"
        elif c.get("status") == "actif" and days_since > 90:
            reason = f"Risque d'attrition ({days_since}j)"
            priority = "high"
        if reason:
            alerts.append({
                "client_id": cid, "client_name": c["name"], "city": c.get("city", ""),
                "status": c["status"], "days_since": days_since,
                "reason": reason, "priority": priority,
                "last_touch": last_touch.isoformat() if last_touch else None,
            })
    order_map = {"high": 0, "medium": 1, "low": 2}
    alerts.sort(key=lambda a: (order_map[a["priority"]], -a["days_since"]))
    return {"count": len(alerts), "items": alerts}

@api_router.get("/clients/{cid}/stats")
async def client_stats(cid: str, user=Depends(get_current_user)):
    orders = await db.orders.find({"client_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    total_ca = sum(o.get("total", 0) for o in orders)
    avg_basket = round(total_ca / len(orders), 2) if orders else 0
    last_order = orders[0] if orders else None
    from datetime import datetime as _dt
    frequency_days = None
    if len(orders) >= 2:
        try:
            first = _dt.fromisoformat(orders[-1]["created_at"].replace("Z", "+00:00"))
            last = _dt.fromisoformat(orders[0]["created_at"].replace("Z", "+00:00"))
            frequency_days = round((last - first).days / max(1, len(orders) - 1), 1)
        except Exception:
            pass
    return {
        "orders_count": len(orders),
        "total_ca": round(total_ca, 2),
        "avg_basket": avg_basket,
        "last_order_date": last_order["created_at"][:10] if last_order else None,
        "last_order_total": last_order.get("total", 0) if last_order else 0,
        "frequency_days": frequency_days,
    }

@api_router.post("/orders/reorder/{oid}")
async def reorder(oid: str, user=Depends(get_current_user)):
    """Crée une nouvelle commande identique à une précédente (1-clic)."""
    src = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not src:
        raise HTTPException(404, "Commande source introuvable")
    new_data = {
        "client_id": src["client_id"],
        "client_name": src["client_name"],
        "lines": src.get("lines", []),
        "notes": f"Recommande de #{src['id'][:8]}",
        "agent_id": user["id"],
        "owner_id": user["id"],
    }
    total = sum(l["quantity"] * l["unit_price"] for l in new_data["lines"])
    new_data["total"] = total
    o = Order(**new_data)
    await db.orders.insert_one(o.model_dump())
    for line in o.lines:
        await db.products.update_one({"id": line.product_id}, {"$inc": {"stock": -line.quantity}})
    await db.activities.insert_one(Activity(
        client_id=o.client_id, agent_id=user["id"], type="commande",
        content=f"Recommande {o.id[:8]} - {total:.2f}€ (basée sur #{src['id'][:8]})", owner_id=user["id"]
    ).model_dump())
    return o.model_dump()

# ---------- VISIT REPORTS (compte-rendus terrain) ----------
class VisitReport(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    client_name: str
    agent_id: str
    mood: Literal["excellent", "bon", "neutre", "difficile"] = "neutre"
    interest: Literal["chaud", "tiede", "froid"] = "tiede"
    next_action: Literal["relance", "devis", "commande", "aucune", "visite"] = "relance"
    next_date: Optional[str] = None
    summary: str = ""
    voice_transcript: Optional[str] = ""
    gps: Optional[dict] = None
    owner_id: str
    client_uuid: Optional[str] = None  # idempotence pour resync offline
    created_at: str = Field(default_factory=now_iso)

@api_router.post("/visits")
async def create_visit(data: dict, user=Depends(get_current_user)):
    # Idempotence resync offline
    cu = data.get("client_uuid")
    if cu:
        existing = await db.visits.find_one({"client_uuid": cu}, {"_id": 0})
        if existing:
            return existing
    data["owner_id"] = user["id"]
    data["agent_id"] = user["id"]
    cid = data.get("client_id")
    c = await db.clients.find_one({"id": cid}, {"_id": 0}) if cid else None
    if not c:
        raise HTTPException(404, "Client introuvable")
    data["client_name"] = c["name"]
    v = VisitReport(**data)
    await db.visits.insert_one(v.model_dump())
    content = f"Visite ({v.mood} · {v.interest}) → {v.next_action}. {v.summary[:120]}"
    await db.activities.insert_one(Activity(
        client_id=cid, agent_id=user["id"], type="visite",
        content=content, owner_id=user["id"]
    ).model_dump())
    return v.model_dump()

@api_router.get("/visits")
async def list_visits(client_id: Optional[str] = None, user=Depends(get_current_user)):
    q = {"client_id": client_id} if client_id else {}
    items = await db.visits.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

# ---------- CALENDAR EVENTS ----------
class CalendarEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    start: str
    end: Optional[str] = None
    type: Literal["visite", "reunion", "relance", "tournee", "autre"] = "autre"
    client_id: Optional[str] = None
    agent_id: str
    shared: bool = False
    notes: Optional[str] = ""
    owner_id: str
    created_at: str = Field(default_factory=now_iso)

@api_router.get("/events")
async def list_events(user=Depends(get_current_user)):
    is_mgr = user["role"] == "manager"
    q = {} if is_mgr else {"$or": [{"agent_id": user["id"]}, {"shared": True}]}
    items = await db.events.find(q, {"_id": 0}).sort("start", 1).to_list(1000)
    return items

@api_router.post("/events")
async def create_event(data: dict, user=Depends(get_current_user)):
    data["owner_id"] = user["id"]
    data["agent_id"] = data.get("agent_id") or user["id"]
    e = CalendarEvent(**data)
    await db.events.insert_one(e.model_dump())
    return e.model_dump()

@api_router.put("/events/{eid}")
async def update_event(eid: str, data: dict, user=Depends(get_current_user)):
    data.pop("id", None); data.pop("_id", None)
    await db.events.update_one({"id": eid}, {"$set": data})
    return await db.events.find_one({"id": eid}, {"_id": 0})

@api_router.delete("/events/{eid}")
async def delete_event(eid: str, user=Depends(get_current_user)):
    await db.events.delete_one({"id": eid})
    return {"ok": True}

# ---------- MONTHLY REVIEW ----------
@api_router.get("/reports/monthly/{agent_id}")
async def monthly_review(agent_id: str, year: Optional[int] = None, month: Optional[int] = None, user=Depends(get_current_user)):
    from datetime import datetime as _dt
    now = datetime.now(timezone.utc)
    y = year or now.year
    m = month or now.month
    start_prefix = f"{y:04d}-{m:02d}"
    orders = await db.orders.find({"agent_id": agent_id}, {"_id": 0}).to_list(5000)
    month_orders = [o for o in orders if (o.get("created_at","")[:7] == start_prefix)]
    # previous month for comparison
    pm = m - 1 if m > 1 else 12
    py = y if m > 1 else y - 1
    prev_prefix = f"{py:04d}-{pm:02d}"
    prev_orders = [o for o in orders if o.get("created_at","")[:7] == prev_prefix]
    ca = sum(o.get("total", 0) for o in month_orders)
    prev_ca = sum(o.get("total", 0) for o in prev_orders)
    growth = round(((ca - prev_ca) / prev_ca * 100), 1) if prev_ca else None
    clients_reached = len({o["client_id"] for o in month_orders})
    visits = await db.visits.count_documents({"agent_id": agent_id, "created_at": {"$regex": f"^{start_prefix}"}})
    activities = await db.activities.count_documents({"agent_id": agent_id, "created_at": {"$regex": f"^{start_prefix}"}})
    new_clients = await db.clients.count_documents({"assigned_to": agent_id, "created_at": {"$regex": f"^{start_prefix}"}})
    agent = await db.users.find_one({"id": agent_id}, {"_id": 0, "password": 0})
    return {
        "agent": agent,
        "period": start_prefix,
        "ca": round(ca, 2),
        "prev_ca": round(prev_ca, 2),
        "growth_pct": growth,
        "orders_count": len(month_orders),
        "avg_basket": round(ca / len(month_orders), 2) if month_orders else 0,
        "clients_reached": clients_reached,
        "new_clients": new_clients,
        "visits": visits,
        "activities": activities,
    }

@api_router.post("/reports/monthly/{agent_id}/ai-narrative")
async def monthly_ai(agent_id: str, data: dict, user=Depends(get_current_user)):
    review = await monthly_review(agent_id, data.get("year"), data.get("month"), user)
    ctx = f"BILAN MENSUEL {review['period']} — Agent: {review['agent']['name']}\n"
    ctx += f"CA: {review['ca']}€ (mois précédent: {review['prev_ca']}€, croissance: {review['growth_pct']}%)\n"
    ctx += f"Commandes: {review['orders_count']} · Panier moyen: {review['avg_basket']}€\n"
    ctx += f"Clients atteints: {review['clients_reached']} · Nouveaux: {review['new_clients']}\n"
    ctx += f"Visites: {review['visits']} · Activités: {review['activities']}"
    req = AIRequest(
        prompt="Prépare un compte-rendu de RÉUNION MENSUELLE avec ce commercial. Structure: 1) Verdict global en 1 phrase. 2) Points forts (2-3). 3) Axes d'amélioration (2-3). 4) 3 objectifs SMART pour le mois suivant. Ton bienveillant mais exigeant. Format clair avec titres en gras.",
        context=ctx, model="claude-sonnet-5"
    )
    return await ai_ask(req, user)

# ---------- MONTHLY GOALS ----------
class MonthlyGoal(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    year: int
    month: int
    target_ca: float
    target_orders: int = 0
    owner_id: str
    created_at: str = Field(default_factory=now_iso)

@api_router.get("/goals")
async def list_goals(user=Depends(get_current_user)):
    q = {} if user["role"] == "manager" else {"agent_id": user["id"]}
    items = await db.goals.find(q, {"_id": 0}).sort([("year",-1),("month",-1)]).to_list(500)
    return items

@api_router.post("/goals")
async def set_goal(data: dict, user=Depends(get_current_user)):
    data["owner_id"] = user["id"]
    existing = await db.goals.find_one({"agent_id": data["agent_id"], "year": data["year"], "month": data["month"]})
    if existing:
        await db.goals.update_one({"id": existing["id"]}, {"$set": {"target_ca": data["target_ca"], "target_orders": data.get("target_orders", 0)}})
        return await db.goals.find_one({"id": existing["id"]}, {"_id": 0})
    g = MonthlyGoal(**data)
    await db.goals.insert_one(g.model_dump())
    return g.model_dump()

@api_router.get("/goals/progress")
async def goals_progress(user=Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    prefix = f"{now.year:04d}-{now.month:02d}"
    goals = await db.goals.find({"year": now.year, "month": now.month}, {"_id": 0}).to_list(500)
    result = []
    for g in goals:
        orders = await db.orders.find({"agent_id": g["agent_id"], "created_at": {"$regex": f"^{prefix}"}}, {"_id": 0}).to_list(5000)
        current_ca = sum(o.get("total", 0) for o in orders)
        agent = await db.users.find_one({"id": g["agent_id"]}, {"_id": 0, "password": 0})
        result.append({
            "agent_id": g["agent_id"],
            "agent_name": agent["name"] if agent else "?",
            "target_ca": g["target_ca"],
            "current_ca": round(current_ca, 2),
            "pct": round((current_ca / g["target_ca"] * 100), 1) if g["target_ca"] else 0,
            "orders": len(orders),
        })
    result.sort(key=lambda x: -x["pct"])
    return result

# ---------- PIPELINE (Kanban) ----------
@api_router.put("/clients/{cid}/status")
async def update_client_status(cid: str, data: dict, user=Depends(get_current_user)):
    new_status = data.get("status")
    if new_status not in ["prospect", "actif", "vip", "inactif"]:
        raise HTTPException(400, "Statut invalide")
    await db.clients.update_one({"id": cid}, {"$set": {"status": new_status, "updated_at": now_iso()}})
    return {"ok": True}

# ---------- DEALS (Kanban opportunities) ----------
class Deal(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    client_id: str
    client_name: str
    amount: float = 0.0
    probability: int = 50
    stage: Literal["qualification", "proposition", "negociation", "gagne", "perdu"] = "qualification"
    expected_close: Optional[str] = None
    notes: Optional[str] = ""
    agent_id: str
    owner_id: str
    created_at: str = Field(default_factory=now_iso)

@api_router.get("/deals")
async def list_deals(user=Depends(get_current_user)):
    q = {} if user["role"] == "manager" else {"agent_id": user["id"]}
    return await db.deals.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api_router.post("/deals")
async def create_deal(data: dict, user=Depends(get_current_user)):
    data["owner_id"] = user["id"]
    data["agent_id"] = data.get("agent_id") or user["id"]
    c = await db.clients.find_one({"id": data.get("client_id")}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Client introuvable")
    data["client_name"] = c["name"]
    d = Deal(**data)
    await db.deals.insert_one(d.model_dump())
    return d.model_dump()

@api_router.put("/deals/{did}")
async def update_deal(did: str, data: dict, user=Depends(get_current_user)):
    data.pop("id", None); data.pop("_id", None)
    await db.deals.update_one({"id": did}, {"$set": data})
    return await db.deals.find_one({"id": did}, {"_id": 0})

@api_router.delete("/deals/{did}")
async def delete_deal(did: str, user=Depends(get_current_user)):
    await db.deals.delete_one({"id": did})
    return {"ok": True}

# ---------- TEAM GOAL ----------
@api_router.get("/goals/team-progress")
async def team_progress(user=Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    prefix = f"{now.year:04d}-{now.month:02d}"
    goals = await db.goals.find({"year": now.year, "month": now.month}, {"_id": 0}).to_list(500)
    orders = await db.orders.find({"created_at": {"$regex": f"^{prefix}"}}, {"_id": 0}).to_list(10000)
    total_target = sum(g.get("target_ca", 0) for g in goals)
    total_current = sum(o.get("total", 0) for o in orders)
    return {
        "period": prefix,
        "total_target": round(total_target, 2),
        "total_current": round(total_current, 2),
        "pct": round((total_current / total_target * 100), 1) if total_target else 0,
        "team_size": len(goals),
    }

# ---------- CONNECTORS ----------
class Connector(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    provider: Literal["easybeer", "vinovent", "pennylane", "google_drive", "custom"]
    name: str
    status: Literal["connected", "disconnected", "error", "pending"] = "disconnected"
    config: dict = Field(default_factory=dict)
    last_sync: Optional[str] = None
    owner_id: str
    created_at: str = Field(default_factory=now_iso)

@api_router.get("/connectors")
async def list_connectors(user=Depends(get_current_user)):
    items = await db.connectors.find({"owner_id": user["id"]}, {"_id": 0}).to_list(100)
    # never leak secrets
    for c in items:
        if c.get("config"):
            c["config"] = {k: ("***" if k in ["api_key", "secret", "token"] else v) for k, v in c["config"].items()}
    return items

@api_router.post("/connectors")
async def create_connector(data: dict, user=Depends(get_current_user)):
    data["owner_id"] = user["id"]
    c = Connector(**data)
    await db.connectors.insert_one(c.model_dump())
    return {"id": c.id, "provider": c.provider, "status": c.status}

@api_router.put("/connectors/{cid}")
async def update_connector(cid: str, data: dict, user=Depends(get_current_user)):
    data.pop("id", None); data.pop("_id", None)
    await db.connectors.update_one({"id": cid}, {"$set": data})
    return {"ok": True}

@api_router.delete("/connectors/{cid}")
async def delete_connector(cid: str, user=Depends(get_current_user)):
    await db.connectors.delete_one({"id": cid})
    return {"ok": True}

@api_router.post("/connectors/{cid}/test")
async def test_connector(cid: str, user=Depends(get_current_user)):
    """Simule un test de connexion. En prod, appelle l'API réelle."""
    c = await db.connectors.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Connecteur introuvable")
    # For now, mark connected if config has minimum keys
    ok = bool(c.get("config", {}).get("api_key") or c.get("config", {}).get("token"))
    new_status = "connected" if ok else "error"
    await db.connectors.update_one({"id": cid}, {"$set": {"status": new_status, "last_sync": now_iso()}})
    return {"status": new_status, "message": "Connexion réussie (mode démo — l'appel API réel nécessite les specs du fournisseur)" if ok else "Credentials manquantes"}

# ---------- AI COACH (deals) ----------
@api_router.post("/deals/{did}/ai-coach")
async def deal_coach(did: str, user=Depends(get_current_user)):
    d = await db.deals.find_one({"id": did}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Deal introuvable")
    c = await db.clients.find_one({"id": d["client_id"]}, {"_id": 0}) or {}
    activities = await db.activities.find({"client_id": d["client_id"]}, {"_id": 0}).sort("created_at", -1).to_list(5)
    ctx = f"DEAL: {d['title']} ({d['stage']}) - {d['amount']}€ - probabilité {d['probability']}%\n"
    ctx += f"CLIENT: {c.get('name')} · {c.get('type')} · {c.get('city')} · statut {c.get('status')}\n"
    ctx += f"Notes deal: {d.get('notes', 'aucune')}\n"
    ctx += f"Activités récentes:\n"
    for a in activities:
        ctx += f"- {a.get('type')}: {a.get('content','')[:100]}\n"
    req = AIRequest(
        prompt="Tu es un coach commercial. Pour ce deal, propose LA MEILLEURE PROCHAINE ACTION en 2-3 phrases MAX. Sois concret et opérationnel (script d'appel, argument, promo, etc.). Format : action → raisonnement rapide.",
        context=ctx, model="claude-sonnet-5"
    )
    return await ai_ask(req, user)

# ---------- SALES FORECAST ----------
@api_router.get("/forecast/sales")
async def sales_forecast(days: int = 30, user=Depends(get_current_user)):
    """Prévision naïve basée sur la moyenne mobile des 90 derniers jours par agent."""
    from datetime import datetime as _dt, timedelta as _td
    now = datetime.now(timezone.utc)
    since = (now - _td(days=90)).isoformat()
    is_mgr = user["role"] == "manager"
    q = {} if is_mgr else {"agent_id": user["id"]}
    q["created_at"] = {"$gte": since}
    orders = await db.orders.find(q, {"_id": 0}).to_list(10000)
    from collections import defaultdict
    by_agent = defaultdict(lambda: {"days": defaultdict(float), "total": 0.0, "count": 0})
    for o in orders:
        aid = o["agent_id"]
        day = o["created_at"][:10]
        by_agent[aid]["days"][day] += o.get("total", 0)
        by_agent[aid]["total"] += o.get("total", 0)
        by_agent[aid]["count"] += 1
    result = []
    for aid, stats in by_agent.items():
        agent = await db.users.find_one({"id": aid}, {"_id": 0, "password": 0})
        active_days = len(stats["days"]) or 1
        daily_avg = stats["total"] / 90  # spread over full 90d
        forecast_total = round(daily_avg * days, 2)
        # daily trend for chart
        chart = []
        for i in range(days):
            d = (now + _td(days=i)).strftime("%Y-%m-%d")
            # weekend pattern: reduce
            weekday = (now + _td(days=i)).weekday()
            factor = 0.4 if weekday >= 5 else 1.15
            chart.append({"date": d, "value": round(daily_avg * factor, 2)})
        result.append({
            "agent_id": aid,
            "agent_name": agent["name"] if agent else "?",
            "daily_avg": round(daily_avg, 2),
            "forecast_total": forecast_total,
            "history_orders": stats["count"],
            "chart": chart[:14],  # 14d chart for compactness
        })
    result.sort(key=lambda x: -x["forecast_total"])
    return result

# ---------- SIGNATURE LINK PUBLIC ----------
@api_router.post("/orders/{oid}/signature-link")
async def create_signature_link(oid: str, user=Depends(get_current_user)):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Commande introuvable")
    token = uuid.uuid4().hex
    await db.orders.update_one({"id": oid}, {"$set": {"sign_token": token, "sign_created": now_iso()}})
    return {"token": token, "url_path": f"/sign/{token}"}

@api_router.get("/public/signature/{token}")
async def get_signature_info(token: str):
    o = await db.orders.find_one({"sign_token": token}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Lien invalide")
    return {
        "id": o["id"], "client_name": o["client_name"],
        "total": o["total"], "lines": o.get("lines", []),
        "created_at": o.get("created_at"), "signed": bool(o.get("signature")),
    }

@api_router.post("/public/signature/{token}")
async def submit_signature(token: str, data: dict):
    o = await db.orders.find_one({"sign_token": token}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Lien invalide")
    sig = data.get("signature", "")
    if not sig.startswith("data:image"):
        raise HTTPException(400, "Signature invalide")
    await db.orders.update_one({"sign_token": token}, {"$set": {"signature": sig, "signed_at": now_iso()}})
    await db.activities.insert_one(Activity(
        client_id=o["client_id"], agent_id=o["agent_id"], type="note",
        content=f"Commande #{o['id'][:8]} signée électroniquement par le client",
        owner_id=o["owner_id"]
    ).model_dump())
    return {"ok": True}

# ---------- GOOGLE DRIVE OAUTH ----------
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT = os.environ.get("GOOGLE_DRIVE_REDIRECT_URI", "")

@api_router.get("/drive/connect")
async def drive_connect(user=Depends(get_current_user)):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(400, "Google OAuth non configuré. Ajoutez GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET dans .env")
    try:
        from google_auth_oauthlib.flow import Flow
    except Exception:
        raise HTTPException(500, "Bibliothèque Google absente")
    flow = Flow.from_client_config(
        {"web": {"client_id": GOOGLE_CLIENT_ID, "client_secret": GOOGLE_CLIENT_SECRET,
                 "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                 "token_uri": "https://oauth2.googleapis.com/token",
                 "redirect_uris": [GOOGLE_REDIRECT]}},
        scopes=['https://www.googleapis.com/auth/drive.readonly'],
        redirect_uri=GOOGLE_REDIRECT,
    )
    auth_url, _ = flow.authorization_url(access_type='offline', include_granted_scopes='true', prompt='consent', state=user["id"])
    return {"authorization_url": auth_url}

@api_router.get("/drive/callback")
async def drive_callback(code: str, state: str):
    from google_auth_oauthlib.flow import Flow
    flow = Flow.from_client_config(
        {"web": {"client_id": GOOGLE_CLIENT_ID, "client_secret": GOOGLE_CLIENT_SECRET,
                 "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                 "token_uri": "https://oauth2.googleapis.com/token",
                 "redirect_uris": [GOOGLE_REDIRECT]}},
        scopes=None,
        redirect_uri=GOOGLE_REDIRECT,
    )
    flow.fetch_token(code=code)
    creds = flow.credentials
    await db.drive_credentials.update_one({"user_id": state}, {"$set": {
        "user_id": state, "access_token": creds.token, "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri, "client_id": creds.client_id, "client_secret": creds.client_secret,
        "scopes": creds.scopes, "expiry": creds.expiry.isoformat() if creds.expiry else None,
        "updated_at": now_iso()
    }}, upsert=True)
    frontend = os.environ.get("FRONTEND_URL", "/")
    return RedirectResponse(url=f"{frontend}/connectors?drive_connected=1")

@api_router.get("/drive/files")
async def drive_list(user=Depends(get_current_user)):
    doc = await db.drive_credentials.find_one({"user_id": user["id"]})
    if not doc:
        raise HTTPException(400, "Google Drive non connecté")
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request as GReq
    from googleapiclient.discovery import build
    creds = Credentials(token=doc["access_token"], refresh_token=doc.get("refresh_token"),
                        token_uri=doc["token_uri"], client_id=doc["client_id"],
                        client_secret=doc["client_secret"], scopes=doc.get("scopes"))
    if creds.expired and creds.refresh_token:
        creds.refresh(GReq())
        await db.drive_credentials.update_one({"user_id": user["id"]}, {"$set": {"access_token": creds.token}})
    svc = build('drive', 'v3', credentials=creds)
    res = svc.files().list(pageSize=50, fields="files(id,name,mimeType,modifiedTime,webViewLink)",
                           q="mimeType='text/csv' or mimeType='application/vnd.google-apps.spreadsheet' or mimeType='image/jpeg' or mimeType='image/png' or mimeType='application/pdf'"
                          ).execute()
    return res.get("files", [])

# ---------- STRIPE PAYMENTS ----------
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# ==========================================================
# EMAIL (Emergent-managed Resend) - Guardrails G2/G3 gate
# ==========================================================
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "BEVID")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)

def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host); return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)

def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)

class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []
    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []
    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)
    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []

def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Non-https link/asset: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Bad host: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor host mismatch: {m.group(1)!r} != {real!r} (G3)")

async def send_email(*, to: str, subject: str, html: str, reply_to: str | None = None):
    if not EMAIL_KEY:
        raise HTTPException(500, "Email non configuré (EMERGENT_EMAIL_KEY manquant)")
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if reply_to or EMAIL_REPLY_TO:
        payload["contact_email"] = reply_to or EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                     headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logging.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(502, "Envoi email échoué")
    except Exception as e:
        logging.exception(f"Email send error: {e}")
        raise HTTPException(500, "Envoi email échoué")

@api_router.post("/orders/{oid}/payment-link")
async def create_payment_link(oid: str, request: Request, user=Depends(get_current_user)):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Commande introuvable")
    origin = os.environ.get("FRONTEND_URL", str(request.base_url).rstrip("/"))
    # apply escompte if enabled
    settings = await db.settings.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    total = o.get("total", 0)
    discount_pct = 0
    if settings.get("discount_enabled"):
        discount_pct = float(settings.get("discount_pct", 2.0))
        total = round(total * (1 - discount_pct / 100), 2)
    try:
        session = stripe.checkout.Session.create(
            line_items=[{
                "price_data": {
                    "currency": "eur",
                    "product_data": {"name": f"Commande BEVID #{oid[:8]}" + (f" (Escompte -{discount_pct}%)" if discount_pct else "") + f" · {o['client_name']}"},
                    "unit_amount": int(round(total * 100)),
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{origin}/payment/cancel",
            metadata={"order_id": oid, "client_id": o["client_id"], "discount_pct": str(discount_pct)},
            payment_method_types=["card"],
        )
        await db.payment_transactions.insert_one({
            "session_id": session.id, "order_id": oid, "client_id": o["client_id"],
            "amount": total, "original_amount": o.get("total", 0), "discount_pct": discount_pct,
            "currency": "eur", "status": "initiated", "payment_status": "pending",
            "created_at": now_iso(), "updated_at": now_iso(),
        })
        await db.orders.update_one({"id": oid}, {"$set": {"payment_session_id": session.id, "payment_status": "pending"}})
        return {"checkout_url": session.url, "session_id": session.id, "amount": total, "original_amount": o.get("total", 0), "discount_pct": discount_pct}
    except Exception as e:
        raise HTTPException(500, f"Erreur Stripe: {str(e)}")

@api_router.get("/payments/status/{session_id}")
async def payment_status(session_id: str):
    record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not record:
        raise HTTPException(404, "Transaction introuvable")
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"status": "completed", "payment_status": "paid",
                              "stripe_payment_intent_id": s.payment_intent, "updated_at": now_iso()}})
                await db.orders.update_one(
                    {"payment_session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"payment_status": "paid", "paid_at": now_iso()}})
                record["payment_status"] = "paid"
                record["status"] = "completed"
        except Exception:
            pass
    return {"session_id": record["session_id"], "status": record["status"], "payment_status": record["payment_status"], "amount": record.get("amount")}

@api_router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(400, "Signature invalide")
    obj = event["data"]["object"]
    t = event["type"]
    if t == "checkout.session.completed":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
            {"$set": {"status": "completed", "payment_status": obj.get("payment_status", "paid"),
                      "stripe_payment_intent_id": obj.get("payment_intent"), "updated_at": now_iso()}})
        await db.orders.update_one(
            {"payment_session_id": obj["id"], "payment_status": {"$ne": "paid"}},
            {"$set": {"payment_status": "paid", "paid_at": now_iso()}})
    return {"status": "ok"}

# ---------- OVERDUE PAYMENTS ----------
@api_router.get("/alerts/overdue-payments")
async def overdue_payments(days: int = 30, user=Depends(get_current_user)):
    from datetime import datetime as _dt, timedelta as _td
    cutoff = (datetime.now(timezone.utc) - _td(days=days)).isoformat()
    is_mgr = user["role"] == "manager"
    q = {"created_at": {"$lt": cutoff}, "payment_status": {"$nin": ["paid", "refunded"]}}
    if not is_mgr:
        q["agent_id"] = user["id"]
    items = await db.orders.find(q, {"_id": 0}).sort("created_at", 1).to_list(500)
    total_overdue = sum(o.get("total", 0) for o in items)
    now = datetime.now(timezone.utc)
    result = []
    for o in items:
        try:
            created = _dt.fromisoformat(o["created_at"].replace("Z", "+00:00"))
            days_late = (now - created).days
        except Exception:
            days_late = days
        result.append({
            "id": o["id"], "client_name": o["client_name"], "client_id": o["client_id"],
            "total": o.get("total", 0), "created_at": o["created_at"][:10],
            "days_late": days_late,
        })
    return {"count": len(result), "total": round(total_overdue, 2), "items": result}

# ---------- RECEIPT ----------
@api_router.get("/orders/{oid}/receipt-text")
async def receipt_text(oid: str, user=Depends(get_current_user)):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Commande introuvable")
    lines_txt = "\n".join([f"- {l['product_name']} x{l['quantity']} : {l['quantity']*l['unit_price']:.2f}€" for l in o.get("lines", [])])
    paid_flag = "✅ PAYÉE" if o.get("payment_status") == "paid" else "⏳ à régler"
    txt = (f"🍾 BEVID · Reçu #{o['id'][:8].upper()}\n"
           f"Client : {o['client_name']}\n"
           f"Date : {o.get('created_at','')[:10]}\n"
           f"Statut : {paid_flag}\n\n"
           f"{lines_txt}\n\n"
           f"TOTAL : {o.get('total',0):.2f}€\n\n"
           f"Merci pour votre commande !")
    return {"text": txt, "encoded": txt}

# ---------- SETTINGS (toggles) ----------
class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    reminders_enabled: bool = False
    reminder_channel: Literal["sms", "whatsapp", "email"] = "whatsapp"
    discount_enabled: bool = False
    discount_pct: float = 2.0
    discount_hours: int = 48
    updated_at: str = Field(default_factory=now_iso)

@api_router.get("/settings")
async def get_settings(user=Depends(get_current_user)):
    s = await db.settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not s:
        s = Settings(user_id=user["id"]).model_dump()
    return s

@api_router.put("/settings")
async def update_settings(data: dict, user=Depends(get_current_user)):
    data["user_id"] = user["id"]
    data["updated_at"] = now_iso()
    await db.settings.update_one({"user_id": user["id"]}, {"$set": data}, upsert=True)
    return await db.settings.find_one({"user_id": user["id"]}, {"_id": 0})

# ---------- TWILIO / WHATSAPP ----------
TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_WA_FROM = os.environ.get("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
TWILIO_SMS_FROM = os.environ.get("TWILIO_SMS_FROM", "")

def _twilio():
    if not TWILIO_SID or not TWILIO_TOKEN:
        return None
    return TwilioClient(TWILIO_SID, TWILIO_TOKEN)

async def send_wa(to_phone: str, body: str):
    tw = _twilio()
    if not tw:
        return {"ok": False, "reason": "Twilio non configuré (SID/Token manquants)"}
    to = to_phone if to_phone.startswith("whatsapp:") else f"whatsapp:{to_phone}"
    try:
        msg = tw.messages.create(body=body, from_=TWILIO_WA_FROM, to=to)
        return {"ok": True, "sid": msg.sid}
    except Exception as e:
        return {"ok": False, "reason": str(e)[:200]}

async def send_sms(to_phone: str, body: str):
    tw = _twilio()
    if not tw or not TWILIO_SMS_FROM:
        return {"ok": False, "reason": "Twilio SMS non configuré"}
    try:
        msg = tw.messages.create(body=body, from_=TWILIO_SMS_FROM, to=to_phone)
        return {"ok": True, "sid": msg.sid}
    except Exception as e:
        return {"ok": False, "reason": str(e)[:200]}

@api_router.post("/orders/{oid}/send-receipt-whatsapp")
async def send_receipt_wa(oid: str, user=Depends(get_current_user)):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Commande introuvable")
    c = await db.clients.find_one({"id": o["client_id"]}, {"_id": 0}) or {}
    phone = c.get("phone", "").replace(" ", "")
    if not phone:
        raise HTTPException(400, "Numéro client manquant")
    if not phone.startswith("+"):
        phone = "+33" + phone.lstrip("0")
    receipt = await receipt_text(oid, user)
    r = await send_wa(phone, receipt["text"])
    if r["ok"]:
        await db.activities.insert_one(Activity(
            client_id=o["client_id"], agent_id=user["id"], type="note",
            content=f"Reçu envoyé sur WhatsApp ({phone})", owner_id=user["id"]
        ).model_dump())
    return r

# ---------- CASHFLOW FORECAST ----------
@api_router.get("/cashflow/forecast")
async def cashflow(days: int = 60, user=Depends(get_current_user)):
    from datetime import datetime as _dt, timedelta as _td
    now = datetime.now(timezone.utc)
    since = (now - _td(days=days)).isoformat()
    is_mgr = user["role"] == "manager"
    q = {"created_at": {"$gte": since}}
    if not is_mgr:
        q["agent_id"] = user["id"]
    orders = await db.orders.find(q, {"_id": 0}).to_list(20000)
    from collections import defaultdict
    invoiced = defaultdict(float)
    collected = defaultdict(float)
    for o in orders:
        d = o.get("created_at", "")[:10]
        invoiced[d] += o.get("total", 0)
        if o.get("payment_status") == "paid":
            paid_d = (o.get("paid_at") or o.get("created_at", ""))[:10]
            collected[paid_d] += o.get("total", 0)
    # merge days
    days_set = sorted(set(list(invoiced.keys()) + list(collected.keys())))
    chart = [{"date": d, "facture": round(invoiced.get(d, 0), 2), "encaisse": round(collected.get(d, 0), 2)} for d in days_set]
    total_invoiced = sum(invoiced.values())
    total_collected = sum(collected.values())
    outstanding = total_invoiced - total_collected
    # Simple forward projection: avg daily invoicing * 60 days
    daily_avg = total_invoiced / max(days, 1)
    forecast_60 = round(daily_avg * 60, 2)
    return {
        "chart": chart[-days:],
        "total_invoiced": round(total_invoiced, 2),
        "total_collected": round(total_collected, 2),
        "outstanding": round(outstanding, 2),
        "forecast_60d": forecast_60,
    }

# ---------- CRON PAYMENT REMINDERS ----------
WEBHOOK_CRON_SECRET = os.environ.get("WEBHOOK_CRON_SECRET", "")

async def _process_reminders():
    from datetime import datetime as _dt, timedelta as _td
    now = datetime.now(timezone.utc)
    orders = await db.orders.find({"payment_status": {"$nin": ["paid", "refunded"]}}, {"_id": 0}).to_list(5000)
    sent = 0
    for o in orders:
        try:
            created = _dt.fromisoformat(o["created_at"].replace("Z", "+00:00"))
            age = (now - created).days
        except Exception:
            continue
        if age not in (15, 30):
            continue
        # find agent's settings
        s = await db.settings.find_one({"user_id": o["agent_id"]}, {"_id": 0})
        if not s or not s.get("reminders_enabled"):
            continue
        c = await db.clients.find_one({"id": o["client_id"]}, {"_id": 0}) or {}
        phone = c.get("phone", "").replace(" ", "")
        if phone and not phone.startswith("+"):
            phone = "+33" + phone.lstrip("0")
        tone = "amicale" if age == 15 else "ferme"
        body = (f"Bonjour {c.get('contact_name','')}, votre commande #{o['id'][:8]} de {o.get('total',0):.2f}€ "
                f"reste à régler ({age}j). Un lien de paiement rapide est disponible sur demande. Cordialement, BEVID.")
        channel = s.get("reminder_channel", "whatsapp")
        if phone:
            if channel == "whatsapp":
                r = await send_wa(phone, body)
            elif channel == "sms":
                r = await send_sms(phone, body)
            else:
                r = {"ok": False, "reason": "email not configured"}
            if r.get("ok"):
                sent += 1
                await db.orders.update_one({"id": o["id"]}, {"$set": {f"reminder_{age}d_sent": now_iso()}})
    return sent

@api_router.post("/cron/payment-reminders")
async def cron_reminders(request: Request, authorization: Optional[str] = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    import hmac
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "auth manquant")
    token = authorization.split(" ", 1)[1]
    if not hmac.compare_digest(token, WEBHOOK_CRON_SECRET):
        raise HTTPException(401, "token invalide")
    import asyncio
    asyncio.create_task(_process_reminders())
    return {"status": "queued"}

# ---------- HEALTH SCORE ----------
async def _compute_score(client, orders):
    from datetime import datetime as _dt, timedelta as _td
    if not orders:
        return {"score": 20 if client.get("status") == "prospect" else 40, "grade": "C", "reasons": ["Aucune commande"]}
    now = datetime.now(timezone.utc)
    reasons = []
    score = 50
    # frequency (30 pts)
    try:
        first = _dt.fromisoformat(orders[-1]["created_at"].replace("Z", "+00:00"))
        last = _dt.fromisoformat(orders[0]["created_at"].replace("Z", "+00:00"))
        span = max((last - first).days, 1)
        freq = span / max(len(orders) - 1, 1) if len(orders) > 1 else 999
        if freq < 21:
            score += 30; reasons.append("Fréquence excellente")
        elif freq < 45:
            score += 20; reasons.append("Fréquence régulière")
        elif freq < 90:
            score += 10; reasons.append("Fréquence correcte")
        else:
            score -= 10; reasons.append(f"Fréquence faible (~{int(freq)}j)")
        # recency
        days_since = (now - last).days
        if days_since > 60:
            score -= 15; reasons.append(f"Silence {days_since}j")
        elif days_since < 20:
            score += 5
    except Exception:
        pass
    # growth (20 pts)
    if len(orders) >= 4:
        recent_avg = sum(o.get("total", 0) for o in orders[:len(orders)//2]) / (len(orders)//2)
        older_avg = sum(o.get("total", 0) for o in orders[len(orders)//2:]) / (len(orders) - len(orders)//2)
        if older_avg > 0:
            growth = (recent_avg - older_avg) / older_avg
            if growth > 0.15:
                score += 20; reasons.append("Croissance forte")
            elif growth > 0:
                score += 10; reasons.append("Croissance positive")
            elif growth < -0.2:
                score -= 15; reasons.append("Décroissance marquée")
    # payment (20 pts)
    unpaid = [o for o in orders if o.get("payment_status") not in ("paid", "refunded")]
    old_unpaid = [o for o in unpaid if (now - _dt.fromisoformat(o["created_at"].replace("Z", "+00:00"))).days > 30]
    if not unpaid:
        score += 20; reasons.append("Aucun impayé")
    elif old_unpaid:
        score -= 20; reasons.append(f"{len(old_unpaid)} impayés >30j")
    else:
        score -= 5; reasons.append(f"{len(unpaid)} en attente")
    score = max(0, min(100, score))
    grade = "A" if score >= 80 else "B" if score >= 60 else "C" if score >= 40 else "D"
    return {"score": score, "grade": grade, "reasons": reasons[:4]}

@api_router.get("/clients/{cid}/health-score")
async def health_score(cid: str, user=Depends(get_current_user)):
    c = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Client introuvable")
    orders = await db.orders.find({"client_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return await _compute_score(c, orders)

@api_router.get("/reports/health-scores")
async def all_health_scores(user=Depends(get_current_user)):
    is_mgr = user["role"] == "manager"
    q = {} if is_mgr else {"$or": [{"owner_id": user["id"]}, {"assigned_to": user["id"]}]}
    clients = await db.clients.find(q, {"_id": 0}).to_list(2000)
    result = []
    for c in clients:
        orders = await db.orders.find({"client_id": c["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
        s = await _compute_score(c, orders)
        result.append({"client_id": c["id"], "name": c["name"], **s})
    result.sort(key=lambda x: x["score"])
    return result

# ---------- MORNING CHECKLIST ----------
@api_router.get("/onboarding/morning")
async def morning_checklist(user=Depends(get_current_user)):
    from datetime import datetime as _dt, timedelta as _td
    is_mgr = user["role"] == "manager"
    tasks = []
    # 1. Impayés à encaisser
    cutoff = (datetime.now(timezone.utc) - _td(days=30)).isoformat()
    q_over = {"created_at": {"$lt": cutoff}, "payment_status": {"$nin": ["paid", "refunded"]}}
    if not is_mgr: q_over["agent_id"] = user["id"]
    overdue = await db.orders.find(q_over, {"_id": 0}).sort("created_at", 1).to_list(3)
    for o in overdue[:1]:
        tasks.append({"priority": "high", "type": "impaye", "title": f"Encaisser {o['client_name']} · {o.get('total',0):.0f}€", "action_path": f"/orders", "icon": "💳"})
    # 2. VIP silencieux à recontacter
    q_c = {"status": "vip"} if is_mgr else {"status": "vip", "$or": [{"owner_id": user["id"]}, {"assigned_to": user["id"]}]}
    vips = await db.clients.find(q_c, {"_id": 0}).to_list(50)
    now = datetime.now(timezone.utc)
    for c in vips:
        last = await db.activities.find_one({"client_id": c["id"]}, sort=[("created_at", -1)])
        try:
            days = (now - _dt.fromisoformat(last["created_at"].replace("Z","+00:00"))).days if last else 999
        except Exception: days = 999
        if days > 14:
            tasks.append({"priority": "medium", "type": "relance", "title": f"Appeler {c['name']} (VIP silencieux {days}j)", "action_path": f"/clients/{c['id']}", "icon": "📞"})
            break
    # 3. Deal proche du closing
    q_d = {"stage": {"$in": ["proposition", "negociation"]}} if is_mgr else {"stage": {"$in": ["proposition", "negociation"]}, "agent_id": user["id"]}
    deal = await db.deals.find_one(q_d, {"_id": 0}, sort=[("amount", -1)])
    if deal:
        tasks.append({"priority": "medium", "type": "deal", "title": f"Faire avancer '{deal['title']}' · {deal.get('amount',0):.0f}€", "action_path": "/deals", "icon": "🎯"})
    # Fill with visit if fewer than 3
    if len(tasks) < 3:
        tasks.append({"priority": "low", "type": "visit", "title": "Programmer une tournée cette semaine", "action_path": "/tours", "icon": "🚗"})
    return {"date": now.strftime("%Y-%m-%d"), "user": user["name"], "tasks": tasks[:3]}

# ---------- QUARTERLY REPORT PDF ----------
@api_router.get("/reports/quarterly/pdf")
async def quarterly_pdf(year: Optional[int] = None, quarter: Optional[int] = None, user=Depends(get_current_user)):
    from datetime import datetime as _dt
    now = datetime.now(timezone.utc)
    y = year or now.year
    q_num = quarter or ((now.month - 1) // 3 + 1)
    start_month = (q_num - 1) * 3 + 1
    months = [f"{y:04d}-{start_month + i:02d}" for i in range(3)]
    is_mgr = user["role"] == "manager"
    order_q = {} if is_mgr else {"agent_id": user["id"]}
    all_orders = await db.orders.find(order_q, {"_id": 0}).to_list(20000)
    q_orders = [o for o in all_orders if o.get("created_at","")[:7] in months]
    total_ca = sum(o.get("total", 0) for o in q_orders)
    from collections import defaultdict
    by_client = defaultdict(float); by_prod = defaultdict(lambda: {"ca": 0, "qty": 0})
    for o in q_orders:
        by_client[o["client_name"]] += o.get("total", 0)
        for l in o.get("lines", []):
            by_prod[l["product_name"]]["ca"] += l["quantity"] * l["unit_price"]
            by_prod[l["product_name"]]["qty"] += l["quantity"]
    top_clients = sorted(by_client.items(), key=lambda x: -x[1])[:5]
    top_prods = sorted(by_prod.items(), key=lambda x: -x[1]["ca"])[:5]
    # AI synthesis
    ctx = f"BILAN Q{q_num} {y}\nCA: {total_ca:.2f}€ sur {len(q_orders)} commandes\nTop clients: " + ", ".join([f"{n} ({v:.0f}€)" for n,v in top_clients])
    ctx += "\nTop produits: " + ", ".join([f"{n} ({v['ca']:.0f}€)" for n,v in top_prods])
    ai_text = ""
    try:
        req = AIRequest(prompt="Prépare un CR de comité de direction en 4 sections: 1) Verdict Q en 1 phrase, 2) Faits marquants (3 bullets), 3) Risques identifiés (2 bullets), 4) Recommandations stratégiques (3 bullets). Ton corporate, précis.", context=ctx, model="claude-sonnet-5")
        r = await ai_ask(req, user)
        ai_text = r.get("answer", "")
    except Exception:
        ai_text = "Synthèse IA indisponible."
    # PDF
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=40, leftMargin=50, rightMargin=50)
    styles = getSampleStyleSheet()
    title = ParagraphStyle('T', parent=styles['Title'], textColor=colors.HexColor("#4A154B"), fontSize=28, spaceAfter=6)
    over = ParagraphStyle('O', parent=styles['Normal'], fontSize=8, textColor=colors.grey, spaceAfter=16)
    h2 = ParagraphStyle('H2', parent=styles['Heading2'], textColor=colors.HexColor("#2D5A4C"), fontSize=14, spaceAfter=6)
    body = ParagraphStyle('B', parent=styles['Normal'], fontSize=10, leading=14)
    elems = [Paragraph("Comité de direction", over), Paragraph(f"Bilan Q{q_num} {y}", title),
             Paragraph(f"Chiffre d'affaires: <b>{total_ca:,.2f} €</b> · {len(q_orders)} commandes".replace(",", " "), body), Spacer(1, 16)]
    elems.append(Paragraph("Top 5 clients", h2))
    tc = [["Client", "CA (€)"]] + [[n, f"{v:,.2f}".replace(",", " ")] for n, v in top_clients]
    t = Table(tc, colWidths=[300, 100]); t.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,0), colors.HexColor("#4A154B")), ('TEXTCOLOR', (0,0), (-1,0), colors.white), ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'), ('GRID', (0,0), (-1,-1), 0.3, colors.HexColor("#E7E4DF")), ('BOTTOMPADDING', (0,0), (-1,-1), 6), ('TOPPADDING', (0,0), (-1,-1), 6)]))
    elems.extend([t, Spacer(1, 14), Paragraph("Top 5 produits", h2)])
    tp = [["Produit", "Quantité", "CA (€)"]] + [[n, str(v["qty"]), f"{v['ca']:,.2f}".replace(",", " ")] for n, v in top_prods]
    t2 = Table(tp, colWidths=[250, 70, 100]); t2.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,0), colors.HexColor("#2D5A4C")), ('TEXTCOLOR', (0,0), (-1,0), colors.white), ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'), ('GRID', (0,0), (-1,-1), 0.3, colors.HexColor("#E7E4DF")), ('BOTTOMPADDING', (0,0), (-1,-1), 6), ('TOPPADDING', (0,0), (-1,-1), 6)]))
    elems.extend([t2, Spacer(1, 20), Paragraph("Synthèse managériale (Claude Sonnet 5)", h2)])
    for para in ai_text.split("\n\n"):
        elems.append(Paragraph(para.replace("\n", "<br/>"), body)); elems.append(Spacer(1, 6))
    doc.build(elems); buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="bilan-Q{q_num}-{y}.pdf"'})

# ---------- SMART GOALS AI ----------
class SmartGoal(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    agent_name: str = ""
    year: int
    month: int
    title: str
    kpi_type: Literal["ca", "orders", "new_clients", "visits"] = "ca"
    target_value: float
    rationale: str = ""
    status: Literal["pending", "approved", "rejected"] = "pending"
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    owner_id: str
    created_at: str = Field(default_factory=now_iso)

@api_router.post("/goals/smart/suggest/{agent_id}")
async def suggest_smart(agent_id: str, user=Depends(get_current_user)):
    """IA propose 3 objectifs SMART pour le mois prochain."""
    from datetime import datetime as _dt
    now = datetime.now(timezone.utc)
    y = now.year if now.month < 12 else now.year + 1
    m = now.month + 1 if now.month < 12 else 1
    review = await monthly_review(agent_id, now.year, now.month, user)
    agent = review["agent"] or {}
    ctx = (f"Historique du mois en cours de {agent.get('name','?')}:\n"
           f"CA {review['ca']}€ vs {review['prev_ca']}€ (croiss. {review['growth_pct']}%)\n"
           f"Commandes: {review['orders_count']} · Panier moy: {review['avg_basket']}€\n"
           f"Clients touchés: {review['clients_reached']} · Nouveaux: {review['new_clients']}\n"
           f"Visites: {review['visits']} · Activités: {review['activities']}")
    prompt = (f"Propose 3 objectifs SMART pour {agent.get('name','?')} pour {m:02d}/{y}. "
              "Retourne UNIQUEMENT un JSON strict avec cette structure : "
              '{"goals":[{"title":"…","kpi_type":"ca|orders|new_clients|visits","target_value":<nombre>,"rationale":"1 phrase"}]}. '
              "Sois ambitieux mais réaliste (croissance 10-20% max). Aucun markdown.")
    req = AIRequest(prompt=prompt, context=ctx, model="claude-sonnet-5")
    ai = await ai_ask(req, user)
    import json, re
    try:
        clean = re.sub(r'```json|```', '', ai.get("answer", "")).strip()
        parsed = json.loads(clean)
        created = []
        for g in parsed.get("goals", [])[:3]:
            sg = SmartGoal(
                agent_id=agent_id, agent_name=agent.get("name",""), year=y, month=m,
                title=g.get("title",""), kpi_type=g.get("kpi_type","ca"),
                target_value=float(g.get("target_value", 0)), rationale=g.get("rationale",""),
                status="pending", owner_id=user["id"],
            )
            await db.smart_goals.insert_one(sg.model_dump())
            created.append(sg.model_dump())
        return {"created": created}
    except Exception as e:
        raise HTTPException(500, f"Parse IA échoué: {str(e)[:100]}")

@api_router.get("/goals/smart")
async def list_smart(status: Optional[str] = None, agent_id: Optional[str] = None, user=Depends(get_current_user)):
    is_mgr = user["role"] == "manager"
    q = {}
    if agent_id: q["agent_id"] = agent_id
    elif not is_mgr: q["agent_id"] = user["id"]
    if status: q["status"] = status
    items = await db.smart_goals.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

@api_router.put("/goals/smart/{gid}")
async def review_smart(gid: str, data: dict, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Seul un manager peut valider")
    new_status = data.get("status")
    if new_status not in ("approved", "rejected", "pending"):
        raise HTTPException(400, "Statut invalide")
    upd = {"status": new_status, "reviewed_by": user["id"], "reviewed_at": now_iso()}
    if "target_value" in data:
        upd["target_value"] = float(data["target_value"])
    if "title" in data:
        upd["title"] = data["title"]
    await db.smart_goals.update_one({"id": gid}, {"$set": upd})
    g = await db.smart_goals.find_one({"id": gid}, {"_id": 0})
    # If approved and ca goal, sync to monthly Goals collection
    if new_status == "approved" and g and g.get("kpi_type") == "ca":
        existing = await db.goals.find_one({"agent_id": g["agent_id"], "year": g["year"], "month": g["month"]})
        if existing:
            await db.goals.update_one({"id": existing["id"]}, {"$set": {"target_ca": g["target_value"]}})
        else:
            mg = MonthlyGoal(agent_id=g["agent_id"], year=g["year"], month=g["month"], target_ca=g["target_value"], owner_id=user["id"])
            await db.goals.insert_one(mg.model_dump())
    return g

# ---------- ANNIVERSARIES ----------
@api_router.get("/anniversaries")
async def anniversaries(days: int = 30, user=Depends(get_current_user)):
    from datetime import datetime as _dt, timedelta as _td
    is_mgr = user["role"] == "manager"
    q = {} if is_mgr else {"$or": [{"owner_id": user["id"]}, {"assigned_to": user["id"]}]}
    clients = await db.clients.find(q, {"_id": 0}).to_list(2000)
    now = datetime.now(timezone.utc)
    horizon = now + _td(days=days)
    items = []
    for c in clients:
        # first order date
        first = await db.orders.find_one({"client_id": c["id"]}, {"_id": 0, "created_at": 1}, sort=[("created_at", 1)])
        events = []
        try:
            created = _dt.fromisoformat(c["created_at"].replace("Z", "+00:00"))
            # next anniversary of onboarding
            anniv = created.replace(year=now.year)
            if anniv < now:
                anniv = anniv.replace(year=now.year + 1)
            if anniv <= horizon:
                yrs = now.year - created.year if anniv.year == now.year else now.year - created.year + 1
                if yrs >= 1:
                    events.append({"kind": "compte", "date": anniv.strftime("%Y-%m-%d"), "years": yrs, "label": f"{yrs} an{'s' if yrs>1 else ''} chez BEVID"})
        except Exception:
            pass
        if first:
            try:
                fd = _dt.fromisoformat(first["created_at"].replace("Z", "+00:00"))
                anniv = fd.replace(year=now.year)
                if anniv < now: anniv = anniv.replace(year=now.year + 1)
                if anniv <= horizon:
                    yrs = now.year - fd.year if anniv.year == now.year else now.year - fd.year + 1
                    if yrs >= 1:
                        events.append({"kind": "premiere_commande", "date": anniv.strftime("%Y-%m-%d"), "years": yrs, "label": f"{yrs} an{'s' if yrs>1 else ''} de collaboration"})
            except Exception:
                pass
        for ev in events:
            items.append({"client_id": c["id"], "client_name": c["name"], "type": c.get("type"), "city": c.get("city"), "phone": c.get("phone"), "email": c.get("email"), **ev})
    items.sort(key=lambda x: x["date"])
    return {"count": len(items), "items": items}

# ---------- BRASSERIE LOT 1 : ESTABLISHMENTS / PRICE LISTS / DEROGATIONS ----------
class Establishment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    siret: Optional[str] = ""
    type: Literal["bar", "restaurant", "caviste", "hotel", "epicerie", "autre"] = "bar"
    address: Optional[str] = ""
    city: Optional[str] = ""
    postal_code: Optional[str] = ""
    region: Optional[str] = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    price_list_id: Optional[str] = None
    credit_limit: float = 0.0
    current_credit: float = 0.0
    overdue_amount: float = 0.0
    overdue_days: int = 0
    payment_terms_days: Optional[int] = None
    credit_status: Optional[str] = None
    credit_status_updated_at: Optional[str] = None
    tags: List[str] = []
    notes: Optional[str] = ""
    assigned_to: Optional[str] = None
    active: bool = True
    owner_id: str
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)

def credit_color(est: dict) -> str:
    limit = est.get("credit_limit") or 0
    current = est.get("current_credit") or 0
    overdue_days = est.get("overdue_days") or 0
    if overdue_days > 30 or (limit and current >= limit):
        return "rouge"
    if overdue_days > 0 or (limit and current >= limit * 0.6):
        return "orange"
    return "vert"

class PriceList(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    is_default: bool = False
    currency: str = "EUR"
    max_discount_pct: float = 15.0
    owner_id: str
    created_at: str = Field(default_factory=now_iso)

class PriceListItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    price_list_id: str
    product_id: str
    unit_price: float
    min_qty: int = 1
    max_discount_pct: Optional[float] = None

class Derogation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    establishment_id: str
    agent_id: str
    reason: str
    requested_amount: float
    status: Literal["pending", "approved", "rejected"] = "pending"
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    owner_id: str
    created_at: str = Field(default_factory=now_iso)

def strip_cost_fields(role: str, obj: dict) -> dict:
    if role != "gerant" and role != "manager":
        for k in ["cost_price", "margin_target", "margin", "cost"]:
            obj.pop(k, None)
    return obj

@api_router.get("/establishments")
async def list_establishments(user=Depends(get_current_user)):
    is_mgr = user["role"] in ("manager", "gerant")
    q = {} if is_mgr else {"assigned_to": user["id"]}
    items = await db.establishments.find(q, {"_id": 0}).sort("name", 1).to_list(2000)
    for e in items:
        e["credit_status"] = credit_color(e)
    return items

@api_router.post("/establishments")
async def create_establishment(data: dict, user=Depends(get_current_user)):
    data["owner_id"] = user["id"]
    data.setdefault("assigned_to", user["id"])
    e = Establishment(**data)
    doc = e.model_dump()
    doc["credit_status"] = credit_color(doc)
    await db.establishments.insert_one(doc.copy())
    return doc

@api_router.get("/establishments/{eid}")
async def get_establishment(eid: str, user=Depends(get_current_user)):
    e = await db.establishments.find_one({"id": eid}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Établissement introuvable")
    e["credit_status"] = credit_color(e)
    # top 3 references from last 12 months
    from datetime import timedelta as _td
    since = (datetime.now(timezone.utc) - _td(days=365)).isoformat()
    orders = await db.orders.find({"client_id": eid, "created_at": {"$gte": since}}, {"_id": 0}).to_list(500)
    from collections import defaultdict
    stats = defaultdict(lambda: {"qty": 0, "name": ""})
    volumes_by_month = defaultdict(float)
    for o in orders:
        volumes_by_month[o.get("created_at", "")[:7]] += o.get("total", 0)
        for l in o.get("lines", []):
            stats[l["product_id"]]["qty"] += l["quantity"]
            stats[l["product_id"]]["name"] = l["product_name"]
    top3 = sorted([{"product_id": k, **v} for k, v in stats.items()], key=lambda x: -x["qty"])[:3]
    last_visit = await db.visits.find_one({"client_id": eid}, {"_id": 0}, sort=[("created_at", -1)])
    return {**e, "top_products": top3, "volumes_12m": [{"month": k, "ca": round(v, 2)} for k, v in sorted(volumes_by_month.items())], "last_visit": last_visit}

@api_router.put("/establishments/{eid}")
async def update_est(eid: str, data: dict, user=Depends(get_current_user)):
    data.pop("id", None); data.pop("_id", None); data.pop("owner_id", None)
    data["updated_at"] = now_iso()
    await db.establishments.update_one({"id": eid}, {"$set": data})
    return await db.establishments.find_one({"id": eid}, {"_id": 0})

@api_router.get("/price-lists")
async def list_price_lists(user=Depends(get_current_user)):
    return await db.price_lists.find({}, {"_id": 0}).to_list(200)

@api_router.post("/price-lists")
async def create_price_list(data: dict, user=Depends(get_current_user)):
    data["owner_id"] = user["id"]
    p = PriceList(**data)
    await db.price_lists.insert_one(p.model_dump())
    return p.model_dump()

@api_router.get("/price-lists/{plid}/items")
async def price_list_items(plid: str, user=Depends(get_current_user)):
    return await db.price_list_items.find({"price_list_id": plid}, {"_id": 0}).to_list(2000)

@api_router.put("/price-lists/{plid}/items")
async def upsert_price_list_item(plid: str, data: dict, user=Depends(get_current_user)):
    data["price_list_id"] = plid
    q = {"price_list_id": plid, "product_id": data.get("product_id")}
    existing = await db.price_list_items.find_one(q)
    if existing:
        await db.price_list_items.update_one(q, {"$set": {"unit_price": float(data.get("unit_price", 0)), "min_qty": int(data.get("min_qty", 1))}})
    else:
        item = PriceListItem(**data)
        await db.price_list_items.insert_one(item.model_dump())
    return {"ok": True}

@api_router.get("/establishments/{eid}/catalog")
async def establishment_catalog(eid: str, user=Depends(get_current_user)):
    """Retourne le catalogue avec les prix personnalisés + quantités habituelles depuis historique."""
    e = await db.establishments.find_one({"id": eid}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Établissement introuvable")
    products = await db.products.find({}, {"_id": 0}).to_list(2000)
    pl_id = e.get("price_list_id")
    price_map = {}
    if pl_id:
        items = await db.price_list_items.find({"price_list_id": pl_id}, {"_id": 0}).to_list(2000)
        price_map = {i["product_id"]: i for i in items}
    # habitual qty from last 6 months
    from datetime import timedelta as _td
    since = (datetime.now(timezone.utc) - _td(days=180)).isoformat()
    orders = await db.orders.find({"client_id": eid, "created_at": {"$gte": since}}, {"_id": 0}).to_list(500)
    from collections import defaultdict
    qty_stats = defaultdict(list)
    for o in orders:
        for l in o.get("lines", []):
            qty_stats[l["product_id"]].append(l["quantity"])
    result = []
    for p in products:
        pm = price_map.get(p["id"])
        unit_price = pm["unit_price"] if pm else p.get("price", 0)
        qtys = qty_stats.get(p["id"], [])
        habitual_qty = round(sum(qtys) / len(qtys)) if qtys else 0
        result.append(strip_cost_fields(user["role"], {
            **p, "unit_price_client": unit_price,
            "habitual_qty": habitual_qty,
            "on_price_list": pm is not None,
            "volume_liters": p.get("volume_liters"),
            "hecto_tiers": p.get("hecto_tiers", []),
        }))
    max_discount = 15.0
    if pl_id:
        pl = await db.price_lists.find_one({"id": pl_id}, {"_id": 0}) or {}
        max_discount = pl.get("max_discount_pct", 15.0)
    return {"establishment": {**e, "credit_status": credit_color(e)}, "products": result, "max_discount_pct": max_discount}

@api_router.post("/derogations")
async def create_derogation(data: dict, user=Depends(get_current_user)):
    data["owner_id"] = user["id"]
    data["agent_id"] = user["id"]
    d = Derogation(**data)
    await db.derogations.insert_one(d.model_dump())
    # notify gerant via alert
    await db.alerts.insert_one({
        "id": str(uuid.uuid4()), "target_role": "gerant", "kind": "derogation_requested",
        "establishment_id": data.get("establishment_id"), "payload": d.model_dump(),
        "severity": "high", "seen": False, "created_at": now_iso(),
    })
    return d.model_dump()

@api_router.get("/derogations")
async def list_derogations(status: Optional[str] = None, user=Depends(get_current_user)):
    q = {} if user["role"] in ("manager", "gerant") else {"agent_id": user["id"]}
    if status: q["status"] = status
    return await db.derogations.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)

@api_router.put("/derogations/{did}")
async def review_derogation(did: str, data: dict, user=Depends(get_current_user)):
    if user["role"] not in ("manager", "gerant"):
        raise HTTPException(403, "Manager only")
    st = data.get("status")
    if st not in ("approved", "rejected"):
        raise HTTPException(400, "status invalide")
    await db.derogations.update_one({"id": did}, {"$set": {"status": st, "reviewed_by": user["id"], "reviewed_at": now_iso()}})
    return await db.derogations.find_one({"id": did}, {"_id": 0})

# ---------- SYNC BOOTSTRAP (offline PWA) ----------
@api_router.get("/sync/bootstrap")
async def sync_bootstrap(user=Depends(get_current_user)):
    """Dump initial pour hydratation IndexedDB du portefeuille du commercial."""
    from datetime import timedelta as _td
    since_12m = (datetime.now(timezone.utc) - _td(days=365)).isoformat()
    is_mgr = user["role"] in ("manager", "gerant")
    est_q = {} if is_mgr else {"assigned_to": user["id"]}
    establishments = await db.establishments.find(est_q, {"_id": 0}).to_list(5000)
    for e in establishments:
        e["credit_status"] = credit_color(e)
    est_ids = [e["id"] for e in establishments]
    products = await db.products.find({}, {"_id": 0}).to_list(5000)
    products = [strip_cost_fields(user["role"], p) for p in products]
    price_lists = await db.price_lists.find({}, {"_id": 0}).to_list(200)
    price_list_items = await db.price_list_items.find({}, {"_id": 0}).to_list(20000)
    orders_q = {"created_at": {"$gte": since_12m}}
    if not is_mgr: orders_q["client_id"] = {"$in": est_ids}
    orders = await db.orders.find(orders_q, {"_id": 0}).to_list(20000)
    visits_q = {"created_at": {"$gte": since_12m}}
    if not is_mgr: visits_q["client_id"] = {"$in": est_ids}
    visits = await db.visits.find(visits_q, {"_id": 0}).to_list(10000)
    return {
        "user": {k: user[k] for k in user if k != "password"},
        "server_time": now_iso(),
        "snapshot_at": now_iso(),
        "establishments": establishments,
        "products": products,
        "price_lists": price_lists,
        "price_list_items": price_list_items,
        "orders": orders,
        "visits": visits,
    }

@api_router.post("/sync/push")
async def sync_push(data: dict, user=Depends(get_current_user)):
    """Recoit une file d'opérations locales. Détecte conflits (updated_at serveur > client)."""
    conflicts = []
    applied = []
    for op in data.get("operations", []):
        entity = op.get("entity")  # visits, orders, establishments
        payload = op.get("payload", {})
        local_id = op.get("local_id")
        col = getattr(db, entity, None)
        if col is None:
            continue
        eid = payload.get("id")
        if eid:
            server = await col.find_one({"id": eid}, {"_id": 0})
            if server and server.get("updated_at") and payload.get("client_base_updated_at"):
                if server["updated_at"] > payload["client_base_updated_at"]:
                    conflicts.append({"entity": entity, "id": eid, "local_id": local_id, "server_version": server})
                    await db.sync_conflicts.insert_one({"id": str(uuid.uuid4()), "entity": entity, "record_id": eid, "local_payload": payload, "server_version": server, "user_id": user["id"], "created_at": now_iso()})
                    continue
        payload["owner_id"] = payload.get("owner_id", user["id"])
        payload["updated_at"] = now_iso()
        payload.pop("client_base_updated_at", None)
        if not eid:
            payload["id"] = str(uuid.uuid4())
        await col.update_one({"id": payload["id"]}, {"$set": payload}, upsert=True)
        applied.append({"entity": entity, "id": payload["id"], "local_id": local_id})
    return {"applied": applied, "conflicts": conflicts}

@api_router.get("/sync/conflicts")
async def sync_conflicts(user=Depends(get_current_user)):
    if user["role"] not in ("manager", "gerant"):
        raise HTTPException(403, "Manager only")
    return await db.sync_conflicts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

# ---------- BRASSERIE LOT 1 SUITE : PRODUITS ENRICHIS / SEGMENTS / ALERTES / CARNET / MARGES ----------
class ProductEnriched(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    product_id: str
    style: Optional[str] = ""
    abv: Optional[float] = None
    formats: List[str] = []
    arguments: List[str] = []
    accords: Optional[str] = ""
    cible: Optional[str] = ""
    stock_status: Literal["disponible", "tension", "epuise"] = "disponible"
    stock_updated_at: Optional[str] = None
    documents: List[dict] = []  # [{name, url, kind}]
    updated_at: str = Field(default_factory=now_iso)

@api_router.get("/products/{pid}/enriched")
async def get_enriched(pid: str, user=Depends(get_current_user)):
    e = await db.product_enriched.find_one({"product_id": pid}, {"_id": 0})
    return e or {"product_id": pid, "style": "", "arguments": [], "documents": [], "stock_status": "disponible"}

@api_router.put("/products/{pid}/enriched")
async def upsert_enriched(pid: str, data: dict, user=Depends(get_current_user)):
    data["product_id"] = pid
    data["updated_at"] = now_iso()
    if data.get("stock_status"):
        data["stock_updated_at"] = now_iso()
    existing = await db.product_enriched.find_one({"product_id": pid})
    if existing:
        await db.product_enriched.update_one({"product_id": pid}, {"$set": data})
    else:
        e = ProductEnriched(**data)
        await db.product_enriched.insert_one(e.model_dump())
    return await db.product_enriched.find_one({"product_id": pid}, {"_id": 0})

# ---------- SEGMENTS + FREQUENCE CIBLE ----------
class Segment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str  # A, B, C, prospect
    label: str
    target_visit_days: int  # 21 for A (3 sem)
    owner_id: str
    created_at: str = Field(default_factory=now_iso)

@api_router.get("/segments")
async def list_segments(user=Depends(get_current_user)):
    items = await db.segments.find({}, {"_id": 0}).to_list(50)
    if not items:
        # bootstrap defaults
        defaults = [
            {"code": "A", "label": "Comptes prioritaires", "target_visit_days": 21},
            {"code": "B", "label": "Comptes réguliers", "target_visit_days": 60},
            {"code": "C", "label": "Comptes occasionnels", "target_visit_days": 180},
            {"code": "prospect", "label": "Prospects", "target_visit_days": 30},
        ]
        for d in defaults:
            s = Segment(**d, owner_id=user["id"])
            await db.segments.insert_one(s.model_dump())
        items = await db.segments.find({}, {"_id": 0}).to_list(50)
    return items

@api_router.put("/segments/{sid}")
async def update_segment(sid: str, data: dict, user=Depends(get_current_user)):
    if user["role"] not in ("manager", "gerant"):
        raise HTTPException(403, "Manager only")
    data.pop("id", None); data.pop("_id", None)
    await db.segments.update_one({"id": sid}, {"$set": data})
    return await db.segments.find_one({"id": sid}, {"_id": 0})

@api_router.get("/tasks/today")
async def tasks_today(user=Depends(get_current_user)):
    """Liste 'à visiter cette semaine' + rappels next_action datés + alertes écart."""
    from datetime import datetime as _dt, timedelta as _td
    now = datetime.now(timezone.utc)
    is_mgr = user["role"] in ("manager", "gerant")
    est_q = {} if is_mgr else {"assigned_to": user["id"]}
    ests = await db.establishments.find(est_q, {"_id": 0}).to_list(2000)
    segments = {s["code"]: s for s in await db.segments.find({}, {"_id": 0}).to_list(50)}
    tasks = []
    for e in ests:
        seg = segments.get(e.get("segment", "B"), segments.get("B"))
        target_days = seg["target_visit_days"] if seg else 60
        last = await db.visits.find_one({"client_id": e["id"]}, sort=[("created_at", -1)])
        try:
            days_since = (now - _dt.fromisoformat(last["created_at"].replace("Z","+00:00"))).days if last else 999
        except Exception:
            days_since = 999
        if days_since >= target_days:
            urgency = "high" if days_since >= target_days * 1.5 else "medium"
            tasks.append({"kind": "visite_due", "establishment_id": e["id"], "name": e["name"], "days_since": days_since, "target_days": target_days, "urgency": urgency})
    # rappels next_action datés
    upcoming = await db.visits.find({"next_date": {"$gte": now.strftime("%Y-%m-%d"), "$lte": (now + _td(days=7)).strftime("%Y-%m-%d")}}, {"_id": 0}).to_list(200)
    for v in upcoming:
        if not is_mgr and v.get("agent_id") != user["id"]:
            continue
        tasks.append({"kind": "next_action", "establishment_id": v.get("client_id"), "action": v.get("next_action"), "date": v.get("next_date"), "urgency": "medium"})
    tasks.sort(key=lambda x: (0 if x["urgency"]=="high" else 1, -x.get("days_since", 0)))
    return tasks

@api_router.get("/coverage")
async def coverage(user=Depends(get_current_user)):
    from datetime import datetime as _dt, timedelta as _td
    now = datetime.now(timezone.utc)
    since_30 = (now - _td(days=30)).isoformat()
    since_90 = (now - _td(days=90)).isoformat()
    ests = await db.establishments.find({}, {"_id": 0}).to_list(5000)
    segments = {s["code"]: s for s in await db.segments.find({}, {"_id": 0}).to_list(50)}
    from collections import defaultdict
    by_seg = defaultdict(lambda: {"total": 0, "visited_30": 0, "visited_90": 0})
    for e in ests:
        code = e.get("segment", "B")
        by_seg[code]["total"] += 1
        v30 = await db.visits.find_one({"client_id": e["id"], "created_at": {"$gte": since_30}})
        v90 = await db.visits.find_one({"client_id": e["id"], "created_at": {"$gte": since_90}})
        if v30: by_seg[code]["visited_30"] += 1
        if v90: by_seg[code]["visited_90"] += 1
    result = []
    for code, stats in by_seg.items():
        seg = segments.get(code, {})
        pct_30 = round(stats["visited_30"] / stats["total"] * 100, 1) if stats["total"] else 0
        pct_90 = round(stats["visited_90"] / stats["total"] * 100, 1) if stats["total"] else 0
        result.append({"segment": code, "label": seg.get("label", code), "total": stats["total"], "coverage_30d": pct_30, "coverage_90d": pct_90})
    return result

# ---------- ALERTES ECART FREQUENCE + VOLUME (cron hebdo) ----------
class AlertRule(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    freq_deviation_pct: float = 25.0  # écart >25% = alerte
    volume_deviation_pct: float = 20.0
    high_volume_hl: float = 20.0  # >20hL/an = enjeu high
    medium_volume_hl: float = 5.0
    owner_id: str

@api_router.get("/alerts/deviation-rules")
async def get_rules(user=Depends(get_current_user)):
    r = await db.alert_rules.find_one({}, {"_id": 0})
    return r or AlertRule(owner_id=user["id"]).model_dump()

@api_router.put("/alerts/deviation-rules")
async def set_rules(data: dict, user=Depends(get_current_user)):
    if user["role"] not in ("manager", "gerant"):
        raise HTTPException(403, "Manager only")
    existing = await db.alert_rules.find_one({})
    if existing:
        await db.alert_rules.update_one({"id": existing["id"]}, {"$set": data})
    else:
        data["owner_id"] = user["id"]
        r = AlertRule(**data)
        await db.alert_rules.insert_one(r.model_dump())
    return await db.alert_rules.find_one({}, {"_id": 0})

async def _compute_deviations():
    from datetime import datetime as _dt, timedelta as _td
    now = datetime.now(timezone.utc)
    rules = await db.alert_rules.find_one({}, {"_id": 0}) or AlertRule(owner_id="system").model_dump()
    ests = await db.establishments.find({}, {"_id": 0}).to_list(5000)
    created = 0
    for e in ests:
        # Frequency deviation : compare last 90j vs previous 90j
        orders_last = await db.orders.find({"client_id": e["id"], "created_at": {"$gte": (now - _td(days=90)).isoformat()}}, {"_id": 0}).to_list(500)
        orders_prev = await db.orders.find({"client_id": e["id"], "created_at": {"$gte": (now - _td(days=180)).isoformat(), "$lt": (now - _td(days=90)).isoformat()}}, {"_id": 0}).to_list(500)
        if not orders_prev:
            continue
        freq_dev = ((len(orders_last) - len(orders_prev)) / len(orders_prev)) * 100
        # Volume deviation vs same period year ago
        orders_ya = await db.orders.find({"client_id": e["id"], "created_at": {"$gte": (now - _td(days=455)).isoformat(), "$lt": (now - _td(days=365)).isoformat()}}, {"_id": 0}).to_list(500)
        vol_last = sum(o.get("total", 0) for o in orders_last)
        vol_ya = sum(o.get("total", 0) for o in orders_ya) if orders_ya else 0
        vol_dev = ((vol_last - vol_ya) / vol_ya * 100) if vol_ya else 0
        annual_hl = e.get("annual_volume_hl", 0)
        severity = "low"
        if annual_hl >= rules["high_volume_hl"]: severity = "high"
        elif annual_hl >= rules["medium_volume_hl"]: severity = "medium"
        if abs(freq_dev) > rules["freq_deviation_pct"] or abs(vol_dev) > rules["volume_deviation_pct"]:
            await db.alerts.insert_one({
                "id": str(uuid.uuid4()), "target_user_id": e.get("assigned_to"),
                "kind": "deviation", "establishment_id": e["id"],
                "payload": {"freq_dev_pct": round(freq_dev,1), "vol_dev_pct": round(vol_dev,1), "annual_hl": annual_hl, "name": e["name"]},
                "severity": severity, "seen": False, "created_at": now_iso(),
            })
            created += 1
    return created

@api_router.post("/cron/deviation-alerts")
async def cron_deviation(request: Request, authorization: Optional[str] = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    import hmac, asyncio
    if not authorization or not authorization.startswith("Bearer ") or not hmac.compare_digest(authorization.split(" ",1)[1], WEBHOOK_CRON_SECRET):
        raise HTTPException(401, "auth invalide")
    asyncio.create_task(_compute_deviations())
    return {"status": "queued"}

# ---------- CARNET COMMANDES SIGNÉES NON LIVRÉES + PRÉVISION ----------
@api_router.get("/orderbook")
async def orderbook(user=Depends(get_current_user)):
    from datetime import datetime as _dt, timedelta as _td
    now = datetime.now(timezone.utc)
    is_mgr = user["role"] in ("manager", "gerant")
    q = {"status": {"$in": ["signee", "confirme", "validee"]}, "delivery_status": {"$ne": "livree"}}
    if not is_mgr: q["agent_id"] = user["id"]
    orders = await db.orders.find(q, {"_id": 0}).to_list(2000)
    from collections import defaultdict
    signed_by_week = defaultdict(lambda: defaultdict(float))
    for o in orders:
        d = o.get("delivery_date") or o.get("created_at","")[:10]
        try:
            dt = _dt.fromisoformat(d)
            wk = dt.strftime("%Y-W%W")
        except Exception:
            wk = "unknown"
        for l in o.get("lines", []):
            signed_by_week[wk][l["product_name"]] += l["quantity"]
    # Forecast: intentions from visits + historical avg
    intentions = await db.visits.find({"volume_previsionnel": {"$gt": 0}}, {"_id": 0}).to_list(500)
    hist_avg_weekly = 0
    all_orders_year = await db.orders.find({"created_at": {"$gte": (now - _td(days=365)).isoformat()}}, {"_id": 0}).to_list(20000)
    if all_orders_year:
        total_units = sum(l["quantity"] for o in all_orders_year for l in o.get("lines", []))
        hist_avg_weekly = round(total_units / 52, 1)
    return {
        "signed_by_week": {wk: dict(prods) for wk, prods in signed_by_week.items()},
        "intentions_count": len(intentions),
        "intentions_total_units": sum(v.get("volume_previsionnel", 0) for v in intentions),
        "historical_avg_weekly_units": hist_avg_weekly,
        "signed_count": len(orders),
    }

# ---------- MARGES (gerant only) ----------
class ProductCost(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    product_id: str
    cost_matieres: float = 0.0
    cost_emballage: float = 0.0
    cost_mo: float = 0.0
    cost_accises: float = 0.0
    total_cost: float = 0.0
    effective_from: str = Field(default_factory=now_iso)
    owner_id: str

@api_router.get("/costs/{pid}")
async def get_cost(pid: str, user=Depends(get_current_user)):
    if user["role"] not in ("manager", "gerant"):
        raise HTTPException(403, "Manager only")
    c = await db.product_costs.find_one({"product_id": pid}, {"_id": 0}, sort=[("effective_from", -1)])
    return c or {"product_id": pid, "total_cost": 0}

@api_router.post("/costs/{pid}")
async def set_cost(pid: str, data: dict, user=Depends(get_current_user)):
    if user["role"] not in ("manager", "gerant"):
        raise HTTPException(403, "Manager only")
    data["product_id"] = pid
    data["total_cost"] = sum([float(data.get(k, 0)) for k in ["cost_matieres", "cost_emballage", "cost_mo", "cost_accises"]])
    data["owner_id"] = user["id"]
    c = ProductCost(**data)
    await db.product_costs.insert_one(c.model_dump())
    return c.model_dump()

@api_router.get("/margins/top-clients")
async def top_margin_clients(user=Depends(get_current_user)):
    if user["role"] not in ("manager", "gerant"):
        raise HTTPException(403, "Manager only")
    # Verrou : marges masquées tant que les coûts ne sont pas validés
    s = await db.org_settings.find_one({"id": "global"}, {"_id": 0}) or {}
    if not s.get("costs_validated_at"):
        raise HTTPException(423, "Coûts de revient non validés — marges désactivées")
    orders = await db.orders.find({}, {"_id": 0}).to_list(20000)
    costs = {c["product_id"]: c["total_cost"] async for c in db.product_costs.find({}, {"_id": 0})}
    from collections import defaultdict
    margin_by_client = defaultdict(lambda: {"name": "", "ca": 0, "marge": 0, "discount_pcts": []})
    neg_lines = []
    for o in orders:
        cid = o["client_id"]; margin_by_client[cid]["name"] = o["client_name"]
        for l in o.get("lines", []):
            revenue = l["quantity"] * l["unit_price"]
            cost = costs.get(l["product_id"], 0) * l["quantity"]
            margin = revenue - cost
            margin_by_client[cid]["ca"] += revenue
            margin_by_client[cid]["marge"] += margin
            if margin < 0:
                neg_lines.append({"client": o["client_name"], "product": l["product_name"], "margin": round(margin, 2)})
    result = [{"client_id": k, "name": v["name"], "ca": round(v["ca"], 2), "marge": round(v["marge"], 2), "taux_marge_pct": round(v["marge"]/v["ca"]*100, 1) if v["ca"] else 0} for k, v in margin_by_client.items()]
    result.sort(key=lambda x: -x["marge"])
    return {"top10_marge": result[:10], "lignes_marge_negative": neg_lines[:20]}

# ==========================================================
# ADMIN USER MANAGEMENT (manager crée/gère les commerciaux)
# ==========================================================
@api_router.get("/admin/users")
async def admin_list_users(user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    items = await db.users.find({}, {"_id": 0, "password": 0}).sort("created_at", -1).to_list(500)
    return items

@api_router.post("/admin/users")
async def admin_create_user(data: dict, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    email = (data.get("email") or "").strip().lower()
    name = (data.get("name") or "").strip()
    if not email or not name:
        raise HTTPException(422, "email + name requis")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email déjà utilisé")
    import secrets, string
    tmp_pwd = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(12))
    role = data.get("role", "commercial")
    if role not in ("commercial", "manager"):
        role = "commercial"
    u = User(email=email, name=name, role=role)
    doc = u.model_dump()
    doc["password"] = hash_password(tmp_pwd)
    doc["must_reset"] = True
    doc["active"] = True
    await db.users.insert_one(doc)
    await audit_log(user["id"], "user_create", {"target_user_id": u.id, "email": email, "role": role})
    return {"user": u.model_dump(), "temp_password": tmp_pwd}

@api_router.put("/admin/users/{uid}")
async def admin_update_user(uid: str, data: dict, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    updates = {}
    for k in ("name", "role", "active"):
        if k in data:
            updates[k] = data[k]
    if updates:
        await db.users.update_one({"id": uid}, {"$set": updates})
        await audit_log(user["id"], "user_update", {"target_user_id": uid, "fields": list(updates.keys())})
    return await db.users.find_one({"id": uid}, {"_id": 0, "password": 0})

@api_router.post("/admin/users/{uid}/reset-password")
async def admin_reset_password(uid: str, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    import secrets, string
    tmp_pwd = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(12))
    await db.users.update_one({"id": uid}, {"$set": {"password": hash_password(tmp_pwd), "must_reset": True}})
    await audit_log(user["id"], "password_reset_admin", {"target_user_id": uid})
    return {"temp_password": tmp_pwd}

# ==========================================================
# PASSWORD FORGOT/CHANGE (mode dégradé sans email)
# ==========================================================
@api_router.post("/auth/forgot-password")
async def forgot_password(data: dict, request: Request):
    """Envoi d'un email avec lien de réinitialisation (Emergent Resend). Rate-limité 3/15 min."""
    email = (data.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(422, "Email requis")
    ip = _client_ip(request)
    _rate_limit_check(kind="forgot", ip=ip, email=email, max_attempts=3, window_min=15)
    _rate_limit_record(kind="forgot", ip=ip, email=email)
    u = await db.users.find_one({"email": email})
    # Réponse identique pour ne pas divulguer l'existence du compte
    if u:
        # Token 32 hex, expire dans 60 min, à usage unique
        import secrets
        token = secrets.token_urlsafe(32)
        expiry = (datetime.now(timezone.utc) + timedelta(minutes=60)).isoformat()
        await db.password_reset_tokens.insert_one({
            "id": str(uuid.uuid4()), "user_id": u["id"], "email": email,
            "token": token, "expires_at": expiry, "used": False,
            "created_at": now_iso(),
        })
        # URL frontend
        frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
        reset_url = f"{frontend}/reset-password/{token}"
        subject = "Réinitialisation de votre mot de passe BEVID"
        # Template server-side. Pas de <form>/<input>. Liens https absolus, ancre = hôte.
        safe_url = reset_url
        html = (
            '<table role="presentation" width="100%" style="background:#F7F5F2">'
            '<tr><td style="padding:32px 16px">'
            '<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;'
            'background:#fff;border-radius:12px;font-family:Arial,sans-serif;color:#1a1a1a">'
            '<tr><td style="padding:32px">'
            f'<h1 style="margin:0 0 16px 0;font-size:22px;color:#4A154B">BEVID</h1>'
            f'<p style="margin:0 0 12px 0">Bonjour {escape(u.get("name") or "")},</p>'
            f'<p style="margin:0 0 12px 0">Vous avez demandé la réinitialisation de votre mot de passe. '
            f'Ouvrez le lien ci-dessous pour en choisir un nouveau. Ce lien expire dans 60 minutes.</p>'
            f'<p style="margin:24px 0"><a href="{safe_url}" '
            f'style="background:#4A154B;color:#fff;padding:12px 24px;border-radius:8px;'
            f'text-decoration:none;font-weight:600">Choisir un nouveau mot de passe</a></p>'
            f'<p style="margin:12px 0 0 0;font-size:12px;color:#666">'
            f'Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet email — '
            f'votre mot de passe actuel reste valide.</p>'
            f'<p style="margin:24px 0 0 0;font-size:11px;color:#888">'
            f'Envoyé par BEVID. Nous ne vous demandons jamais votre mot de passe par email.</p>'
            '</td></tr></table></td></tr></table>'
        )
        try:
            await send_email(to=email, subject=subject, html=html)
            await audit_log(u["id"], "password_reset_email_sent", {"email": email})
        except Exception as e:
            logger.exception("send reset email failed: %s", e)
            # ne pas révéler l'erreur au caller
    return {"ok": True, "message": "Si le compte existe, un email vient d'être envoyé."}

@api_router.post("/auth/reset-password")
async def reset_password(data: dict):
    token = (data.get("token") or "").strip()
    new = data.get("new_password", "")
    if not token or len(new) < 8:
        raise HTTPException(422, "Token + nouveau mot de passe (8 caractères minimum) requis")
    doc = await db.password_reset_tokens.find_one({"token": token, "used": False}, {"_id": 0})
    if not doc:
        raise HTTPException(400, "Lien invalide ou déjà utilisé")
    try:
        exp = datetime.fromisoformat(doc["expires_at"])
    except Exception:
        raise HTTPException(400, "Lien invalide")
    if datetime.now(timezone.utc) > exp:
        raise HTTPException(400, "Lien expiré — redemandez une réinitialisation")
    await db.users.update_one({"id": doc["user_id"]}, {"$set": {"password": hash_password(new), "must_reset": False}})
    await db.password_reset_tokens.update_one({"token": token}, {"$set": {"used": True, "used_at": now_iso()}})
    await audit_log(doc["user_id"], "password_reset_via_email", {"email": doc.get("email")})
    return {"ok": True}

@api_router.get("/admin/reset-requests")
async def list_reset_requests(user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    items = await db.password_reset_requests.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items

@api_router.post("/admin/reset-requests/{rid}/approve")
async def approve_reset(rid: str, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    req = await db.password_reset_requests.find_one({"id": rid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Demande introuvable")
    if req.get("status") != "pending":
        raise HTTPException(409, "Demande déjà traitée")
    import secrets, string
    tmp_pwd = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(12))
    await db.users.update_one({"id": req["user_id"]}, {"$set": {"password": hash_password(tmp_pwd), "must_reset": True}})
    await db.password_reset_requests.update_one({"id": rid}, {"$set": {"status": "approved", "handled_at": now_iso(), "handled_by": user["id"]}})
    await audit_log(user["id"], "password_reset_approve", {"target_user_id": req["user_id"], "request_id": rid})
    return {"temp_password": tmp_pwd, "email": req["email"]}

@api_router.post("/auth/change-password")
async def change_password(data: dict, user=Depends(get_current_user)):
    old = data.get("old_password", "")
    new = data.get("new_password", "")
    if len(new) < 8:
        raise HTTPException(422, "Nouveau mot de passe : 8 caractères minimum")
    doc = await db.users.find_one({"id": user["id"]})
    if not doc or not verify_password(old, doc["password"]):
        raise HTTPException(401, "Ancien mot de passe invalide")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password": hash_password(new), "must_reset": False}})
    await audit_log(user["id"], "password_change", {})
    return {"ok": True}

# ==========================================================
# AUDIT LOG (RGPD - journalisation des accès sensibles)
# ==========================================================
async def audit_log(user_id: str, action: str, details: dict):
    try:
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "action": action,
            "details": details,
            "at": now_iso(),
        })
    except Exception:
        pass

@api_router.get("/admin/audit-logs")
async def list_audit(limit: int = 200, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    items = await db.audit_logs.find({}, {"_id": 0}).sort("at", -1).to_list(limit)
    return items

# ==========================================================
# RGPD (export / droit à l'effacement)
# ==========================================================
@api_router.get("/rgpd/clients/{cid}/export")
async def rgpd_export(cid: str, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    client_doc = await db.clients.find_one({"id": cid}, {"_id": 0})
    est_doc = await db.establishments.find_one({"id": cid}, {"_id": 0})
    orders = await db.orders.find({"client_id": cid}, {"_id": 0}).to_list(10000)
    visits = await db.visits.find({"client_id": cid}, {"_id": 0}).to_list(1000)
    activities = await db.activities.find({"client_id": cid}, {"_id": 0}).to_list(1000)
    await audit_log(user["id"], "rgpd_export", {"client_id": cid})
    return {"client": client_doc, "establishment": est_doc, "orders": orders,
            "visits": visits, "activities": activities, "exported_at": now_iso()}

@api_router.delete("/rgpd/clients/{cid}")
async def rgpd_delete(cid: str, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    n_orders = await db.orders.count_documents({"client_id": cid})
    n_visits = await db.visits.count_documents({"client_id": cid})
    await db.clients.delete_one({"id": cid})
    await db.establishments.delete_one({"id": cid})
    await db.orders.delete_many({"client_id": cid})
    await db.visits.delete_many({"client_id": cid})
    await db.activities.delete_many({"client_id": cid})
    await audit_log(user["id"], "rgpd_delete", {"client_id": cid, "orders": n_orders, "visits": n_visits})
    return {"ok": True, "deleted_client_id": cid, "orders_deleted": n_orders, "visits_deleted": n_visits}

# ==========================================================
# ORG SETTINGS (seuils, RGPD, géoloc, rétention audio)
# ==========================================================
DEFAULT_ORG_SETTINGS = {
    "credit_thresholds": {
        "overdue_orange_days": 7,
        "overdue_red_days": 30,
        "credit_orange_pct": 60,
        "credit_red_pct": 100,
    },
    "geolocation_enabled": True,   # ponctuelle uniquement, jamais continue
    "voice_transcript_retention_days": 90,
    "voice_delete_after_transcription": False,
    "default_payment_terms_days": 30,
    "costs_validated_at": None,
    "costs_validated_by": None,
    "data_hosting_region": "EU",
    "bad_payer_alert_score_threshold": 30,   # seuil de score composite pour alerte
    "bad_payer_alert_overdue_amount": 500,   # OU montant en retard cumulé
}

async def get_org_settings():
    doc = await db.org_settings.find_one({"id": "global"}, {"_id": 0})
    if not doc:
        base = {"id": "global", **DEFAULT_ORG_SETTINGS}
        await db.org_settings.insert_one(base.copy())
        doc = await db.org_settings.find_one({"id": "global"}, {"_id": 0})
    for k, v in DEFAULT_ORG_SETTINGS.items():
        doc.setdefault(k, v)
    return doc

@api_router.get("/org/settings")
async def read_org_settings(user=Depends(get_current_user)):
    s = await get_org_settings()
    if user["role"] != "manager":
        # commercial : lecture seule, sans données sensibles
        return {
            "geolocation_enabled": s.get("geolocation_enabled", True),
            "voice_transcript_retention_days": s.get("voice_transcript_retention_days", 90),
            "voice_delete_after_transcription": s.get("voice_delete_after_transcription", False),
            "data_hosting_region": s.get("data_hosting_region", "EU"),
        }
    return s

@api_router.put("/org/settings")
async def update_org_settings(data: dict, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    allowed = ("credit_thresholds", "geolocation_enabled", "voice_transcript_retention_days",
               "voice_delete_after_transcription", "default_payment_terms_days",
               "bad_payer_alert_score_threshold", "bad_payer_alert_overdue_amount")
    updates = {k: data[k] for k in allowed if k in data}
    if updates:
        await db.org_settings.update_one({"id": "global"}, {"$set": updates}, upsert=True)
    await audit_log(user["id"], "org_settings_update", {"fields": list(updates.keys())})
    return await get_org_settings()

# ==========================================================
# COSTS VALIDATION (verrou marges = pas de chiffres tant que non validé)
# ==========================================================
@api_router.get("/margins/lock-status")
async def margin_lock_status(user=Depends(get_current_user)):
    s = await get_org_settings()
    total_products = await db.products.count_documents({})
    validated_costs = await db.product_costs.count_documents({})
    return {
        "unlocked": bool(s.get("costs_validated_at")),
        "validated_at": s.get("costs_validated_at"),
        "validated_by": s.get("costs_validated_by"),
        "products_total": total_products,
        "costs_saisis": validated_costs,
    }

@api_router.post("/admin/costs/validate")
async def validate_costs(user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    n = await db.product_costs.count_documents({})
    if n == 0:
        raise HTTPException(400, "Aucun coût de revient saisi. Impossible de valider.")
    await db.org_settings.update_one({"id": "global"},
        {"$set": {"costs_validated_at": now_iso(), "costs_validated_by": user["id"]}}, upsert=True)
    await audit_log(user["id"], "costs_validate", {"count": n})
    return {"validated_at": now_iso(), "products_validated": n}

@api_router.post("/admin/costs/invalidate")
async def invalidate_costs(user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    await db.org_settings.update_one({"id": "global"},
        {"$set": {"costs_validated_at": None, "costs_validated_by": None}}, upsert=True)
    await audit_log(user["id"], "costs_invalidate", {})
    return {"ok": True}

# ==========================================================
# PAYMENT TRACKING (DSO, retards, mauvais payeurs)
# ==========================================================
def _parse_iso(dt_str):
    try:
        return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    except Exception:
        return None

async def _client_payment_analysis(cid: str, default_terms: int):
    est = await db.establishments.find_one({"id": cid}, {"_id": 0}) or await db.clients.find_one({"id": cid}, {"_id": 0}) or {}
    terms = est.get("payment_terms_days") or default_terms
    orders = await db.orders.find({"client_id": cid}, {"_id": 0}).to_list(2000)
    now = datetime.now(timezone.utc)
    paid_delays = []
    overdue_amt = 0.0
    overdue_ages = []
    unpaid_amt = 0.0
    for o in orders:
        if o.get("status") == "annule":
            continue
        created = _parse_iso(o.get("created_at", ""))
        if not created:
            continue
        due = created + timedelta(days=terms)
        total = o.get("total", 0) or 0
        if o.get("payment_status") == "paid":
            paid_at = _parse_iso(o.get("paid_at", "") or "")
            if paid_at:
                paid_delays.append((paid_at - due).days)
        else:
            unpaid_amt += total
            if now > due:
                overdue_amt += total
                overdue_ages.append((now - due).days)
    avg_delay = round(sum(paid_delays) / len(paid_delays), 1) if paid_delays else None
    return {
        "client_id": cid,
        "payment_terms_days": terms,
        "avg_paid_delay_vs_due": avg_delay,
        "gap_days": avg_delay,
        "overdue_amount": round(overdue_amt, 2),
        "overdue_oldest_days": max(overdue_ages) if overdue_ages else 0,
        "unpaid_amount": round(unpaid_amt, 2),
        "paid_invoices_count": len(paid_delays),
    }

@api_router.get("/payments/client/{cid}")
async def payment_analysis(cid: str, user=Depends(get_current_user)):
    # Rôle : commercial n'accède qu'à ses clients assignés
    if user["role"] != "manager":
        est = await db.establishments.find_one({"id": cid}, {"_id": 0}) or await db.clients.find_one({"id": cid}, {"_id": 0})
        if not est:
            raise HTTPException(404, "Client introuvable")
        if est.get("assigned_to") not in (user["id"], None) and est.get("owner_id") != user["id"]:
            raise HTTPException(403, "Client non assigné")
    s = await get_org_settings()
    return await _client_payment_analysis(cid, s.get("default_payment_terms_days", 30))

@api_router.get("/payments/bad-payers")
async def bad_payers(limit: int = 20, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    s = await get_org_settings()
    default_terms = s.get("default_payment_terms_days", 30)
    ests = await db.establishments.find({}, {"_id": 0}).to_list(5000)
    if not ests:
        ests = await db.clients.find({}, {"_id": 0}).to_list(5000)
    result = []
    for e in ests:
        a = await _client_payment_analysis(e["id"], default_terms)
        a["name"] = e.get("name", "?")
        score = 0
        if a["avg_paid_delay_vs_due"]:
            score += max(0, a["avg_paid_delay_vs_due"])
        score += a["overdue_oldest_days"]
        score += min(50, a["overdue_amount"] / 100)
        a["score"] = round(score, 1)
        if a["overdue_amount"] > 0 or (a["avg_paid_delay_vs_due"] or 0) > 0:
            result.append(a)
    result.sort(key=lambda x: -x["score"])
    return result[:limit]

@api_router.get("/payments/dso")
async def dso_evolution(months: int = 12, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    from collections import defaultdict
    orders = await db.orders.find({}, {"_id": 0}).to_list(50000)
    monthly_ca = defaultdict(float)
    monthly_unpaid = defaultdict(float)
    for o in orders:
        if o.get("status") == "annule":
            continue
        created = _parse_iso(o.get("created_at", ""))
        if not created:
            continue
        key = f"{created.year:04d}-{created.month:02d}"
        monthly_ca[key] += o.get("total", 0) or 0
        if o.get("payment_status") != "paid":
            monthly_unpaid[key] += o.get("total", 0) or 0
    keys = sorted(set(list(monthly_ca.keys()) + list(monthly_unpaid.keys())))[-months:]
    chart = []
    for k in keys:
        ca = monthly_ca.get(k, 0)
        unpaid = monthly_unpaid.get(k, 0)
        daily = ca / 30 if ca else 0
        dso = round(unpaid / daily, 1) if daily else 0
        chart.append({"month": k, "ca": round(ca, 2), "encours": round(unpaid, 2), "dso": dso})
    current = chart[-1]["dso"] if chart else 0
    prev = chart[-2]["dso"] if len(chart) >= 2 else current
    return {"chart": chart, "current_dso": current, "prev_dso": prev, "trend": round(current - prev, 1)}

@api_router.post("/establishments/recompute-status")
async def recompute_all_statuses(user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    s = await get_org_settings()
    default_terms = s.get("default_payment_terms_days", 30)
    thresholds = s.get("credit_thresholds", DEFAULT_ORG_SETTINGS["credit_thresholds"])
    ests = await db.establishments.find({}, {"_id": 0}).to_list(5000)
    updated = 0
    for e in ests:
        a = await _client_payment_analysis(e["id"], default_terms)
        limit = e.get("credit_limit") or 0
        credit_used_pct = (a["unpaid_amount"] / limit * 100) if limit else 0
        overdue_days = a["overdue_oldest_days"]
        if overdue_days >= thresholds["overdue_red_days"] or credit_used_pct >= thresholds["credit_red_pct"]:
            color = "rouge"
        elif overdue_days >= thresholds["overdue_orange_days"] or credit_used_pct >= thresholds["credit_orange_pct"]:
            color = "orange"
        else:
            color = "vert"
        await db.establishments.update_one({"id": e["id"]}, {"$set": {
            "current_credit": a["unpaid_amount"],
            "overdue_amount": a["overdue_amount"],
            "overdue_days": overdue_days,
            "credit_status": color,
            "credit_status_updated_at": now_iso(),
        }})
        updated += 1
    await audit_log(user["id"], "recompute_statuses", {"updated": updated})
    return {"updated": updated}

# ==========================================================
# VOICE RETENTION PURGE (cron / manuel)
# ==========================================================
@api_router.post("/admin/voice/purge")
async def purge_voice(user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    s = await get_org_settings()
    days = int(s.get("voice_transcript_retention_days", 90))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    r = await db.visits.update_many(
        {"created_at": {"$lt": cutoff}, "voice_transcript": {"$ne": ""}},
        {"$set": {"voice_transcript": ""}}
    )
    await audit_log(user["id"], "voice_purge", {"days": days, "updated": r.modified_count})
    return {"purged": r.modified_count, "cutoff_days": days}

# ==========================================================
# BAD PAYER ALERTS (seuil + scan quotidien)
# ==========================================================
@api_router.post("/alerts/bad-payers/scan")
async def scan_bad_payers(user=Depends(get_current_user)):
    """Détecte les clients qui viennent de franchir le seuil. Idempotent : ne double pas les alertes actives."""
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    s = await get_org_settings()
    score_threshold = float(s.get("bad_payer_alert_score_threshold", 30))
    amt_threshold = float(s.get("bad_payer_alert_overdue_amount", 500))
    default_terms = s.get("default_payment_terms_days", 30)
    ests = await db.establishments.find({}, {"_id": 0}).to_list(5000)
    if not ests:
        ests = await db.clients.find({}, {"_id": 0}).to_list(5000)
    new_alerts = 0
    for e in ests:
        a = await _client_payment_analysis(e["id"], default_terms)
        score = 0
        if a["avg_paid_delay_vs_due"]:
            score += max(0, a["avg_paid_delay_vs_due"])
        score += a["overdue_oldest_days"]
        score += min(50, a["overdue_amount"] / 100)
        crossed = (score >= score_threshold) or (a["overdue_amount"] >= amt_threshold)
        if not crossed:
            # auto-résolution : si le client était en alerte et n'est plus, on ferme
            await db.bad_payer_alerts.update_many(
                {"client_id": e["id"], "status": "active"},
                {"$set": {"status": "resolved", "resolved_at": now_iso()}}
            )
            continue
        # évite doublon d'alerte active
        existing = await db.bad_payer_alerts.find_one({"client_id": e["id"], "status": "active"}, {"_id": 0})
        if existing:
            # met à jour la snapshot
            await db.bad_payer_alerts.update_one(
                {"id": existing["id"]},
                {"$set": {"snapshot": a, "score": round(score, 1), "updated_at": now_iso()}}
            )
            continue
        alert = {
            "id": str(uuid.uuid4()),
            "client_id": e["id"],
            "client_name": e.get("name", "?"),
            "assigned_to": e.get("assigned_to"),
            "score": round(score, 1),
            "snapshot": a,
            "reason": ("Score" if score >= score_threshold else "Montant") + f" au-dessus du seuil",
            "status": "active",
            "created_at": now_iso(),
        }
        await db.bad_payer_alerts.insert_one(alert.copy())
        new_alerts += 1
        # écho dans la notification bell
        await db.alerts.insert_one({
            "id": str(uuid.uuid4()), "target_role": "manager", "kind": "bad_payer",
            "establishment_id": e["id"], "payload": alert,
            "severity": "high", "seen": False, "created_at": now_iso(),
        })
    await audit_log(user["id"], "bad_payer_scan", {"new": new_alerts})
    return {"new_alerts": new_alerts}

@api_router.get("/alerts/bad-payers")
async def list_bad_payer_alerts(user=Depends(get_current_user)):
    q = {"status": "active"}
    if user["role"] != "manager":
        q["assigned_to"] = user["id"]
    items = await db.bad_payer_alerts.find(q, {"_id": 0}).sort("score", -1).to_list(500)
    return items

@api_router.post("/alerts/bad-payers/{aid}/dismiss")
async def dismiss_bad_payer_alert(aid: str, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    await db.bad_payer_alerts.update_one({"id": aid}, {"$set": {"status": "dismissed", "dismissed_at": now_iso(), "dismissed_by": user["id"]}})
    await audit_log(user["id"], "bad_payer_dismiss", {"alert_id": aid})
    return {"ok": True}

# ==========================================================
# STOCK / CONSIGNES FÛTS / DRM
# ==========================================================
class Container(BaseModel):
    """Contenant physique traçable : fût, carton, palette, bouteille pièce.
    L'id sert de payload QR code (ou EAN si fourni)."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: Literal["fut", "carton", "palette", "bouteille", "autre"] = "fut"
    product_id: Optional[str] = None
    product_name: Optional[str] = ""
    barcode: Optional[str] = None              # EAN alternatif si étiquette imprimée
    batch_lot: Optional[str] = ""              # lot de production/DLC
    filled_volume_l: Optional[float] = None
    deposit_amount: float = 0.0                # consigne facturable au retour non-rendu
    status: Literal["en_stock", "sorti", "chez_client", "retour", "vide", "consigne_facturee", "casse"] = "en_stock"
    current_location: Optional[str] = None     # "entrepot" ou establishment_id
    current_location_name: Optional[str] = ""
    filled_at: Optional[str] = None
    last_moved_at: str = Field(default_factory=now_iso)
    owner_id: str
    created_at: str = Field(default_factory=now_iso)

class StockMovement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    container_id: Optional[str] = None
    product_id: Optional[str] = None
    kind: Literal["entree", "sortie", "retour", "casse", "degustation", "don", "vente", "transfert"] = "entree"
    qty: float = 1.0
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    note: Optional[str] = ""
    agent_id: str
    owner_id: str
    at: str = Field(default_factory=now_iso)

@api_router.get("/containers")
async def list_containers(status: Optional[str] = None, type: Optional[str] = None,
                          location: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if status: q["status"] = status
    if type: q["type"] = type
    if location: q["current_location"] = location
    items = await db.containers.find(q, {"_id": 0}).sort("last_moved_at", -1).to_list(2000)
    return items

@api_router.post("/containers")
async def create_container(data: dict, user=Depends(get_current_user)):
    data["owner_id"] = user["id"]
    if data.get("product_id"):
        p = await db.products.find_one({"id": data["product_id"]}, {"_id": 0})
        if p:
            data["product_name"] = p["name"]
            if not data.get("filled_volume_l"):
                data["filled_volume_l"] = p.get("volume_liters")
    if not data.get("current_location"):
        data["current_location"] = "entrepot"
        data["current_location_name"] = "Entrepôt"
    c = Container(**data)
    await db.containers.insert_one(c.model_dump())
    await db.stock_movements.insert_one(StockMovement(
        container_id=c.id, product_id=c.product_id, kind="entree", qty=1,
        to_location=c.current_location, note="Création contenant",
        agent_id=user["id"], owner_id=user["id"],
    ).model_dump())
    return c.model_dump()

@api_router.get("/containers/{cid}")
async def get_container(cid: str, user=Depends(get_current_user)):
    c = await db.containers.find_one({"$or": [{"id": cid}, {"barcode": cid}]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Contenant introuvable")
    moves = await db.stock_movements.find({"container_id": c["id"]}, {"_id": 0}).sort("at", -1).to_list(200)
    return {**c, "movements": moves}

@api_router.put("/containers/{cid}/move")
async def move_container(cid: str, data: dict, user=Depends(get_current_user)):
    c = await db.containers.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Contenant introuvable")
    new_loc = data.get("to_location")
    new_loc_name = data.get("to_location_name", "")
    new_status = data.get("status", c.get("status"))
    if new_loc and new_loc != "entrepot":
        est = await db.establishments.find_one({"id": new_loc}, {"_id": 0}) or await db.clients.find_one({"id": new_loc}, {"_id": 0})
        if est:
            new_loc_name = est.get("name", new_loc_name)
    await db.containers.update_one({"id": cid}, {"$set": {
        "current_location": new_loc,
        "current_location_name": new_loc_name,
        "status": new_status,
        "last_moved_at": now_iso(),
    }})
    await db.stock_movements.insert_one(StockMovement(
        container_id=cid, product_id=c.get("product_id"),
        kind=data.get("kind", "transfert"), qty=1,
        from_location=c.get("current_location"), to_location=new_loc,
        note=data.get("note", ""),
        agent_id=user["id"], owner_id=user["id"],
    ).model_dump())
    return await db.containers.find_one({"id": cid}, {"_id": 0})

@api_router.get("/containers/scan/{code}")
async def scan_container(code: str, user=Depends(get_current_user)):
    """Endpoint appelé après scan QR/barcode. Accepte id ou barcode."""
    c = await db.containers.find_one({"$or": [{"id": code}, {"barcode": code}]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Contenant inconnu")
    return c

@api_router.get("/stock/summary")
async def stock_summary(user=Depends(get_current_user)):
    """État stock par produit : en entrepôt / chez clients / retours / vides."""
    from collections import defaultdict
    counts = defaultdict(lambda: {"en_stock": 0, "chez_client": 0, "retour": 0, "vide": 0, "sorti": 0, "total": 0, "volume_l": 0.0})
    async for c in db.containers.find({}, {"_id": 0}):
        pid = c.get("product_id") or "_none"
        st = c.get("status", "en_stock")
        counts[pid][st] = counts[pid].get(st, 0) + 1
        counts[pid]["total"] += 1
        counts[pid]["volume_l"] += (c.get("filled_volume_l") or 0)
    products = {p["id"]: p async for p in db.products.find({}, {"_id": 0})}
    result = []
    for pid, st in counts.items():
        p = products.get(pid, {})
        result.append({
            "product_id": pid,
            "product_name": p.get("name", "(sans produit)"),
            "category": p.get("category"),
            "abv_pct": p.get("abv_pct"),
            **st,
        })
    result.sort(key=lambda x: -x["total"])
    return result

@api_router.get("/stock/movements")
async def list_movements(limit: int = 200, user=Depends(get_current_user)):
    items = await db.stock_movements.find({}, {"_id": 0}).sort("at", -1).to_list(limit)
    return items

@api_router.get("/deposits/outstanding")
async def deposits_outstanding(user=Depends(get_current_user)):
    """Consignes de fûts sortis (chez client) non encore rendus."""
    items = await db.containers.find(
        {"status": {"$in": ["chez_client", "sorti"]}, "deposit_amount": {"$gt": 0}}, {"_id": 0}
    ).to_list(5000)
    from collections import defaultdict
    by_client = defaultdict(lambda: {"count": 0, "total_deposit": 0.0, "containers": []})
    for c in items:
        loc = c.get("current_location") or "?"
        by_client[loc]["count"] += 1
        by_client[loc]["total_deposit"] += c.get("deposit_amount", 0) or 0
        by_client[loc]["containers"].append({"id": c["id"], "product": c.get("product_name"), "type": c.get("type"), "since": c.get("last_moved_at")})
        by_client[loc]["client_name"] = c.get("current_location_name") or loc
    return [{"client_id": k, **v} for k, v in by_client.items()]

@api_router.get("/drm/{year}/{month}")
async def drm_month(year: int, month: int, user=Depends(get_current_user)):
    """DRM mensuelle : par produit alcoolisé — stock initial, entrées, sorties, stock final,
    en volume (L) et alcool pur (L). Manager only."""
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    prefix = f"{year:04d}-{month:02d}"
    start = f"{prefix}-01"
    if month == 12:
        end = f"{year+1:04d}-01-01"
    else:
        end = f"{year:04d}-{month+1:02d}-01"
    products = {p["id"]: p async for p in db.products.find({}, {"_id": 0})}
    from collections import defaultdict
    stats = defaultdict(lambda: {
        "entrees_l": 0.0, "sorties_l": 0.0, "casse_l": 0.0, "degust_l": 0.0, "don_l": 0.0,
        "entrees_units": 0, "sorties_units": 0,
    })
    movs = await db.stock_movements.find({"at": {"$gte": start, "$lt": end}}, {"_id": 0}).to_list(50000)
    for m in movs:
        pid = m.get("product_id")
        if not pid:
            continue
        p = products.get(pid, {})
        vol_unit = p.get("volume_liters") or 0
        vol = (m.get("qty") or 0) * vol_unit
        k = m.get("kind")
        if k in ("entree", "retour"):
            stats[pid]["entrees_l"] += vol
            stats[pid]["entrees_units"] += m.get("qty") or 0
        elif k in ("sortie", "vente", "transfert"):
            stats[pid]["sorties_l"] += vol
            stats[pid]["sorties_units"] += m.get("qty") or 0
        elif k == "casse":
            stats[pid]["casse_l"] += vol
        elif k == "degustation":
            stats[pid]["degust_l"] += vol
        elif k == "don":
            stats[pid]["don_l"] += vol
    result = []
    total_alcool_pur_l = 0
    for pid, st in stats.items():
        p = products.get(pid, {})
        if not p or not (p.get("abv_pct") and p.get("alcohol_type")):
            continue  # DRM = alcool uniquement
        abv = p["abv_pct"] / 100.0
        net_l = st["entrees_l"] - st["sorties_l"] - st["casse_l"] - st["degust_l"] - st["don_l"]
        alcool_pur_l = abs(st["sorties_l"] + st["casse_l"] + st["degust_l"] + st["don_l"]) * abv
        total_alcool_pur_l += alcool_pur_l
        result.append({
            "product_id": pid,
            "product_name": p.get("name"),
            "alcohol_type": p.get("alcohol_type"),
            "abv_pct": p.get("abv_pct"),
            **{k: round(v, 2) for k, v in st.items()},
            "net_l": round(net_l, 2),
            "alcool_pur_l": round(alcool_pur_l, 3),
        })
    result.sort(key=lambda x: x["alcohol_type"] or "")
    return {
        "period": prefix,
        "lines": result,
        "total_alcool_pur_l": round(total_alcool_pur_l, 3),
        "generated_at": now_iso(),
        "note": "Récapitulatif automatique — à valider et déclarer sur portailpro.douanes.gouv.fr. Ce logiciel n'est pas un télédéclarant agréé.",
    }

@api_router.get("/")
async def root():
    return {"service": "BEVID API", "status": "ok"}

# ==========================================================
# CRONS externes (Emergent scheduler) — endpoints publics idempotents
# ==========================================================
@api_router.post("/cron/bad-payer-scan")
async def cron_bad_payer_scan():
    s = await get_org_settings()
    score_threshold = float(s.get("bad_payer_alert_score_threshold", 30))
    amt_threshold = float(s.get("bad_payer_alert_overdue_amount", 500))
    default_terms = s.get("default_payment_terms_days", 30)
    ests = await db.establishments.find({}, {"_id": 0}).to_list(5000)
    if not ests:
        ests = await db.clients.find({}, {"_id": 0}).to_list(5000)
    new_alerts = 0
    for e in ests:
        a = await _client_payment_analysis(e["id"], default_terms)
        score = 0
        if a["avg_paid_delay_vs_due"]:
            score += max(0, a["avg_paid_delay_vs_due"])
        score += a["overdue_oldest_days"]
        score += min(50, a["overdue_amount"] / 100)
        crossed = (score >= score_threshold) or (a["overdue_amount"] >= amt_threshold)
        if not crossed:
            await db.bad_payer_alerts.update_many(
                {"client_id": e["id"], "status": "active"},
                {"$set": {"status": "resolved", "resolved_at": now_iso()}}
            )
            continue
        existing = await db.bad_payer_alerts.find_one({"client_id": e["id"], "status": "active"}, {"_id": 0})
        if existing:
            await db.bad_payer_alerts.update_one({"id": existing["id"]},
                {"$set": {"snapshot": a, "score": round(score, 1), "updated_at": now_iso()}})
            continue
        alert = {"id": str(uuid.uuid4()), "client_id": e["id"], "client_name": e.get("name", "?"),
                 "assigned_to": e.get("assigned_to"), "score": round(score, 1), "snapshot": a,
                 "reason": ("Score" if score >= score_threshold else "Montant") + " au-dessus du seuil",
                 "status": "active", "created_at": now_iso()}
        await db.bad_payer_alerts.insert_one(alert.copy())
        new_alerts += 1
    return {"ok": True, "new_alerts": new_alerts, "ran_at": now_iso()}

@api_router.post("/cron/voice-purge")
async def cron_voice_purge():
    s = await get_org_settings()
    days = int(s.get("voice_transcript_retention_days", 90))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    r = await db.visits.update_many(
        {"created_at": {"$lt": cutoff}, "voice_transcript": {"$ne": ""}},
        {"$set": {"voice_transcript": ""}}
    )
    return {"ok": True, "purged": r.modified_count, "cutoff_days": days, "ran_at": now_iso()}

# ==========================================================
# SYNC LOG — feed manager des mutations arrivées du terrain hors-ligne
# ==========================================================
@api_router.get("/dashboard/sync-feed")
async def sync_feed(minutes: int = 60, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
    visits = await db.visits.find(
        {"created_at": {"$gte": cutoff}, "client_uuid": {"$exists": True, "$ne": None}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    orders = await db.orders.find(
        {"created_at": {"$gte": cutoff}, "client_uuid": {"$exists": True, "$ne": None}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    conflicts = await db.conflicts.find({"at": {"$gte": cutoff}}, {"_id": 0}).sort("at", -1).to_list(50)
    return {
        "window_minutes": minutes,
        "visits": [{
            "id": v["id"], "client_id": v.get("client_id"), "client_name": v.get("client_name"),
            "agent_id": v.get("agent_id"), "mood": v.get("mood"), "next_action": v.get("next_action"),
            "created_at": v.get("created_at"),
        } for v in visits],
        "orders": [{
            "id": o["id"], "client_id": o.get("client_id"), "client_name": o.get("client_name"),
            "agent_id": o.get("agent_id"), "total": o.get("total"),
            "has_signature": bool(o.get("signature")),
            "created_at": o.get("created_at"),
        } for o in orders],
        "conflicts": conflicts,
    }

# Enregistrement d'un conflit détecté au moment du resync
async def log_conflict(kind: str, entity_id: str, reason: str, extra: dict):
    doc = {"id": str(uuid.uuid4()), "kind": kind, "entity_id": entity_id,
           "reason": reason, "extra": extra, "at": now_iso(), "seen": False}
    await db.conflicts.insert_one(doc)

# =============================================================
# BANKING / RECONCILIATION — Iter 10a
# Object storage (Kbis/RIB) + IBAN validation + Bank imports +
# Reconciliation engine (4 confidence levels) + réversible lettrage
# =============================================================
from bank import storage as _bank_storage
from bank.validators import (
    clean_iban, is_valid_iban, is_valid_siren, is_valid_siret,
    normalize_name as _norm_name,
)
from bank.importers import PARSERS as _BANK_PARSERS, sniff_format as _bank_sniff
from bank.reconciliation import propose as _bank_propose, AUTO_LETTRAGE_THRESHOLD

BANK_APP = "bevid"


# ---------- Kbis / RIB upload ----------
@api_router.post("/clients/{cid}/documents")
async def upload_client_document(
    cid: str,
    kind: str = Query(..., pattern="^(kbis|rib)$"),
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    """Upload PDF Kbis ou RIB pour un client. Manager only."""
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    c = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Client introuvable")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "Fichier > 10 Mo")
    ct = file.content_type or "application/pdf"
    if ct not in ("application/pdf", "image/png", "image/jpeg"):
        raise HTTPException(415, "Format accepté : PDF, PNG, JPEG")
    ext = (file.filename or "").split(".")[-1].lower() or "pdf"
    path = f"{BANK_APP}/clients/{cid}/{kind}-{uuid.uuid4().hex[:12]}.{ext}"
    try:
        result = _bank_storage.put_object(path, data, ct)
    except RuntimeError as e:
        raise HTTPException(503, f"Stockage indisponible: {e}")
    stored_path = result["path"]
    field = "kbis_path" if kind == "kbis" else "rib_path"
    await db.clients.update_one({"id": cid}, {"$set": {
        field: stored_path,
        f"{kind}_filename": file.filename,
        f"{kind}_uploaded_at": now_iso(),
        "updated_at": now_iso(),
    }})
    await db.files.insert_one({
        "id": str(uuid.uuid4()),
        "storage_path": stored_path,
        "original_filename": file.filename,
        "content_type": ct,
        "size": len(data),
        "owner_client_id": cid,
        "kind": kind,
        "is_deleted": False,
        "created_at": now_iso(),
    })
    await audit_log(user["id"], "client_doc_upload", {"client_id": cid, "kind": kind, "path": stored_path})
    return {"ok": True, "path": stored_path, "size": len(data)}


@api_router.get("/files/{file_path:path}")
async def download_stored_file(file_path: str, authorization: Optional[str] = Header(None), auth: Optional[str] = Query(None)):
    """Télécharge un fichier stocké — auth via header ou query param (pour img src)."""
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(None, 1)[1]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(401, "Auth requise")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(401, "Token invalide")
    u = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not u or not u.get("active", True):
        raise HTTPException(403, "Compte inactif")
    rec = await db.files.find_one({"storage_path": file_path, "is_deleted": False}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Fichier introuvable")
    # ACL : manager voit tout ; commercial voit uniquement fichiers de ses clients
    if u["role"] != "manager":
        cid = rec.get("owner_client_id")
        if cid:
            c = await db.clients.find_one({"id": cid, "$or": [
                {"owner_id": u["id"]}, {"assigned_to": u["id"]}
            ]}, {"_id": 0})
            if not c:
                raise HTTPException(403, "Accès refusé")
    try:
        content, ct = _bank_storage.get_object(file_path)
    except FileNotFoundError:
        raise HTTPException(404, "Fichier absent du stockage")
    except RuntimeError as e:
        raise HTTPException(503, f"Stockage indisponible: {e}")
    return Response(content=content, media_type=rec.get("content_type", ct))


# ---------- Client banking validation (hook update) ----------
@api_router.post("/clients/{cid}/banking")
async def update_client_banking(cid: str, data: dict, user=Depends(get_current_user)):
    """Met à jour uniquement les champs bancaires du client avec validation stricte."""
    c = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Client introuvable")
    if user["role"] != "manager" and c.get("owner_id") != user["id"] and c.get("assigned_to") != user["id"]:
        raise HTTPException(403, "Accès refusé")

    updates = {}
    iban = clean_iban(data.get("iban", ""))
    if iban:
        if not is_valid_iban(iban):
            raise HTTPException(400, "IBAN invalide (clé mod-97 non valide)")
        updates["iban"] = iban
    elif "iban" in data:
        updates["iban"] = ""

    if "bic" in data:
        updates["bic"] = (data.get("bic") or "").strip().upper()

    siret = re.sub(r"\s+", "", data.get("siret", "") or "")
    if siret:
        if not is_valid_siret(siret):
            raise HTTPException(400, "SIRET invalide (clé Luhn non valide)")
        updates["siret"] = siret
        updates["siren"] = siret[:9]
    elif "siret" in data:
        updates["siret"] = ""

    siren = re.sub(r"\s+", "", data.get("siren", "") or "")
    if siren and "siret" not in data:
        if not is_valid_siren(siren):
            raise HTTPException(400, "SIREN invalide (clé Luhn non valide)")
        updates["siren"] = siren

    if "tva_intra" in data:
        updates["tva_intra"] = (data.get("tva_intra") or "").strip().upper()

    updates["updated_at"] = now_iso()
    await db.clients.update_one({"id": cid}, {"$set": updates})
    await audit_log(user["id"], "client_banking_update", {"client_id": cid, "fields": list(updates.keys())})
    return {"ok": True, "updated": updates}


# ---------- Bank statement import (CSV / CAMT.053 / CFONB 120) ----------
@api_router.post("/banque/imports")
async def import_bank_statement(
    file: UploadFile = File(...),
    account_label: Optional[str] = Query(None, description="Libellé libre du compte source"),
    user=Depends(get_current_user),
):
    """Upload d'un relevé bancaire. Détecte le format, parse, insère idempotent, propose auto-lettrage.
    Retour : {import_id, format, total_lines, new, duplicates, auto_lettrages}
    """
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    content = await file.read()
    try:
        fmt = _bank_sniff(file.filename or "", content)
    except ValueError:
        raise HTTPException(400, "Format non reconnu (CSV, CAMT.053, CFONB 120 attendus)")
    parser = _BANK_PARSERS[fmt]
    try:
        rows = parser(content, filename=file.filename or "")
    except Exception as e:
        raise HTTPException(400, f"Erreur parsing: {e}")

    import_id = str(uuid.uuid4())
    now = now_iso()
    await db.bank_imports.insert_one({
        "id": import_id, "format": fmt, "account_label": account_label or "",
        "filename": file.filename, "total_lines": len(rows),
        "uploaded_by": user["id"], "uploaded_at": now,
    })

    new_count = 0
    dup_count = 0
    inserted_ids = []
    for row in rows:
        ext_id = row["external_id"]
        existing = await db.bank_transactions.find_one({"external_id": ext_id}, {"_id": 0, "id": 1})
        if existing:
            dup_count += 1
            continue
        tx_id = str(uuid.uuid4())
        # Contreparties dans base isolée (règle 4.2 : cloisonnement DSP2)
        if row.get("counterparty_name"):
            await db.bank_counterparties.update_one(
                {"normalized_name": row["counterparty_name"]},
                {"$setOnInsert": {"first_seen": now}, "$inc": {"seen_count": 1}, "$set": {"last_seen": now}},
                upsert=True,
            )
        await db.bank_transactions.insert_one({
            "id": tx_id, "import_id": import_id, "external_id": ext_id,
            "value_date": row.get("value_date"), "operation_date": row.get("operation_date"),
            "amount": row.get("amount", 0), "currency": row.get("currency", "EUR"),
            "counterparty_name": row.get("counterparty_name", ""),
            "counterparty_iban": row.get("counterparty_iban"),
            "label": row.get("label", ""), "reference": row.get("reference"),
            "raw": row.get("raw", {}),
            "matched_amount": 0.0, "status": "open",
            "created_at": now,
        })
        inserted_ids.append(tx_id)
        new_count += 1

    # Auto-lettrage sur les nouvelles écritures (score >= threshold)
    auto_count = 0
    if inserted_ids:
        auto_count = await _run_auto_lettrage(inserted_ids, user["id"])

    return {
        "import_id": import_id, "format": fmt,
        "total_lines": len(rows), "new": new_count, "duplicates": dup_count,
        "auto_lettrages": auto_count,
    }


async def _fetch_open_orders() -> list[dict]:
    """Charge les commandes non payées + remaining_amount + client_name normalisé."""
    orders = await db.orders.find(
        {"payment_status": {"$nin": ["paid", "refunded"]}},
        {"_id": 0, "id": 1, "total": 1, "created_at": 1, "client_id": 1,
         "client_name": 1, "payment_status": 1, "rf_reference": 1, "emitted_e2e_id": 1}
    ).to_list(5000)
    # somme des lettrages déjà appliqués sur cette commande
    letts = await db.bank_lettrages.find(
        {"status": "active"}, {"_id": 0, "order_id": 1, "amount": 1}
    ).to_list(50000)
    applied = {}
    for l in letts:
        applied[l["order_id"]] = applied.get(l["order_id"], 0) + l["amount"]
    for o in orders:
        o["client_name_normalized"] = _norm_name(o.get("client_name") or "")
        o["remaining_amount"] = round((o.get("total") or 0) - applied.get(o["id"], 0), 2)
    return [o for o in orders if o["remaining_amount"] > 0.005]


async def _run_auto_lettrage(tx_ids: list[str], user_id: str) -> int:
    open_orders = await _fetch_open_orders()
    count = 0
    for tid in tx_ids:
        tx = await db.bank_transactions.find_one({"id": tid}, {"_id": 0})
        if not tx or tx.get("status") != "open":
            continue
        propositions = _bank_propose(tx, open_orders)
        if propositions and propositions[0]["confidence"] >= AUTO_LETTRAGE_THRESHOLD:
            top = propositions[0]
            await _apply_lettrage(tid, top["order_ids"], top["amount_applied"],
                                  method="auto", confidence=top["confidence"],
                                  reason=top["reason"], user_id=user_id)
            # refresh open_orders car les montants restants ont changé
            open_orders = await _fetch_open_orders()
            count += 1
    return count


async def _apply_lettrage(tx_id: str, order_ids: list[str], amount_applied: float,
                          method: str, confidence: int, reason: str, user_id: str):
    """Crée les lignes de lettrage, marque la tx, met à jour payment_status si soldée."""
    tx = await db.bank_transactions.find_one({"id": tx_id}, {"_id": 0})
    if not tx:
        raise HTTPException(404, "Écriture bancaire introuvable")
    # split proportionnel si plusieurs commandes
    orders = await db.orders.find({"id": {"$in": order_ids}}, {"_id": 0}).to_list(50)
    if len(orders) != len(order_ids):
        raise HTTPException(404, "Une ou plusieurs commandes introuvables")

    # calcul des montants restants par commande
    letts = await db.bank_lettrages.find(
        {"order_id": {"$in": order_ids}, "status": "active"}, {"_id": 0}
    ).to_list(1000)
    applied_map = {oid: 0.0 for oid in order_ids}
    for l in letts:
        applied_map[l["order_id"]] = applied_map.get(l["order_id"], 0) + l["amount"]
    remainings = {o["id"]: round(o.get("total", 0) - applied_map.get(o["id"], 0), 2) for o in orders}

    now = now_iso()
    total_to_split = amount_applied
    for oid in order_ids:
        rem = remainings[oid]
        alloc = min(rem, total_to_split) if len(order_ids) > 1 else amount_applied
        if len(order_ids) == 1:
            alloc = min(amount_applied, rem)
        letrage = {
            "id": str(uuid.uuid4()),
            "tx_id": tx_id, "order_id": oid,
            "amount": round(alloc, 2),
            "method": method, "confidence": confidence, "reason": reason,
            "status": "active",
            "created_by": user_id, "created_at": now,
        }
        await db.bank_lettrages.insert_one(letrage)
        total_to_split -= alloc
        # payment_status
        new_applied = applied_map.get(oid, 0) + alloc
        order = next(x for x in orders if x["id"] == oid)
        if new_applied >= order.get("total", 0) - 0.005:
            await db.orders.update_one({"id": oid}, {"$set": {
                "payment_status": "paid", "paid_at": now, "paid_via": "bank_reconciliation",
            }})
        else:
            await db.orders.update_one({"id": oid}, {"$set": {
                "payment_status": "partial", "paid_amount": round(new_applied, 2),
            }})

    # met à jour la tx
    total_matched = tx.get("matched_amount", 0) + amount_applied
    tx_status = "matched" if abs(total_matched - abs(tx.get("amount", 0))) < 0.01 else "partial"
    await db.bank_transactions.update_one({"id": tx_id}, {"$set": {
        "matched_amount": round(total_matched, 2), "status": tx_status,
        "last_letrage_at": now,
    }})
    await audit_log(user_id, "bank_lettrage", {
        "tx_id": tx_id, "order_ids": order_ids, "amount": amount_applied,
        "method": method, "confidence": confidence,
    })


@api_router.get("/banque/transactions")
async def list_bank_transactions(
    status: Optional[str] = Query(None, description="open|matched|partial|all"),
    limit: int = 200,
    user=Depends(get_current_user),
):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    q = {}
    if status and status != "all":
        q["status"] = status
    txs = await db.bank_transactions.find(q, {"_id": 0}).sort("value_date", -1).limit(limit).to_list(limit)
    return txs


@api_router.get("/banque/transactions/{tid}/propose")
async def propose_lettrage(tid: str, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    tx = await db.bank_transactions.find_one({"id": tid}, {"_id": 0})
    if not tx:
        raise HTTPException(404, "Écriture introuvable")
    open_orders = await _fetch_open_orders()
    propositions = _bank_propose(tx, open_orders)
    # enrichit chaque proposition avec les commandes et clients pour l'UI
    for p in propositions:
        p["orders"] = []
        for oid in p["order_ids"]:
            o = next((x for x in open_orders if x["id"] == oid), None)
            if o:
                p["orders"].append({
                    "id": o["id"], "total": o["total"],
                    "remaining_amount": o["remaining_amount"],
                    "client_id": o.get("client_id"), "client_name": o.get("client_name"),
                    "created_at": o.get("created_at"),
                })
    return {"tx": tx, "propositions": propositions[:5]}


@api_router.post("/banque/transactions/{tid}/lettrer")
async def create_lettrage(tid: str, data: dict, user=Depends(get_current_user)):
    """Body: { order_ids: [str], amount_applied: float, confidence?: int, reason?: str }"""
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    order_ids = data.get("order_ids") or []
    amount = float(data.get("amount_applied") or 0)
    if not order_ids or amount <= 0:
        raise HTTPException(400, "order_ids et amount_applied requis")
    await _apply_lettrage(
        tid, order_ids, amount,
        method="manual", confidence=int(data.get("confidence", 100)),
        reason=data.get("reason") or "Lettrage manuel",
        user_id=user["id"],
    )
    return {"ok": True}


@api_router.post("/banque/lettrages/{lid}/delettrer")
async def delete_lettrage(lid: str, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    lett = await db.bank_lettrages.find_one({"id": lid, "status": "active"}, {"_id": 0})
    if not lett:
        raise HTTPException(404, "Lettrage introuvable ou déjà annulé")
    now = now_iso()
    await db.bank_lettrages.update_one({"id": lid}, {"$set": {
        "status": "reversed", "reversed_by": user["id"], "reversed_at": now,
    }})
    # recalcule le statut de la commande et de la transaction
    order = await db.orders.find_one({"id": lett["order_id"]}, {"_id": 0})
    if order:
        other = await db.bank_lettrages.find(
            {"order_id": lett["order_id"], "status": "active"}, {"_id": 0, "amount": 1}
        ).to_list(1000)
        applied = sum(x["amount"] for x in other)
        total = order.get("total", 0)
        if applied >= total - 0.005:
            new_status = "paid"
        elif applied > 0:
            new_status = "partial"
        else:
            new_status = "pending"
        await db.orders.update_one({"id": lett["order_id"]}, {"$set": {
            "payment_status": new_status,
            "paid_amount": round(applied, 2),
        }})
    tx = await db.bank_transactions.find_one({"id": lett["tx_id"]}, {"_id": 0})
    if tx:
        others = await db.bank_lettrages.find(
            {"tx_id": lett["tx_id"], "status": "active"}, {"_id": 0, "amount": 1}
        ).to_list(1000)
        matched = sum(x["amount"] for x in others)
        tx_status = "matched" if abs(matched - abs(tx.get("amount", 0))) < 0.01 else ("partial" if matched > 0 else "open")
        await db.bank_transactions.update_one({"id": lett["tx_id"]}, {"$set": {
            "matched_amount": round(matched, 2), "status": tx_status,
        }})
    await audit_log(user["id"], "bank_delettrage", {"lettrage_id": lid, "order_id": lett["order_id"]})
    return {"ok": True}


@api_router.get("/banque/lettrages")
async def list_lettrages(status: str = "active", limit: int = 200, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    q = {} if status == "all" else {"status": status}
    return await db.bank_lettrages.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)


@api_router.get("/banque/summary")
async def bank_summary(user=Depends(get_current_user)):
    """KPIs pour la page rapprochement."""
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    total_tx = await db.bank_transactions.count_documents({})
    open_tx = await db.bank_transactions.count_documents({"status": "open"})
    matched_tx = await db.bank_transactions.count_documents({"status": "matched"})
    active_letts = await db.bank_lettrages.count_documents({"status": "active"})
    auto_letts = await db.bank_lettrages.count_documents({"status": "active", "method": "auto"})
    return {
        "total_tx": total_tx, "open_tx": open_tx, "matched_tx": matched_tx,
        "matched_pct": round(matched_tx / total_tx * 100, 1) if total_tx else 0,
        "active_lettrages": active_letts, "auto_lettrages": auto_letts,
        "auto_rate_pct": round(auto_letts / active_letts * 100, 1) if active_letts else 0,
    }


# =============================================================
# INTEGRATIONS PUBLIQUES FR — Phase 1 (Bouclier / Radar / Prospection / Rappels)
# Règle 0 : aucune API externe depuis l'UI. Tout passe par ces endpoints backend.
# =============================================================
from integrations import bodacc as _bodacc
from integrations import recherche_entreprises as _re
from integrations import rappelconso as _rc
from integrations import vies as _vies
from integrations.naf_chr import NAF_CHR_SEED, is_chr_code, get_seed_documents as _naf_seed_docs
from integrations.sources_seed import DATA_SOURCES_SEED
from permissions import FEATURES, has_feature, effective_permissions


def require_feature(key: str):
    async def _dep(user=Depends(get_current_user)):
        if not has_feature(user, key):
            raise HTTPException(403, f"Accès refusé : feature '{key}' non autorisée")
        return user
    return _dep


@api_router.get("/permissions/features")
async def list_features(user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    return FEATURES


@api_router.get("/me/permissions")
async def me_permissions(user=Depends(get_current_user)):
    return {"role": user.get("role"), "permissions": effective_permissions(user)}


@api_router.get("/admin/users/{uid}/permissions")
async def get_user_permissions(uid: str, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Utilisateur introuvable")
    return {"user_id": uid, "role": target.get("role"),
            "overrides": target.get("feature_overrides") or {},
            "effective": effective_permissions(target)}


@api_router.post("/admin/users/{uid}/permissions")
async def set_user_permissions(uid: str, data: dict, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    if user["id"] == uid:
        raise HTTPException(400, "Impossible de modifier ses propres permissions (SoD)")
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Utilisateur introuvable")
    incoming = data.get("overrides") or {}
    current = target.get("feature_overrides") or {}
    from permissions import FEATURES_INDEX
    for k, v in incoming.items():
        if k not in FEATURES_INDEX:
            continue
        if v is None:
            current.pop(k, None)
        else:
            current[k] = bool(v)
    await db.users.update_one({"id": uid}, {"$set": {"feature_overrides": current, "updated_at": now_iso()}})
    await audit_log(user["id"], "permissions_updated", {"target_user_id": uid, "changed_keys": list(incoming.keys())})
    updated = await db.users.find_one({"id": uid}, {"_id": 0})
    return {"ok": True, "overrides": current, "effective": effective_permissions(updated)}


async def _seed_integrations_on_startup():
    """Idempotent — seed data_sources + naf_chr_mapping si vides ou obsolètes."""
    for src in DATA_SOURCES_SEED:
        await db.data_sources.update_one(
            {"id": src["id"]},
            {"$set": {**src}, "$setOnInsert": {"created_at": now_iso()}},
            upsert=True,
        )
    for doc in _naf_seed_docs():
        key = doc.get("code_2008") or doc.get("code_2025")
        if not key:
            continue
        await db.naf_chr_mapping.update_one(
            {"$or": [{"code_2008": doc.get("code_2008")}, {"code_2025": doc.get("code_2025")}]} if doc.get("code_2008") or doc.get("code_2025") else {"label": doc["label"]},
            {"$set": doc, "$setOnInsert": {"created_at": now_iso()}},
            upsert=True,
        )
    logging.info("[integrations] data_sources + naf_chr_mapping seeded")


@app.on_event("startup")
async def _integrations_startup():
    try:
        await _seed_integrations_on_startup()
    except Exception as e:
        logging.error(f"integrations seed failed: {e}")


# ---------- /sources-donnees ----------
@api_router.get("/sources-donnees")
async def list_data_sources(user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    sources = await db.data_sources.find({}, {"_id": 0}).to_list(100)
    # enrichit avec last_sync depuis ingestion_runs
    for s in sources:
        last = await db.ingestion_runs.find_one(
            {"source": s["id"]}, {"_id": 0}, sort=[("started_at", -1)]
        )
        if last:
            s["last_sync_at"] = last["started_at"]
            s["last_sync_status"] = last["status"]
            s["last_records"] = last.get("records", 0)
    return sources


@api_router.get("/ingestion-runs")
async def list_ingestion_runs(source: Optional[str] = None, limit: int = 50, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    q = {"source": source} if source else {}
    return await db.ingestion_runs.find(q, {"_id": 0}).sort("started_at", -1).limit(limit).to_list(limit)


# ---------- Settings : départements surveillés (radar) ----------
@api_router.get("/settings/monitored-departments")
async def get_monitored_departments(user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    s = await db.settings.find_one({"key": "monitored_departments"}, {"_id": 0}) or {"value": ["64"]}
    return {"departments": s.get("value", [])}


@api_router.post("/settings/monitored-departments")
async def set_monitored_departments(data: dict, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    depts = data.get("departments", [])
    if not isinstance(depts, list):
        raise HTTPException(400, "departments doit être une liste")
    depts = [str(d).strip() for d in depts if d]
    await db.settings.update_one(
        {"key": "monitored_departments"},
        {"$set": {"key": "monitored_departments", "value": depts, "updated_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True, "departments": depts}


# ---------- PROSPECTION autour de moi ----------
@api_router.get("/prospection/nearby")
async def prospection_nearby(
    lat: float, lng: float, radius_km: float = 5,
    naf_codes: Optional[str] = None,
    user=Depends(get_current_user),
):
    """Recherche géographique de prospects CHR. Rate-limité serveur, exclut clients existants."""
    if radius_km > 50:
        raise HTTPException(400, "Rayon max 50 km")
    # Codes NAF cibles : par défaut tous les CHR de notre mapping
    mapping = await db.naf_chr_mapping.find({"is_chr": True}, {"_id": 0}).to_list(200)
    if naf_codes:
        codes = [c.strip() for c in naf_codes.split(",") if c.strip()]
    else:
        codes = [m["code_2008"] for m in mapping if m.get("code_2008")]
    try:
        results = await _re.search_nearby(lat, lng, radius_km, activite_principale=codes, db=db)
    except RuntimeError as e:
        raise HTTPException(503, f"Source publique indisponible: {e}")
    # Exclusion des SIREN déjà en portefeuille
    existing_sirens = set()
    async for e in db.clients.find({"siren": {"$exists": True, "$ne": ""}}, {"_id": 0, "siren": 1}):
        if e.get("siren"):
            existing_sirens.add(e["siren"])
    async for e in db.establishments.find({"siren": {"$exists": True, "$ne": ""}}, {"_id": 0, "siren": 1}):
        if e.get("siren"):
            existing_sirens.add(e["siren"])
    out = []
    for r in results:
        siren = r.get("siren", "")
        if siren in existing_sirens:
            continue
        gps_lat, gps_lng = _re.extract_gps(r)
        naf, naf25 = _re.extract_naf(r)
        is_chr, segment = is_chr_code(naf, mapping)
        if not is_chr:
            is_chr, segment = is_chr_code(naf25, mapping)
        out.append({
            "siren": siren, "name": r.get("nom_complet") or r.get("nom_raison_sociale"),
            "enseigne": (r.get("siege") or {}).get("enseigne"),
            "activite_principale": naf, "activite_principale_naf25": naf25,
            "segment": segment,
            "lat": gps_lat, "lng": gps_lng,
            "address": (r.get("siege") or {}).get("adresse"),
            "postal": (r.get("siege") or {}).get("code_postal"),
            "commune": (r.get("siege") or {}).get("libelle_commune"),
            "etat_administratif": r.get("etat_administratif"),
            "date_creation": r.get("date_creation"),
            "badges": {
                "confiance_sanitaire": r.get("est_alim_confiance"),
                "entrepreneur_spectacle": r.get("est_entrepreneur_spectacle"),
                "bio": r.get("est_bio"),
            },
        })
    return {"count": len(out), "results": out}


@api_router.post("/prospection/convert")
async def prospection_convert(data: dict, user=Depends(get_current_user)):
    """Convertit un résultat de prospection en client dans le portefeuille."""
    siren = (data.get("siren") or "").strip()
    if not siren:
        raise HTTPException(400, "siren requis")
    existing = await db.clients.find_one({"siren": siren}, {"_id": 0})
    if existing:
        return {"ok": True, "already": True, "client_id": existing["id"]}
    doc = Client(
        name=data.get("name") or f"Prospect {siren}",
        type=data.get("segment") or "bar",
        status="prospect",
        city=data.get("commune") or "",
        address=data.get("address") or "",
        lat=data.get("lat"), lng=data.get("lng"),
        owner_id=user["id"],
    ).model_dump()
    doc.update({
        "siren": siren,
        "activite_principale": data.get("activite_principale"),
        "activite_principale_naf25": data.get("activite_principale_naf25"),
        "prospection_status": "nouveau",
        "source_decouverte": "prospection_terrain",
    })
    await db.clients.insert_one(doc)
    return {"ok": True, "client_id": doc["id"]}


# ---------- CRON RADAR d'ouvertures ----------
@api_router.post("/cron/radar/creations")
async def cron_radar_creations(request: Request, authorization: Optional[str] = Header(None)):
    if not WEBHOOK_CRON_SECRET or not authorization or authorization.split(" ", 1)[-1] != WEBHOOK_CRON_SECRET:
        raise HTTPException(401, "Cron secret invalide")
    return await _run_radar_creations()


@api_router.post("/radar/scan-now")
async def radar_scan_now(user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    return await _run_radar_creations()


async def _run_radar_creations():
    s = await db.settings.find_one({"key": "monitored_departments"}, {"_id": 0}) or {"value": ["64"]}
    depts = s.get("value") or ["64"]
    mapping = await db.naf_chr_mapping.find({"is_chr": True}, {"_id": 0}).to_list(200)
    since_iso = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%d")
    total_bodacc = 0
    total_chr = 0
    total_new = 0
    for dept in depts:
        try:
            annonces = await _bodacc.fetch_creations_by_department(dept, since_iso, db=db)
        except RuntimeError as e:
            logging.warning(f"BODACC dept {dept} indispo: {e}")
            continue
        total_bodacc += len(annonces)
        for a in annonces:
            siren = (a.get("registre") or [""])[0] if isinstance(a.get("registre"), list) else a.get("registre", "")
            if not siren or len(siren) < 9:
                continue
            siren = siren[:9]
            if await db.establishments.find_one({"siren": siren}, {"_id": 0, "id": 1}):
                continue
            if await db.clients.find_one({"siren": siren}, {"_id": 0, "id": 1}):
                continue
            # Enrichissement recherche-entreprises
            try:
                enrich = await _re.get_by_siren(siren, db=db)
            except RuntimeError:
                enrich = None
            if not enrich:
                continue
            naf, naf25 = _re.extract_naf(enrich)
            is_chr, segment = is_chr_code(naf, mapping)
            if not is_chr:
                is_chr, segment = is_chr_code(naf25, mapping)
            if not is_chr:
                continue
            total_chr += 1
            lat, lng = _re.extract_gps(enrich)
            siege = enrich.get("siege") or {}
            doc = {
                "id": str(uuid.uuid4()),
                "name": enrich.get("nom_complet") or f"Etab {siren}",
                "siren": siren,
                "activite_principale": naf,
                "activite_principale_naf25": naf25,
                "segment": segment,
                "type": segment or "bar",
                "city": siege.get("libelle_commune"),
                "address": siege.get("adresse"),
                "code_commune_insee": siege.get("commune"),
                "postal": siege.get("code_postal"),
                "lat": lat, "lng": lng,
                "date_creation_entreprise": enrich.get("date_creation"),
                "etat_administratif": enrich.get("etat_administratif"),
                "source_decouverte": "bodacc",
                "prospection_status": "nouveau",
                "status": "prospect",
                "owner_id": "system",
                "created_at": now_iso(),
                "discovered_at": now_iso(),
            }
            await db.establishments.insert_one(doc)
            await db.watch_events.insert_one({
                "id": str(uuid.uuid4()),
                "source": "bodacc", "event_type": "creation_entreprise",
                "entity_ref": siren, "payload": a,
                "occurred_at": a.get("dateparution"), "ingested_at": now_iso(),
                "processed": True, "gravite": "info",
            })
            total_new += 1
    return {"ok": True, "bodacc_count": total_bodacc, "chr_count": total_chr, "new_prospects": total_new}


@api_router.get("/radar/new-prospects")
async def radar_new_prospects(days: int = 30, user=Depends(get_current_user)):
    """Nouveaux prospects découverts par le radar sur X derniers jours."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    q = {"source_decouverte": "bodacc", "discovered_at": {"$gte": cutoff}}
    if user["role"] != "manager":
        # commercial voit uniquement les prospects de ses départements
        pass
    return await db.establishments.find(q, {"_id": 0}).sort("discovered_at", -1).limit(200).to_list(200)


# ---------- CRON RAPPELS-CONSO ----------
@api_router.post("/cron/rappels/scan")
async def cron_rappels_scan(request: Request, authorization: Optional[str] = Header(None)):
    if not WEBHOOK_CRON_SECRET or not authorization or authorization.split(" ", 1)[-1] != WEBHOOK_CRON_SECRET:
        raise HTTPException(401, "Cron secret invalide")
    return await _run_rappels_scan()


@api_router.post("/veille/scan-now")
async def veille_scan_now(user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    return await _run_rappels_scan()


async def _run_rappels_scan():
    # Récupère tous les GTINs de nos produits + lots
    products = await db.products.find({}, {"_id": 0, "id": 1, "gtin": 1, "name": 1}).to_list(5000)
    gtins_by_product = {p["id"]: p.get("gtin") for p in products if p.get("gtin")}
    since_iso = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
    try:
        recent = await _rc.fetch_recent(since_iso, db=db)
    except RuntimeError as e:
        return {"ok": False, "error": str(e)}
    matches = 0
    for rec in recent:
        gtin = str(rec.get("gtin") or "").strip()
        if not gtin:
            continue
        product_id = next((pid for pid, g in gtins_by_product.items() if g == gtin), None)
        if not product_id and not await db.lots.find_one({"gtin": gtin}, {"_id": 0, "id": 1}):
            continue
        # évite doublon
        existing = await db.watch_events.find_one(
            {"source": "rappelconso", "entity_ref": gtin,
             "payload.reference_fiche": rec.get("reference_fiche")},
            {"_id": 0, "id": 1}
        )
        if existing:
            continue
        await db.watch_events.insert_one({
            "id": str(uuid.uuid4()), "source": "rappelconso",
            "event_type": "rappel_produit", "entity_ref": gtin,
            "payload": rec, "occurred_at": rec.get("date_publication") or rec.get("date_de_publication"),
            "ingested_at": now_iso(), "processed": False,
            "gravite": rec.get("risques_encourus") and "critical" or "warning",
            "product_id": product_id,
        })
        matches += 1
    return {"ok": True, "checked": len(recent), "matches": matches}


@api_router.get("/veille/rappels")
async def list_rappels(limit: int = 50, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    return await db.watch_events.find(
        {"source": "rappelconso"}, {"_id": 0}
    ).sort("occurred_at", -1).limit(limit).to_list(limit)


@api_router.get("/veille/rappels/{event_id}/impacted-clients")
async def rappel_impacted_clients(event_id: str, user=Depends(get_current_user)):
    """Fonction inverse : à partir d'un event → clients livrés du/des lot(s) concerné(s)."""
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    ev = await db.watch_events.find_one({"id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(404, "Event introuvable")
    gtin = ev.get("entity_ref")
    # lots correspondants
    lots = await db.lots.find({"gtin": gtin}, {"_id": 0}).to_list(500)
    lot_ids = [l["id"] for l in lots]
    # lignes de livraison affectées
    if not lot_ids and ev.get("product_id"):
        # fallback via product_id
        deliveries = await db.delivery_lines.find(
            {"product_id": ev["product_id"]}, {"_id": 0}
        ).to_list(5000)
    else:
        deliveries = await db.delivery_lines.find(
            {"lot_id": {"$in": lot_ids}}, {"_id": 0}
        ).to_list(5000)
    # agrège par client
    by_client: dict[str, dict] = {}
    for d in deliveries:
        cid = d.get("client_id")
        if not cid:
            continue
        entry = by_client.setdefault(cid, {"client_id": cid, "total_quantity": 0, "last_delivery": None, "lots": set()})
        entry["total_quantity"] += d.get("quantity", 0)
        if d.get("lot_id"):
            entry["lots"].add(d["lot_id"])
        dd = d.get("delivered_at")
        if dd and (not entry["last_delivery"] or dd > entry["last_delivery"]):
            entry["last_delivery"] = dd
    # enrichit avec noms clients
    for cid, e in by_client.items():
        c = await db.clients.find_one({"id": cid}, {"_id": 0, "name": 1, "phone": 1, "email": 1})
        if c:
            e.update({"client_name": c.get("name"), "phone": c.get("phone"), "email": c.get("email")})
        e["lots"] = list(e["lots"])
    return {"event": ev, "impacted_count": len(by_client), "clients": list(by_client.values())}


# ---------- CRON BOUCLIER ENCOURS ----------
@api_router.post("/cron/bouclier/scan")
async def cron_bouclier_scan(request: Request, authorization: Optional[str] = Header(None)):
    if not WEBHOOK_CRON_SECRET or not authorization or authorization.split(" ", 1)[-1] != WEBHOOK_CRON_SECRET:
        raise HTTPException(401, "Cron secret invalide")
    return await _run_bouclier_scan()


@api_router.post("/bouclier/scan-now")
async def bouclier_scan_now(user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    return await _run_bouclier_scan()


async def _run_bouclier_scan():
    since_iso = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
    # SIRENs des établissements + clients actifs
    q = {"siren": {"$exists": True, "$ne": ""}}
    sirens_by_id: dict[str, tuple[str, str]] = {}  # siren -> (collection, id)
    async for e in db.establishments.find(q, {"_id": 0, "id": 1, "siren": 1}):
        if e.get("siren"):
            sirens_by_id[e["siren"]] = ("establishments", e["id"])
    async for c in db.clients.find(q, {"_id": 0, "id": 1, "siren": 1}):
        if c.get("siren") and c["siren"] not in sirens_by_id:
            sirens_by_id[c["siren"]] = ("clients", c["id"])
    total_alerts = 0
    for siren, (coll, doc_id) in sirens_by_id.items():
        try:
            annonces = await _bodacc.fetch_collective_by_siren(siren, since_iso, db=db)
        except RuntimeError:
            continue
        for a in annonces:
            # dédup
            fingerprint = f"{siren}-{a.get('id') or a.get('publicationavis')}"
            if await db.watch_events.find_one({"entity_ref": siren, "payload.id": a.get("id")}, {"_id": 0, "id": 1}):
                continue
            severity, action_label = _bodacc.classify_collective(a.get("jugement") or {})
            await db.watch_events.insert_one({
                "id": str(uuid.uuid4()), "source": "bodacc",
                "event_type": "procedure_collective", "entity_ref": siren,
                "payload": a, "occurred_at": a.get("dateparution"),
                "ingested_at": now_iso(), "processed": False,
                "gravite": severity, "action_label": action_label,
                "fingerprint": fingerprint,
            })
            # Application immédiate côté fiche
            updates = {
                "admin_state": "collective_proc",
                "admin_state_reason": action_label,
                "admin_state_updated_at": now_iso(),
            }
            if severity == "block":
                updates["credit_status"] = "rouge"
                updates["orders_blocked"] = True
                updates["orders_blocked_reason"] = "Liquidation judiciaire — BODACC"
            elif severity == "watch":
                updates["credit_status"] = "orange"
                updates["orders_cash_only"] = True
            db_coll = db.establishments if coll == "establishments" else db.clients
            await db_coll.update_one({"id": doc_id}, {"$set": updates})
            total_alerts += 1
    return {"ok": True, "sirens_scanned": len(sirens_by_id), "alerts": total_alerts}


@api_router.get("/bouclier/alerts")
async def list_bouclier_alerts(limit: int = 100, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    return await db.watch_events.find(
        {"source": "bodacc", "event_type": "procedure_collective"}, {"_id": 0}
    ).sort("occurred_at", -1).limit(limit).to_list(limit)


# ---------- ORDER GUARD : bloquer si orders_blocked ----------
async def _check_orders_blocked(client_id: str):
    for coll in (db.clients, db.establishments):
        c = await coll.find_one({"id": client_id, "orders_blocked": True}, {"_id": 0, "orders_blocked_reason": 1})
        if c:
            raise HTTPException(423, f"Compte bloqué : {c.get('orders_blocked_reason', 'liquidation')}")


# =============================================================
# PHASE 2 amorce — Traçabilité lot + Relevés terrain + VIES check
# =============================================================

# ---------- LOTS + LIGNES DE LIVRAISON ----------
@api_router.post("/lots")
async def create_lot(data: dict, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    if not data.get("product_id") or not data.get("lot_number"):
        raise HTTPException(400, "product_id et lot_number requis")
    existing = await db.lots.find_one(
        {"product_id": data["product_id"], "lot_number": data["lot_number"]}, {"_id": 0, "id": 1}
    )
    if existing:
        return {"ok": True, "already": True, "id": existing["id"]}
    doc = {
        "id": str(uuid.uuid4()),
        "product_id": data["product_id"],
        "lot_number": data["lot_number"],
        "gtin": (data.get("gtin") or "").strip() or None,
        "date_fabrication": data.get("date_fabrication"),
        "ddm": data.get("ddm"),
        "quantite_produite": data.get("quantite_produite", 0),
        "quantite_restante": data.get("quantite_produite", 0),
        "matieres_premieres": data.get("matieres_premieres", []),
        "created_at": now_iso(), "owner_id": user["id"],
    }
    await db.lots.insert_one(doc)
    return {"ok": True, "id": doc["id"]}


@api_router.get("/lots")
async def list_lots(product_id: Optional[str] = None, user=Depends(get_current_user)):
    q = {"product_id": product_id} if product_id else {}
    return await db.lots.find(q, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)


@api_router.post("/delivery-lines")
async def create_delivery_line(data: dict, user=Depends(get_current_user)):
    """Enregistre une ligne de livraison rattachée à un lot — indispensable au rappel sortant."""
    if not all(k in data for k in ("order_id", "product_id", "client_id", "quantity")):
        raise HTTPException(400, "order_id, product_id, client_id, quantity requis")
    doc = {
        "id": str(uuid.uuid4()),
        "order_id": data["order_id"], "product_id": data["product_id"],
        "lot_id": data.get("lot_id"), "gtin": data.get("gtin"),
        "client_id": data["client_id"], "quantity": data["quantity"],
        "sscc_palette": data.get("sscc_palette"),
        "delivered_at": data.get("delivered_at") or now_iso(),
        "transporteur": data.get("transporteur"),
        "created_at": now_iso(), "created_by": user["id"],
    }
    await db.delivery_lines.insert_one(doc)
    # décrémente qté restante du lot
    if data.get("lot_id") and data.get("quantity"):
        await db.lots.update_one({"id": data["lot_id"]}, {"$inc": {"quantite_restante": -data["quantity"]}})
    return {"ok": True, "id": doc["id"]}


# ---------- Dossier de rappel réglementaire (déclaration) ----------
@api_router.post("/veille/rappels/{event_id}/generate-declaration")
async def generate_recall_declaration(event_id: str, user=Depends(get_current_user)):
    """Pré-remplit le dossier de déclaration DGCCRF à partir d'un rappel + calcule quantité totale + unité."""
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    ev = await db.watch_events.find_one({"id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(404, "Event introuvable")
    gtin = ev.get("entity_ref")
    p = ev.get("payload") or {}
    # somme des quantités livrées
    lots = await db.lots.find({"gtin": gtin}, {"_id": 0, "id": 1, "quantite_produite": 1}).to_list(500)
    lot_ids = [l["id"] for l in lots]
    deliveries = await db.delivery_lines.find(
        {"lot_id": {"$in": lot_ids}}, {"_id": 0}
    ).to_list(10000)
    total_qty = sum(d.get("quantity", 0) for d in deliveries)
    product = await db.products.find_one({"id": ev.get("product_id")}, {"_id": 0}) if ev.get("product_id") else None
    return {
        "rappel_reference": p.get("numero_fiche"),
        "marque": p.get("marque_produit"),
        "gtin": gtin, "lots": [l["id"] for l in lots],
        "quantite_vendue_totale": total_qty,
        "unite": (product or {}).get("unit", "unité"),
        "motif": p.get("motif_rappel"),
        "risques": p.get("risques_encourus"),
        "distributeur": "BEVID",
        "clients_notifies_count": len({d.get("client_id") for d in deliveries if d.get("client_id")}),
        "generated_at": now_iso(),
    }


# ---------- RELEVÉS TERRAIN (< 20 s) — Observatoire ----------
@api_router.post("/releves-terrain")
async def create_releve_terrain(data: dict, user=Depends(get_current_user)):
    """Formulaire < 20 s : marques_presentes[], prix_releves[], nb_lignes_tirage, nb_lignes_par_marque{}, photo_id?"""
    if not data.get("etablissement_id") and not data.get("client_id"):
        raise HTTPException(400, "etablissement_id ou client_id requis")
    doc = {
        "id": str(uuid.uuid4()),
        "etablissement_id": data.get("etablissement_id") or data.get("client_id"),
        "date": data.get("date") or now_iso(),
        "utilisateur_id": user["id"],
        "marques_presentes": data.get("marques_presentes", []),
        "prix_releves": data.get("prix_releves", []),
        "nb_lignes_totales": data.get("nb_lignes_totales", 0),
        "nb_lignes_par_marque": data.get("nb_lignes_par_marque", {}),
        "photo_id": data.get("photo_id"),
        "lat": data.get("lat"), "lng": data.get("lng"),
        "created_at": now_iso(),
    }
    await db.releves_terrain.insert_one(doc)
    return {"ok": True, "id": doc["id"]}


@api_router.get("/releves-terrain")
async def list_releves(client_id: Optional[str] = None, limit: int = 100, user=Depends(get_current_user)):
    q = {}
    if client_id:
        q["etablissement_id"] = client_id
    if user["role"] != "manager":
        q["utilisateur_id"] = user["id"]
    return await db.releves_terrain.find(q, {"_id": 0}).sort("date", -1).limit(limit).to_list(limit)


@api_router.get("/observatoire/summary")
async def observatoire_summary(user=Depends(get_current_user)):
    """Agrégat anonymisé — seuil minimum 5 relevés pour affichage."""
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    releves = await db.releves_terrain.find({}, {"_id": 0}).to_list(50000)
    if len(releves) < 5:
        return {"ok": True, "anonymized": True, "count": len(releves), "min_threshold": 5, "brands": [], "prices": []}
    brand_counts: dict[str, int] = {}
    prices_by_brand: dict[str, list[float]] = {}
    for r in releves:
        for m in r.get("marques_presentes", []):
            brand_counts[m] = brand_counts.get(m, 0) + 1
        for p in r.get("prix_releves", []):
            b = p.get("marque")
            if b and p.get("prix_consommateur") is not None:
                prices_by_brand.setdefault(b, []).append(float(p["prix_consommateur"]))
    brands = sorted(brand_counts.items(), key=lambda x: -x[1])[:10]
    prices = [{"marque": b, "median": sorted(v)[len(v)//2], "n": len(v)}
              for b, v in prices_by_brand.items() if len(v) >= 3]
    return {"ok": True, "count": len(releves), "brands": brands, "prices": prices}


# ---------- VIES TVA intracom ----------
@api_router.post("/tools/vies-check")
async def vies_check(data: dict, user=Depends(get_current_user)):
    vat = data.get("vat_number") or ""
    return await _vies.check_vat(vat, db=db)


@api_router.post("/conflicts/{cid}/dismiss")
async def dismiss_conflict(cid: str, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    await db.conflicts.update_one({"id": cid}, {"$set": {"seen": True, "dismissed_by": user["id"], "dismissed_at": now_iso()}})
    return {"ok": True}

# =============================================================
# CONFLICT PLAYBOOK — Rembourser + prévenir client (1-click)
# =============================================================
@api_router.get("/conflicts/{cid}/playbook-preview")
async def conflict_playbook_preview(cid: str, user=Depends(get_current_user)):
    """Preview des actions possibles pour un conflit + message pré-rempli."""
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    conf = await db.conflicts.find_one({"id": cid}, {"_id": 0})
    if not conf:
        raise HTTPException(404, "Conflit introuvable")
    order = None
    client = None
    if conf.get("kind") == "order":
        order = await db.orders.find_one({"id": conf["entity_id"]}, {"_id": 0})
        if order:
            client = await db.clients.find_one({"id": order["client_id"]}, {"_id": 0}) or {}
    can_refund = bool(order and order.get("payment_status") == "paid" and order.get("stripe_payment_intent_id"))
    already_refunded = bool(order and order.get("payment_status") == "refunded")
    reason_type = (conf.get("extra") or {}).get("reason_type") or "conflit"
    reason_label = {
        "credit_red": "compte bloqué (crédit rouge)",
        "stock": "rupture de stock",
    }.get(reason_type, "conflit détecté à la synchro")
    total = (order or {}).get("total", 0)
    default_msg = (
        f"Bonjour {(client or {}).get('contact_name') or (client or {}).get('name', '')},\n\n"
        f"Nous avons rencontré un {reason_label} sur votre commande #{(order or {}).get('id', '')[:8].upper()} "
        f"({total:.2f} €).\n\n"
        f"Un remboursement intégral a été initié aujourd'hui et vous parviendra sous 3–5 jours ouvrés. "
        f"Notre équipe reprend contact avec vous dans la journée pour trouver une solution.\n\n"
        f"Toutes nos excuses pour la gêne,\nBEVID"
    )
    return {
        "conflict": conf,
        "order": order and {
            "id": order["id"], "total": order.get("total"), "payment_status": order.get("payment_status"),
            "has_signature": bool(order.get("signature")), "client_id": order.get("client_id"),
            "stripe_payment_intent_id": order.get("stripe_payment_intent_id"),
        },
        "client": client and {
            "id": client.get("id"), "name": client.get("name"), "contact_name": client.get("contact_name"),
            "email": client.get("email"), "phone": client.get("phone"),
        },
        "can_refund": can_refund,
        "already_refunded": already_refunded,
        "default_message": default_msg,
    }

@api_router.post("/conflicts/{cid}/playbook")
async def conflict_playbook(cid: str, data: dict, user=Depends(get_current_user)):
    """
    Exécute la playbook manager :
      - remboursement Stripe (si applicable + demandé)
      - réintégration du stock (obligatoire)
      - notification client (WhatsApp / Email)
      - marque le conflit résolu
    Body: { refund: bool, restock: bool=True, channel: "whatsapp"|"email"|"none", message: str }
    """
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    conf = await db.conflicts.find_one({"id": cid}, {"_id": 0})
    if not conf:
        raise HTTPException(404, "Conflit introuvable")
    if conf.get("resolved_at"):
        raise HTTPException(400, "Conflit déjà résolu")

    do_refund = bool(data.get("refund"))
    do_restock = data.get("restock", True) is not False
    channel = (data.get("channel") or "none").lower()
    message = (data.get("message") or "").strip()

    order = None
    client = {}
    if conf.get("kind") == "order":
        order = await db.orders.find_one({"id": conf["entity_id"]}, {"_id": 0})
        if order:
            client = await db.clients.find_one({"id": order["client_id"]}, {"_id": 0}) or {}

    result = {"refund": None, "restock": None, "notification": None}

    # 1) Refund
    if do_refund and order:
        if order.get("payment_status") == "refunded":
            result["refund"] = {"ok": True, "already": True}
        elif order.get("stripe_payment_intent_id"):
            try:
                r = stripe.Refund.create(payment_intent=order["stripe_payment_intent_id"])
                await db.orders.update_one({"id": order["id"]}, {"$set": {
                    "payment_status": "refunded",
                    "refunded_at": now_iso(),
                    "refund_id": r.id,
                    "refunded_by": user["id"],
                }})
                result["refund"] = {"ok": True, "refund_id": r.id}
            except Exception as e:
                result["refund"] = {"ok": False, "reason": str(e)[:200]}
        else:
            # No stripe intent = mark as refunded manually (COD / à régler)
            await db.orders.update_one({"id": order["id"]}, {"$set": {
                "payment_status": "refunded",
                "refunded_at": now_iso(),
                "refunded_by": user["id"],
                "refund_manual": True,
            }})
            result["refund"] = {"ok": True, "manual": True}

    # 2) Restock (rétablir les quantités déduites)
    if do_restock and order:
        for line in order.get("lines", []):
            await db.products.update_one(
                {"id": line["product_id"]},
                {"$inc": {"stock": line.get("quantity", 0)}}
            )
        result["restock"] = {"ok": True, "lines": len(order.get("lines", []))}

    # 3) Notification client
    if channel == "whatsapp":
        phone = (client.get("phone") or "").replace(" ", "")
        if not phone:
            result["notification"] = {"ok": False, "reason": "Numéro client manquant"}
        else:
            if not phone.startswith("+"):
                phone = "+33" + phone.lstrip("0")
            r = await send_wa(phone, message or "Bonjour, votre commande fait l'objet d'un remboursement. Nous vous recontactons.")
            result["notification"] = {**r, "channel": "whatsapp"}
    elif channel == "email":
        to_email = client.get("email")
        if not to_email:
            result["notification"] = {"ok": False, "reason": "Email client manquant"}
        else:
            html_body = "<div style='font-family:Arial,sans-serif;color:#222;line-height:1.5;'>" \
                        + escape(message or "").replace("\n", "<br/>") \
                        + "<hr style='margin:20px 0;border:none;border-top:1px solid #eee'/>" \
                        + "<p style='font-size:12px;color:#888'>BEVID — équipe support</p></div>"
            try:
                email_id = await send_email(to=to_email, subject="BEVID · Information sur votre commande", html=html_body)
                result["notification"] = {"ok": True, "channel": "email", "email_id": email_id}
            except HTTPException as e:
                result["notification"] = {"ok": False, "channel": "email", "reason": str(e.detail)[:200]}
            except Exception as e:
                result["notification"] = {"ok": False, "channel": "email", "reason": str(e)[:200]}
    else:
        result["notification"] = {"ok": True, "skipped": True}

    # 4) Marquer le conflit résolu
    resolution = {
        "actor": user["id"], "at": now_iso(),
        "refund": result["refund"], "restock": result["restock"], "notification": result["notification"],
        "channel": channel, "refund_requested": do_refund,
    }
    await db.conflicts.update_one({"id": cid}, {"$set": {
        "seen": True, "resolved_at": now_iso(), "resolved_by": user["id"], "resolution": resolution
    }})

    # Update order visibility flag
    if order:
        await db.orders.update_one({"id": order["id"]}, {"$set": {"has_conflict": False, "conflict_resolved_at": now_iso()}})
        await db.activities.insert_one(Activity(
            client_id=order["client_id"], agent_id=user["id"], type="note",
            content=f"Playbook conflit #{cid[:6]} exécuté — refund:{do_refund} · restock:{do_restock} · notif:{channel}",
            owner_id=order.get("owner_id", user["id"])
        ).model_dump())
    await audit_log(user["id"], "conflict_playbook", {"conflict_id": cid, "refund": do_refund, "channel": channel})

    return {"ok": True, "result": result}

# =============================================================
# ORDER PDF EMAIL — envoi du PDF signé au client (Resend)
# via lien public signé (24h) car email API sans pièce jointe
# =============================================================
@api_router.get("/public/orders/{token}/pdf")
async def public_order_pdf(token: str):
    o = await db.orders.find_one({"receipt_token": token}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Lien invalide ou expiré")
    exp = o.get("receipt_token_exp")
    if exp:
        try:
            if datetime.fromisoformat(exp.replace("Z", "+00:00")) < datetime.now(timezone.utc):
                raise HTTPException(410, "Lien expiré")
        except (ValueError, TypeError):
            pass
    c = await db.clients.find_one({"id": o["client_id"]}, {"_id": 0}) or {}
    buf = io.BytesIO(_build_order_pdf_bytes(o, c))
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="commande-{o["id"][:8]}.pdf"'})

@api_router.post("/orders/{oid}/send-pdf-email")
async def send_order_pdf_email(oid: str, data: dict = None, user=Depends(get_current_user)):
    """Envoie au client (ou destinataire override) un email contenant le lien de téléchargement du PDF signé."""
    data = data or {}
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Commande introuvable")
    c = await db.clients.find_one({"id": o["client_id"]}, {"_id": 0}) or {}
    to_email = (data.get("to") or c.get("email") or "").strip()
    if not to_email:
        raise HTTPException(400, "Email client manquant")

    # (re)génère un token unique 24h
    token = uuid.uuid4().hex
    exp = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    await db.orders.update_one({"id": oid}, {"$set": {"receipt_token": token, "receipt_token_exp": exp}})

    base = os.environ.get("FRONTEND_URL", "").rstrip("/")
    pdf_url = f"{base}/api/public/orders/{token}/pdf"
    client_greet = escape(c.get("contact_name") or c.get("name") or "cher client")
    order_short = escape(o["id"][:8].upper())
    total = o.get("total", 0)
    signed_note = "Votre signature a été enregistrée avec horodatage." if o.get("signature") else "Votre commande a été enregistrée."
    html = (
        "<div style='font-family:Arial,sans-serif;color:#222;line-height:1.55;max-width:560px;'>"
        f"<h2 style='color:#4A154B;margin:0 0 12px'>BEVID · Bon de commande</h2>"
        f"<p>Bonjour {client_greet},</p>"
        f"<p>Merci pour votre commande <b>#{order_short}</b> d'un montant de <b>{total:.2f} €</b>.</p>"
        f"<p>{signed_note} Vous pouvez télécharger votre bon de commande au format PDF ci-dessous :</p>"
        f"<p style='margin:24px 0'><a href='{pdf_url}' "
        f"style='background:#4A154B;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600'>"
        f"Télécharger le PDF</a></p>"
        f"<p style='font-size:12px;color:#888'>Ce lien est valide 24 heures. Il contient un identifiant unique, ne pas le partager.</p>"
        f"<hr style='margin:20px 0;border:none;border-top:1px solid #eee'/>"
        f"<p style='font-size:12px;color:#888'>BEVID — {escape(EMAIL_REPLY_TO or '')}</p>"
        "</div>"
    )
    try:
        email_id = await send_email(to=to_email, subject=f"BEVID · Votre bon de commande #{order_short}", html=html)
    except HTTPException:
        raise
    await db.activities.insert_one(Activity(
        client_id=o["client_id"], agent_id=user["id"], type="email",
        content=f"PDF commande #{o['id'][:8]} envoyé par email à {to_email}",
        owner_id=o.get("owner_id", user["id"])
    ).model_dump())
    await audit_log(user["id"], "order_pdf_email_sent", {"order_id": oid, "to": to_email})
    return {"ok": True, "email_id": email_id, "to": to_email, "expires": exp}


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# =============================================================
# ENRICHISSEMENT ÉTABLISSEMENT — 3 couches (A : gratuit / B : port / C : lieu)
# Le nom des fournisseurs Couche B n'apparaît PAS dans le code métier — port anonymisé.
# =============================================================
from enrichissement.layer_a import enrichir_couche_a as _layer_a_run
from enrichissement.models import apply_enriched_update, user_locked_update, CHAMPS_ENRICHIS_AUTORISES
from enrichissement.port import resolve_port as _resolve_enrich_port
from enrichissement.credits import CreditsGuard, get_credits_report
from integrations import recherche_entreprises as _re_autocomplete


@api_router.get("/enrichissement/autocomplete")
async def enrichissement_autocomplete(q: str, user=Depends(get_current_user)):
    """Autocomplétion nom → SIREN via Recherche-Entreprises. Rate-limité serveur."""
    q = (q or "").strip()
    if len(q) < 3:
        return {"results": []}
    from integrations.http_client import fetch_json
    payload = await fetch_json(
        "https://recherche-entreprises.api.gouv.fr/search",
        source="recherche-entreprises", db=db, kind="autocomplete",
        params={"q": q, "per_page": 8, "page": 1, "etat_administratif": "A"},
    )
    results = payload.get("results") or []
    return {"results": [
        {
            "siren": r.get("siren"),
            "denomination": r.get("nom_complet") or r.get("nom_raison_sociale"),
            "adresse": (r.get("siege") or {}).get("adresse"),
            "commune": (r.get("siege") or {}).get("libelle_commune"),
            "naf": r.get("activite_principale"),
            "etat": r.get("etat_administratif"),
        } for r in results
    ]}


def _get_enrich_bucket(est: dict) -> dict:
    return (est or {}).get("enrichissement") or {}


async def _apply_layer_result(eid: str, source: str, fields: dict) -> dict:
    """Applique un résultat de Couche A/B/C dans establishments.enrichissement en respectant les verrous."""
    est = await db.establishments.find_one({"id": eid}, {"_id": 0})
    if not est:
        raise HTTPException(404, "Établissement introuvable")
    bucket = _get_enrich_bucket(est)
    updates = {}
    changed_count = 0
    for k, v in fields.items():
        if k.startswith("_") or v is None:
            continue
        if k not in CHAMPS_ENRICHIS_AUTORISES:
            continue
        existing = bucket.get(k)
        doc, changed = apply_enriched_update(existing, v, source=source, fiabilite=0.9)
        updates[f"enrichissement.{k}"] = doc
        if changed:
            changed_count += 1
    if updates:
        updates["enrichissement_updated_at"] = now_iso()
        await db.establishments.update_one({"id": eid}, {"$set": updates})
    return {"ok": True, "changed": changed_count, "fields": list(updates.keys())}


@api_router.post("/establishments/{eid}/enrichir")
async def establishment_enrichir_layer_a(eid: str, user=Depends(get_current_user)):
    """Couche A gratuite : Recherche-Entreprises + Sirene + RNE + BAN + VIES."""
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    est = await db.establishments.find_one({"id": eid}, {"_id": 0})
    if not est:
        raise HTTPException(404, "Établissement introuvable")
    bucket = _get_enrich_bucket(est)
    siren = (bucket.get("siren") or {}).get("valeur") if isinstance(bucket.get("siren"), dict) else (est.get("siren") or est.get("siret") or "")[:9]
    if not siren or len(siren) != 9:
        raise HTTPException(400, "SIREN manquant ou invalide sur l'établissement")
    fields = await _layer_a_run(siren, db=db, adresse_saisie=est.get("address"))
    if fields.get("_error"):
        raise HTTPException(400, fields["_error"])
    # source portée par chaque appel — on utilise la source dominante Sirene/RE
    return await _apply_layer_result(eid, source="sirene", fields=fields)


@api_router.post("/establishments/{eid}/enrichir-plus")
async def establishment_enrichir_layer_b(eid: str, data: dict = None, user=Depends(get_current_user)):
    """Couche B (payante) via port anonymisé. Bascule automatique sur Couche A si crédits épuisés."""
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    est = await db.establishments.find_one({"id": eid}, {"_id": 0})
    if not est:
        raise HTTPException(404, "Établissement introuvable")
    bucket = _get_enrich_bucket(est)
    siren_field = bucket.get("siren")
    siren = (siren_field.get("valeur") if isinstance(siren_field, dict) else None) or est.get("siren") or ""
    if not siren or len(siren) != 9:
        raise HTTPException(400, "SIREN manquant")
    override = (data or {}).get("provider")  # "pappers" pour un déclenchement manuel
    port = _resolve_enrich_port(override_provider=override)
    guard = await CreditsGuard.check(db, port.provider_key)
    if not guard.allowed:
        # bascule automatique vers Couche A gratuite
        fields = await _layer_a_run(siren, db=db, adresse_saisie=est.get("address"))
        result = await _apply_layer_result(eid, source="sirene", fields=fields)
        result["fallback"] = "layer_a"
        result["reason"] = "credits_exhausted"
        return result
    payload = await port.enrichir(siren, db=db)
    scoring = await port.score(siren, db=db)
    if not payload.get("_available"):
        # échec provider → fallback Couche A
        fields = await _layer_a_run(siren, db=db, adresse_saisie=est.get("address"))
        result = await _apply_layer_result(eid, source="sirene", fields=fields)
        result["fallback"] = "layer_a"
        result["reason"] = payload.get("_reason", "provider_unavailable")
        return result
    await guard.consume(db, n=1)
    merged = {**{k: v for k, v in payload.items() if not k.startswith("_")}}
    if scoring.get("_available"):
        for k in ("score_solvabilite", "score_paiement", "score_alerte"):
            if scoring.get(k) is not None:
                merged[k] = scoring[k]
    return await _apply_layer_result(eid, source="layer_b", fields=merged)


@api_router.get("/establishments/{eid}/enriched")
async def establishment_get_enriched(eid: str, user=Depends(get_current_user)):
    est = await db.establishments.find_one({"id": eid}, {"_id": 0})
    if not est:
        raise HTTPException(404, "Établissement introuvable")
    return {"enrichissement": _get_enrich_bucket(est), "updated_at": est.get("enrichissement_updated_at")}


@api_router.put("/establishments/{eid}/enriched-field/{field}")
async def establishment_set_enriched_field(eid: str, field: str, data: dict, user=Depends(get_current_user)):
    """Édition manuelle d'un champ enrichi — verrouille automatiquement."""
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    if field not in CHAMPS_ENRICHIS_AUTORISES:
        raise HTTPException(400, f"Champ non autorisé : {field}")
    valeur = data.get("valeur")
    doc = user_locked_update(valeur)
    await db.establishments.update_one(
        {"id": eid},
        {"$set": {f"enrichissement.{field}": doc, "enrichissement_updated_at": now_iso()}},
    )
    return {"ok": True, "field": field, "locked": True}


@api_router.post("/establishments/{eid}/enriched-field/{field}/lock")
async def establishment_toggle_lock(eid: str, field: str, data: dict = None, user=Depends(get_current_user)):
    """Verrouille / déverrouille un champ enrichi."""
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    if field not in CHAMPS_ENRICHIS_AUTORISES:
        raise HTTPException(400, f"Champ non autorisé : {field}")
    lock = True if (data or {}).get("locked") is None else bool(data["locked"])
    await db.establishments.update_one(
        {"id": eid},
        {"$set": {f"enrichissement.{field}.verrouille_par_utilisateur": lock,
                  f"enrichissement.{field}.date_maj": now_iso()}},
    )
    return {"ok": True, "field": field, "locked": lock}


@api_router.get("/enrichissement/credits")
async def enrichissement_credits(user=Depends(get_current_user)):
    """Rapport mensuel de consommation Couche B — n'expose pas le nom du fournisseur."""
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    return {"providers": await get_credits_report(db)}


# ---------- Couche C — Google Places (live uniquement) + OSM (socle isolé) ----------
from enrichissement import places as _places


@api_router.post("/establishments/{eid}/link-place")
async def link_google_place_id(eid: str, data: dict, user=Depends(get_current_user)):
    """Enregistre UNIQUEMENT le place_id Google. Aucune donnée Google en base."""
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    est = await db.establishments.find_one({"id": eid}, {"_id": 0, "id": 1})
    if not est:
        raise HTTPException(404, "Établissement introuvable")
    pid = (data or {}).get("place_id", "").strip()
    if not pid:
        raise HTTPException(400, "place_id requis")
    return await _places.link_google_place(db, eid, pid)


@api_router.get("/establishments/{eid}/google-place")
async def get_google_place_ref(eid: str, user=Depends(get_current_user)):
    ref = await _places.get_place_ref(db, eid)
    if not ref:
        raise HTTPException(404, "Aucun place_id lié")
    return ref


@api_router.delete("/establishments/{eid}/google-place")
async def unlink_google_place_id(eid: str, user=Depends(get_current_user)):
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    await _places.unlink_google_place(db, eid)
    return {"ok": True}


@api_router.get("/establishments/{eid}/place-preview")
async def google_place_preview(eid: str, user=Depends(get_current_user)):
    """Appel LIVE à Google Places — jamais stocké, jamais caché.
    Aucune colonne note_google n'existe en base ; c'est bien un appel direct à chaque ouverture.
    """
    ref = await _places.get_place_ref(db, eid)
    if not ref:
        raise HTTPException(404, "Aucun place_id lié")
    return await _places.fetch_google_place_live(ref["place_id"])


@api_router.get("/osm-places/search")
async def osm_places_search(lat: float, lng: float, radius_deg: float = 0.02, limit: int = 50, user=Depends(get_current_user)):
    """Recherche géographique dans le socle OSM stocké — jamais joint aux établissements."""
    if user["role"] != "manager":
        raise HTTPException(403, "Manager only")
    results = await _places.search_osm_places(db, lat, lng, radius_deg, limit)
    return {"results": results, "attribution": "© OpenStreetMap contributors"}


# ---------- Crons enrichissement planifiés ----------
async def _iter_portefeuille_sirens():
    """Itère les SIREN du portefeuille (établissements avec siren enriched ou siret raw)."""
    async for e in db.establishments.find({}, {"_id": 0, "id": 1, "siret": 1, "siren": 1, "enrichissement": 1, "address": 1}):
        siren_field = (e.get("enrichissement") or {}).get("siren") or {}
        siren = siren_field.get("valeur") or e.get("siren") or (e.get("siret") or "")[:9]
        if siren and len(siren) == 9 and siren.isdigit():
            yield e, siren


async def _cron_auth(authorization: Optional[str]):
    if not WEBHOOK_CRON_SECRET or not authorization or authorization.split(" ", 1)[-1] != WEBHOOK_CRON_SECRET:
        raise HTTPException(401, "Cron secret invalide")


@api_router.post("/cron/enrichissement/sirene-refresh")
async def cron_enrichissement_sirene_refresh(request: Request, authorization: Optional[str] = Header(None)):
    """Rafraîchit mensuellement identité + adresse via Couche A. Respecte les verrous."""
    await _cron_auth(authorization)
    scanned = 0
    updated = 0
    errors = 0
    async for est, siren in _iter_portefeuille_sirens():
        scanned += 1
        try:
            fields = await _layer_a_run(siren, db=db, adresse_saisie=est.get("address"))
            if not fields.get("_error"):
                result = await _apply_layer_result(est["id"], source="sirene", fields=fields)
                updated += result.get("changed", 0)
        except Exception as e:
            errors += 1
            logging.warning(f"[cron sirene-refresh] {siren} → {e}")
    return {"ok": True, "sirens_scanned": scanned, "fields_updated": updated, "errors": errors}


@api_router.post("/cron/enrichissement/scoring-mensuel")
async def cron_enrichissement_scoring_mensuel(request: Request, authorization: Optional[str] = Header(None)):
    """Scoring mensuel Couche B avec bascule automatique Couche A si crédits épuisés."""
    await _cron_auth(authorization)
    port = _resolve_enrich_port()
    guard = await CreditsGuard.check(db, port.provider_key)
    scanned = 0
    scored = 0
    fallback = 0
    errors = 0
    async for est, siren in _iter_portefeuille_sirens():
        scanned += 1
        try:
            if not guard.allowed:
                # bascule douce vers Couche A (rafraîchit identité)
                fields = await _layer_a_run(siren, db=db)
                await _apply_layer_result(est["id"], source="sirene", fields=fields)
                fallback += 1
                continue
            scoring = await port.score(siren, db=db)
            if scoring.get("_available"):
                merged = {k: v for k, v in scoring.items() if not k.startswith("_") and v is not None}
                if merged:
                    await _apply_layer_result(est["id"], source="layer_b", fields=merged)
                    await guard.consume(db, 1)
                    scored += 1
            else:
                fallback += 1
        except Exception as e:
            errors += 1
            logging.warning(f"[cron scoring-mensuel] {siren} → {e}")
    return {"ok": True, "sirens_scanned": scanned, "scored": scored, "fallback_to_layer_a": fallback, "errors": errors}


@api_router.post("/cron/enrichissement/comptes-annuels-rne")
async def cron_enrichissement_comptes_rne(request: Request, authorization: Optional[str] = Header(None)):
    """Charge annuellement (avril) les comptes annuels et dirigeants depuis le RNE INPI."""
    await _cron_auth(authorization)
    from enrichissement import rne as _rne
    scanned = 0
    updated = 0
    errors = 0
    async for est, siren in _iter_portefeuille_sirens():
        scanned += 1
        try:
            formalite = await _rne.fetch_formalite(siren, db=db)
            if not formalite:
                continue
            comptes = (
                formalite.get("formality", {}).get("content", {}).get("personneMorale", {}).get("comptesAnnuels")
                or []
            )
            fields = {}
            dirigeants = _rne.extract_dirigeants(formalite)
            if dirigeants:
                fields["dirigeants"] = dirigeants
            benefs = _rne.extract_beneficiaires(formalite)
            if benefs:
                fields["beneficiaires_effectifs"] = benefs
            if comptes:
                fields["comptes_annuels"] = comptes
            if fields:
                res = await _apply_layer_result(est["id"], source="rne-inpi", fields=fields)
                updated += res.get("changed", 0)
        except Exception as e:
            errors += 1
            logging.warning(f"[cron comptes-rne] {siren} → {e}")
    return {"ok": True, "sirens_scanned": scanned, "fields_updated": updated, "errors": errors}


# ---------- Voice transcribe (offline queue endpoint) ----------
@api_router.post("/voice/transcribe")
async def voice_transcribe(
    audio: UploadFile = File(...),
    lang: str = "fr-FR",
    recorded_at: str = "",
    user=Depends(get_current_user),
):
    """Reçoit un enregistrement audio issu de la file offline. Stocke les métadonnées
    et le blob binaire dans `voice_uploads`. La transcription réelle (Whisper) est
    branchée à part quand la clé LLM est configurée — l'endpoint retourne 200 pour
    vider la file côté client dès que le fichier est reçu.
    """
    try:
        payload = await audio.read()
    except Exception:
        raise HTTPException(400, "Audio illisible")
    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "user_id": user["id"],
        "lang": lang,
        "recorded_at": recorded_at or now_iso(),
        "received_at": now_iso(),
        "mime": audio.content_type or "audio/webm",
        "size": len(payload),
        "audio_b64": base64.b64encode(payload).decode("ascii") if len(payload) < 10 * 1024 * 1024 else None,
        "status": "received",
        "transcript": None,
    }
    await db.voice_uploads.insert_one(doc)
    return {"ok": True, "id": doc_id, "transcript": ""}


app.include_router(api_router)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# ---------- Seed démo idempotent (manager + commercial) ----------
async def _seed_demo_users_on_startup():
    """Garantit l'existence des comptes de démo + les rattache à BEVID Démo."""
    org_id = await ensure_demo_org(db_raw)
    demo_users = [
        {"email": "manager.demo@bevidcrm.fr",    "password": "Manager!2026Demo",   "name": "Marie Manager",     "role": "manager"},
        {"email": "commercial.demo@bevidcrm.fr", "password": "Commercial!2026Demo","name": "Thomas Commercial", "role": "commercial"},
    ]
    for a in demo_users:
        existing = await db_raw.users.find_one({"email": a["email"]})
        if existing:
            # Backfill éventuel : rattacher à BEVID Démo si org_id manque
            if not existing.get("org_id"):
                await db_raw.users.update_one(
                    {"id": existing["id"]}, {"$set": {"org_id": org_id}}
                )
            continue
        doc = {
            "id": str(uuid.uuid4()), "email": a["email"], "name": a["name"],
            "role": a["role"], "language": "fr", "active": True, "must_reset": False,
            "created_at": now_iso(), "password": hash_password(a["password"]),
            "terms_accepted_at": now_iso(), "org_id": org_id,
        }
        await db_raw.users.insert_one(doc)
        logger.info(f"[seed] demo user created: {a['email']} → {a['role']} in org={org_id[:8]}")
    # Owner = le premier manager rattaché
    await ensure_owner_of_demo(db_raw, org_id)


@app.on_event("startup")
async def _startup_seed_demo():
    try:
        await _seed_demo_users_on_startup()
    except Exception as e:
        logger.warning(f"[seed] demo users skipped: {e}")


@app.on_event("startup")
async def _startup_tenant_migration():
    """Migration idempotente vers le multi-tenant : stampe org_id sur les docs
    orphelins et journalise les fuites potentielles."""
    try:
        report = await run_tenant_migration(db_raw)
        if report.get("backfilled"):
            logger.info(f"[tenant] backfill : {report['backfilled']}")
        if report.get("orphans"):
            logger.warning(f"[tenant] ORPHELINS RESTANTS : {report['orphans']}")
    except Exception as e:
        logger.warning(f"[tenant] migration skipped: {e}")
