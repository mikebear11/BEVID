from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Request
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
import httpx, stripe
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
JWT_SECRET = os.environ.get('JWT_SECRET', 'crm-boisson-secret-2026-change-me')
JWT_ALGO = "HS256"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="CRM Boisson API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# ---------- MODELS ----------
def now_iso():
    return datetime.now(timezone.utc).isoformat()

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["manager", "commercial"] = "commercial"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    role: str = "commercial"
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

def create_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=30)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload.get("sub")
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        if not user:
            raise HTTPException(401, "Utilisateur introuvable")
        return user
    except jwt.PyJWTError:
        raise HTTPException(401, "Token invalide")

@api_router.post("/auth/register")
async def register(data: UserRegister):
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(400, "Email déjà utilisé")
    user = User(email=data.email, name=data.name, role=data.role)
    doc = user.model_dump()
    doc["password"] = hash_password(data.password)
    await db.users.insert_one(doc)
    token = create_token(user.id)
    return {"token": token, "user": user.model_dump()}

@api_router.post("/auth/login")
async def login(data: UserLogin):
    doc = await db.users.find_one({"email": data.email})
    if not doc or not verify_password(data.password, doc["password"]):
        raise HTTPException(401, "Identifiants invalides")
    token = create_token(doc["id"])
    doc.pop("password", None)
    doc.pop("_id", None)
    return {"token": token, "user": doc}

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
    await db.clients.update_one({"id": client_id}, {"$set": data})
    return await db.clients.find_one({"id": client_id}, {"_id": 0})

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user=Depends(get_current_user)):
    await db.clients.delete_one({"id": client_id})
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
    data["owner_id"] = user["id"]
    data["agent_id"] = data.get("agent_id") or user["id"]
    # auto-fill client_name if missing
    if not data.get("client_name") and data.get("client_id"):
        c = await db.clients.find_one({"id": data["client_id"]}, {"_id": 0})
        if c:
            data["client_name"] = c["name"]
        else:
            raise HTTPException(422, "client_id introuvable")
    total = sum(l["quantity"] * l["unit_price"] for l in data.get("lines", []))
    data["total"] = total
    o = Order(**data)
    await db.orders.insert_one(o.model_dump())
    # decrement stocks
    for line in o.lines:
        await db.products.update_one({"id": line.product_id}, {"$inc": {"stock": -line.quantity}})
    # add activity
    await db.activities.insert_one(Activity(
        client_id=o.client_id, agent_id=o.agent_id, type="commande",
        content=f"Commande {o.id[:8]} - {total:.2f}€", owner_id=user["id"]
    ).model_dump())
    return o.model_dump()

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
                         headers={"User-Agent": "CellierCRM/1.0"})
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
                                 headers={"User-Agent": "CellierCRM/1.0"})
                results = r.json() if r.status_code == 200 else []
                if results:
                    await db.clients.update_one({"id": c["id"]},
                        {"$set": {"lat": float(results[0]["lat"]), "lng": float(results[0]["lon"])}})
                    updated += 1
            except Exception:
                pass
    return {"updated": updated, "total_processed": min(len(clients), 30)}

# ---------- PDF ORDER ----------
@api_router.get("/orders/{oid}/pdf")
async def order_pdf(oid: str, user=Depends(get_current_user)):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Commande introuvable")
    c = await db.clients.find_one({"id": o["client_id"]}, {"_id": 0}) or {}
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=40, bottomMargin=40, leftMargin=50, rightMargin=50)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('T', parent=styles['Title'], textColor=colors.HexColor("#4A154B"), fontSize=26, spaceAfter=6)
    over_style = ParagraphStyle('O', parent=styles['Normal'], fontSize=8, textColor=colors.grey, spaceAfter=20)
    elems = []
    elems.append(Paragraph("BON DE COMMANDE", over_style))
    elems.append(Paragraph(f"Cellier · Commande #{o['id'][:8].upper()}", title_style))
    elems.append(Paragraph(f"Date: {o.get('created_at','')[:10]}", styles['Normal']))
    elems.append(Spacer(1, 16))
    elems.append(Paragraph(f"<b>Client:</b> {o.get('client_name','')}", styles['Normal']))
    if c.get('address') or c.get('city'):
        elems.append(Paragraph(f"{c.get('address','')}, {c.get('city','')}", styles['Normal']))
    if c.get('contact_name'):
        elems.append(Paragraph(f"Contact: {c.get('contact_name')} · {c.get('phone','')}", styles['Normal']))
    elems.append(Spacer(1, 20))
    # lines table
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
    # signature
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
    owner_id: str
    created_at: str = Field(default_factory=now_iso)

@api_router.post("/visits")
async def create_visit(data: dict, user=Depends(get_current_user)):
    data["owner_id"] = user["id"]
    data["agent_id"] = user["id"]
    cid = data.get("client_id")
    c = await db.clients.find_one({"id": cid}, {"_id": 0}) if cid else None
    if not c:
        raise HTTPException(404, "Client introuvable")
    data["client_name"] = c["name"]
    v = VisitReport(**data)
    await db.visits.insert_one(v.model_dump())
    # aussi comme activity
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
    provider: Literal["easybeer", "vinovendpro", "pennylane", "google_drive", "custom"]
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

@api_router.post("/orders/{oid}/payment-link")
async def create_payment_link(oid: str, request: Request, user=Depends(get_current_user)):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Commande introuvable")
    origin = os.environ.get("FRONTEND_URL", str(request.base_url).rstrip("/"))
    try:
        session = stripe.checkout.Session.create(
            line_items=[{
                "price_data": {
                    "currency": "eur",
                    "product_data": {"name": f"Commande Cellier #{oid[:8]} · {o['client_name']}"},
                    "unit_amount": int(round(o.get("total", 0) * 100)),
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{origin}/payment/cancel",
            metadata={"order_id": oid, "client_id": o["client_id"]},
            payment_method_types=["card"],
        )
        await db.payment_transactions.insert_one({
            "session_id": session.id, "order_id": oid, "client_id": o["client_id"],
            "amount": o.get("total", 0), "currency": "eur",
            "status": "initiated", "payment_status": "pending",
            "created_at": now_iso(), "updated_at": now_iso(),
        })
        await db.orders.update_one({"id": oid}, {"$set": {"payment_session_id": session.id, "payment_status": "pending"}})
        return {"checkout_url": session.url, "session_id": session.id, "amount": o.get("total", 0)}
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
    txt = (f"🍾 Cellier · Reçu #{o['id'][:8].upper()}\n"
           f"Client : {o['client_name']}\n"
           f"Date : {o.get('created_at','')[:10]}\n"
           f"Statut : {paid_flag}\n\n"
           f"{lines_txt}\n\n"
           f"TOTAL : {o.get('total',0):.2f}€\n\n"
           f"Merci pour votre commande !")
    return {"text": txt, "encoded": txt}

@api_router.get("/")
async def root():
    return {"service": "CRM Boisson API", "status": "ok"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
