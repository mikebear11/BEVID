from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, uuid, jwt, bcrypt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
from emergentintegrations.llm.chat import LlmChat, UserMessage

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
