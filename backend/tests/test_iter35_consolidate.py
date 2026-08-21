"""Lot 8 · Consolidation Test Data.

Vérifie :
- La purge élimine les fake clients/produits/commandes.
- L'enrichissement crée des commandes/visites/objections/engagements sur les
  établissements réels.
- L'endpoint est idempotent (rejeu → 0 création supplémentaire).
- Réservé aux managers (403 pour commercial).
- Les établissements préservés restent intacts.
"""
import os
import pytest
import httpx

API = os.environ.get("BEVID_API", "http://localhost:8001/api")
MANAGER = {"email": "manager.demo@bevidcrm.fr", "password": "Manager!2026Demo"}
COMMERCIAL = {"email": "commercial.demo@bevidcrm.fr", "password": "Commercial!2026Demo"}

REAL_NAMES = {"ADT 64", "BEKAST (BURGER KING)", "SAS CASSOULET", "Bar de la Poste", "Tour Eiffel Test"}


@pytest.fixture(scope="module")
def manager_client():
    with httpx.Client(base_url=API, timeout=60.0) as c:
        r = c.post("/auth/login", json=MANAGER)
        assert r.status_code == 200
        c.headers["Authorization"] = f"Bearer {r.json()['token']}"
        yield c


@pytest.fixture(scope="module")
def commercial_client():
    with httpx.Client(base_url=API, timeout=60.0) as c:
        r = c.post("/auth/login", json=COMMERCIAL)
        assert r.status_code == 200
        c.headers["Authorization"] = f"Bearer {r.json()['token']}"
        yield c


def test_consolidate_forbidden_for_commercial(commercial_client):
    r = commercial_client.post("/admin/demo/consolidate")
    assert r.status_code == 403


def test_consolidate_returns_report_shape(manager_client):
    r = manager_client.post("/admin/demo/consolidate")
    assert r.status_code == 200
    data = r.json()
    # Toutes les clés du rapport doivent être présentes et numériques
    for k in ("establishments_purged", "clients_purged", "orders_purged",
              "products_purged", "enriched_establishments", "orders_created",
              "visits_created", "objections_created", "engagements_created"):
        assert k in data, f"Clé manquante : {k}"
        assert isinstance(data[k], int), f"{k} doit être un entier"
    assert set(data["preserved_establishments"]) == REAL_NAMES


def test_consolidate_is_idempotent(manager_client):
    """Un 2e appel ne doit rien recréer (déjà seed)."""
    r2 = manager_client.post("/admin/demo/consolidate")
    assert r2.status_code == 200
    d = r2.json()
    # Aucune nouvelle création après premier passage
    assert d["orders_created"] == 0, f"Non-idempotent : {d['orders_created']} commandes créées au 2e run"
    assert d["visits_created"] == 0
    assert d["objections_created"] == 0
    assert d["engagements_created"] == 0
    assert d["enriched_establishments"] == 0


def test_no_junk_establishments_remain(manager_client):
    """Après consolidation : les noms de test doivent avoir disparu."""
    r = manager_client.get("/establishments")
    assert r.status_code == 200
    names = {e["name"] for e in r.json()}
    junk_patterns = ["TESTP_", "PROPTEST-", "BAR LE CENTRAL",
                     "Cave du Sud", "Restaurant Chez Paul", "XLSX Test"]
    for pat in junk_patterns:
        assert not any(pat in n for n in names), f"Junk restant : {[n for n in names if pat in n]}"


def test_real_establishments_are_preserved(manager_client):
    r = manager_client.get("/establishments")
    names = {e["name"] for e in r.json()}
    # Au moins 3 des 5 réels doivent survivre (ADT 64, BEKAST, SAS CASSOULET)
    critical = {"ADT 64", "BEKAST (BURGER KING)", "SAS CASSOULET"}
    assert critical.issubset(names), f"Établissements critiques disparus : {critical - names}"


def test_enrichment_created_history(manager_client):
    """Après consolidation, ADT 64 doit avoir des commandes récentes + une mémoire."""
    r = manager_client.get("/establishments")
    ests = r.json()
    adt = next((e for e in ests if e["name"] == "ADT 64"), None)
    assert adt is not None, "ADT 64 doit exister"
    # Commandes
    orders = manager_client.get("/orders").json()
    adt_orders = [o for o in orders if o.get("client_id") == adt["id"]]
    assert len(adt_orders) >= 6, f"ADT 64 devrait avoir ≥ 6 commandes, a {len(adt_orders)}"
    # Visites
    visits = manager_client.get(f"/visits?client_id={adt['id']}").json()
    assert len(visits) >= 1, "ADT 64 devrait avoir au moins 1 visite"
    # Objections
    objs = manager_client.get(f"/establishments/{adt['id']}/objections").json()
    assert len(objs) >= 1, "ADT 64 devrait avoir au moins 1 objection"


def test_no_junk_orders_remain(manager_client):
    orders = manager_client.get("/orders").json()
    junk_patterns = ["TESTP_", "PROPTEST-", "BAR LE CENTRAL", "MANUAL DE", "BK_"]
    for pat in junk_patterns:
        matching = [o for o in orders if pat in (o.get("client_name") or "")]
        assert not matching, f"Junk orders restants pour '{pat}' : {[o['client_name'] for o in matching[:3]]}"
