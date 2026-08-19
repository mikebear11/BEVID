"""Lot 4 P5 — Déploiement d'équipe (invitations 3 canaux, transfer ownership)."""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE}/api"

MANAGER = {"email": "manager.demo@bevidcrm.fr", "password": "Manager!2026Demo"}
COMMERCIAL = {"email": "commercial.demo@bevidcrm.fr", "password": "Commercial!2026Demo"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s, r.json().get("user", {})


def _register(email, password="Testp@ssw0rd!"):
    r = requests.post(
        f"{API}/auth/register",
        json={
            "email": email, "name": email.split("@")[0], "password": password,
            "password_confirm": password, "accept_terms": True, "accept_privacy": True,
        }, timeout=15,
    )
    return r


@pytest.fixture(scope="module")
def manager_session():
    s, u = _login(MANAGER)
    return s, u


@pytest.fixture(scope="module")
def commercial_session():
    s, u = _login(COMMERCIAL)
    return s, u


# ---------- Invitations : channels ----------

class TestInvitationsChannels:
    def test_email_invitation_manager(self, manager_session):
        s, _ = manager_session
        r = s.post(f"{API}/org/invitations", json={
            "channel": "email", "email": f"test.email.{uuid.uuid4().hex[:6]}@example.com",
            "name": "Alice", "role": "commercial",
        }, timeout=15)
        assert r.status_code == 200, r.text
        inv = r.json()["invitation"]
        assert inv["token"] and inv["activate_url"]
        assert inv["channel"] == "email"

    def test_sms_invitation_manager(self, manager_session):
        s, _ = manager_session
        r = s.post(f"{API}/org/invitations", json={
            "channel": "sms", "phone": "+33612345678", "name": "Bob", "role": "commercial",
        }, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["invitation"]["channel"] == "sms"

    def test_qr_invitation_manager(self, manager_session):
        s, _ = manager_session
        r = s.post(f"{API}/org/invitations", json={
            "channel": "qr", "name": "Charlie", "role": "commercial",
        }, timeout=15)
        assert r.status_code == 200, r.text
        inv = r.json()["invitation"]
        assert inv["channel"] == "qr"
        assert inv["email"] in (None, "")

    def test_commercial_cannot_invite(self, commercial_session):
        s, _ = commercial_session
        r = s.post(f"{API}/org/invitations", json={
            "channel": "email", "email": "denied@example.com", "role": "commercial",
        }, timeout=15)
        assert r.status_code == 403, r.text


# ---------- Public GET invitation meta ----------

class TestInvitationMeta:
    def test_qr_meta_requires_email(self, manager_session):
        s, _ = manager_session
        r = s.post(f"{API}/org/invitations", json={"channel": "qr", "name": "Dan"}, timeout=15)
        token = r.json()["invitation"]["token"]
        rm = requests.get(f"{API}/auth/invitation/{token}", timeout=10)
        assert rm.status_code == 200, rm.text
        data = rm.json()
        assert data["channel"] == "qr"
        assert data["requires_email"] is True
        assert "org_name" in data

    def test_email_meta_no_email_required(self, manager_session):
        s, _ = manager_session
        email = f"test.meta.{uuid.uuid4().hex[:6]}@example.com"
        r = s.post(f"{API}/org/invitations", json={"channel": "email", "email": email, "name": "Eve"}, timeout=15)
        token = r.json()["invitation"]["token"]
        rm = requests.get(f"{API}/auth/invitation/{token}", timeout=10)
        assert rm.status_code == 200
        data = rm.json()
        assert data["requires_email"] is False
        assert data["email"] == email


# ---------- Accept invitation ----------

class TestAcceptInvitation:
    def test_qr_without_email_returns_422(self, manager_session):
        s, _ = manager_session
        r = s.post(f"{API}/org/invitations", json={"channel": "qr", "name": "Frank"}, timeout=15)
        token = r.json()["invitation"]["token"]
        ra = requests.post(f"{API}/auth/accept-invitation",
                           json={"token": token, "password": "Passw0rd!!"}, timeout=15)
        assert ra.status_code == 422, ra.text
        assert "email" in ra.json().get("errors", {})

    def test_qr_with_email_succeeds(self, manager_session):
        s, _ = manager_session
        r = s.post(f"{API}/org/invitations", json={"channel": "qr", "name": "Gina"}, timeout=15)
        token = r.json()["invitation"]["token"]
        email = f"test.qr.accept.{uuid.uuid4().hex[:6]}@example.com"
        ra = requests.post(f"{API}/auth/accept-invitation", json={
            "token": token, "password": "Passw0rd!!", "email": email, "name": "Gina",
        }, timeout=15)
        assert ra.status_code == 200, ra.text
        body = ra.json()
        assert body.get("token") and body.get("user", {}).get("email") == email
        # cookie posé
        cookies_set = ra.headers.get("set-cookie", "")
        assert "bevid_auth" in cookies_set

    def test_email_channel_without_body_email_succeeds(self, manager_session):
        s, _ = manager_session
        email = f"test.email.accept.{uuid.uuid4().hex[:6]}@example.com"
        r = s.post(f"{API}/org/invitations", json={"channel": "email", "email": email, "name": "Hank"}, timeout=15)
        token = r.json()["invitation"]["token"]
        ra = requests.post(f"{API}/auth/accept-invitation",
                           json={"token": token, "password": "Passw0rd!!", "name": "Hank"}, timeout=15)
        assert ra.status_code == 200, ra.text
        assert ra.json()["user"]["email"] == email

    def test_reuse_accepted_token_returns_400(self, manager_session):
        s, _ = manager_session
        email = f"test.reuse.{uuid.uuid4().hex[:6]}@example.com"
        r = s.post(f"{API}/org/invitations", json={"channel": "email", "email": email, "name": "Ivy"}, timeout=15)
        token = r.json()["invitation"]["token"]
        r1 = requests.post(f"{API}/auth/accept-invitation",
                           json={"token": token, "password": "Passw0rd!!"}, timeout=15)
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/auth/accept-invitation",
                           json={"token": token, "password": "Passw0rd!!"}, timeout=15)
        assert r2.status_code == 400
        assert "utilisée" in r2.text.lower() or "utilis" in r2.text.lower()


# ---------- Revoke ----------

class TestRevoke:
    def test_revoked_meta_returns_400(self, manager_session):
        s, _ = manager_session
        r = s.post(f"{API}/org/invitations", json={"channel": "qr", "name": "Jack"}, timeout=15)
        inv = r.json()["invitation"]
        rr = s.post(f"{API}/org/invitations/{inv['id']}/revoke", timeout=10)
        assert rr.status_code == 200
        rm = requests.get(f"{API}/auth/invitation/{inv['token']}", timeout=10)
        assert rm.status_code == 400
        assert "révoqu" in rm.text.lower() or "revoqu" in rm.text.lower()

    def test_double_revoke_idempotent_404(self, manager_session):
        s, _ = manager_session
        r = s.post(f"{API}/org/invitations", json={"channel": "qr", "name": "Kate"}, timeout=15)
        inv_id = r.json()["invitation"]["id"]
        r1 = s.post(f"{API}/org/invitations/{inv_id}/revoke", timeout=10)
        assert r1.status_code == 200
        r2 = s.post(f"{API}/org/invitations/{inv_id}/revoke", timeout=10)
        assert r2.status_code == 404


# ---------- Transfer ownership ----------

class TestTransferOwnership:
    """Nécessite 2 nouveaux comptes ad-hoc pour ne pas polluer l'org demo."""

    @pytest.fixture(scope="class")
    def ownership_setup(self, manager_session):
        # Le manager.demo est owner de BEVID Démo. On invite un nouveau manager dans cette org.
        s_owner, owner_user = manager_session
        org = s_owner.get(f"{API}/org/current", timeout=10).json()
        # Crée invitation manager
        r = s_owner.post(f"{API}/org/invitations", json={
            "channel": "qr", "name": "New Manager", "role": "manager",
        }, timeout=15)
        assert r.status_code == 200
        token = r.json()["invitation"]["token"]
        target_email = f"test.newmgr.{uuid.uuid4().hex[:6]}@example.com"
        ra = requests.post(f"{API}/auth/accept-invitation", json={
            "token": token, "password": "Passw0rd!!Long", "email": target_email, "name": "New Manager",
        }, timeout=15)
        assert ra.status_code == 200, ra.text
        target_token = ra.json()["token"]
        target_user_id = ra.json()["user"]["id"]
        s_target = requests.Session()
        s_target.headers.update({"Authorization": f"Bearer {target_token}"})
        return {
            "s_owner": s_owner, "org": org,
            "s_target": s_target, "target_user_id": target_user_id,
        }

    def test_wrong_org_name_422(self, ownership_setup):
        ctx = ownership_setup
        r = ctx["s_owner"].post(f"{API}/org/transfer-ownership/initiate", json={
            "target_user_id": ctx["target_user_id"],
            "org_name_confirm": "WRONG NAME",
        }, timeout=10)
        assert r.status_code == 422

    def test_initiate_correct_returns_transfer_id(self, ownership_setup):
        ctx = ownership_setup
        r = ctx["s_owner"].post(f"{API}/org/transfer-ownership/initiate", json={
            "target_user_id": ctx["target_user_id"],
            "org_name_confirm": ctx["org"]["name"],
        }, timeout=10)
        assert r.status_code == 200, r.text
        ctx["transfer_id"] = r.json()["transfer_id"]
        # Non-target user cannot confirm
        # We'll simulate a third user attempt by registering an outsider
        outsider_email = f"outsider.{uuid.uuid4().hex[:6]}@example.com"
        _register(outsider_email, "Passw0rd!!Long")
        s_out, _ = _login({"email": outsider_email, "password": "Passw0rd!!Long"})
        rc_wrong = s_out.post(f"{API}/org/transfer-ownership/{ctx['transfer_id']}/confirm", timeout=10)
        assert rc_wrong.status_code == 403, rc_wrong.text

        # Target confirms
        rc = ctx["s_target"].post(f"{API}/org/transfer-ownership/{ctx['transfer_id']}/confirm", timeout=10)
        assert rc.status_code == 200, rc.text
        # Owner check
        cur = ctx["s_owner"].get(f"{API}/org/current", timeout=10).json()
        assert cur["owner_user_id"] == ctx["target_user_id"]

        # RESTORE : transférer à nouveau vers le manager demo initial
        # (le nouveau owner est target ; il transfère de retour à l'ancien owner)
        old_owner_id = _login(MANAGER)[1]["id"]
        rb = ctx["s_target"].post(f"{API}/org/transfer-ownership/initiate", json={
            "target_user_id": old_owner_id,
            "org_name_confirm": ctx["org"]["name"],
        }, timeout=10)
        assert rb.status_code == 200, rb.text
        tid2 = rb.json()["transfer_id"]
        s_owner_fresh, _ = _login(MANAGER)
        rc2 = s_owner_fresh.post(f"{API}/org/transfer-ownership/{tid2}/confirm", timeout=10)
        assert rc2.status_code == 200


# ---------- Multi-tenant isolation ----------

class TestIsolation:
    def test_orgB_cannot_see_orgA_invitation(self, manager_session):
        s_a, _ = manager_session
        # Manager de l'org A crée une invitation
        r = s_a.post(f"{API}/org/invitations", json={"channel": "qr", "name": "Zorg"}, timeout=15)
        inv_id_a = r.json()["invitation"]["id"]

        # Crée un manager d'une autre org : register donne role=commercial. Il faut donc
        # aller par la voie manuelle : on va juste vérifier qu'un COMMERCIAL de l'org A
        # ne peut ni lister ni révoquer (403 attendu). Pour le vrai multi-tenant, on
        # utilise un compte ad-hoc + tenter revoke → 404.
        outsider_email = f"tenant.b.{uuid.uuid4().hex[:6]}@example.com"
        _register(outsider_email, "Passw0rd!!Long")
        # Register crée un manager owner d'une nouvelle org (org B). L'isolation multi-tenant
        # doit garantir : (a) invitation de l'org A absente de sa liste, (b) revoke 404.
        s_b, _ = _login({"email": outsider_email, "password": "Passw0rd!!Long"})
        r_list = s_b.get(f"{API}/org/invitations", timeout=10)
        assert r_list.status_code == 200
        ids_b = [i.get("id") for i in r_list.json()]
        assert inv_id_a not in ids_b, "Fuite multi-tenant : org B voit une invitation de l'org A"
        r_rev = s_b.post(f"{API}/org/invitations/{inv_id_a}/revoke", timeout=10)
        assert r_rev.status_code == 404, r_rev.text
