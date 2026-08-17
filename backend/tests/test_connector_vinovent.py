import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

EMAIL = "guillaume@sulauze.com"
PASSWORD = "Cellier2026!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"] if "token" in r.json() else r.json().get("access_token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_create_vinovent_connector(headers):
    payload = {
        "provider": "vinovent",
        "name": "Vinovent",
        "config": {"api_key": "TEST_key_123", "region": "FR"},
        "status": "pending",
    }
    r = requests.post(f"{BASE_URL}/api/connectors", json=payload, headers=headers)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert data["provider"] == "vinovent"
    global CREATED_ID
    CREATED_ID = data.get("id")


def test_reject_vinovendpro(headers):
    payload = {
        "provider": "vinovendpro",
        "name": "Vinovend Pro",
        "config": {"api_key": "x"},
        "status": "pending",
    }
    r = requests.post(f"{BASE_URL}/api/connectors", json=payload, headers=headers)
    assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"


def test_list_connectors_contains_vinovent(headers):
    r = requests.get(f"{BASE_URL}/api/connectors", headers=headers)
    assert r.status_code == 200
    providers = [c.get("provider") for c in r.json()]
    assert "vinovent" in providers


def test_cleanup(headers):
    r = requests.get(f"{BASE_URL}/api/connectors", headers=headers)
    for c in r.json():
        if c.get("provider") == "vinovent" and c.get("config", {}).get("api_key") == "TEST_key_123":
            requests.delete(f"{BASE_URL}/api/connectors/{c['id']}", headers=headers)
