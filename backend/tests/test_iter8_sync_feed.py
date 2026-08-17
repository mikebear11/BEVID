"""
Iter 8 — Sync feed dashboard + conflict detection + PWA icons
"""
import os
import uuid
import pytest
import requests
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
FRONTEND_URL = BASE_URL  # icons served by frontend host

MANAGER_EMAIL = "guillaume@sulauze.com"
MANAGER_PWD = "Cellier2026!"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def manager_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": MANAGER_EMAIL, "password": MANAGER_PWD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def manager_headers(manager_token):
    return {"Authorization": f"Bearer {manager_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def commercial_token(manager_headers):
    """Create a throwaway commercial user via admin API, then login."""
    email = f"test.com.{uuid.uuid4().hex[:6]}@bevid-test.example.com"
    r = requests.post(f"{BASE_URL}/api/admin/users", headers=manager_headers, json={
        "email": email, "name": "Test Commercial", "role": "commercial"
    })
    assert r.status_code in (200, 201), f"admin/users failed: {r.status_code} {r.text}"
    tmp_pwd = r.json().get("temp_password") or r.json().get("temporary_password") or r.json().get("password")
    assert tmp_pwd, f"no temp password returned: {r.json()}"

    # login with temp password
    r2 = requests.post(f"{BASE_URL}/api/auth/login",
                       json={"email": email, "password": tmp_pwd})
    assert r2.status_code == 200, f"commercial login failed: {r2.text}"
    tok = r2.json()["token"]

    # must_reset → change password to complete activation
    new_pwd = "TestPass2026!"
    r3 = requests.post(f"{BASE_URL}/api/auth/change-password",
                       headers={"Authorization": f"Bearer {tok}"},
                       json={"current_password": tmp_pwd, "new_password": new_pwd})
    # may return 200 or endpoint may differ — ignore if not present, token still valid usually
    if r3.status_code == 200:
        r4 = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": email, "password": new_pwd})
        if r4.status_code == 200:
            tok = r4.json()["token"]
    return tok


@pytest.fixture(scope="module")
def commercial_headers(commercial_token):
    return {"Authorization": f"Bearer {commercial_token}", "Content-Type": "application/json"}


# ---------- Sync feed ----------
class TestSyncFeed:
    def test_sync_feed_manager_access(self, manager_headers):
        r = requests.get(f"{BASE_URL}/api/dashboard/sync-feed?minutes=60",
                         headers=manager_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["window_minutes"] == 60
        assert isinstance(data["visits"], list)
        assert isinstance(data["orders"], list)
        assert isinstance(data["conflicts"], list)

    def test_sync_feed_commercial_forbidden(self, commercial_headers):
        r = requests.get(f"{BASE_URL}/api/dashboard/sync-feed?minutes=60",
                         headers=commercial_headers)
        assert r.status_code == 403, f"expected 403, got {r.status_code}"


# ---------- Order create + conflict detection ----------
class TestOrderConflict:
    @pytest.fixture(scope="class")
    def seed(self, manager_headers):
        # create client
        c = requests.post(f"{BASE_URL}/api/clients", headers=manager_headers,
                          json={"name": f"TEST_client_{uuid.uuid4().hex[:6]}",
                                "type": "caviste", "city": "Paris"})
        assert c.status_code in (200, 201), c.text
        client_id = c.json()["id"]

        # create product with stock=0 to force conflict
        p_zero = requests.post(f"{BASE_URL}/api/products", headers=manager_headers,
                               json={"name": f"TEST_prod_zero_{uuid.uuid4().hex[:6]}",
                                     "category": "vin", "price": 10.0, "stock": 0})
        assert p_zero.status_code in (200, 201), p_zero.text
        prod_zero = p_zero.json()["id"]
        prod_zero_name = p_zero.json()["name"]

        # create product with plenty of stock
        p_ok = requests.post(f"{BASE_URL}/api/products", headers=manager_headers,
                             json={"name": f"TEST_prod_ok_{uuid.uuid4().hex[:6]}",
                                   "category": "vin", "price": 15.0, "stock": 100})
        assert p_ok.status_code in (200, 201), p_ok.text
        prod_ok = p_ok.json()["id"]
        prod_ok_name = p_ok.json()["name"]

        return {"client_id": client_id, "prod_zero": prod_zero, "prod_ok": prod_ok,
                "prod_zero_name": prod_zero_name, "prod_ok_name": prod_ok_name}

    def test_order_with_stock_conflict(self, manager_headers, seed):
        payload = {
            "client_id": seed["client_id"],
            "client_uuid": str(uuid.uuid4()),
            "lines": [{"product_id": seed["prod_zero"], "product_name": seed["prod_zero_name"], "quantity": 5, "unit_price": 10.0}],
        }
        r = requests.post(f"{BASE_URL}/api/orders", headers=manager_headers, json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("has_conflict") is True, f"expected has_conflict=True: {body}"
        reasons = body.get("conflict_reasons") or []
        assert any(c.get("type") == "stock" for c in reasons), reasons

        # verify feed contains the conflict
        f = requests.get(f"{BASE_URL}/api/dashboard/sync-feed?minutes=60",
                         headers=manager_headers)
        assert f.status_code == 200
        feed = f.json()
        assert any(c.get("entity_id") == body["id"] or c.get("reason", "").startswith("Stock")
                   for c in feed["conflicts"]), \
            f"conflict not found in feed. conflicts={feed['conflicts'][:3]}"

    def test_order_without_conflict(self, manager_headers, seed):
        payload = {
            "client_id": seed["client_id"],
            "client_uuid": str(uuid.uuid4()),
            "lines": [{"product_id": seed["prod_ok"], "product_name": seed["prod_ok_name"], "quantity": 1, "unit_price": 15.0}],
        }
        r = requests.post(f"{BASE_URL}/api/orders", headers=manager_headers, json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert not body.get("has_conflict"), body
        assert not body.get("conflict_reasons"), body


# ---------- Dismiss conflict ----------
class TestConflictDismiss:
    def test_dismiss_manager(self, manager_headers):
        # get a conflict (create one if none)
        f = requests.get(f"{BASE_URL}/api/dashboard/sync-feed?minutes=60",
                         headers=manager_headers).json()
        if not f["conflicts"]:
            pytest.skip("no conflicts to dismiss")
        cid = f["conflicts"][0]["id"]
        r = requests.post(f"{BASE_URL}/api/conflicts/{cid}/dismiss",
                          headers=manager_headers)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_dismiss_commercial_forbidden(self, commercial_headers, manager_headers):
        f = requests.get(f"{BASE_URL}/api/dashboard/sync-feed?minutes=60",
                         headers=manager_headers).json()
        if not f["conflicts"]:
            pytest.skip("no conflicts")
        cid = f["conflicts"][0]["id"]
        r = requests.post(f"{BASE_URL}/api/conflicts/{cid}/dismiss",
                          headers=commercial_headers)
        assert r.status_code == 403


# ---------- PWA icons ----------
class TestPWAIcons:
    @pytest.mark.parametrize("path", ["/icon-192.png", "/icon-512.png", "/icon-maskable-512.png"])
    def test_icon_served(self, path):
        r = requests.get(f"{FRONTEND_URL}{path}")
        assert r.status_code == 200, f"{path}: {r.status_code}"
        assert r.headers.get("content-type", "").startswith("image/png"), \
            f"{path} content-type={r.headers.get('content-type')}"
        assert len(r.content) > 500, f"{path} too small: {len(r.content)}"

    def test_manifest_references_icons(self):
        r = requests.get(f"{FRONTEND_URL}/manifest.json")
        assert r.status_code == 200
        m = r.json()
        srcs = {i["src"] for i in m["icons"]}
        assert "/icon-192.png" in srcs
        assert "/icon-512.png" in srcs
        assert "/icon-maskable-512.png" in srcs
