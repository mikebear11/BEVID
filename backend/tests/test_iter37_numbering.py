"""Lot 8 étape 1 · Modèle documentaire et numérotation atomique.

Le point 1 conditionne tout le reste de la chaîne documentaire (facture, avoir,
bon de livraison, etc.). Ce test vérifie :

- Le format `PREFIX-YYYY-NNNN` pour les 7 types de documents.
- La séquence est continue sans trou en usage normal.
- **La concurrence** : 100 allocations parallèles → 100 numéros consécutifs
  distincts (garantie MongoDB $inc + upsert).
- L'aperçu (`preview-number`) NE CONSOMME PAS la séquence.
- La séquence est cloisonnée par (org_id, doc_type, year).
- Les mentions légales : lecture / écriture / validation par le validateur.
- Les types fiscaux (facture/avoir) sont bien marqués `fiscal: True`.
"""
import asyncio
import os
import uuid
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
        yield c


def test_document_types_endpoint_lists_seven_types(client):
    r = client.get("/documents/types")
    assert r.status_code == 200
    types = r.json()["types"]
    values = {t["value"] for t in types}
    assert values == {
        "devis", "bon_commande", "bon_livraison",
        "proforma", "facture", "avoir", "feuille_depot",
    }
    # Facture + avoir doivent être marqués fiscaux
    fiscals = {t["value"] for t in types if t["fiscal"]}
    assert fiscals == {"facture", "avoir"}


def test_preview_number_does_not_consume(client):
    """Deux GET sur /preview-number retournent le même numéro tant qu'aucune
    allocation n'a eu lieu."""
    r1 = client.get("/documents/preview-number/facture")
    r2 = client.get("/documents/preview-number/facture")
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["next_number"] == r2.json()["next_number"]


def test_preview_number_format_is_prefix_year_seq(client):
    r = client.get("/documents/preview-number/devis")
    n = r.json()["next_number"]
    # Format `DEV-YYYY-NNNN`
    parts = n.split("-")
    assert len(parts) == 3
    assert parts[0] == "DEV"
    assert len(parts[1]) == 4 and parts[1].isdigit()
    assert len(parts[2]) == 4 and parts[2].isdigit()


def test_preview_unknown_type_returns_422(client):
    r = client.get("/documents/preview-number/facture_bidon")
    assert r.status_code == 422


def test_sequential_allocation_produces_consecutive_numbers(client):
    """3 allocations consécutives sur la même série → 3 numéros consécutifs."""
    # On lit d'abord le prochain aperçu pour connaître le point de départ
    r0 = client.get("/documents/preview-number/proforma")
    start_next = r0.json()["next_number"]
    start_seq = int(start_next.split("-")[-1])

    numbers = []
    for _ in range(3):
        r = client.post("/_internal/allocate-doc-number", json={"doc_type": "proforma"})
        assert r.status_code == 200, r.text
        numbers.append(r.json()["number"])

    # Format
    for n in numbers:
        parts = n.split("-")
        assert parts[0] == "PRO"

    # Séquence continue
    seqs = [int(n.split("-")[-1]) for n in numbers]
    assert seqs == [start_seq, start_seq + 1, start_seq + 2]


@pytest.mark.asyncio
async def test_hundred_concurrent_allocations_produce_unique_consecutive_numbers():
    """Le test qui verrouille tout : 100 allocations parallèles sur la même
    série doivent produire 100 numéros consécutifs distincts. Zéro doublon.

    Simule deux commerciaux qui valident 50 factures chacun exactement au
    même instant. Le compteur atomique MongoDB doit tenir.
    """
    async with httpx.AsyncClient(base_url=API, timeout=60.0) as c:
        r = await c.post("/auth/login", json=MANAGER)
        token = r.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Choix d'un doc_type qu'aucun autre test ne pollue en parallèle
        DOC_TYPE = "feuille_depot"

        # Baseline : peek avant
        r0 = await c.get(f"/documents/preview-number/{DOC_TYPE}", headers=headers)
        start_seq = int(r0.json()["next_number"].split("-")[-1])

        async def alloc():
            r = await c.post(
                "/_internal/allocate-doc-number",
                json={"doc_type": DOC_TYPE},
                headers=headers,
            )
            assert r.status_code == 200, r.text
            return r.json()["number"]

        tasks = [alloc() for _ in range(100)]
        results = await asyncio.gather(*tasks)

        # 1) Aucun doublon
        assert len(set(results)) == 100, f"Doublons détectés : {[n for n in results if results.count(n) > 1][:5]}"

        # 2) Consécutifs
        seqs = sorted(int(n.split("-")[-1]) for n in results)
        assert seqs == list(range(start_seq, start_seq + 100)), \
            f"Trou dans la séquence : {[i for i, s in enumerate(seqs) if i > 0 and seqs[i] != seqs[i-1] + 1][:5]}"


def test_sequences_are_isolated_by_doc_type(client):
    """Chaque type a sa propre série — allouer un devis ne fait pas avancer la
    séquence des factures."""
    fac_before = client.get("/documents/preview-number/facture").json()["next_number"]
    client.post("/_internal/allocate-doc-number", json={"doc_type": "devis"})
    client.post("/_internal/allocate-doc-number", json={"doc_type": "devis"})
    fac_after = client.get("/documents/preview-number/facture").json()["next_number"]
    assert fac_before == fac_after, "Les séries doivent être indépendantes"


def test_org_legal_read_returns_defaults_before_first_write(client):
    """Une organisation qui n'a jamais renseigné ses mentions doit avoir des
    défauts légaux (recovery=40€, cash_max=1000€)."""
    r = client.get("/org/legal")
    assert r.status_code == 200
    data = r.json()
    assert data.get("recovery_indemnity_eur") == 40.0
    assert data.get("cash_payment_max_eur") == 1000.0
    # Doit lister ce qui manque pour émettre une facture
    assert isinstance(data.get("_missing_for_invoice"), list)


def test_org_legal_write_then_read_roundtrip(client):
    payload = {
        "legal_name": "BEVID Test SAS",
        "legal_form": "SAS",
        "capital_eur": 10000.0,
        "siren": "123456789",
        "siret": "12345678900011",
        "tva_intra": "FR12345678901",
        "accise_number": "FR012345E6789",
        "rcs_city": "Pau",
        "address_line1": "12 rue du Test",
        "postal_code": "64000",
        "city": "Pau",
        "iban": "FR7612345678901234567890123",
        "bic": "BNPAFRPP",
        "default_payment_terms_days": 30,
        "late_penalty_rate_pct": 12.0,
    }
    r = client.put("/org/legal", json=payload)
    assert r.status_code == 200, r.text
    stored = r.json()
    for k, v in payload.items():
        assert stored.get(k) == v, f"{k} : attendu {v}, obtenu {stored.get(k)}"
    # Validation : tous les champs obligatoires sont renseignés → liste vide
    assert stored["_missing_for_invoice"] == []


def test_org_legal_missing_fields_prevent_invoice_validation(client):
    """Un champ obligatoire vide → apparaît dans _missing_for_invoice."""
    # Écrase le SIREN
    r = client.put("/org/legal", json={"siren": ""})
    assert r.status_code == 200
    missing = r.json()["_missing_for_invoice"]
    assert "siren" in missing, f"siren doit apparaître dans les manquants : {missing}"
    # Réparation
    r = client.put("/org/legal", json={"siren": "123456789"})
    assert "siren" not in r.json()["_missing_for_invoice"]


def test_org_legal_forbidden_for_commercial():
    """Un commercial ne doit pas pouvoir modifier les mentions légales."""
    commercial = {"email": "commercial.demo@bevidcrm.fr", "password": "Commercial!2026Demo"}
    with httpx.Client(base_url=API, timeout=30.0) as c:
        r = c.post("/auth/login", json=commercial)
        assert r.status_code == 200
        c.headers["Authorization"] = f"Bearer {r.json()['token']}"
        r = c.put("/org/legal", json={"legal_name": "Hack SAS"})
        assert r.status_code == 403


def test_internal_alloc_endpoint_forbidden_for_commercial():
    commercial = {"email": "commercial.demo@bevidcrm.fr", "password": "Commercial!2026Demo"}
    with httpx.Client(base_url=API, timeout=30.0) as c:
        r = c.post("/auth/login", json=commercial)
        assert r.status_code == 200
        c.headers["Authorization"] = f"Bearer {r.json()['token']}"
        r = c.post("/_internal/allocate-doc-number", json={"doc_type": "facture"})
        assert r.status_code == 403
