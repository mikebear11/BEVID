"""
Iter 7 backend tests — idempotence client_uuid on orders/visits, inline signature on orders.
"""
import os, uuid, pytest, requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://drink-sales-hub-8.preview.emergentagent.com"
API = f"{BASE_URL}/api"

MANAGER = {"email": "guillaume@sulauze.com", "password": "Cellier2026!"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json=MANAGER, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def client_id(H):
    # find or create a client
    r = requests.get(f"{API}/clients", headers=H, timeout=15)
    assert r.status_code == 200
    lst = r.json()
    if lst:
        return lst[0]["id"]
    r = requests.post(f"{API}/clients", headers=H, timeout=15,
                      json={"name": "TEST_client_iter7", "type": "restaurant"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


@pytest.fixture(scope="module")
def product(H):
    r = requests.get(f"{API}/products", headers=H, timeout=15)
    assert r.status_code == 200
    lst = r.json()
    if lst:
        return lst[0]
    r = requests.post(f"{API}/products", headers=H, timeout=15,
                     json={"name": "TEST_prod", "category": "vin", "unit_price": 10.0, "stock": 100})
    assert r.status_code in (200, 201)
    return r.json()


# ---------- VISITS idempotence ----------
def test_visit_idempotence(H, client_id):
    cu = f"TEST_visit_{uuid.uuid4()}"
    payload = {"client_id": client_id, "client_uuid": cu, "mood": "bon",
               "interest": "chaud", "next_action": "relance", "summary": "TEST iter7 idemp"}
    r1 = requests.post(f"{API}/visits", headers=H, json=payload, timeout=15)
    assert r1.status_code == 200, r1.text
    id1 = r1.json()["id"]
    r2 = requests.post(f"{API}/visits", headers=H, json=payload, timeout=15)
    assert r2.status_code == 200, r2.text
    id2 = r2.json()["id"]
    assert id1 == id2, "Same client_uuid must return same visit id"

    # Verify only one exists in GET
    r3 = requests.get(f"{API}/visits", headers=H, params={"client_id": client_id}, timeout=15)
    assert r3.status_code == 200
    matches = [v for v in r3.json() if v.get("client_uuid") == cu]
    assert len(matches) == 1, f"expected 1 visit for client_uuid, got {len(matches)}"


# ---------- ORDERS idempotence + stock ----------
def test_order_idempotence_and_stock(H, client_id, product):
    pid = product["id"]
    # snapshot current stock
    r = requests.get(f"{API}/products", headers=H, timeout=15)
    p_before = next(p for p in r.json() if p["id"] == pid)
    stock_before = p_before.get("stock", 0)

    cu = f"TEST_order_{uuid.uuid4()}"
    payload = {
        "client_id": client_id,
        "client_uuid": cu,
        "lines": [{"product_id": pid, "product_name": p_before["name"],
                   "quantity": 2, "unit_price": p_before.get("unit_price", 10.0)}],
    }
    r1 = requests.post(f"{API}/orders", headers=H, json=payload, timeout=15)
    assert r1.status_code == 200, r1.text
    id1 = r1.json()["id"]
    r2 = requests.post(f"{API}/orders", headers=H, json=payload, timeout=15)
    assert r2.status_code == 200, r2.text
    id2 = r2.json()["id"]
    assert id1 == id2

    # Stock decremented only once (by 2)
    r = requests.get(f"{API}/products", headers=H, timeout=15)
    p_after = next(p for p in r.json() if p["id"] == pid)
    assert p_after["stock"] == stock_before - 2, \
        f"stock={p_after['stock']}, expected {stock_before-2} (before={stock_before}, no double decrement)"


# ---------- ORDERS inline signature ----------
def test_order_inline_signature(H, client_id, product):
    pid = product["id"]
    cu = f"TEST_ordersig_{uuid.uuid4()}"
    sig = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    payload = {
        "client_id": client_id,
        "client_uuid": cu,
        "lines": [{"product_id": pid, "product_name": product["name"], "quantity": 1,
                   "unit_price": product.get("unit_price", 10.0)}],
        "signature_data_url": sig,
        "signature_gps": {"lat": 43.6, "lng": 1.44},
        "signature_signed_at": "2026-01-15T10:00:00Z",
    }
    r = requests.post(f"{API}/orders", headers=H, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    oid = r.json()["id"]
    # verify via GET
    lst = requests.get(f"{API}/orders", headers=H, timeout=15).json()
    o = next((x for x in lst if x["id"] == oid), None)
    assert o is not None, "order not found in GET /orders"
    assert o.get("signature", "").startswith("data:image/png"), f"signature missing: {o.get('signature')!r:.80}"
    assert o.get("signature_gps") == {"lat": 43.6, "lng": 1.44}
    assert o.get("signature_signed_at") == "2026-01-15T10:00:00Z"


# ---------- ORDERS without client_uuid (backward compat) ----------
def test_order_no_client_uuid(H, client_id, product):
    payload = {
        "client_id": client_id,
        "lines": [{"product_id": product["id"], "product_name": product["name"],
                   "quantity": 1, "unit_price": product.get("unit_price", 10.0)}],
    }
    r = requests.post(f"{API}/orders", headers=H, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("id")


# ---------- PWA manifest & icons ----------
def test_manifest_icons():
    r = requests.get(f"{BASE_URL}/manifest.json", timeout=15)
    assert r.status_code == 200
    m = r.json()
    srcs = [(i["src"], i.get("purpose", "any")) for i in m.get("icons", [])]
    assert ("/icon-192.png", "any") in srcs
    assert ("/icon-512.png", "any") in srcs
    assert any(s == "/icon-maskable-512.png" and "maskable" in p for s, p in srcs)


def test_icon_files_served():
    for f in ("icon-192.png", "icon-512.png", "icon-maskable-512.png"):
        r = requests.get(f"{BASE_URL}/{f}", timeout=15)
        assert r.status_code == 200, f"{f} → {r.status_code}"
        assert r.headers.get("content-type", "").startswith("image/"), \
            f"{f} content-type={r.headers.get('content-type')}"
