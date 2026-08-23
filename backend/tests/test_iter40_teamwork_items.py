"""Tests Lot Travail équipe items 4/5/7/8/12 (23/02/2026).

Coverage :
- Item 5 : notif preferences, silence window, push subscribe
- Item 7 : approvals create/list/review + reminder cron
- Item 8 : portfolios list, reassign, unassigned
- Item 12 : weekly review generate + patch
- Silence window compute (unit)
"""
import os
import pytest
import httpx
import asyncio


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")
API = f"{BASE_URL}/api"

MANAGER_EMAIL = "manager.demo@bevidcrm.fr"
MANAGER_PW = "Manager!2026Demo"
COMMERCIAL_EMAIL = "commercial.demo@bevidcrm.fr"
COMMERCIAL_PW = "Commercial!2026Demo"


@pytest.fixture(scope="module")
def mgr_token():
    with httpx.Client(base_url=API, timeout=15.0) as c:
        r = c.post("/auth/login", json={"email": MANAGER_EMAIL, "password": MANAGER_PW})
        assert r.status_code == 200
        return r.json()["token"]


@pytest.fixture(scope="module")
def com_token():
    with httpx.Client(base_url=API, timeout=15.0) as c:
        r = c.post("/auth/login", json={"email": COMMERCIAL_EMAIL, "password": COMMERCIAL_PW})
        assert r.status_code == 200
        return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def test_notif_prefs_defaults(mgr_token):
    with httpx.Client(base_url=API, timeout=15.0) as c:
        r = c.get("/notifications/preferences", headers=_h(mgr_token))
        assert r.status_code == 200
        p = r.json()
        for k in ("mentions_immediate", "digest_owned_objects", "inbox_only_rest",
                  "silence_start", "silence_end", "silence_sundays", "push_enabled"):
            assert k in p, f"clé manquante {k}"


def test_notif_prefs_update_silence(mgr_token):
    with httpx.Client(base_url=API, timeout=15.0) as c:
        r = c.put("/notifications/preferences",
                   headers=_h(mgr_token),
                   json={"silence_start": "22:00", "silence_end": "07:00"})
        assert r.status_code == 200
        assert r.json()["silence_start"] == "22:00"
        # Format invalide → 422
        r2 = c.put("/notifications/preferences",
                    headers=_h(mgr_token),
                    json={"silence_start": "25:99"})
        assert r2.status_code == 422


def test_push_subscribe_flow(mgr_token):
    with httpx.Client(base_url=API, timeout=15.0) as c:
        r = c.post("/notifications/push-subscribe",
                    headers=_h(mgr_token),
                    json={"endpoint": "https://example.com/push/abc",
                          "keys": {"p256dh": "x", "auth": "y"}})
        assert r.status_code == 200
        # endpoint non-https → 422
        r2 = c.post("/notifications/push-subscribe",
                     headers=_h(mgr_token),
                     json={"endpoint": "http://insecure", "keys": {}})
        assert r2.status_code == 422
        # unsub
        r3 = c.delete("/notifications/push-subscribe", headers=_h(mgr_token))
        assert r3.status_code == 200


def test_approvals_create_list_review(com_token, mgr_token):
    with httpx.Client(base_url=API, timeout=15.0) as c:
        # Commercial crée une demande
        r = c.post("/approvals",
                    headers=_h(com_token),
                    json={"kind": "remise",
                          "reason": "Fidélité client — 3 ans sans impayé",
                          "context": {"pct": 12}})
        assert r.status_code == 200, r.text
        aid = r.json()["id"]
        # Manager voit la demande pending
        r2 = c.get("/approvals?status=pending", headers=_h(mgr_token))
        assert r2.status_code == 200
        assert any(a["id"] == aid for a in r2.json())
        # Manager approve
        r3 = c.patch(f"/approvals/{aid}",
                      headers=_h(mgr_token),
                      json={"status": "approved", "response": "OK exceptionnel"})
        assert r3.status_code == 200
        assert r3.json()["status"] == "approved"


def test_approvals_forbidden_for_non_manager(com_token):
    with httpx.Client(base_url=API, timeout=15.0) as c:
        # Créer une demande
        r = c.post("/approvals",
                    headers=_h(com_token),
                    json={"kind": "avoir", "reason": "Casse à la livraison", "context": {}})
        aid = r.json()["id"]
        # Un autre commercial (soi-même ici) essaye d'approuver → 403 attendu
        r2 = c.patch(f"/approvals/{aid}",
                      headers=_h(com_token),
                      json={"status": "approved"})
        assert r2.status_code == 403


def test_portfolios_manager_only(com_token):
    with httpx.Client(base_url=API, timeout=15.0) as c:
        r = c.get("/portfolios", headers=_h(com_token))
        assert r.status_code == 403


def test_portfolios_list_and_reassign(mgr_token):
    with httpx.Client(base_url=API, timeout=15.0) as c:
        r = c.get("/portfolios", headers=_h(mgr_token))
        assert r.status_code == 200
        data = r.json()
        assert "portfolios" in data
        assert "unassigned_count" in data
        # Prend un client existant
        est = c.get("/establishments", headers=_h(mgr_token)).json()
        if not est:
            pytest.skip("Aucun établissement pour tester la réattribution")
        # Cible : le commercial
        # Récupère l'id commercial via portfolios
        com = next((p["user"] for p in data["portfolios"] if p["user"]["role"] == "commercial"), None)
        if not com:
            pytest.skip("Aucun commercial en org")
        target_id = com["id"]
        payload = {"client_ids": [est[0]["id"]], "to_user_id": target_id}
        r2 = c.post("/portfolios/reassign", headers=_h(mgr_token), json=payload)
        assert r2.status_code == 200, r2.text
        assert r2.json()["reassigned"] >= 0


def test_portfolios_unassigned_endpoint(mgr_token):
    with httpx.Client(base_url=API, timeout=15.0) as c:
        r = c.get("/portfolios/unassigned", headers=_h(mgr_token))
        assert r.status_code == 200
        assert "clients" in r.json()


def test_weekly_review_generate_and_patch(mgr_token):
    with httpx.Client(base_url=API, timeout=15.0) as c:
        r = c.get("/weekly-review/me", headers=_h(mgr_token))
        assert r.status_code == 200
        doc = r.json()
        assert "id" in doc
        assert "auto" in doc
        assert "kpis" in doc["auto"]
        # Patch libre fields
        r2 = c.patch(f"/weekly-review/{doc['id']}",
                      headers=_h(mgr_token),
                      json={"notes": "Semaine test", "focus_next": "Priorité X"})
        assert r2.status_code == 200
        assert r2.json()["notes"] == "Semaine test"


def test_cron_endpoints_no_auth():
    """Les cron endpoints doivent répondre 200 sans auth (invoqués par la plateforme)."""
    with httpx.Client(base_url=API, timeout=15.0) as c:
        for path in ["/cron/notifications-flush", "/cron/digest-morning",
                      "/cron/digest-afternoon", "/cron/approval-reminders",
                      "/cron/weekly-review-monday"]:
            r = c.post(path)
            assert r.status_code == 200, f"{path} → {r.status_code}"


def test_silence_window_helper():
    """Test unitaire du helper _is_in_silence (via import direct)."""
    import sys
    sys.path.insert(0, "/app/backend")
    from server import _is_in_silence
    from datetime import datetime as dt

    # 21h ← dans la fenêtre 20h→8h (traverse minuit)
    prefs = {"silence_start": "20:00", "silence_end": "08:00", "silence_sundays": False}
    monday_9pm = dt(2026, 2, 23, 21, 0)  # lundi 21h
    assert _is_in_silence(prefs, monday_9pm) is True
    # 12h → hors fenêtre
    monday_noon = dt(2026, 2, 23, 12, 0)
    assert _is_in_silence(prefs, monday_noon) is False
    # Dimanche + silence_sundays=True → toujours dans silence
    prefs2 = {"silence_start": "20:00", "silence_end": "08:00", "silence_sundays": True}
    sunday_noon = dt(2026, 2, 22, 12, 0)  # dimanche
    assert _is_in_silence(prefs2, sunday_noon) is True
    sunday_noon2 = dt(2026, 2, 22, 12, 0)
    prefs3 = {"silence_start": "20:00", "silence_end": "08:00", "silence_sundays": False}
    assert _is_in_silence(prefs3, sunday_noon2) is False
