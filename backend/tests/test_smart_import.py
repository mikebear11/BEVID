"""Tests du module smart_import — 3 fichiers de test comme demandé par le spec."""
import io
import pytest
from openpyxl import Workbook

from smart_import import (
    sniff_file, read_csv_rows, read_xlsx_rows,
    detect_columns, clean_row, normalize_phone_fr,
    normalize_email, normalize_postal_code, normalize_name,
    split_address_if_possible, dup_confidence,
)


# --- Test 1 : CSV FR avec `;`, encoding Windows-1252, colonnes désordonnées ---
def test_sniff_csv_fr_latin1_semicolon():
    payload = "NOM DU BAR;Tel;CP ville\nCafé du Coin;06.12.34.56.78;75014 Paris\n"
    data = payload.encode("windows-1252")
    r = sniff_file(data, "clients_marc.csv")
    assert r.kind == "csv"
    assert r.separator == ";"
    # windows-1252 ou compatible latin-1 accepté
    assert (r.encoding or "").lower() in ("windows-1252", "iso-8859-1", "latin-1")


def test_detect_columns_by_header():
    headers = ["NOM DU BAR", "Tel", "email pro", "cp"]
    rows = [{"NOM DU BAR": "Le Palace", "Tel": "0612345678", "email pro": "a@b.fr", "cp": "75014"}]
    dets = detect_columns(headers, rows)
    field_map = {d.header: d.field for d in dets}
    assert field_map["NOM DU BAR"] == "nom"
    assert field_map["Tel"] == "telephone"
    assert field_map["email pro"] == "email"
    assert field_map["cp"] == "code_postal"


# --- Test 2 : XLSX sans en-tête utile (Colonne1, Colonne2…) ---
def test_detect_columns_by_content_no_header():
    headers = ["Colonne1", "Colonne2", "Colonne3", "Colonne4"]
    rows = [
        {"Colonne1": "Le Palace", "Colonne2": "0612345678", "Colonne3": "12345678901234", "Colonne4": "75014"},
        {"Colonne1": "Le Sunset", "Colonne2": "0687654321", "Colonne3": "98765432109876", "Colonne4": "75001"},
        {"Colonne1": "Le Bar 33", "Colonne2": "0623456789", "Colonne3": "11111111111111", "Colonne4": "33000"},
    ]
    dets = detect_columns(headers, rows)
    field_map = {d.header: d.field for d in dets}
    assert field_map["Colonne2"] == "telephone"
    assert field_map["Colonne3"] == "siret"
    assert field_map["Colonne4"] == "code_postal"


# --- Test 3 : nettoyage téléphones et CP amputés du zéro ---
@pytest.mark.parametrize("raw,expected,valid", [
    ("06.12.34.56.78", "+33 6 12 34 56 78", True),
    ("06 12 34 56 78", "+33 6 12 34 56 78", True),
    ("0612345678", "+33 6 12 34 56 78", True),
    ("+33612345678", "+33 6 12 34 56 78", True),
    ("+33 6 12 34 56 78", "+33 6 12 34 56 78", True),
    ("0033612345678", "+33 6 12 34 56 78", True),
    ("123", "123", False),  # invalide, conservé
])
def test_normalize_phone(raw, expected, valid):
    out, ok = normalize_phone_fr(raw)
    assert out == expected
    assert ok == valid


def test_normalize_postal_code_leading_zero():
    # Excel a mangé le zéro sur Corse et Ain
    assert normalize_postal_code("1400") == ("01400", True)
    assert normalize_postal_code("20200") == ("20200", True)
    assert normalize_postal_code("75014") == ("75014", True)


def test_normalize_email_lowercase():
    assert normalize_email("Contact@Bar.FR") == ("contact@bar.fr", True)
    assert normalize_email("pas-un-email") == ("pas-un-email", False)


def test_normalize_name_sigles_and_particles():
    # La casse titre standard de "CAFE" n'a pas d'accent — le fichier source
    # n'en a pas non plus, on ne l'invente pas. On teste la structure : sigles
    # préservés, particules en minuscules.
    assert normalize_name("LE CAFE DES SPORTS") == "Le Cafe des Sports"
    assert normalize_name("SARL JLM") == "SARL JLM"
    assert normalize_name("bar de la marine") == "Bar de la Marine"


def test_split_address_if_possible():
    r = split_address_if_possible("12 rue de la Paix 75001 Paris")
    assert r == {"adresse": "12 rue de la Paix", "code_postal": "75001", "ville": "Paris"}
    assert split_address_if_possible("Pas d'adresse") is None


def test_clean_row_traces_corrections():
    mapping = {"NOM": "nom", "TEL": "telephone", "CP": "code_postal"}
    raw = {"NOM": "CAFE DU CENTRE", "TEL": "06.12.34.56.78", "CP": "1400"}
    cleaned, corrections = clean_row(raw, mapping)
    assert cleaned == {"nom": "Cafe du Centre", "telephone": "+33 6 12 34 56 78", "code_postal": "01400"}
    # 3 corrections tracées
    assert {c["field"] for c in corrections} == {"nom", "telephone", "code_postal"}


def test_dup_confidence_siret_certain():
    a = {"siret": "12345678901234", "nom": "A"}
    b = {"siret": "12345678901234", "nom": "B"}
    level, score = dup_confidence(a, b)
    assert level == "certain"
    assert score == 1.0


def test_dup_confidence_no_match():
    a = {"siret": "1", "nom": "Alpha"}
    b = {"siret": "2", "nom": "Beta"}
    assert dup_confidence(a, b) == ("", 0.0)


def test_xlsx_read_streaming():
    wb = Workbook()
    ws = wb.active
    ws.title = "Clients"
    ws.append(["NOM", "TEL", "CP"])
    ws.append(["Bar Bleu", "0612345678", "75014"])
    buf = io.BytesIO()
    wb.save(buf)
    data = buf.getvalue()
    r = sniff_file(data, "test.xlsx")
    assert r.kind == "xlsx"
    assert "Clients" in r.sheets
    rows = list(read_xlsx_rows(data, "Clients"))
    assert len(rows) == 1
    _, row, headers = rows[0]
    assert row["NOM"] == "Bar Bleu"
    assert headers == ["NOM", "TEL", "CP"]
