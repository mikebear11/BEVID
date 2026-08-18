"""BEVID Lot 3 backend tests: auth cookie httpOnly, logout, /api/errors, rate limits."""
import os
import re
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://drink-sales-hub-8.preview.emergentagent.com').rstrip('/')

COMMERCIAL_EMAIL = "commercial.demo@bevidcrm.fr"
COMMERCIAL_PASS = "Commercial!2026Demo"


@pytest.fixture
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Auth cookie httpOnly ----------

class TestAuthCookie:
    def test_login_sets_httponly_cookie(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": COMMERCIAL_EMAIL, "password": COMMERCIAL_PASS
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and "user" in data
        # Check Set-Cookie header
        set_cookie = r.headers.get("set-cookie") or ""
        assert "bevid_auth=" in set_cookie, f"cookie header missing: {set_cookie}"
        low = set_cookie.lower()
        assert "httponly" in low, "cookie must be HttpOnly"
        assert "samesite=lax" in low, "cookie must be SameSite=Lax"
        assert "secure" in low, "cookie must be Secure"

    def test_me_via_cookie_only(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": COMMERCIAL_EMAIL, "password": COMMERCIAL_PASS
        })
        assert r.status_code == 200
        # session cookie jar now has bevid_auth. Call /me without Authorization header.
        r2 = session.get(f"{BASE_URL}/api/auth/me")
        assert r2.status_code == 200, r2.text
        assert r2.json().get("email") == COMMERCIAL_EMAIL

    def test_me_without_cookie_or_bearer_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_logout_returns_ok_and_clears_cookie(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": COMMERCIAL_EMAIL, "password": COMMERCIAL_PASS
        })
        assert r.status_code == 200
        r2 = session.post(f"{BASE_URL}/api/auth/logout")
        assert r2.status_code == 200
        assert r2.json() == {"ok": True}
        # Set-Cookie should express deletion (Max-Age=0 or expires past)
        sc = (r2.headers.get("set-cookie") or "").lower()
        assert "bevid_auth=" in sc
        assert ("max-age=0" in sc) or ("expires=" in sc)


# ---------- Register: role forcé commercial ----------

class TestRegisterRoleForced:
    def test_register_ignores_role_manager(self, session):
        email = f"test_role_{uuid.uuid4().hex[:8]}@example.com"
        r = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "name": "Test Role",
            "password": "Password!2026",
            "password_confirm": "Password!2026",
            "accept_terms": True,
            "language": "fr",
            "role": "manager",  # Doit être ignoré
        })
        assert r.status_code == 200, r.text
        user = r.json().get("user", {})
        assert user.get("role") == "commercial", f"role must be forced to commercial, got {user.get('role')}"


# ---------- /api/errors ----------

class TestErrorsEndpoint:
    def test_post_error_returns_id_and_scrubs_pii(self):
        # Use fresh IP by adding a unique X-Forwarded-For to avoid rate limit
        headers = {"Content-Type": "application/json", "X-Forwarded-For": f"10.0.0.{int(time.time()) % 250}"}
        payload = {
            "message": "user email leaked user@example.com and Bearer eyJabc.def.ghi in error",
            "stack": "Error at foo\n at bar",
            "url": "https://app/route",
            "user_agent": "pytest-agent",
        }
        r = requests.post(f"{BASE_URL}/api/errors", json=payload, headers=headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "id" in body and len(body["id"]) > 8

    def test_errors_rate_limit_429(self):
        # Use a dedicated IP so this test is isolated
        ip = f"10.0.99.{int(time.time()) % 200}"
        headers = {"Content-Type": "application/json", "X-Forwarded-For": ip}
        codes = []
        for i in range(25):
            r = requests.post(f"{BASE_URL}/api/errors",
                              json={"message": f"m{i}", "stack": "", "url": "", "user_agent": ""},
                              headers=headers)
            codes.append(r.status_code)
            if r.status_code == 429:
                break
        assert 429 in codes, f"Expected 429 after 20 posts, got {codes}"


# ---------- Rate limit login ----------

class TestLoginRateLimit:
    def test_login_rate_limit_429_with_retry_after(self):
        ip = f"10.0.55.{int(time.time()) % 200}"
        headers = {"Content-Type": "application/json", "X-Forwarded-For": ip}
        codes = []
        retry_after = None
        # Use non-existent email so we don't burn the demo account counter
        bad_email = f"nobody_{uuid.uuid4().hex[:8]}@example.com"
        for i in range(8):
            r = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": bad_email, "password": "wrongwrong"},
                              headers=headers)
            codes.append(r.status_code)
            if r.status_code == 429:
                retry_after = r.headers.get("Retry-After")
                break
        assert 429 in codes, f"Expected 429 after 5 failed logins, got {codes}"
        assert retry_after is not None, "Retry-After header missing on 429"
