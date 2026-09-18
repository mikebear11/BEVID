"""
Iteration 26 — Stripe SaaS checkout + Read-only paywall (billing_guard).

Covers:
- GET /api/billing/current shape (stripe_configured, is_owner, portal_available, effective_status).
- POST /api/payments/checkout returns Stripe checkout_url + session_id (as owner).
- GET /api/payments/status/{session_id} public, kind='saas', payment_status='pending'.
- POST /api/billing/upgrade → 409 when Stripe configured (non-exempt).
- POST /api/billing/portal → 409 when no stripe_customer_id, 403 for non-owner.
- POST /api/payments/checkout → 403 for non-owner (commercial).
- billing_guard: readonly.test → 402 on POST /api/clients, PUT/DELETE, but 200 on GET,
  XLSX exports, and POST /api/payments/checkout (exempt from paywall).
- manager.demo (active) → POST /api/clients ok, then cleanup.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"

MGR_EMAIL = "manager.demo@bevidcrm.fr"
MGR_PWD = "Manager!2026Demo"
COM_EMAIL = "commercial.demo@bevidcrm.fr"
COM_PWD = "Commercial!2026Demo"
RO_EMAIL = "readonly.test@bevidcrm.fr"
RO_PWD = "ReadOnly!2026Test"


def _login(email, pwd):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd}, timeout=20)
    assert r.status_code == 200, f"login {email} → {r.status_code} {r.text[:200]}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def mgr_headers():
    return {"Authorization": f"Bearer {_login(MGR_EMAIL, MGR_PWD)}"}


@pytest.fixture(scope="module")
def com_headers():
    return {"Authorization": f"Bearer {_login(COM_EMAIL, COM_PWD)}"}


@pytest.fixture(scope="module")
def ro_headers():
    return {"Authorization": f"Bearer {_login(RO_EMAIL, RO_PWD)}"}


# ------ 1. billing/current as owner ------
def test_billing_current_owner(mgr_headers):
    r = requests.get(f"{BASE_URL}/api/billing/current", headers=mgr_headers, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["stripe_configured"] is True, "STRIPE_SECRET_KEY not configured"
    assert d["is_owner"] is True, "manager.demo should be owner of BEVID Démo"
    assert d["billing_exempt"] is False
    assert isinstance(d["portal_available"], bool)
    assert d["effective_status"] in ("active", "trialing", "read_only", "suspended")
    print(f"billing/current owner: plan={d['plan']} status={d['effective_status']} portal={d['portal_available']}")


# ------ 2. checkout session (SaaS) ------
_shared = {}

def test_payments_checkout_owner(mgr_headers):
    r = requests.post(
        f"{BASE_URL}/api/payments/checkout",
        headers=mgr_headers,
        json={"lookup_key": "bevid_pro_monthly", "origin_url": BASE_URL},
        timeout=25,
    )
    assert r.status_code == 200, f"checkout → {r.status_code} {r.text[:400]}"
    d = r.json()
    assert d.get("checkout_url", "").startswith("https://checkout.stripe.com/"), d
    assert d.get("session_id")
    _shared["session_id"] = d["session_id"]


def test_payments_status_public():
    sid = _shared.get("session_id")
    if not sid:
        pytest.skip("no session_id")
    r = requests.get(f"{BASE_URL}/api/payments/status/{sid}", timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("kind") == "saas", d
    assert d.get("payment_status") in ("pending", "unpaid", "paid", "no_payment_required"), d


# ------ 3. billing/upgrade must 409 when Stripe configured ------
def test_billing_upgrade_conflicts_when_stripe(mgr_headers):
    r = requests.post(
        f"{BASE_URL}/api/billing/upgrade",
        headers=mgr_headers,
        json={"plan_id": "entreprise", "billing_mode": "monthly"},
        timeout=15,
    )
    assert r.status_code == 409, f"expected 409 got {r.status_code} {r.text[:200]}"


# ------ 4. billing/portal — 409 if no stripe_customer_id ------
def test_billing_portal_owner_no_customer(mgr_headers):
    r = requests.post(f"{BASE_URL}/api/billing/portal", headers=mgr_headers, json={"origin_url": BASE_URL}, timeout=20)
    # Either 409 (no customer) or 200 (customer exists)
    assert r.status_code in (200, 409), f"portal → {r.status_code} {r.text[:200]}"
    if r.status_code == 200:
        assert r.json().get("portal_url", "").startswith("https://billing.stripe.com/")


# ------ 5. commercial (non-owner) forbidden on checkout & portal ------
def test_checkout_forbidden_for_non_owner(com_headers):
    r = requests.post(
        f"{BASE_URL}/api/payments/checkout",
        headers=com_headers,
        json={"lookup_key": "bevid_pro_monthly", "origin_url": BASE_URL},
        timeout=20,
    )
    assert r.status_code == 403, f"non-owner checkout expected 403 got {r.status_code} {r.text[:200]}"


def test_portal_forbidden_for_non_owner(com_headers):
    r = requests.post(f"{BASE_URL}/api/billing/portal", headers=com_headers, json={"origin_url": BASE_URL}, timeout=15)
    assert r.status_code == 403, f"non-owner portal expected 403 got {r.status_code} {r.text[:200]}"


# ------ 6. Read-only paywall ------
def test_ro_billing_current_status(ro_headers):
    r = requests.get(f"{BASE_URL}/api/billing/current", headers=ro_headers, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("effective_status") == "read_only", r.json()


def test_ro_get_clients_ok(ro_headers):
    r = requests.get(f"{BASE_URL}/api/clients", headers=ro_headers, timeout=15)
    assert r.status_code == 200, r.text


def test_ro_post_client_blocked_402(ro_headers):
    r = requests.post(
        f"{BASE_URL}/api/clients",
        headers=ro_headers,
        json={"name": "TEST_ro_blocked", "type": "restaurant"},
        timeout=15,
    )
    assert r.status_code == 402, f"expected 402 got {r.status_code} {r.text[:200]}"
    d = r.json()
    # Body may be nested under 'detail' (FastAPI HTTPException) or at root
    body = d.get("detail") if isinstance(d.get("detail"), dict) else d
    assert body.get("error") == "billing_blocked", d
    assert body.get("effective_status") == "read_only", d


def test_ro_xlsx_export_ok(ro_headers):
    r = requests.get(f"{BASE_URL}/api/xlsx/export/establishments", headers=ro_headers, timeout=30)
    assert r.status_code == 200, f"xlsx export → {r.status_code} {r.text[:200]}"


def test_ro_checkout_exempt_from_paywall(ro_headers):
    r = requests.post(
        f"{BASE_URL}/api/payments/checkout",
        headers=ro_headers,
        json={"lookup_key": "bevid_pro_monthly", "origin_url": BASE_URL},
        timeout=25,
    )
    # readonly.test must be able to pay: must NOT be 402. Owner check may apply (should be owner of its org).
    assert r.status_code != 402, f"paywall blocked checkout! → {r.status_code} {r.text[:300]}"
    # Accept 200 (checkout ok) or 403 (not owner of its org — needs main agent to check seed)
    assert r.status_code in (200, 403), f"checkout → {r.status_code} {r.text[:200]}"


# ------ 7. manager.demo (active) writes not blocked, then cleanup ------
def test_mgr_client_write_then_delete(mgr_headers):
    r = requests.post(
        f"{BASE_URL}/api/clients",
        headers=mgr_headers,
        json={"name": "TEST_iter26_paywall", "type": "restaurant"},
        timeout=15,
    )
    assert r.status_code in (200, 201), f"create client → {r.status_code} {r.text[:200]}"
    cid = r.json().get("id")
    assert cid
    d = requests.delete(f"{BASE_URL}/api/clients/{cid}", headers=mgr_headers, timeout=15)
    assert d.status_code in (200, 204), f"delete → {d.status_code} {d.text[:200]}"
