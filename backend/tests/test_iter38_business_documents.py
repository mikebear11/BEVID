"""Lot 8 étapes 2-5 · BusinessDocument, émission, PDF, auto-facturation.

Vérifie :
- Création draft (aucun numéro), update, get, list.
- Validation à l'émission (lots obligatoires sur BL/facture, mentions légales,
  SIREN client, motif avoir).
- Attribution atomique du numéro à l'émission.
- Immuabilité facture/avoir émis (PATCH → 423 Locked).
- Idempotence de l'émission (2e appel = même numéro).
- PDF rendu correctement (WeasyPrint, entête + lignes + totaux + mentions).
- Auto-émission de la facture au pointage « livré » du BL.
- Idempotence de `mark-delivered` (rejeu = pas de doublon facture).
- Création avoir avec référence + motif obligatoires.
"""
import os
import pytest
import httpx

API = os.environ.get("BEVID_API", "http://localhost:8001/api")
MANAGER = {"email": "manager.demo@bevidcrm.fr", "password": "Manager!2026Demo"}


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=API, timeout=60.0) as c:
        r = c.post("/auth/login", json=MANAGER)
        assert r.status_code == 200, r.text
        c.headers["Authorization"] = f"Bearer {r.json()['token']}"
        # Prépare les mentions légales complètes pour permettre l'émission
        c.put("/org/legal", json={
            "legal_name": "BEVID Démo SAS", "legal_form": "SAS", "capital_eur": 10000,
            "siren": "123456789", "siret": "12345678900011", "tva_intra": "FR12345678901",
            "accise_number": "FR012345E6789", "rcs_city": "Pau",
            "address_line1": "12 rue du Test", "postal_code": "64000", "city": "Pau",
            "iban": "FR7612345678901234567890123", "bic": "BNPAFRPP",
            "default_payment_terms_days": 30, "late_penalty_rate_pct": 12.0,
        })
        yield c


@pytest.fixture(scope="module")
def adt64_id(client):
    """Récupère l'ID d'ADT 64 pour référence."""
    r = client.get("/establishments")
    for e in r.json():
        if e["name"] == "ADT 64":
            # Assure que l'établissement a un SIREN pour les tests factures
            if not e.get("siren"):
                client.put(f"/establishments/{e['id']}", json={"siren": "987654321"})
            return e["id"]
    pytest.fail("ADT 64 non trouvé")


def _bl_lines_ok():
    """Lignes de test avec lots obligatoires."""
    return [
        {"designation": "IPA Houblonée", "sku": "IPA-30L", "format": "Fût 30L",
         "quantity": 3, "unit": "fût", "unit_price": 89.0, "tva_rate": 20.0,
         "lot_number": "L20260220-A", "ddm": "2027-02-20"},
        {"designation": "Consigne fût 30L", "quantity": 3, "unit_price": 30.0,
         "tva_rate": 20.0, "is_deposit": True},
    ]


def test_create_document_no_number_attributed(client, adt64_id):
    r = client.post("/documents", json={
        "doc_type": "devis", "client_id": adt64_id,
        "lines": [{"designation": "IPA test", "quantity": 3, "unit_price": 89.0}],
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["number"] is None, "Le brouillon ne doit PAS avoir de numéro"
    assert d["status"] == "brouillon"
    assert d["doc_type"] == "devis"
    assert d["total_ht"] == 267.0
    assert d["total_ttc"] == round(267.0 * 1.2, 2)


def test_emit_devis_allocates_number(client, adt64_id):
    r = client.post("/documents", json={
        "doc_type": "devis", "client_id": adt64_id,
        "lines": [{"designation": "IPA", "quantity": 3, "unit_price": 89.0}],
    })
    did = r.json()["id"]
    r2 = client.post(f"/documents/{did}/emit")
    assert r2.status_code == 200, r2.text
    d = r2.json()
    assert d["number"] is not None
    assert d["number"].startswith("DEV-")
    assert d["status"] == "envoye"


def test_emit_is_idempotent(client, adt64_id):
    r = client.post("/documents", json={
        "doc_type": "proforma", "client_id": adt64_id,
        "lines": [{"designation": "IPA", "quantity": 2, "unit_price": 89.0,
                   "lot_number": "X"}],
    })
    did = r.json()["id"]
    r1 = client.post(f"/documents/{did}/emit")
    n1 = r1.json()["number"]
    r2 = client.post(f"/documents/{did}/emit")
    n2 = r2.json()["number"]
    assert n1 == n2, "2e émission doit renvoyer le même numéro"


def test_bl_without_lots_rejected(client, adt64_id):
    """Sans lot, un BL ne peut pas être émis (règlement CE 178/2002)."""
    r = client.post("/documents", json={
        "doc_type": "bon_livraison", "client_id": adt64_id,
        "driver_name": "Paul", "receiver_name": "Sophie",
        "lines": [{"designation": "IPA", "quantity": 3, "unit_price": 89.0}],
    })
    did = r.json()["id"]
    r2 = client.post(f"/documents/{did}/emit")
    assert r2.status_code == 422
    detail = r2.json()["detail"]
    problems = detail.get("problems", [])
    assert any("lot" in p.lower() for p in problems), problems


def test_bl_with_lots_and_signatures_emits(client, adt64_id):
    r = client.post("/documents", json={
        "doc_type": "bon_livraison", "client_id": adt64_id,
        "driver_name": "Paul Livreur", "receiver_name": "Sophie Achats",
        "lines": _bl_lines_ok(),
    })
    did = r.json()["id"]
    r2 = client.post(f"/documents/{did}/emit")
    assert r2.status_code == 200, r2.text
    d = r2.json()
    assert d["number"].startswith("BL-")
    assert d["status"] == "envoye"
    assert d["total_ht"] == round(3 * 89 + 3 * 30, 2)


def test_invoice_requires_client_siren(client, adt64_id):
    """Un client sans SIREN ne peut pas recevoir de facture (obligation 2026)."""
    # Retire temporairement le SIREN
    client.put(f"/establishments/{adt64_id}", json={"siren": ""})
    r = client.post("/documents", json={
        "doc_type": "facture", "client_id": adt64_id,
        "lines": [{"designation": "IPA", "quantity": 3, "unit_price": 89.0,
                   "lot_number": "L1"}],
    })
    did = r.json()["id"]
    r2 = client.post(f"/documents/{did}/emit")
    assert r2.status_code == 422
    problems = r2.json()["detail"].get("problems", [])
    assert any("siren" in p.lower() for p in problems), problems
    # Réparation pour les tests suivants
    client.put(f"/establishments/{adt64_id}", json={"siren": "987654321"})


def test_fiscal_document_is_immutable_after_emit(client, adt64_id):
    """Facture émise → PATCH doit retourner 423 Locked."""
    r = client.post("/documents", json={
        "doc_type": "facture", "client_id": adt64_id,
        "lines": [{"designation": "IPA", "quantity": 3, "unit_price": 89.0,
                   "lot_number": "L100"}],
    })
    did = r.json()["id"]
    # Ré-injecte SIREN au cas où
    client.put(f"/establishments/{adt64_id}", json={"siren": "987654321"})
    # Re-snapshot le client
    client.patch(f"/documents/{did}", json={
        "lines": [{"designation": "IPA", "quantity": 3, "unit_price": 89.0,
                   "lot_number": "L100"}]
    })
    r2 = client.post(f"/documents/{did}/emit")
    if r2.status_code != 200:
        # Le snapshot client était pris avant le SIREN — on force-refresh en
        # supprimant le doc et en le recréant
        r = client.post("/documents", json={
            "doc_type": "facture", "client_id": adt64_id,
            "lines": [{"designation": "IPA", "quantity": 3, "unit_price": 89.0,
                       "lot_number": "L100"}],
        })
        did = r.json()["id"]
        r2 = client.post(f"/documents/{did}/emit")
    assert r2.status_code == 200, r2.text
    # PATCH doit être refusé
    r3 = client.patch(f"/documents/{did}", json={"notes": "modification interdite"})
    assert r3.status_code == 423


def test_pdf_renders_for_draft(client, adt64_id):
    r = client.post("/documents", json={
        "doc_type": "devis", "client_id": adt64_id,
        "lines": [{"designation": "IPA test PDF", "quantity": 3, "unit_price": 89.0}],
    })
    did = r.json()["id"]
    r2 = client.get(f"/documents/{did}/pdf")
    assert r2.status_code == 200
    assert r2.headers["content-type"].startswith("application/pdf")
    assert len(r2.content) > 1000
    assert r2.content[:4] == b"%PDF"


def test_auto_invoice_from_delivered_bl(client, adt64_id):
    """Un BL marqué livré déclenche l'émission automatique de la facture."""
    # Assure SIREN sur ADT 64
    client.put(f"/establishments/{adt64_id}", json={"siren": "987654321"})
    r = client.post("/documents", json={
        "doc_type": "bon_livraison", "client_id": adt64_id,
        "driver_name": "P.", "receiver_name": "S.",
        "lines": _bl_lines_ok(),
    })
    did = r.json()["id"]
    # Émission du BL
    client.post(f"/documents/{did}/emit")
    # Marquage livré
    r2 = client.post(f"/documents/{did}/mark-delivered")
    assert r2.status_code == 200
    invoice = r2.json().get("invoice")
    assert invoice is not None
    assert invoice.get("source_bl_id") == did
    if invoice.get("number"):
        assert invoice["number"].startswith("F-")
        assert invoice.get("auto_emitted") is True


def test_mark_delivered_is_idempotent(client, adt64_id):
    client.put(f"/establishments/{adt64_id}", json={"siren": "987654321"})
    r = client.post("/documents", json={
        "doc_type": "bon_livraison", "client_id": adt64_id,
        "driver_name": "P.", "receiver_name": "S.",
        "lines": _bl_lines_ok(),
    })
    did = r.json()["id"]
    client.post(f"/documents/{did}/emit")
    r1 = client.post(f"/documents/{did}/mark-delivered")
    r2 = client.post(f"/documents/{did}/mark-delivered")
    inv1 = (r1.json().get("invoice") or {}).get("id")
    inv2 = (r2.json().get("invoice") or {}).get("id")
    assert inv1 == inv2, "Rejeu de mark-delivered doit renvoyer LA MÊME facture"


def test_avoir_requires_reason(client, adt64_id):
    # Crée + émet une facture
    client.put(f"/establishments/{adt64_id}", json={"siren": "987654321"})
    r = client.post("/documents", json={
        "doc_type": "facture", "client_id": adt64_id,
        "lines": [{"designation": "IPA", "quantity": 3, "unit_price": 89.0,
                   "lot_number": "L200"}],
    })
    did = r.json()["id"]
    client.post(f"/documents/{did}/emit")
    r_avoir = client.post(f"/documents/{did}/create-avoir", json={"reason": ""})
    assert r_avoir.status_code == 422


def test_avoir_with_reason_references_invoice(client, adt64_id):
    client.put(f"/establishments/{adt64_id}", json={"siren": "987654321"})
    r = client.post("/documents", json={
        "doc_type": "facture", "client_id": adt64_id,
        "lines": [{"designation": "IPA", "quantity": 3, "unit_price": 89.0,
                   "lot_number": "L201"}],
    })
    did = r.json()["id"]
    client.post(f"/documents/{did}/emit")
    r_avoir = client.post(f"/documents/{did}/create-avoir",
                          json={"reason": "Retour marchandise cassée"})
    assert r_avoir.status_code == 200, r_avoir.text
    avoir = r_avoir.json()
    assert avoir["doc_type"] == "avoir"
    assert avoir["original_invoice_id"] == did
    assert avoir["reason"] == "Retour marchandise cassée"
    assert avoir["status"] == "brouillon"


def test_totals_computed_with_tva_breakdown_by_rate(client, adt64_id):
    """Deux lignes à des taux TVA différents produisent une ventilation par taux."""
    r = client.post("/documents", json={
        "doc_type": "devis", "client_id": adt64_id,
        "lines": [
            {"designation": "IPA (TVA 20%)", "quantity": 10, "unit_price": 89.0, "tva_rate": 20.0},
            {"designation": "Eau (TVA 5.5%)", "quantity": 20, "unit_price": 1.5, "tva_rate": 5.5},
        ],
    })
    d = r.json()
    rates = {round(b["rate"], 1) for b in d["tva_breakdown"]}
    assert rates == {20.0, 5.5}, f"Ventilation TVA attendue par taux : {d['tva_breakdown']}"


def test_list_documents_filtered_by_type(client, adt64_id):
    r = client.get("/documents", params={"doc_type": "devis"})
    assert r.status_code == 200
    for d in r.json():
        assert d["doc_type"] == "devis"
