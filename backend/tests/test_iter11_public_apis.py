"""Iter 11 — Phase 1 intégrations publiques (Bouclier, Radar, Prospection, Rappels)."""
import os
import pytest
import requests
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MANAGER_EMAIL = "demo@cellier.fr"
MANAGER_PWD = "demo1234"


@pytest.fixture(scope="module")
def headers():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": MANAGER_EMAIL, "password": MANAGER_PWD})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


class TestSocleSources:
    def test_sources_donnees(self, headers):
        r = requests.get(f"{BASE_URL}/api/sources-donnees", headers=headers)
        assert r.status_code == 200
        ids = {s["id"] for s in r.json()}
        assert {"bodacc", "recherche-entreprises", "rappelconso"} <= ids

    def test_sources_only_manager(self):
        r = requests.get(f"{BASE_URL}/api/sources-donnees")
        assert r.status_code in (401, 403)

    def test_ingestion_runs_shape(self, headers):
        r = requests.get(f"{BASE_URL}/api/ingestion-runs?limit=5", headers=headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_monitored_departments_crud(self, headers):
        r = requests.post(f"{BASE_URL}/api/settings/monitored-departments",
                          headers=headers, json={"departments": ["64", "40"]})
        assert r.status_code == 200
        assert r.json()["departments"] == ["64", "40"]
        r2 = requests.get(f"{BASE_URL}/api/settings/monitored-departments", headers=headers)
        assert set(r2.json()["departments"]) == {"64", "40"}


class TestNafValidators:
    def test_naf_chr_mapping_seeded(self, headers):
        # via bouclier ou via un ping — vérifie qu'un scan retourne un shape valide
        # (le mapping est utilisé indirectement)
        from integrations.naf_chr import is_chr_code, NAF_CHR_SEED
        mapping = [{"code_2008": c, "code_2025": n25, "is_chr": chr_, "segment": seg}
                   for c, _, n25, chr_, seg in NAF_CHR_SEED]
        ok, seg = is_chr_code("56.30Z", mapping)
        assert ok and seg == "bar"
        ok2, _ = is_chr_code("99.99Z", mapping)
        assert not ok2


class TestBodaccClassifier:
    def test_classify_liquidation(self):
        from integrations.bodacc import classify_collective
        sev, action = classify_collective({"nature": "Liquidation judiciaire"})
        assert sev == "block"
        assert "bloquées" in action.lower() or "bloqu" in action.lower()

    def test_classify_redressement(self):
        from integrations.bodacc import classify_collective
        sev, action = classify_collective({"nature": "Redressement judiciaire"})
        assert sev == "watch"

    def test_classify_sauvegarde(self):
        from integrations.bodacc import classify_collective
        sev, _ = classify_collective({"nature": "Sauvegarde"})
        assert sev == "watch"


class TestProspectionEndpoint:
    def test_radius_max(self, headers):
        r = requests.get(f"{BASE_URL}/api/prospection/nearby",
                         headers=headers, params={"lat": 43.29, "lng": -0.37, "radius_km": 100})
        assert r.status_code == 400

    def test_only_authenticated(self):
        r = requests.get(f"{BASE_URL}/api/prospection/nearby",
                         params={"lat": 43.29, "lng": -0.37, "radius_km": 2})
        assert r.status_code in (401, 403)


class TestScanEndpoints:
    def test_bouclier_scan_shape(self, headers):
        r = requests.post(f"{BASE_URL}/api/bouclier/scan-now", headers=headers)
        assert r.status_code == 200, r.text
        b = r.json()
        assert "ok" in b and "sirens_scanned" in b and "alerts" in b

    def test_rappels_scan_shape(self, headers):
        r = requests.post(f"{BASE_URL}/api/veille/scan-now", headers=headers)
        assert r.status_code == 200, r.text
        b = r.json()
        # peut être {ok:false, error:...} si l'API publique fluctue
        assert "ok" in b or "error" in b

    def test_radar_scan_shape(self, headers):
        r = requests.post(f"{BASE_URL}/api/radar/scan-now", headers=headers)
        assert r.status_code == 200, r.text
        b = r.json()
        assert "ok" in b and "bodacc_count" in b


class TestCronAuth:
    def test_cron_bouclier_requires_secret(self):
        r = requests.post(f"{BASE_URL}/api/cron/bouclier/scan")
        assert r.status_code == 401

    def test_cron_radar_requires_secret(self):
        r = requests.post(f"{BASE_URL}/api/cron/radar/creations")
        assert r.status_code == 401

    def test_cron_rappels_requires_secret(self):
        r = requests.post(f"{BASE_URL}/api/cron/rappels/scan")
        assert r.status_code == 401
