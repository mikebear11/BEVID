"""Iter32 — Migration idempotente clients→establishments."""
import os
import requests

BASE = os.environ.get("BACKEND_URL", "http://localhost:8001")
API = f"{BASE}/api"

MGR = {"email": "manager.demo@bevidcrm.fr", "password": "Manager!2026Demo"}


def _token(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=10)
    return r.json()["token"]


def _headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def test_all_clients_now_reachable_as_establishments():
    """Après migration au startup, chaque doc de /api/clients doit être atteignable
    via /api/establishments/{id} (plus de 404 quand on redirige)."""
    tok = _token(MGR)
    clients = requests.get(f"{API}/clients", headers=_headers(tok), timeout=10).json()
    assert len(clients) > 0
    missing = []
    for c in clients:
        r = requests.get(f"{API}/establishments/{c['id']}", headers=_headers(tok), timeout=10)
        if r.status_code != 200:
            missing.append(c["id"])
    assert not missing, f"clients absents de db.establishments après merge : {missing[:3]}"


def test_migration_idempotent():
    """Deuxième appel au /establishments doit renvoyer le même count (pas de duplicats)."""
    tok = _token(MGR)
    n1 = len(requests.get(f"{API}/establishments", headers=_headers(tok), timeout=10).json())
    n2 = len(requests.get(f"{API}/establishments", headers=_headers(tok), timeout=10).json())
    assert n1 == n2
