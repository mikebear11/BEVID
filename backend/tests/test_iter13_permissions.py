"""Iter 13 — RBAC + per-user permission overrides."""
import os, uuid, pytest, requests
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def M():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": "demo@cellier.fr", "password": "demo1234"})
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def commercial_user_and_headers(M):
    email = f"perm.com.{uuid.uuid4().hex[:6]}@bevid-test.example.com"
    r = requests.post(f"{BASE}/api/admin/users", headers=M, json={
        "email": email, "name": "Perm Test Commercial", "role": "commercial"
    })
    assert r.status_code in (200, 201), r.text
    body = r.json()
    tmp = body.get("temp_password") or body.get("temporary_password")
    uid = (body.get("user") or {}).get("id") or body.get("id")
    r2 = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": tmp})
    assert r2.status_code == 200, r2.text
    return uid, {"Authorization": f"Bearer {r2.json()['token']}", "Content-Type": "application/json"}


def test_features_registry(M):
    r = requests.get(f"{BASE}/api/permissions/features", headers=M)
    assert r.status_code == 200
    keys = {f["key"] for f in r.json()}
    assert "page:rapprochement" in keys and "product:view_cost" in keys and "client:edit_banking" in keys


def test_me_permissions_manager_has_all(M):
    r = requests.get(f"{BASE}/api/me/permissions", headers=M)
    assert r.status_code == 200
    p = r.json()["permissions"]
    # manager doit avoir toutes les features par défaut (tous defaults manager=True)
    assert all(p.values()), f"manager missing: {[k for k,v in p.items() if not v]}"


def test_commercial_defaults_locked(commercial_user_and_headers):
    _, H = commercial_user_and_headers
    r = requests.get(f"{BASE}/api/me/permissions", headers=H)
    assert r.status_code == 200
    p = r.json()["permissions"]
    # commercial DOIT être refusé sur ces zones sensibles
    assert p.get("page:rapprochement") is False
    assert p.get("page:sources-donnees") is False
    assert p.get("client:edit_banking") is False
    assert p.get("product:view_cost") is False
    # commercial DOIT avoir accès à ça
    assert p.get("page:clients") is True
    assert p.get("page:prospection") is True
    assert p.get("releve:create") is True


def test_manager_can_grant_feature(M, commercial_user_and_headers):
    uid, H = commercial_user_and_headers
    # override : autoriser rapprochement pour ce commercial
    r = requests.post(f"{BASE}/api/admin/users/{uid}/permissions", headers=M,
                      json={"overrides": {"page:rapprochement": True}})
    assert r.status_code == 200
    # le commercial voit maintenant la feature
    r2 = requests.get(f"{BASE}/api/me/permissions", headers=H)
    assert r2.json()["permissions"]["page:rapprochement"] is True


def test_manager_can_revoke_feature(M, commercial_user_and_headers):
    uid, H = commercial_user_and_headers
    # retirer accès aux relevés
    r = requests.post(f"{BASE}/api/admin/users/{uid}/permissions", headers=M,
                      json={"overrides": {"releve:create": False}})
    assert r.status_code == 200
    r2 = requests.get(f"{BASE}/api/me/permissions", headers=H)
    assert r2.json()["permissions"]["releve:create"] is False


def test_reset_override_returns_to_default(M, commercial_user_and_headers):
    uid, H = commercial_user_and_headers
    # d'abord révoquer
    requests.post(f"{BASE}/api/admin/users/{uid}/permissions", headers=M,
                  json={"overrides": {"page:prospection": False}})
    # puis reset (null)
    r = requests.post(f"{BASE}/api/admin/users/{uid}/permissions", headers=M,
                      json={"overrides": {"page:prospection": None}})
    assert r.status_code == 200
    r2 = requests.get(f"{BASE}/api/me/permissions", headers=H)
    # default commercial = True pour cette page
    assert r2.json()["permissions"]["page:prospection"] is True


def test_commercial_cannot_edit_permissions(commercial_user_and_headers):
    uid, H = commercial_user_and_headers
    r = requests.post(f"{BASE}/api/admin/users/{uid}/permissions", headers=H,
                      json={"overrides": {"page:rapprochement": True}})
    assert r.status_code == 403


def test_manager_cannot_edit_own_permissions(M):
    r_me = requests.get(f"{BASE}/api/me/permissions", headers=M)
    # need own uid — fetch users list
    users = requests.get(f"{BASE}/api/admin/users", headers=M).json()
    own = next(u for u in users if u["email"] == "demo@cellier.fr")
    r = requests.post(f"{BASE}/api/admin/users/{own['id']}/permissions", headers=M,
                      json={"overrides": {"page:privacy": False}})
    assert r.status_code == 400


def test_unknown_feature_ignored(M, commercial_user_and_headers):
    uid, _ = commercial_user_and_headers
    r = requests.post(f"{BASE}/api/admin/users/{uid}/permissions", headers=M,
                      json={"overrides": {"page:this-does-not-exist": True}})
    assert r.status_code == 200
    assert "page:this-does-not-exist" not in r.json()["effective"]
