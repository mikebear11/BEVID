"""Lot 8 · Contacts multiples par établissement (gérant, comptable, acheteur…).

Vérifie le contrat des 4 endpoints CRUD + les règles métier :
- rôles fermés (10 valeurs),
- un seul principal à la fois,
- 404 si contact/établissement inconnu,
- validation des champs obligatoires.
"""
import os
import pytest
import httpx

API = os.environ.get("BEVID_API", "http://localhost:8001/api")
MANAGER = {"email": "manager.demo@bevidcrm.fr", "password": "Manager!2026Demo"}


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=API, timeout=30.0) as c:
        r = c.post("/auth/login", json=MANAGER)
        assert r.status_code == 200, r.text
        tok = r.json()["token"]
        c.headers["Authorization"] = f"Bearer {tok}"
        yield c


@pytest.fixture(scope="module")
def est_id(client):
    """Crée un établissement dédié à ces tests pour ne rien polluer."""
    r = client.post("/establishments", json={
        "name": "Test Contacts SARL", "type": "bar", "city": "Paris",
    })
    assert r.status_code == 200, r.text
    eid = r.json()["id"]
    yield eid
    # cleanup best-effort — on tolère l'échec, seed peut rester
    try:
        client.request("DELETE", f"/establishments/{eid}")
    except Exception:
        pass


def test_list_empty_by_default(client, est_id):
    r = client.get(f"/establishments/{est_id}/contacts")
    assert r.status_code == 200
    assert r.json() == []


def test_create_requires_name(client, est_id):
    r = client.post(f"/establishments/{est_id}/contacts", json={"role": "gerant", "name": "   "})
    assert r.status_code == 422


def test_create_rejects_unknown_role(client, est_id):
    r = client.post(f"/establishments/{est_id}/contacts", json={"role": "empereur", "name": "X"})
    assert r.status_code == 422


def test_full_crud_cycle(client, est_id):
    # Create #1
    r = client.post(f"/establishments/{est_id}/contacts", json={
        "role": "gerant", "name": "  Anne Dupont  ", "phone": "0612345678",
        "email": "anne@testcontacts.fr", "notes": "  disponible en semaine  ",
        "is_primary": True,
    })
    assert r.status_code == 200, r.text
    c1 = r.json()
    assert c1["name"] == "Anne Dupont"  # trim
    assert c1["notes"] == "disponible en semaine"
    assert c1["is_primary"] is True
    assert c1["role"] == "gerant"

    # Create #2 aussi principal → doit démoter le #1
    r = client.post(f"/establishments/{est_id}/contacts", json={
        "role": "comptable", "name": "Bruno Martin", "email": "compta@x.fr",
        "is_primary": True,
    })
    assert r.status_code == 200, r.text
    c2 = r.json()

    listing = client.get(f"/establishments/{est_id}/contacts").json()
    by_id = {c["id"]: c for c in listing}
    assert by_id[c1["id"]]["is_primary"] is False, "c1 aurait dû être démoté"
    assert by_id[c2["id"]]["is_primary"] is True

    # PATCH sur c1 → nouveau rôle + notes
    r = client.patch(f"/establishments/{est_id}/contacts/{c1['id']}", json={
        "role": "acheteur", "notes": "après 17h"
    })
    assert r.status_code == 200
    assert r.json()["role"] == "acheteur"
    assert r.json()["notes"] == "après 17h"

    # PATCH sur c1 → promotion principal → doit démoter c2
    r = client.patch(f"/establishments/{est_id}/contacts/{c1['id']}", json={"is_primary": True})
    assert r.status_code == 200
    listing = client.get(f"/establishments/{est_id}/contacts").json()
    by_id = {c["id"]: c for c in listing}
    assert by_id[c1["id"]]["is_primary"] is True
    assert by_id[c2["id"]]["is_primary"] is False

    # DELETE c2
    r = client.delete(f"/establishments/{est_id}/contacts/{c2['id']}")
    assert r.status_code == 200
    assert r.json()["ok"] is True

    # Re-DELETE → 404 idempotence explicite
    r = client.delete(f"/establishments/{est_id}/contacts/{c2['id']}")
    assert r.status_code == 404


def test_patch_unknown_contact_returns_404(client, est_id):
    r = client.patch(f"/establishments/{est_id}/contacts/does-not-exist", json={"name": "X"})
    assert r.status_code == 404


def test_get_on_unknown_establishment_returns_404(client):
    r = client.get("/establishments/does-not-exist/contacts")
    assert r.status_code == 404


def test_put_establishment_does_not_wipe_contacts(client, est_id):
    """Un PUT global ne doit pas écraser la sous-collection contacts."""
    r = client.post(f"/establishments/{est_id}/contacts",
                    json={"role": "sommelier", "name": "Zoé Testeur"})
    assert r.status_code == 200
    before = client.get(f"/establishments/{est_id}/contacts").json()
    assert any(c["name"] == "Zoé Testeur" for c in before)

    # PUT global qui essaie d'écraser contacts
    r = client.put(f"/establishments/{est_id}", json={"contacts": [], "city": "Lyon"})
    assert r.status_code == 200

    after = client.get(f"/establishments/{est_id}/contacts").json()
    assert any(c["name"] == "Zoé Testeur" for c in after), "PUT ne doit pas écraser contacts"
