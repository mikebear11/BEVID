"""Iter 10a — Banking + Reconciliation engine."""
import io
import os
import uuid
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


# ---------- Validators (unit) ----------
class TestValidators:
    def test_iban_ok(self):
        from bank.validators import is_valid_iban
        assert is_valid_iban("FR76 3000 6000 0112 3456 7890 189") is True
        assert is_valid_iban("FR7630006000011234567890189") is True
        assert is_valid_iban("FR7630006000011234567890188") is False
        assert is_valid_iban("") is False

    def test_siret(self):
        from bank.validators import is_valid_siret, is_valid_siren
        assert is_valid_siret("73282932000074") is True
        assert is_valid_siret("73282932000075") is False
        assert is_valid_siren("732829320") is True

    def test_rf(self):
        from bank.validators import is_valid_rf_reference
        assert is_valid_rf_reference("RF18539007547034") is True
        assert is_valid_rf_reference("RF19539007547034") is False


# ---------- Endpoints validation ----------
class TestBankingEndpoints:
    def test_summary_manager_only(self):
        r = requests.get(f"{BASE_URL}/api/banque/summary")
        assert r.status_code in (401, 403)

    def test_summary_shape(self, headers):
        r = requests.get(f"{BASE_URL}/api/banque/summary", headers=headers)
        assert r.status_code == 200
        b = r.json()
        for k in ("total_tx", "open_tx", "matched_tx", "matched_pct",
                  "active_lettrages", "auto_lettrages", "auto_rate_pct"):
            assert k in b

    def test_client_banking_invalid_iban(self, headers):
        c = requests.post(f"{BASE_URL}/api/clients", headers=headers, json={
            "name": f"BK_bad_iban_{uuid.uuid4().hex[:6]}", "type": "caviste"})
        r = requests.post(f"{BASE_URL}/api/clients/{c.json()['id']}/banking",
                          headers=headers, json={"iban": "FR7612345678901234567890123"})
        assert r.status_code == 400
        assert "IBAN" in r.json()["detail"]

    def test_client_banking_valid_iban_and_siret(self, headers):
        c = requests.post(f"{BASE_URL}/api/clients", headers=headers, json={
            "name": f"BK_ok_{uuid.uuid4().hex[:6]}", "type": "caviste"})
        r = requests.post(f"{BASE_URL}/api/clients/{c.json()['id']}/banking",
                          headers=headers, json={
                              "iban": "FR7630006000011234567890189",
                              "siret": "73282932000074",
                              "tva_intra": "FR12345678900",
                          })
        assert r.status_code == 200, r.text
        # verify SIREN is derived
        c2 = requests.get(f"{BASE_URL}/api/clients/{c.json()['id']}", headers=headers).json()
        assert c2["iban"] == "FR7630006000011234567890189"
        assert c2["siret"] == "73282932000074"
        assert c2["siren"] == "732829320"

    def test_client_banking_invalid_siret(self, headers):
        c = requests.post(f"{BASE_URL}/api/clients", headers=headers, json={
            "name": f"BK_bad_siret_{uuid.uuid4().hex[:6]}", "type": "caviste"})
        r = requests.post(f"{BASE_URL}/api/clients/{c.json()['id']}/banking",
                          headers=headers, json={"siret": "12345678901234"})
        assert r.status_code == 400


# ---------- CSV import + reconciliation ----------
class TestCsvImportAndMatch:
    @pytest.fixture
    def seed(self, headers):
        import random
        cid = requests.post(f"{BASE_URL}/api/clients", headers=headers, json={
            "name": f"BAR LE CENTRAL {uuid.uuid4().hex[:4].upper()}", "type": "bar",
        }).json()["id"]
        pid = requests.post(f"{BASE_URL}/api/products", headers=headers, json={
            "name": f"biere_{uuid.uuid4().hex[:6]}", "category": "biere",
            "price": 100.0, "stock": 500}).json()["id"]
        client = requests.get(f"{BASE_URL}/api/clients/{cid}", headers=headers).json()
        # montant unique par run pour isoler des autres tests
        unique_amount = round(200 + random.random() * 5000, 2)
        qty = 1
        unit = unique_amount
        oid = requests.post(f"{BASE_URL}/api/orders", headers=headers, json={
            "client_id": cid, "client_uuid": str(uuid.uuid4()),
            "lines": [{"product_id": pid, "product_name": "biere_test",
                       "quantity": qty, "unit_price": unit}],
        }).json()["id"]
        return {"cid": cid, "oid": oid, "client_name": client["name"], "amount": unique_amount}

    def test_import_csv_and_auto_lettrage_exact_name_amount(self, headers, seed):
        # CSV avec payeur nom exact + montant exact = auto-lettrage (score >= 85)
        unique_label = uuid.uuid4().hex[:8]
        amount_str = f"{seed['amount']:.2f}".replace(".", ",")
        csv_content = (
            "date;libelle;montant\n"
            f"01/02/2026;VIREMENT {seed['client_name']} REF {unique_label};{amount_str}\n"
        ).encode("utf-8")
        r = requests.post(
            f"{BASE_URL}/api/banque/imports",
            headers={"Authorization": headers["Authorization"]},
            files={"file": (f"releve_{unique_label}.csv", csv_content, "text/csv")},
        )
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["format"] == "csv"
        assert b["new"] == 1
        assert b["duplicates"] == 0
        assert b["auto_lettrages"] >= 1, f"pas d'auto-lettrage: {b}"

        # order should be paid now
        o = next(x for x in requests.get(f"{BASE_URL}/api/orders", headers=headers).json()
                 if x["id"] == seed["oid"])
        assert o["payment_status"] == "paid"

    def test_import_idempotent(self, headers, seed):
        # Rejeu du même fichier → 0 nouvelles écritures
        unique_label = uuid.uuid4().hex[:8]
        amt = round(seed["amount"] + 0.11, 2)
        csv_content = (
            "date;libelle;montant\n"
            f"05/02/2026;VIRT {seed['client_name']} {unique_label};{f'{amt:.2f}'.replace('.', ',')}\n"
        ).encode("utf-8")
        r1 = requests.post(f"{BASE_URL}/api/banque/imports",
                           headers={"Authorization": headers["Authorization"]},
                           files={"file": (f"r_{unique_label}.csv", csv_content, "text/csv")})
        assert r1.json()["new"] == 1
        r2 = requests.post(f"{BASE_URL}/api/banque/imports",
                           headers={"Authorization": headers["Authorization"]},
                           files={"file": (f"r_{unique_label}.csv", csv_content, "text/csv")})
        assert r2.json()["new"] == 0
        assert r2.json()["duplicates"] == 1

    def test_delettrage_reverses_order_status(self, headers, seed):
        # apply first
        unique_label = uuid.uuid4().hex[:8]
        amount_str = f"{seed['amount']:.2f}".replace(".", ",")
        csv_content = (
            "date;libelle;montant\n"
            f"06/02/2026;VIRT {seed['client_name']} {unique_label};{amount_str}\n"
        ).encode("utf-8")
        requests.post(f"{BASE_URL}/api/banque/imports",
                      headers={"Authorization": headers["Authorization"]},
                      files={"file": (f"d_{unique_label}.csv", csv_content, "text/csv")})
        # find the lettrage
        letts = requests.get(f"{BASE_URL}/api/banque/lettrages", headers=headers).json()
        my = [x for x in letts if x["order_id"] == seed["oid"] and x["status"] == "active"]
        assert my, "aucun lettrage actif trouvé"
        lid = my[0]["id"]
        # dé-lettrage
        r = requests.post(f"{BASE_URL}/api/banque/lettrages/{lid}/delettrer", headers=headers)
        assert r.status_code == 200
        # order back to pending
        o = next(x for x in requests.get(f"{BASE_URL}/api/orders", headers=headers).json()
                 if x["id"] == seed["oid"])
        assert o["payment_status"] in ("pending", "partial")


# ---------- Manual lettrage + propose ----------
class TestPropose:
    def test_propose_returns_candidates(self, headers):
        # Client avec nom identifiant unique + montant unique → doit produire au moins 1 proposition
        import random
        unique_amount = round(70000 + random.random() * 200, 2)
        unique_name = f"PROPTEST-{uuid.uuid4().hex[:8].upper()}"
        cid = requests.post(f"{BASE_URL}/api/clients", headers=headers, json={
            "name": unique_name, "type": "caviste"}).json()["id"]
        pid = requests.post(f"{BASE_URL}/api/products", headers=headers, json={
            "name": f"prod_{uuid.uuid4().hex[:6]}", "category": "vin",
            "price": unique_amount, "stock": 100}).json()["id"]
        oid = requests.post(f"{BASE_URL}/api/orders", headers=headers, json={
            "client_id": cid, "client_uuid": str(uuid.uuid4()),
            "lines": [{"product_id": pid, "product_name": "vin",
                       "quantity": 1, "unit_price": unique_amount}],
        }).json()["id"]
        # CSV avec le nom unique du client dans le libellé → match HIGH
        amt_str = f"{unique_amount:.2f}".replace(".", ",")
        csv_content = f"date;libelle;montant\n07/02/2026;VIRT {unique_name};{amt_str}\n".encode()
        requests.post(f"{BASE_URL}/api/banque/imports",
                      headers={"Authorization": headers["Authorization"]},
                      files={"file": (f"p_{uuid.uuid4().hex[:6]}.csv", csv_content, "text/csv")})
        # tx aurait dû être auto-lettrée (HIGH match) → order.paid
        o = next(x for x in requests.get(f"{BASE_URL}/api/orders", headers=headers).json()
                 if x["id"] == oid)
        assert o["payment_status"] == "paid", f"expected auto-paid, got {o.get('payment_status')}"

    def test_manual_lettrage(self, headers):
        cid = requests.post(f"{BASE_URL}/api/clients", headers=headers, json={
            "name": f"MANUAL {uuid.uuid4().hex[:4].upper()}", "type": "hotel"}).json()["id"]
        pid = requests.post(f"{BASE_URL}/api/products", headers=headers, json={
            "name": f"p_{uuid.uuid4().hex[:6]}", "category": "spiritueux",
            "price": 77.77, "stock": 10}).json()["id"]
        oid = requests.post(f"{BASE_URL}/api/orders", headers=headers, json={
            "client_id": cid, "client_uuid": str(uuid.uuid4()),
            "lines": [{"product_id": pid, "product_name": "spir", "quantity": 1, "unit_price": 77.77}],
        }).json()["id"]
        # tx différent : 50€ + 27.77€ ne se propose pas auto
        csv = f"date;libelle;montant\n08/02/2026;PMT XYZ{uuid.uuid4().hex[:4]};77,77\n".encode()
        requests.post(f"{BASE_URL}/api/banque/imports",
                      headers={"Authorization": headers["Authorization"]},
                      files={"file": ("m.csv", csv, "text/csv")})
        txs = requests.get(f"{BASE_URL}/api/banque/transactions?status=open", headers=headers).json()
        cand = [t for t in txs if abs(t["amount"] - 77.77) < 0.01]
        assert cand
        r = requests.post(f"{BASE_URL}/api/banque/transactions/{cand[0]['id']}/lettrer",
                          headers=headers, json={
                              "order_ids": [oid], "amount_applied": 77.77,
                              "confidence": 100, "reason": "Manuel",
                          })
        assert r.status_code == 200
        o = next(x for x in requests.get(f"{BASE_URL}/api/orders", headers=headers).json()
                 if x["id"] == oid)
        assert o["payment_status"] == "paid"


# ---------- CAMT.053 parser ----------
CAMT_SAMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
 <BkToCstmrStmt>
  <GrpHdr><MsgId>MSG1</MsgId><CreDtTm>2026-02-08T09:00:00</CreDtTm></GrpHdr>
  <Stmt>
   <Id>STMT1</Id>
   <Ntry>
    <NtryRef>NTR001</NtryRef>
    <Amt Ccy="EUR">340.50</Amt>
    <CdtDbtInd>CRDT</CdtDbtInd>
    <ValDt><Dt>2026-02-07</Dt></ValDt>
    <BookgDt><Dt>2026-02-07</Dt></BookgDt>
    <NtryDtls><TxDtls>
     <RltdPties><Dbtr><Nm>RESTAURANT LE PICOTIN</Nm></Dbtr></RltdPties>
     <RmtInf><Ustrd>Facture BEVID-2026001</Ustrd></RmtInf>
    </TxDtls></NtryDtls>
   </Ntry>
   <Ntry>
    <NtryRef>NTR002</NtryRef>
    <Amt Ccy="EUR">150.00</Amt>
    <CdtDbtInd>DBIT</CdtDbtInd>
    <ValDt><Dt>2026-02-07</Dt></ValDt>
    <BookgDt><Dt>2026-02-07</Dt></BookgDt>
   </Ntry>
  </Stmt>
 </BkToCstmrStmt>
</Document>
""".encode()


class TestCamt:
    def test_camt_parse(self):
        from bank.importers import parse_camt053
        rows = parse_camt053(CAMT_SAMPLE, "sample.xml")
        assert len(rows) == 2
        credit = next(r for r in rows if r["amount"] > 0)
        assert credit["amount"] == 340.50
        assert "PICOTIN" in credit["counterparty_name"]
        assert "BEVID-2026001" in credit["label"]

    def test_camt_import_endpoint(self, headers):
        r = requests.post(f"{BASE_URL}/api/banque/imports",
                          headers={"Authorization": headers["Authorization"]},
                          files={"file": ("stmt.xml", CAMT_SAMPLE, "application/xml")})
        assert r.status_code == 200, r.text
        assert r.json()["format"] == "camt053"
