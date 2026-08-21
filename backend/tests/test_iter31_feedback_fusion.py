"""Lot 7 — Feedback utilité + fusion clients/etabs sur RGPD."""
import os
import uuid
import requests

BASE = os.environ.get("BACKEND_URL", "http://localhost:8001")
API = f"{BASE}/api"

MGR = {"email": "manager.demo@bevidcrm.fr", "password": "Manager!2026Demo"}


def _token(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=10)
    assert r.status_code == 200
    return r.json()["token"]


def _headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def test_feedback_upsert_idempotent():
    tok = _token(MGR)
    tgt = f"test-brief-{uuid.uuid4().hex[:6]}"
    # First vote
    r = requests.post(f"{API}/copilot/feedback", headers=_headers(tok),
                      json={"kind": "brief", "target_id": tgt, "useful": True}, timeout=10)
    assert r.status_code == 200
    # Second vote overrides (idempotent upsert)
    r = requests.post(f"{API}/copilot/feedback", headers=_headers(tok),
                      json={"kind": "brief", "target_id": tgt, "useful": False}, timeout=10)
    assert r.status_code == 200
    # Stats
    stats = requests.get(f"{API}/copilot/feedback/stats", headers=_headers(tok), timeout=10).json()
    assert "useful_rate" in stats
    assert "by_kind" in stats and "brief" in stats["by_kind"]
    assert "memory_coverage" in stats


def test_feedback_bad_kind_rejected():
    tok = _token(MGR)
    r = requests.post(f"{API}/copilot/feedback", headers=_headers(tok),
                      json={"kind": "malicious", "target_id": "x", "useful": True}, timeout=10)
    assert r.status_code == 422


def test_feedback_empty_target_rejected():
    tok = _token(MGR)
    r = requests.post(f"{API}/copilot/feedback", headers=_headers(tok),
                      json={"kind": "brief", "target_id": "   ", "useful": True}, timeout=10)
    assert r.status_code == 422


def test_feedback_auth_required():
    r = requests.post(f"{API}/copilot/feedback",
                      json={"kind": "brief", "target_id": "x", "useful": True}, timeout=10)
    assert r.status_code in (401, 403)
    r = requests.get(f"{API}/copilot/feedback/stats", timeout=10)
    assert r.status_code in (401, 403)


def test_rgpd_accepts_establishment_id():
    """Fix fusion clients/etabs : /rgpd/clients/{cid} accepte un id d'établissement.
    Avant : 404 si cid n'existait pas dans db.clients."""
    tok = _token(MGR)
    # Prend un établissement qui n'existe QUE dans db.establishments
    ests = requests.get(f"{API}/establishments", headers=_headers(tok), timeout=10).json()
    eid = ests[0]["id"]
    # L'endpoint export doit répondre 200 sur cet id
    r = requests.get(f"{API}/rgpd/clients/{eid}/export", headers=_headers(tok), timeout=10)
    assert r.status_code == 200, f"export doit accepter un establishment_id, got {r.status_code}"
    body = r.json()
    assert body["establishment"] is not None
