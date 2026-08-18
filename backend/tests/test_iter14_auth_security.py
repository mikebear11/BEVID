"""
Iteration 14 — Auth security & rate limits (LOT 1)
Tests P0/P1 requirements:
- Register: role forced to 'commercial' (payload role ignored)
- Register: validation errors {accept_terms, password, password_confirm}
- Login: rate limit 5/15min → 6th = 429 with Retry-After
- Forgot-password: rate limit 3/window → 4th = 429
- Login invalid email → 422 with friendly FR message (no Pydantic technical detail)
- /voice/transcribe: 200 with token
- Demo accounts: manager.demo & commercial.demo exist with correct roles
"""
import os
import random
import string
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    envp = "/app/frontend/.env"
    if os.path.exists(envp):
        for line in open(envp):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"


def _rand(n=6):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _errors_dict(resp_json):
    """Accepte {errors: {...}} OR {detail: {errors: {...}}} OR {detail: '...str...'}"""
    if isinstance(resp_json, dict):
        if "errors" in resp_json and isinstance(resp_json["errors"], dict):
            return resp_json["errors"]
        d = resp_json.get("detail")
        if isinstance(d, dict) and "errors" in d:
            return d["errors"]
    return {}


# ---------------- DEMO ACCOUNTS (runs first to avoid IP rate-limit pollution) ----------------
class Test1DemoAccounts:
    def test_manager_demo_login(self, session):
        r = session.post(f"{API}/auth/login", json={
            "email": "manager.demo@bevidcrm.fr",
            "password": "Manager!2026Demo",
        })
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "manager"

    def test_commercial_demo_login(self, session):
        r = session.post(f"{API}/auth/login", json={
            "email": "commercial.demo@bevidcrm.fr",
            "password": "Commercial!2026Demo",
        })
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "commercial"


# ---------------- VOICE TRANSCRIBE (runs early, needs a valid login) ----------------
class Test2VoiceTranscribe:
    def test_voice_transcribe_with_token(self, session):
        # Fallback to demo@cellier.fr if manager.demo not seeded
        login = session.post(f"{API}/auth/login", json={
            "email": "manager.demo@bevidcrm.fr",
            "password": "Manager!2026Demo",
        })
        if login.status_code != 200:
            login = session.post(f"{API}/auth/login", json={
                "email": "demo@cellier.fr",
                "password": "demo1234",
            })
        if login.status_code != 200:
            pytest.skip(f"No demo login available ({login.status_code}) — voice test skipped")
        token = login.json()["token"]
        files = {"audio": ("test.webm", b"\x00\x01\x02\x03fake-audio", "audio/webm")}
        r = requests.post(
            f"{API}/voice/transcribe",
            headers={"Authorization": f"Bearer {token}"},
            files=files,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        data = r.json()
        assert data.get("ok") is True
        assert "id" in data
        assert "transcript" in data


# ---------------- REGISTER ----------------
class Test3Register:
    def test_register_role_forced_commercial(self, session):
        email = f"TEST_reg_{_rand()}@bevidcrm.fr"
        r = session.post(f"{API}/auth/register", json={
            "email": email,
            "password": "Passw0rd!!",
            "password_confirm": "Passw0rd!!",
            "name": "Tentative Manager",
            "accept_terms": True,
            "role": "manager",  # doit être IGNORÉ
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 20
        assert data["user"]["role"] == "commercial"
        assert data["user"]["email"] == email

    def test_register_missing_accept_terms(self, session):
        r = session.post(f"{API}/auth/register", json={
            "email": f"TEST_noaccept_{_rand()}@bevidcrm.fr",
            "password": "Passw0rd!!",
            "password_confirm": "Passw0rd!!",
            "name": "N",
            "accept_terms": False,
        })
        assert r.status_code == 422, r.text
        errs = _errors_dict(r.json())
        assert "accept_terms" in errs, f"Response: {r.json()}"

    def test_register_password_too_short(self, session):
        r = session.post(f"{API}/auth/register", json={
            "email": f"TEST_short_{_rand()}@bevidcrm.fr",
            "password": "short1!",
            "password_confirm": "short1!",
            "name": "N",
            "accept_terms": True,
        })
        assert r.status_code == 422, r.text
        errs = _errors_dict(r.json())
        assert "password" in errs, f"Response: {r.json()}"

    def test_register_password_confirm_mismatch(self, session):
        r = session.post(f"{API}/auth/register", json={
            "email": f"TEST_mm_{_rand()}@bevidcrm.fr",
            "password": "Passw0rd!!",
            "password_confirm": "Different!!",
            "name": "N",
            "accept_terms": True,
        })
        assert r.status_code == 422, r.text
        errs = _errors_dict(r.json())
        assert "password_confirm" in errs, f"Response: {r.json()}"

    def test_register_valid_returns_token_and_commercial(self, session):
        email = f"TEST_ok_{_rand()}@bevidcrm.fr"
        r = session.post(f"{API}/auth/register", json={
            "email": email,
            "password": "Passw0rd!!",
            "password_confirm": "Passw0rd!!",
            "name": "Valid User",
            "accept_terms": True,
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["role"] == "commercial"
        assert "token" in data


# ---------------- LOGIN ----------------
class Test4Login:
    def test_login_invalid_email_returns_friendly_422(self, session):
        r = session.post(f"{API}/auth/login", json={
            "email": "pas-un-email",
            "password": "whatever",
        })
        assert r.status_code == 422, r.text
        body = r.json()
        errs = _errors_dict(body)
        assert "email" in errs, f"Response: {body}"
        # Pas de détail technique Pydantic en anglais
        assert errs["email"] == "Adresse email invalide."
        # Vérifie qu'aucun contenu anglais Pydantic ne fuit
        raw = str(body).lower()
        for banned in ("value is not a valid email", "value_error", "ctx", "input_value"):
            assert banned not in raw, f"Détail Pydantic technique exposé: {banned} — {body}"

    def test_login_rate_limit_5_then_429(self, session):
        # Utilise un email unique random pour ne pas polluer le compteur global
        email = f"rl-test-{_rand()}@bevidcrm.fr"
        codes = []
        retry_after_header = None
        detail_msg = None
        for i in range(6):
            r = session.post(f"{API}/auth/login", json={"email": email, "password": "wrongpass"})
            codes.append(r.status_code)
            if r.status_code == 429:
                retry_after_header = r.headers.get("Retry-After")
                try:
                    detail_msg = r.json().get("detail", "")
                except Exception:
                    detail_msg = r.text
        assert codes[:5] == [401, 401, 401, 401, 401], f"Codes: {codes}"
        assert codes[5] == 429, f"Codes: {codes}"
        assert retry_after_header is not None, "Retry-After header manquant"
        assert int(retry_after_header) > 0
        assert "Trop de tentatives" in (detail_msg or ""), f"Detail: {detail_msg}"


# ---------------- FORGOT PASSWORD ----------------
class Test5ForgotPassword:
    def test_forgot_password_rate_limit_3_then_429(self, session):
        email = f"rl-forgot-{_rand()}@bevidcrm.fr"
        codes = []
        for i in range(4):
            r = session.post(f"{API}/auth/forgot-password", json={"email": email})
            codes.append(r.status_code)
        # Les 3 premiers doivent renvoyer 200, le 4e 429
        assert codes[:3] == [200, 200, 200], f"Codes: {codes}"
        assert codes[3] == 429, f"Codes: {codes}"

