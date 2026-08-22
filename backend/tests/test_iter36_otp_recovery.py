"""Lot 8 · Récupération de mot de passe par code OTP.

Vérifie le contrat de /auth/forgot-password-code et /auth/reset-password-code.
Le rate limit étant à 3 demandes / 15 min / email, chaque test utilise un
email unique pour ne pas se marcher dessus.
"""
import os
import time
import uuid
import pytest
import httpx

API = os.environ.get("BEVID_API", "http://localhost:8001/api")

INITIAL_PWD = "InitialPwd!2026"
NEW_PWD = "BrandNewPwd!2026"


def _make_user(suffix: str) -> str:
    """Crée un compte de test avec un email unique et retourne l'email."""
    email = f"otp-{suffix}-{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}@bevidcrm.fr"
    with httpx.Client(base_url=API, timeout=30.0) as c:
        r = c.post("/auth/register", json={
            "email": email, "password": INITIAL_PWD, "password_confirm": INITIAL_PWD,
            "name": "OTP Test", "accept_terms": True,
        })
        assert r.status_code in (200, 201), r.text
    return email


def _request_code(email: str) -> dict:
    with httpx.Client(base_url=API, timeout=30.0) as c:
        r = c.post("/auth/forgot-password-code", json={"email": email})
        assert r.status_code == 200, r.text
        return r.json()


def test_unknown_email_returns_200_no_code():
    r = _request_code(f"does-not-exist-{uuid.uuid4().hex}@bevidcrm.fr")
    assert r["ok"] is True
    assert "code" not in r


def test_known_email_returns_code_in_fallback():
    email = _make_user("fallback")
    r = _request_code(email)
    assert r["ok"] is True
    assert "code" in r, f"Code manquant : {r}"
    assert r["code"].isdigit() and len(r["code"]) == 6
    assert r.get("email_delivered") is False


def test_reset_with_valid_code_then_login():
    email = _make_user("reset")
    r = _request_code(email)
    code = r["code"]
    with httpx.Client(base_url=API, timeout=30.0) as c:
        r2 = c.post("/auth/reset-password-code", json={
            "email": email, "code": code, "new_password": NEW_PWD,
        })
        assert r2.status_code == 200, r2.text
        r3 = c.post("/auth/login", json={"email": email, "password": NEW_PWD})
        assert r3.status_code == 200, r3.text
        # Réutilisation du même code → doit échouer
        r4 = c.post("/auth/reset-password-code", json={
            "email": email, "code": code, "new_password": "AnotherPwd!2026",
        })
        assert r4.status_code == 400


def test_wrong_code_returns_400():
    email = _make_user("wrong")
    _request_code(email)
    with httpx.Client(base_url=API, timeout=30.0) as c:
        r = c.post("/auth/reset-password-code", json={
            "email": email, "code": "000000", "new_password": NEW_PWD,
        })
        assert r.status_code == 400


def test_short_password_rejected():
    email = _make_user("short")
    r = _request_code(email)
    code = r["code"]
    with httpx.Client(base_url=API, timeout=30.0) as c:
        r2 = c.post("/auth/reset-password-code", json={
            "email": email, "code": code, "new_password": "abc",
        })
        assert r2.status_code == 422


def test_previous_code_invalidated_when_new_one_requested():
    email = _make_user("supersede")
    r1 = _request_code(email)
    code1 = r1["code"]
    r2 = _request_code(email)
    code2 = r2["code"]
    assert code1 != code2
    with httpx.Client(base_url=API, timeout=30.0) as c:
        # Ancien code doit échouer
        r = c.post("/auth/reset-password-code", json={
            "email": email, "code": code1, "new_password": NEW_PWD,
        })
        assert r.status_code == 400
        # Nouveau code doit fonctionner
        r = c.post("/auth/reset-password-code", json={
            "email": email, "code": code2, "new_password": NEW_PWD,
        })
        assert r.status_code == 200


def test_rate_limit_after_3_requests():
    email = _make_user("ratelim")
    _request_code(email)
    _request_code(email)
    _request_code(email)
    # 4e appel doit être bloqué
    with httpx.Client(base_url=API, timeout=30.0) as c:
        r = c.post("/auth/forgot-password-code", json={"email": email})
        assert r.status_code == 429, r.text
