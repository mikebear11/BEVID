"""
Backend regression tests - iteration 3
Covers: JWT 90j, multi-language, admin users, forgot/change password,
RGPD, org settings, margins lock, payment tracking (DSO, bad payers),
recompute status, audit logs, voice purge.
"""
import os
import time
import uuid
import base64
import json as _json
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://drink-sales-hub-8.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

MANAGER_EMAIL = "guillaume@sulauze.com"
MANAGER_PASS = "Cellier2026!"

# Shared session-level state
STATE = {}


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def manager_token(s):
    r = s.post(f"{API}/auth/login", json={"email": MANAGER_EMAIL, "password": MANAGER_PASS})
    assert r.status_code == 200, f"manager login failed: {r.status_code} {r.text}"
    data = r.json()
    STATE["manager_token"] = data["token"]
    STATE["manager_user"] = data["user"]
    return data["token"]


@pytest.fixture(scope="session")
def h_manager(manager_token):
    return {"Authorization": f"Bearer {manager_token}"}


# =========== 1. AUTH / JWT / LANGUAGE ============
class TestAuth:
    def test_register_with_language(self, s):
        email = f"TEST_{uuid.uuid4().hex[:8]}@test.com"
        r = s.post(f"{API}/auth/register", json={
            "email": email, "password": "testpass123", "name": "Test ES",
            "role": "commercial", "language": "es"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user"]["language"] == "es"
        assert d["user"]["email"] == email
        assert isinstance(d["token"], str) and len(d["token"]) > 20
        STATE["reg_email"] = email
        STATE["reg_token"] = d["token"]
        STATE["reg_user"] = d["user"]

    def test_login_returns_jwt_90days(self, s):
        r = s.post(f"{API}/auth/login", json={"email": STATE["reg_email"], "password": "testpass123"})
        assert r.status_code == 200, r.text
        d = r.json()
        token = d["token"]
        assert d["user"]["language"] == "es"
        # decode JWT payload to check exp ~90 days
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (-len(payload_b64) % 4)
        payload = _json.loads(base64.urlsafe_b64decode(payload_b64))
        now = time.time()
        delta_days = (payload["exp"] - now) / 86400
        assert 85 < delta_days < 95, f"JWT expiry not ~90d, got {delta_days}"

    def test_update_language(self, s):
        h = {"Authorization": f"Bearer {STATE['reg_token']}"}
        r = s.put(f"{API}/auth/language", json={"language": "de"}, headers=h)
        assert r.status_code == 200
        assert r.json()["language"] == "de"
        # verify via /me
        me = s.get(f"{API}/auth/me", headers=h).json()
        assert me["language"] == "de"

    def test_update_language_invalid(self, s):
        h = {"Authorization": f"Bearer {STATE['reg_token']}"}
        r = s.put(f"{API}/auth/language", json={"language": "zz"}, headers=h)
        assert r.status_code == 422


# =========== 2. ADMIN USER MANAGEMENT ============
class TestAdminUsers:
    def test_manager_list_users(self, s, h_manager):
        r = s.get(f"{API}/admin/users", headers=h_manager)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_commercial_forbidden(self, s):
        h = {"Authorization": f"Bearer {STATE['reg_token']}"}
        r = s.get(f"{API}/admin/users", headers=h)
        assert r.status_code == 403

    def test_create_commercial(self, s, h_manager):
        email = f"TEST_{uuid.uuid4().hex[:8]}@test.com"
        r = s.post(f"{API}/admin/users", json={"email": email, "name": "Sales Rep", "role": "commercial"}, headers=h_manager)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "temp_password" in d and len(d["temp_password"]) >= 8
        assert d["user"]["email"].lower() == email.lower()
        assert d["user"]["role"] == "commercial"
        email = d["user"]["email"]
        STATE["created_uid"] = d["user"]["id"]
        STATE["created_email"] = email
        STATE["created_tmp_pwd"] = d["temp_password"]

    def test_update_user(self, s, h_manager):
        r = s.put(f"{API}/admin/users/{STATE['created_uid']}",
                  json={"name": "Sales Rep Updated", "active": True}, headers=h_manager)
        assert r.status_code == 200
        assert r.json()["name"] == "Sales Rep Updated"

    def test_admin_reset_password(self, s, h_manager):
        r = s.post(f"{API}/admin/users/{STATE['created_uid']}/reset-password", headers=h_manager)
        assert r.status_code == 200
        d = r.json()
        assert "temp_password" in d
        STATE["created_tmp_pwd"] = d["temp_password"]
        # login with new temp password
        lr = s.post(f"{API}/auth/login", json={"email": STATE["created_email"], "password": d["temp_password"]})
        assert lr.status_code == 200


# =========== 3. FORGOT / CHANGE PASSWORD ============
class TestForgotChangePassword:
    def test_forgot_password_creates_request(self, s, h_manager):
        r = s.post(f"{API}/auth/forgot-password", json={"email": STATE["created_email"]})
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # visible for manager
        lr = s.get(f"{API}/admin/reset-requests", headers=h_manager)
        assert lr.status_code == 200
        found = [x for x in lr.json() if x.get("email") == STATE["created_email"] and x.get("status") == "pending"]
        assert found, f"No pending reset request found for {STATE['created_email']}"
        STATE["reset_req_id"] = found[0]["id"]

    def test_approve_reset_request(self, s, h_manager):
        r = s.post(f"{API}/admin/reset-requests/{STATE['reset_req_id']}/approve", headers=h_manager)
        assert r.status_code == 200
        d = r.json()
        assert "temp_password" in d
        STATE["approved_tmp_pwd"] = d["temp_password"]
        # can login with the temp password
        lr = s.post(f"{API}/auth/login", json={"email": STATE["created_email"], "password": d["temp_password"]})
        assert lr.status_code == 200
        STATE["created_user_token"] = lr.json()["token"]

    def test_change_password_wrong_old(self, s):
        h = {"Authorization": f"Bearer {STATE['created_user_token']}"}
        r = s.post(f"{API}/auth/change-password",
                   json={"old_password": "WRONGpass!!", "new_password": "NewPass123!"}, headers=h)
        assert r.status_code == 401

    def test_change_password_success(self, s):
        h = {"Authorization": f"Bearer {STATE['created_user_token']}"}
        r = s.post(f"{API}/auth/change-password",
                   json={"old_password": STATE["approved_tmp_pwd"], "new_password": "NewPass123!"}, headers=h)
        assert r.status_code == 200
        # login with new password
        lr = s.post(f"{API}/auth/login", json={"email": STATE["created_email"], "password": "NewPass123!"})
        assert lr.status_code == 200


# =========== 4. MARGINS LOCK ============
class TestMarginsLock:
    def test_invalidate_first(self, s, h_manager):
        # Reset lock state to ensure clean tests
        s.post(f"{API}/admin/costs/invalidate", headers=h_manager)

    def test_lock_status_locked(self, s, h_manager):
        r = s.get(f"{API}/margins/lock-status", headers=h_manager)
        assert r.status_code == 200
        d = r.json()
        assert d["unlocked"] is False
        STATE["products_total"] = d.get("products_total", 0)
        STATE["costs_saisis"] = d.get("costs_saisis", 0)

    def test_margins_top_clients_423_when_locked(self, s, h_manager):
        r = s.get(f"{API}/margins/top-clients", headers=h_manager)
        assert r.status_code == 423, f"expected 423, got {r.status_code}"

    def test_validate_costs_needs_at_least_one(self, s, h_manager):
        # If there is no cost saved, validate must fail 400
        if STATE["costs_saisis"] == 0:
            # ensure zero costs (fresh setup) - just call validate
            r = s.post(f"{API}/admin/costs/validate", headers=h_manager)
            assert r.status_code == 400
            # now create a cost on some product if any
            prods = s.get(f"{API}/products", headers=h_manager)
            if prods.status_code == 200 and prods.json():
                pid = prods.json()[0]["id"]
                cr = s.post(f"{API}/costs/{pid}", json={"cost_matieres": 1.0}, headers=h_manager)
                assert cr.status_code == 200
                STATE["costs_saisis"] = 1
            else:
                pytest.skip("No products available to attach cost")

    def test_validate_costs_unlocks(self, s, h_manager):
        r = s.post(f"{API}/admin/costs/validate", headers=h_manager)
        assert r.status_code == 200
        d = r.json()
        assert d.get("products_validated", 0) >= 1
        # top-clients now accessible
        r2 = s.get(f"{API}/margins/top-clients", headers=h_manager)
        assert r2.status_code == 200, f"expected 200 after validate, got {r2.status_code} {r2.text}"
        assert "top10_marge" in r2.json()


# =========== 5. ORG SETTINGS ============
class TestOrgSettings:
    def test_manager_sees_full_settings(self, s, h_manager):
        r = s.get(f"{API}/org/settings", headers=h_manager)
        assert r.status_code == 200
        d = r.json()
        assert "credit_thresholds" in d
        assert "costs_validated_at" in d

    def test_commercial_sees_light_settings(self, s):
        h = {"Authorization": f"Bearer {STATE['reg_token']}"}
        r = s.get(f"{API}/org/settings", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert "credit_thresholds" not in d
        assert "costs_validated_at" not in d
        assert "geolocation_enabled" in d

    def test_update_settings(self, s, h_manager):
        r = s.put(f"{API}/org/settings", json={
            "credit_thresholds": {"overdue_orange_days": 5, "overdue_red_days": 25,
                                  "credit_orange_pct": 60, "credit_red_pct": 100},
            "geolocation_enabled": True,
            "voice_transcript_retention_days": 60,
        }, headers=h_manager)
        assert r.status_code == 200
        d = r.json()
        assert d["credit_thresholds"]["overdue_orange_days"] == 5
        assert d["voice_transcript_retention_days"] == 60

    def test_update_settings_forbidden_for_commercial(self, s):
        h = {"Authorization": f"Bearer {STATE['reg_token']}"}
        r = s.put(f"{API}/org/settings", json={"geolocation_enabled": False}, headers=h)
        assert r.status_code == 403


# =========== 6. PAYMENT TRACKING ============
class TestPayments:
    def test_dso(self, s, h_manager):
        r = s.get(f"{API}/payments/dso?months=12", headers=h_manager)
        assert r.status_code == 200
        d = r.json()
        for k in ("chart", "current_dso", "prev_dso", "trend"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["chart"], list)

    def test_dso_forbidden_commercial(self, s):
        h = {"Authorization": f"Bearer {STATE['reg_token']}"}
        r = s.get(f"{API}/payments/dso", headers=h)
        assert r.status_code == 403

    def test_bad_payers(self, s, h_manager):
        r = s.get(f"{API}/payments/bad-payers?limit=5", headers=h_manager)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list)
        assert len(d) <= 5
        if d:
            assert "score" in d[0]

    def test_payment_client(self, s, h_manager):
        # pick a client
        cl = s.get(f"{API}/clients", headers=h_manager).json()
        if not cl:
            pytest.skip("No clients in seed")
        cid = cl[0]["id"]
        r = s.get(f"{API}/payments/client/{cid}", headers=h_manager)
        assert r.status_code == 200
        d = r.json()
        for k in ("payment_terms_days", "avg_paid_delay_vs_due", "overdue_amount",
                  "overdue_oldest_days", "unpaid_amount"):
            assert k in d

    def test_recompute_status(self, s, h_manager):
        r = s.post(f"{API}/establishments/recompute-status", headers=h_manager)
        assert r.status_code == 200
        assert "updated" in r.json()

    def test_recompute_forbidden(self, s):
        h = {"Authorization": f"Bearer {STATE['reg_token']}"}
        r = s.post(f"{API}/establishments/recompute-status", headers=h)
        assert r.status_code == 403


# =========== 7. RGPD ============
class TestRgpd:
    def test_rgpd_export(self, s, h_manager):
        cl = s.get(f"{API}/clients", headers=h_manager).json()
        if not cl:
            pytest.skip("No clients")
        cid = cl[0]["id"]
        STATE["export_cid"] = cid
        r = s.get(f"{API}/rgpd/clients/{cid}/export", headers=h_manager)
        assert r.status_code == 200
        d = r.json()
        for k in ("client", "establishment", "orders", "visits", "activities"):
            assert k in d

    def test_rgpd_export_forbidden_commercial(self, s):
        cid = STATE.get("export_cid")
        if not cid:
            pytest.skip("no cid")
        h = {"Authorization": f"Bearer {STATE['reg_token']}"}
        r = s.get(f"{API}/rgpd/clients/{cid}/export", headers=h)
        assert r.status_code == 403

    def test_rgpd_delete(self, s, h_manager):
        # Create a throwaway client just to delete via RGPD
        r = s.post(f"{API}/clients", json={
            "name": "TEST_RGPD_DEL", "phone": "0600000000", "email": "TEST_rgpd_del@test.com",
        }, headers=h_manager)
        assert r.status_code == 200
        cid = r.json()["id"]
        d = s.delete(f"{API}/rgpd/clients/{cid}", headers=h_manager)
        assert d.status_code == 200
        assert d.json().get("deleted_client_id") == cid
        # verify gone
        g = s.get(f"{API}/clients", headers=h_manager).json()
        assert all(c["id"] != cid for c in g)


# =========== 8. AUDIT LOGS ============
class TestAuditLogs:
    def test_audit_logs_manager(self, s, h_manager):
        r = s.get(f"{API}/admin/audit-logs", headers=h_manager)
        assert r.status_code == 200
        logs = r.json()
        assert isinstance(logs, list)
        actions = {l.get("action") for l in logs}
        # expected actions produced by earlier tests
        for expected in ("rgpd_export", "rgpd_delete", "password_reset_approve"):
            assert expected in actions, f"missing action {expected} in audit logs (found={actions})"

    def test_audit_logs_forbidden_commercial(self, s):
        h = {"Authorization": f"Bearer {STATE['reg_token']}"}
        r = s.get(f"{API}/admin/audit-logs", headers=h)
        assert r.status_code == 403


# =========== 9. VOICE PURGE ============
class TestVoicePurge:
    def test_voice_purge(self, s, h_manager):
        r = s.post(f"{API}/admin/voice/purge", headers=h_manager)
        assert r.status_code == 200
        d = r.json()
        assert "purged" in d
        assert "cutoff_days" in d


# =========== 10. CRUD non-regression ============
class TestCrudNonRegression:
    def test_clients_list(self, s, h_manager):
        r = s.get(f"{API}/clients", headers=h_manager)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_orders_list(self, s, h_manager):
        r = s.get(f"{API}/orders", headers=h_manager)
        assert r.status_code == 200

    def test_products_list(self, s, h_manager):
        r = s.get(f"{API}/products", headers=h_manager)
        assert r.status_code == 200
