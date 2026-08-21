"""Iter27 — Compteurs métier discrets sur la sidebar.
Endpoint /api/sidebar/counters : impayés dépassés + contenants sortis + commandes à signer.
"""
import os
import requests

BASE = os.environ.get("BACKEND_URL", "http://localhost:8001")
API = f"{BASE}/api"

MGR = {"email": "manager.demo@bevidcrm.fr", "password": "Manager!2026Demo"}
COM = {"email": "commercial.demo@bevidcrm.fr", "password": "Commercial!2026Demo"}


def _token(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=10)
    assert r.status_code == 200
    return r.json()["token"]


def _headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def test_counters_shape():
    tok = _token(MGR)
    r = requests.get(f"{API}/sidebar/counters", headers=_headers(tok), timeout=10)
    assert r.status_code == 200
    body = r.json()
    for k in ("payments_overdue", "containers_out", "orders_pending_signature"):
        assert k in body, f"missing key {k}"
        assert isinstance(body[k], int), f"key {k} must be int, got {type(body[k])}"
        assert body[k] >= 0


def test_counters_manager_broader_than_commercial():
    """Le manager voit toutes les commandes ; le commercial seulement les siennes.
    Donc counters(manager) >= counters(commercial) sur chaque champ."""
    mgr_tok = _token(MGR)
    com_tok = _token(COM)
    m = requests.get(f"{API}/sidebar/counters", headers=_headers(mgr_tok), timeout=10).json()
    c = requests.get(f"{API}/sidebar/counters", headers=_headers(com_tok), timeout=10).json()
    for k in ("payments_overdue", "containers_out", "orders_pending_signature"):
        assert m[k] >= c[k], f"manager {k}={m[k]} < commercial {k}={c[k]} — filtre inverse ?"


def test_counters_auth_required():
    r = requests.get(f"{API}/sidebar/counters", timeout=10)
    assert r.status_code in (401, 403)


def test_auth_me_returns_plan_id():
    """Le plan_id doit être disponible côté frontend pour piloter le grisage forfait."""
    tok = _token(MGR)
    r = requests.get(f"{API}/auth/me", headers=_headers(tok), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert "plan_id" in body, "plan_id missing in /auth/me"
    assert body["plan_id"] in ("terrain", "pro", "entreprise"), f"invalid plan_id: {body['plan_id']}"


def test_org_plan_features_present():
    tok = _token(MGR)
    r = requests.get(f"{API}/auth/me", headers=_headers(tok), timeout=10)
    body = r.json()
    # Doit exposer la liste des features du plan (utile pour le grisage frontend)
    assert "org_plan_features" in body
    assert isinstance(body["org_plan_features"], list)
    # Cohérence : terrain a au moins page:clients et page:orders
    if body["plan_id"] == "terrain":
        assert "page:clients" in body["org_plan_features"]
        assert "page:orders" in body["org_plan_features"]
