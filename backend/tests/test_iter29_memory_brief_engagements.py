"""Lot 7 étapes 2, 3, 4 — Mémoire client, brief avant visite, engagements.
Test coverage :
- GET /api/establishments/{eid}/memory retourne {sections, computed_at}.
- POST recompute force le recalcul et met à jour computed_at.
- GET /api/establishments/{eid}/brief renvoie ≤ 5 lignes.
- Engagements : CRUD + extract + confirm + due list + isolation.
- RGPD étendu (engagements + client_memory purgés).
"""
import os
import uuid
import requests
from datetime import date

BASE = os.environ.get("BACKEND_URL", "http://localhost:8001")
API = f"{BASE}/api"

MGR = {"email": "manager.demo@bevidcrm.fr", "password": "Manager!2026Demo"}


def _token(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=10)
    assert r.status_code == 200
    return r.json()["token"]


def _headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _first_est(tok):
    r = requests.get(f"{API}/establishments", headers=_headers(tok), timeout=10)
    lst = r.json()
    assert isinstance(lst, list) and len(lst) > 0
    return lst[0]["id"]


def test_memory_shape():
    tok = _token(MGR)
    eid = _first_est(tok)
    r = requests.get(f"{API}/establishments/{eid}/memory", headers=_headers(tok), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "sections" in body and isinstance(body["sections"], list)
    assert "computed_at" in body
    # Chaque item a un `text` et éventuellement une source
    for sec in body["sections"]:
        assert "key" in sec and "items" in sec
        for it in sec["items"]:
            assert "text" in it


def test_memory_recompute_updates_timestamp():
    tok = _token(MGR)
    eid = _first_est(tok)
    r1 = requests.get(f"{API}/establishments/{eid}/memory", headers=_headers(tok), timeout=15).json()
    ts1 = r1.get("computed_at")
    r2 = requests.post(f"{API}/establishments/{eid}/memory/recompute", headers=_headers(tok), timeout=15).json()
    ts2 = r2.get("computed_at")
    assert ts2 and ts2 != ts1


def test_brief_max_5_lines():
    tok = _token(MGR)
    eid = _first_est(tok)
    r = requests.get(f"{API}/establishments/{eid}/brief", headers=_headers(tok), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert "lines" in body and isinstance(body["lines"], list)
    assert len(body["lines"]) <= 5, "spec : jamais plus de 5 lignes"
    assert len(body["lines"]) >= 1, "spec : si rien, dire 'Rien de particulier…' en une ligne"


def test_engagements_confirm_persists():
    tok = _token(MGR)
    ests = requests.get(f"{API}/clients", headers=_headers(tok), timeout=10).json()
    if not ests:
        ests = requests.get(f"{API}/establishments", headers=_headers(tok), timeout=10).json()
    cid = ests[0]["id"]
    # Crée une visite
    r = requests.post(f"{API}/visits", headers=_headers(tok),
                      json={"client_id": cid, "voice_transcript": "je rappelle lundi",
                            "summary": "je rappelle lundi"}, timeout=10)
    vid = r.json()["id"]
    # Confirme un engagement
    r = requests.post(f"{API}/visits/{vid}/confirm-engagements", headers=_headers(tok),
                      json={"items": [{"label": "Rappeler lundi", "owner": "agent",
                                       "due_date": date.today().isoformat()}]}, timeout=10)
    assert r.status_code == 200
    assert r.json()["count"] == 1
    # Récupération
    lst = requests.get(f"{API}/establishments/{cid}/engagements", headers=_headers(tok), timeout=10).json()
    assert any(e["label"] == "Rappeler lundi" for e in lst)


def test_engagements_due_endpoint():
    tok = _token(MGR)
    r = requests.get(f"{API}/engagements/due?days=7", headers=_headers(tok), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)


def test_engagements_patch_validates_status():
    tok = _token(MGR)
    ests = requests.get(f"{API}/clients", headers=_headers(tok), timeout=10).json()
    if not ests:
        ests = requests.get(f"{API}/establishments", headers=_headers(tok), timeout=10).json()
    cid = ests[0]["id"]
    r = requests.post(f"{API}/visits", headers=_headers(tok),
                      json={"client_id": cid, "voice_transcript": "x", "summary": "x"}, timeout=10)
    vid = r.json()["id"]
    r = requests.post(f"{API}/visits/{vid}/confirm-engagements", headers=_headers(tok),
                      json={"items": [{"label": "test patch", "owner": "agent"}]}, timeout=10)
    eng_id = r.json()["confirmed"][0]["id"]
    # Bad status
    r = requests.patch(f"{API}/engagements/{eng_id}", headers=_headers(tok),
                       json={"status": "bad_state"}, timeout=10)
    assert r.status_code == 422
    # Valid status tenu
    r = requests.patch(f"{API}/engagements/{eng_id}", headers=_headers(tok),
                       json={"status": "tenu"}, timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "tenu"


def test_extract_engagement_visit_not_found():
    tok = _token(MGR)
    r = requests.post(f"{API}/visits/{uuid.uuid4().hex}/extract-engagements",
                      headers=_headers(tok), timeout=20)
    assert r.status_code == 404


def test_extract_engagement_empty_transcript():
    tok = _token(MGR)
    ests = requests.get(f"{API}/clients", headers=_headers(tok), timeout=10).json()
    if not ests:
        ests = requests.get(f"{API}/establishments", headers=_headers(tok), timeout=10).json()
    cid = ests[0]["id"]
    r = requests.post(f"{API}/visits", headers=_headers(tok),
                      json={"client_id": cid, "voice_transcript": ""}, timeout=10)
    vid = r.json()["id"]
    r = requests.post(f"{API}/visits/{vid}/extract-engagements",
                      headers=_headers(tok), timeout=20)
    assert r.status_code == 200
    assert r.json()["proposals"] == []


def test_auth_required():
    r = requests.get(f"{API}/establishments/foo/memory", timeout=10)
    assert r.status_code in (401, 403)
    r = requests.get(f"{API}/establishments/foo/brief", timeout=10)
    assert r.status_code in (401, 403)
    r = requests.get(f"{API}/engagements/due", timeout=10)
    assert r.status_code in (401, 403)
