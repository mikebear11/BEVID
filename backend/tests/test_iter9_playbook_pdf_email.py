"""
Iter 9 — Conflict Playbook (Rembourser + prévenir) + Send Order PDF via email
"""
import os
import uuid
import pytest
import requests
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

MANAGER_EMAIL = "demo@cellier.fr"
MANAGER_PWD = "demo1234"


@pytest.fixture(scope="module")
def manager_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": MANAGER_EMAIL, "password": MANAGER_PWD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def commercial_headers(manager_headers):
    email = f"test.com.{uuid.uuid4().hex[:6]}@bevid-test.example.com"
    r = requests.post(f"{BASE_URL}/api/admin/users", headers=manager_headers, json={
        "email": email, "name": "Test Commercial", "role": "commercial"
    })
    assert r.status_code in (200, 201), r.text
    tmp = r.json().get("temp_password") or r.json().get("temporary_password")
    r2 = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": tmp})
    assert r2.status_code == 200, r2.text
    return {"Authorization": f"Bearer {r2.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def seed_conflict(manager_headers):
    """Create a client with email, a product with stock=0, then place an offline order (stock conflict)."""
    c = requests.post(f"{BASE_URL}/api/clients", headers=manager_headers, json={
        "name": f"TESTP_client_{uuid.uuid4().hex[:6]}",
        "type": "caviste", "city": "Paris",
        "email": "playbook-test@bevid-test.example.com",
        "phone": "+33612345678", "contact_name": "Jean Test",
    })
    assert c.status_code in (200, 201), c.text
    client_id = c.json()["id"]

    p = requests.post(f"{BASE_URL}/api/products", headers=manager_headers, json={
        "name": f"TESTP_prod_{uuid.uuid4().hex[:6]}", "category": "biere",
        "price": 10.0, "stock": 0
    })
    assert p.status_code in (200, 201), p.text
    prod_id = p.json()["id"]
    prod_name = p.json()["name"]

    order_uuid = str(uuid.uuid4())
    o = requests.post(f"{BASE_URL}/api/orders", headers=manager_headers, json={
        "client_id": client_id, "client_uuid": order_uuid,
        "lines": [{"product_id": prod_id, "product_name": prod_name,
                   "quantity": 5, "unit_price": 10.0}],
    })
    assert o.status_code == 200, o.text
    order = o.json()
    assert order.get("has_conflict") is True

    # find conflict id
    f = requests.get(f"{BASE_URL}/api/dashboard/sync-feed?minutes=60", headers=manager_headers).json()
    conflict = next((x for x in f["conflicts"] if x.get("entity_id") == order["id"]), None)
    assert conflict, f"conflict not found in feed; feed={f['conflicts'][:3]}"

    return {"client_id": client_id, "order_id": order["id"], "conflict_id": conflict["id"],
            "prod_id": prod_id}


class TestPlaybookPreview:
    def test_preview_ok(self, manager_headers, seed_conflict):
        cid = seed_conflict["conflict_id"]
        r = requests.get(f"{BASE_URL}/api/conflicts/{cid}/playbook-preview", headers=manager_headers)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["conflict"]["id"] == cid
        assert p["order"]["id"] == seed_conflict["order_id"]
        assert p["client"]["email"] == "playbook-test@bevid-test.example.com"
        assert p["can_refund"] is False  # no stripe intent
        assert "default_message" in p and len(p["default_message"]) > 20

    def test_preview_commercial_forbidden(self, commercial_headers, seed_conflict):
        r = requests.get(f"{BASE_URL}/api/conflicts/{seed_conflict['conflict_id']}/playbook-preview",
                         headers=commercial_headers)
        assert r.status_code == 403


class TestPlaybookExec:
    def test_playbook_restock_only(self, manager_headers, seed_conflict):
        # First check stock before
        p_before = requests.get(f"{BASE_URL}/api/products", headers=manager_headers).json()
        stock_before = next((p["stock"] for p in p_before if p["id"] == seed_conflict["prod_id"]), None)

        r = requests.post(f"{BASE_URL}/api/conflicts/{seed_conflict['conflict_id']}/playbook",
                         headers=manager_headers,
                         json={"refund": False, "restock": True, "channel": "none", "message": ""})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["result"]["restock"]["ok"] is True

        # Stock should have gone back up by 5
        p_after = requests.get(f"{BASE_URL}/api/products", headers=manager_headers).json()
        stock_after = next((p["stock"] for p in p_after if p["id"] == seed_conflict["prod_id"]), None)
        assert stock_after == (stock_before or 0) + 5, f"stock {stock_before} -> {stock_after}"

        # Conflict should be marked resolved
        f = requests.get(f"{BASE_URL}/api/dashboard/sync-feed?minutes=60", headers=manager_headers).json()
        conf = next((x for x in f["conflicts"] if x["id"] == seed_conflict["conflict_id"]), None)
        if conf:
            assert conf.get("resolved_at"), f"conflict not resolved: {conf}"

    def test_playbook_double_exec_blocked(self, manager_headers, seed_conflict):
        r = requests.post(f"{BASE_URL}/api/conflicts/{seed_conflict['conflict_id']}/playbook",
                         headers=manager_headers,
                         json={"refund": False, "restock": True, "channel": "none", "message": ""})
        assert r.status_code == 400, r.text

    def test_playbook_commercial_forbidden(self, commercial_headers, manager_headers):
        # Need a fresh conflict
        c = requests.post(f"{BASE_URL}/api/clients", headers=manager_headers, json={
            "name": f"TESTP2_{uuid.uuid4().hex[:6]}", "type": "caviste"})
        p = requests.post(f"{BASE_URL}/api/products", headers=manager_headers, json={
            "name": f"TESTP2_prod_{uuid.uuid4().hex[:6]}", "category": "biere", "price": 5.0, "stock": 0})
        o = requests.post(f"{BASE_URL}/api/orders", headers=manager_headers, json={
            "client_id": c.json()["id"], "client_uuid": str(uuid.uuid4()),
            "lines": [{"product_id": p.json()["id"], "product_name": p.json()["name"],
                       "quantity": 1, "unit_price": 5.0}]})
        f = requests.get(f"{BASE_URL}/api/dashboard/sync-feed?minutes=60", headers=manager_headers).json()
        conf = next(x for x in f["conflicts"] if x.get("entity_id") == o.json()["id"])

        r = requests.post(f"{BASE_URL}/api/conflicts/{conf['id']}/playbook",
                         headers=commercial_headers,
                         json={"refund": False, "restock": True, "channel": "none", "message": ""})
        assert r.status_code == 403


class TestSendOrderPdfEmail:
    @pytest.fixture(scope="class")
    def order_with_email(self, manager_headers):
        c = requests.post(f"{BASE_URL}/api/clients", headers=manager_headers, json={
            "name": f"TESTPDF_{uuid.uuid4().hex[:6]}", "type": "caviste",
            "email": "delivered@resend.dev", "contact_name": "Alice"})
        p = requests.post(f"{BASE_URL}/api/products", headers=manager_headers, json={
            "name": f"TESTPDF_prod_{uuid.uuid4().hex[:6]}", "category": "biere",
            "price": 12.0, "stock": 50})
        o = requests.post(f"{BASE_URL}/api/orders", headers=manager_headers, json={
            "client_id": c.json()["id"], "client_uuid": str(uuid.uuid4()),
            "lines": [{"product_id": p.json()["id"], "product_name": p.json()["name"],
                       "quantity": 2, "unit_price": 12.0}]})
        assert o.status_code == 200, o.text
        return {"client_id": c.json()["id"], "order_id": o.json()["id"]}

    def test_send_pdf_email_uses_client_email(self, manager_headers, order_with_email):
        r = requests.post(f"{BASE_URL}/api/orders/{order_with_email['order_id']}/send-pdf-email",
                         headers=manager_headers, json={})
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["ok"] is True
        assert b["to"] == "delivered@resend.dev"
        assert "expires" in b

    def test_send_pdf_email_missing_email(self, manager_headers):
        c = requests.post(f"{BASE_URL}/api/clients", headers=manager_headers, json={
            "name": f"TESTPDF_NOEMAIL_{uuid.uuid4().hex[:6]}", "type": "caviste"})
        p = requests.post(f"{BASE_URL}/api/products", headers=manager_headers, json={
            "name": f"TESTPDF_prod2_{uuid.uuid4().hex[:6]}", "category": "biere",
            "price": 8.0, "stock": 20})
        o = requests.post(f"{BASE_URL}/api/orders", headers=manager_headers, json={
            "client_id": c.json()["id"], "client_uuid": str(uuid.uuid4()),
            "lines": [{"product_id": p.json()["id"], "product_name": p.json()["name"],
                       "quantity": 1, "unit_price": 8.0}]})
        r = requests.post(f"{BASE_URL}/api/orders/{o.json()['id']}/send-pdf-email",
                         headers=manager_headers, json={})
        assert r.status_code == 400
        assert "Email" in r.json()["detail"]

    def test_send_pdf_email_override_to(self, manager_headers, order_with_email):
        r = requests.post(f"{BASE_URL}/api/orders/{order_with_email['order_id']}/send-pdf-email",
                         headers=manager_headers,
                         json={"to": "delivered@resend.dev"})
        assert r.status_code == 200, r.text
        assert r.json()["to"] == "delivered@resend.dev"

    def test_public_pdf_token_valid(self, manager_headers, order_with_email):
        # Trigger email to generate a fresh token
        r = requests.post(f"{BASE_URL}/api/orders/{order_with_email['order_id']}/send-pdf-email",
                         headers=manager_headers, json={})
        assert r.status_code == 200
        # Retrieve order to get the token
        orders = requests.get(f"{BASE_URL}/api/orders", headers=manager_headers).json()
        o = next(x for x in orders if x["id"] == order_with_email["order_id"])
        token = o.get("receipt_token")
        assert token, f"no token stored on order: {o}"

        r = requests.get(f"{BASE_URL}/api/public/orders/{token}/pdf")
        assert r.status_code == 200
        assert r.headers.get("content-type") == "application/pdf"
        assert r.content.startswith(b"%PDF")

    def test_public_pdf_invalid_token(self):
        r = requests.get(f"{BASE_URL}/api/public/orders/bogus-token-xxx/pdf")
        assert r.status_code == 404
