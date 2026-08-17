"""Backend tests for Cellier -> BEVID rename and vinovendpro -> vinovent rename."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://drink-sales-hub-8.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

MANAGER_EMAIL = "guillaume@sulauze.com"
MANAGER_PASSWORD = "Cellier2026!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": MANAGER_EMAIL, "password": MANAGER_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data or "token" in data, data
    return data.get("access_token") or data.get("token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_password_unchanged():
    """Password 'Cellier2026!' must still work."""
    r = requests.post(f"{API}/auth/login", json={"email": MANAGER_EMAIL, "password": MANAGER_PASSWORD})
    assert r.status_code == 200, r.text


def test_create_connector_vinovent(headers):
    """POST /api/connectors with provider='vinovent' must be accepted."""
    payload = {"provider": "vinovent", "name": "Vinovent", "config": {"api_key": "TEST_key", "region": "FR"}}
    r = requests.post(f"{API}/connectors", json=payload, headers=headers)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
    data = r.json()
    assert data.get("provider") == "vinovent"


def test_list_connectors_includes_vinovent(headers):
    r = requests.get(f"{API}/connectors", headers=headers)
    assert r.status_code == 200
    providers = [c.get("provider") for c in r.json()]
    assert "vinovent" in providers


def test_create_connector_vinovendpro_rejected(headers):
    """POST /api/connectors with old provider name must be rejected."""
    payload = {"provider": "vinovendpro", "name": "Vinovend Pro", "config": {"api_key": "TEST_key"}}
    r = requests.post(f"{API}/connectors", json=payload, headers=headers)
    assert r.status_code in (400, 422, 500), f"Expected rejection, got {r.status_code}: {r.text}"


def test_forgot_password_uses_bevid_branding():
    """/api/auth/forgot-password should return success (email sent). Verifying branding requires log inspection."""
    r = requests.post(f"{API}/auth/forgot-password", json={"email": MANAGER_EMAIL})
    # endpoint typically returns 200 regardless (to avoid email enumeration)
    assert r.status_code in (200, 202), r.text
