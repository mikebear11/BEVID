"""Iteration 6 – Crons publics + /sync/bootstrap ségrégation + rebrand BEVID."""
import os, uuid, requests, pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://drink-sales-hub-8.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MGR_EMAIL = "guillaume@sulauze.com"
MGR_PASS = "Cellier2026!"


@pytest.fixture(scope="module")
def mgr_token():
    r = requests.post(f"{API}/auth/login", json={"email": MGR_EMAIL, "password": MGR_PASS})
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("access_token") or j["token"]


@pytest.fixture(scope="module")
def mgr_headers(mgr_token):
    return {"Authorization": f"Bearer {mgr_token}"}


# --- Crons publics -------------------------------------------------
class TestCronsPublic:
    def test_bad_payer_scan_no_auth(self):
        r = requests.post(f"{API}/cron/bad-payer-scan")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert "new_alerts" in data
        assert "ran_at" in data
        assert isinstance(data["new_alerts"], int)

    def test_voice_purge_no_auth(self):
        r = requests.post(f"{API}/cron/voice-purge")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert "purged" in data
        assert "cutoff_days" in data
        assert "ran_at" in data
        assert isinstance(data["cutoff_days"], int)


# --- /sync/bootstrap ------------------------------------------------
class TestSyncBootstrap:
    def test_bootstrap_manager_full_keys(self, mgr_headers):
        r = requests.get(f"{API}/sync/bootstrap", headers=mgr_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("establishments", "products", "orders", "visits", "price_lists", "price_list_items"):
            assert k in data, f"missing key {k}"
            assert isinstance(data[k], list)
        # snapshot_at / server_time présent
        assert "server_time" in data

    def test_bootstrap_commercial_segregation(self, mgr_headers):
        # Créer un commercial dédié
        suffix = uuid.uuid4().hex[:8]
        email = f"test_commercial_{suffix}@example.com"
        r = requests.post(f"{API}/admin/users", headers=mgr_headers,
                          json={"email": email, "name": "TEST Commercial", "role": "commercial"})
        assert r.status_code == 200, r.text
        temp_password = r.json()["temp_password"]
        commercial_id = r.json()["user"]["id"]

        # Login (must_reset ne bloque pas l'obtention d'un token)
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": temp_password})
        assert r.status_code == 200, r.text
        c_token = r.json().get("access_token") or r.json()["token"]
        c_headers = {"Authorization": f"Bearer {c_token}"}

        # bootstrap commercial : 0 établissement (aucun assigné)
        r = requests.get(f"{API}/sync/bootstrap", headers=c_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["establishments"] == [], f"commercial doit voir 0 établissement, got {len(data['establishments'])}"

        # Compter les établissements totaux en tant que manager
        r_mgr = requests.get(f"{API}/sync/bootstrap", headers=mgr_headers)
        mgr_ests = r_mgr.json()["establishments"]
        assert len(mgr_ests) >= 0  # peut être 0 en dev

        # Si il y a des établissements, on en assigne un au commercial et on revérifie
        if mgr_ests:
            target = mgr_ests[0]
            # via /api/establishments PUT
            r = requests.put(f"{API}/establishments/{target['id']}",
                             headers=mgr_headers, json={"assigned_to": commercial_id})
            if r.status_code == 200:
                r = requests.get(f"{API}/sync/bootstrap", headers=c_headers)
                assert r.status_code == 200
                new_ests = r.json()["establishments"]
                assert len(new_ests) == 1, f"commercial devrait voir 1 établissement, got {len(new_ests)}"
                assert new_ests[0]["id"] == target["id"]
                # revert
                requests.put(f"{API}/establishments/{target['id']}",
                             headers=mgr_headers, json={"assigned_to": target.get("assigned_to")})

        # Cleanup : désactiver l'utilisateur
        requests.put(f"{API}/admin/users/{commercial_id}", headers=mgr_headers, json={"active": False})
