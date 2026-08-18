"""Iter 12 — Relevés terrain + Traçabilité lot + VIES."""
import os, uuid, pytest, requests
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def H():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": "demo@cellier.fr", "password": "demo1234"})
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


def test_releve_create_and_list(H):
    clients = requests.get(f"{BASE}/api/clients", headers=H).json()
    cid = clients[0]["id"]
    r = requests.post(f"{BASE}/api/releves-terrain", headers=H, json={
        "client_id": cid, "marques_presentes": ["Heineken", "1664"],
        "nb_lignes_totales": 6,
        "prix_releves": [{"marque": "Heineken", "format": "25cl", "prix_consommateur": 4.5}],
    })
    assert r.status_code == 200
    r2 = requests.get(f"{BASE}/api/releves-terrain?client_id={cid}", headers=H)
    assert r2.status_code == 200 and len(r2.json()) >= 1


def test_lot_and_delivery(H):
    products = requests.get(f"{BASE}/api/products", headers=H).json()
    clients = requests.get(f"{BASE}/api/clients", headers=H).json()
    r = requests.post(f"{BASE}/api/lots", headers=H, json={
        "product_id": products[0]["id"], "lot_number": f"L-{uuid.uuid4().hex[:6]}",
        "gtin": "3760000000099", "quantite_produite": 200,
    })
    assert r.status_code == 200 and r.json().get("ok")
    lot_id = r.json()["id"]
    d = requests.post(f"{BASE}/api/delivery-lines", headers=H, json={
        "order_id": "test-o", "product_id": products[0]["id"], "lot_id": lot_id,
        "client_id": clients[0]["id"], "quantity": 24,
    })
    assert d.status_code == 200


def test_observatoire_threshold(H):
    r = requests.get(f"{BASE}/api/observatoire/summary", headers=H)
    assert r.status_code == 200
    b = r.json()
    assert "count" in b and "brands" in b


def test_vies_bad_format(H):
    r = requests.post(f"{BASE}/api/tools/vies-check", headers=H, json={"vat_number": "X"})
    assert r.status_code == 200
    assert r.json()["valid"] is False


def test_vies_shape(H):
    r = requests.post(f"{BASE}/api/tools/vies-check", headers=H, json={"vat_number": "FR40303265045"})
    assert r.status_code == 200
    b = r.json()
    # peut être valid ou indisponible selon l'état du service VIES
    assert "valid" in b
