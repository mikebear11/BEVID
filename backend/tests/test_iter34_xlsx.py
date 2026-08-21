"""Lot 8 · Import/Export XLSX (établissements, contacts, produits, tarifs, commandes).

Vérifie :
- Les 3 endpoints template ouvrent bien un xlsx lisible avec les bonnes feuilles.
- Les 3 endpoints export renvoient un xlsx bien formé.
- Le round-trip template → import fonctionne sans erreur.
- L'import rejette les rôles/catégories/types inconnus proprement.
- Le fichier trop volumineux est rejeté (413).
- Les extensions autres que .xlsx sont refusées.
"""
import io
import os
import pytest
import httpx
from openpyxl import load_workbook, Workbook

API = os.environ.get("BEVID_API", "http://localhost:8001/api")
MANAGER = {"email": "manager.demo@bevidcrm.fr", "password": "Manager!2026Demo"}


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=API, timeout=60.0) as c:
        r = c.post("/auth/login", json=MANAGER)
        assert r.status_code == 200, r.text
        c.headers["Authorization"] = f"Bearer {r.json()['token']}"
        yield c


def _load(content: bytes):
    return load_workbook(io.BytesIO(content))


def test_template_establishments_has_two_sheets(client):
    r = client.get("/xlsx/template/establishments")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/vnd.openxmlformats")
    wb = _load(r.content)
    assert "Etablissements" in wb.sheetnames
    assert "Contacts" in wb.sheetnames
    # Header 1 doit être Nom * (marqué obligatoire)
    assert wb["Etablissements"]["A1"].value.endswith("*")
    # Ligne d'exemple présente
    assert wb["Etablissements"]["A2"].value == "Bar de la Poste"


def test_template_products_has_products_sheet(client):
    r = client.get("/xlsx/template/products")
    assert r.status_code == 200
    wb = _load(r.content)
    assert "Produits" in wb.sheetnames
    assert wb["Produits"]["A1"].value.endswith("*")


def test_template_pricelists_has_tarifs_and_lignes(client):
    r = client.get("/xlsx/template/pricelists")
    assert r.status_code == 200
    wb = _load(r.content)
    assert "Tarifs" in wb.sheetnames
    assert "Lignes" in wb.sheetnames


def test_export_orders_flattens_lines(client):
    r = client.get("/xlsx/export/orders")
    assert r.status_code == 200
    wb = _load(r.content)
    assert "Commandes" in wb.sheetnames
    ws = wb["Commandes"]
    # Headers attendus (par ordre)
    headers = [c.value for c in ws[1]]
    assert "N° commande" in headers
    assert "Produit" in headers
    assert "Sous-total (€)" in headers


def test_export_establishments_includes_contacts_sheet(client):
    r = client.get("/xlsx/export/establishments")
    assert r.status_code == 200
    wb = _load(r.content)
    assert "Etablissements" in wb.sheetnames
    assert "Contacts" in wb.sheetnames


def test_roundtrip_template_establishments(client):
    """Le template téléchargé peut être re-uploadé sans erreur."""
    r = client.get("/xlsx/template/establishments")
    assert r.status_code == 200
    files = {"file": ("template.xlsx", r.content,
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    r2 = client.post("/xlsx/import/establishments", files=files)
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert data["total_errors"] == 0
    # 1 création (ligne exemple) + 1 contact (feuille Contacts)
    assert data["created"] + data["updated"] >= 1


def test_import_rejects_wrong_extension(client):
    files = {"file": ("data.csv", b"nom,type\nX,bar\n", "text/csv")}
    r = client.post("/xlsx/import/establishments", files=files)
    assert r.status_code == 422


def test_import_rejects_too_large_file(client):
    # Génère 6 Mo de bytes valides xlsx-looking (juste dépasse la limite 5 Mo)
    big = b"PK" + b"\x00" * (6 * 1024 * 1024)
    files = {"file": ("big.xlsx", big,
                     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    r = client.post("/xlsx/import/establishments", files=files)
    assert r.status_code == 413


def test_import_reports_unknown_role_gracefully(client):
    """Un rôle contact inconnu ne casse pas l'import — il est signalé et remis à 'autre'."""
    wb = Workbook()
    wb.remove(wb.active)
    ws1 = wb.create_sheet("Etablissements")
    ws1.append(["Nom *", "Type (bar/restaurant/caviste/hotel/epicerie/autre)"])
    ws1.append(["XLSX Test Etab 34", "bar"])
    ws2 = wb.create_sheet("Contacts")
    ws2.append(["Établissement (nom exact) *", "Rôle *", "Nom du contact *"])
    ws2.append(["XLSX Test Etab 34", "empereur", "Napoléon"])
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    files = {"file": ("t.xlsx", buf.read(),
                     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    r = client.post("/xlsx/import/establishments", files=files)
    assert r.status_code == 200
    data = r.json()
    # Le contact a été créé quand même (rôle remis à autre) mais l'erreur est signalée
    assert any("empereur" in e.get("message", "") for e in data.get("errors", []))


def test_import_products_unknown_category_reported(client):
    wb = Workbook()
    ws = wb.active
    ws.title = "Produits"
    ws.append(["Nom *", "Catégorie (vin/biere/spiritueux/soft/eau/autre)", "Prix HT (€)"])
    ws.append(["XLSX Test Produit 34", "cocktail", 12.5])
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    files = {"file": ("p.xlsx", buf.read(),
                     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    r = client.post("/xlsx/import/products", files=files)
    assert r.status_code == 200
    data = r.json()
    assert any("cocktail" in e.get("message", "") for e in data.get("errors", []))
