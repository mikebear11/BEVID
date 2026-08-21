"""Lot 7 étapes 5 & 6 — Commentaires libres + réponses qui marchent + snapshot brief offline."""
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


def _first_est(tok):
    r = requests.get(f"{API}/establishments", headers=_headers(tok), timeout=10)
    return r.json()[0]["id"]


def test_comments_create_read_pin_delete():
    tok = _token(MGR)
    eid = _first_est(tok)
    # Create
    r = requests.post(f"{API}/establishments/{eid}/comments", headers=_headers(tok),
                      json={"establishment_id": eid, "text": "Note libre importante"}, timeout=10)
    assert r.status_code == 200
    cid = r.json()["id"]
    assert r.json()["author_id"]
    # Read
    lst = requests.get(f"{API}/establishments/{eid}/comments", headers=_headers(tok), timeout=10).json()
    assert any(c["id"] == cid for c in lst)
    # Pin (any user)
    r = requests.patch(f"{API}/comments/{cid}", headers=_headers(tok), json={"pinned": True}, timeout=10)
    assert r.status_code == 200
    assert r.json()["pinned"] is True
    # Pinned first in list
    lst = requests.get(f"{API}/establishments/{eid}/comments", headers=_headers(tok), timeout=10).json()
    assert lst[0]["id"] == cid
    # Delete
    r = requests.delete(f"{API}/comments/{cid}", headers=_headers(tok), timeout=10)
    assert r.status_code == 200


def test_comments_only_author_can_edit_text():
    """L'auteur seul peut modifier le texte. L'autre user peut épingler."""
    mgr = _token(MGR)
    com = _token(COM)
    eid = _first_est(mgr)
    # Manager crée
    r = requests.post(f"{API}/establishments/{eid}/comments", headers=_headers(mgr),
                      json={"establishment_id": eid, "text": "created by manager"}, timeout=10)
    cid = r.json()["id"]
    # Commercial tente d'éditer → 403
    r = requests.patch(f"{API}/comments/{cid}", headers=_headers(com),
                       json={"text": "hacked"}, timeout=10)
    assert r.status_code == 403
    # Commercial peut épingler
    r = requests.patch(f"{API}/comments/{cid}", headers=_headers(com),
                       json={"pinned": True}, timeout=10)
    assert r.status_code == 200
    # cleanup
    requests.delete(f"{API}/comments/{cid}", headers=_headers(mgr), timeout=10)


def test_comments_empty_text_rejected():
    tok = _token(MGR)
    eid = _first_est(tok)
    r = requests.post(f"{API}/establishments/{eid}/comments", headers=_headers(tok),
                      json={"establishment_id": eid, "text": "   "}, timeout=10)
    assert r.status_code == 422


def test_pinned_comment_shows_in_memory():
    tok = _token(MGR)
    eid = _first_est(tok)
    # Crée un commentaire épinglé
    r = requests.post(f"{API}/establishments/{eid}/comments", headers=_headers(tok),
                      json={"establishment_id": eid, "text": "IMPORTANT: préfère la Blanche"}, timeout=10)
    cid = r.json()["id"]
    requests.patch(f"{API}/comments/{cid}", headers=_headers(tok), json={"pinned": True}, timeout=10)
    # Force recompute mémoire
    requests.post(f"{API}/establishments/{eid}/memory/recompute", headers=_headers(tok), timeout=10)
    mem = requests.get(f"{API}/establishments/{eid}/memory", headers=_headers(tok), timeout=10).json()
    pinned_section = next((s for s in mem["sections"] if s["key"] == "pinned_comments"), None)
    assert pinned_section is not None, "commentaire épinglé absent de la mémoire"
    assert any("Blanche" in it["text"] for it in pinned_section["items"])
    # cleanup
    requests.delete(f"{API}/comments/{cid}", headers=_headers(tok), timeout=10)


def test_effective_responses_shape():
    tok = _token(MGR)
    r = requests.get(f"{API}/objections/effective-responses?category=prix",
                     headers=_headers(tok), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["category"] == "prix"
    assert isinstance(body["responses"], list)
    # Chaque item a la bonne forme
    for r_item in body["responses"]:
        assert "response" in r_item and "uses" in r_item and "successes" in r_item and "rate" in r_item
        assert r_item["uses"] > 0
        assert 0 <= r_item["rate"] <= 1


def test_effective_responses_rejects_bad_category():
    tok = _token(MGR)
    r = requests.get(f"{API}/objections/effective-responses?category=fake",
                     headers=_headers(tok), timeout=10)
    assert r.status_code == 422


def test_bootstrap_includes_tour_briefs():
    tok = _token(MGR)
    r = requests.get(f"{API}/sync/bootstrap", headers=_headers(tok), timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert "tour_briefs" in body, "briefs pré-calculés absents du snapshot"
    assert isinstance(body["tour_briefs"], list)


def test_auth_required():
    r = requests.get(f"{API}/establishments/foo/comments", timeout=10)
    assert r.status_code in (401, 403)
    r = requests.get(f"{API}/objections/effective-responses?category=prix", timeout=10)
    assert r.status_code in (401, 403)
