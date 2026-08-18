"""Parseurs de relevés bancaires — CSV libre, CAMT.053, CFONB 120.

Chaque parseur renvoie une liste de dicts uniformes :
    {
        "external_id": str,  # id unique fourni par la source (idempotence)
        "value_date": ISO date str,
        "operation_date": ISO date str | None,
        "amount": float,  # signé (négatif = débit, positif = crédit)
        "currency": "EUR",
        "counterparty_name": str,  # normalisé
        "counterparty_iban": str | None,  # rarement présent en CAMT.053 FR (voir 4.3)
        "label": str,  # libellé brut de la remise
        "reference": str | None,  # RF... ou EndToEndId
        "raw": dict,  # bloc source complet pour audit
    }
"""
import csv
import hashlib
import io
import re
from datetime import datetime
from xml.etree import ElementTree as ET

from .validators import normalize_name


def _hash_line(*parts) -> str:
    h = hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()
    return h[:24]


# ------------------------------------------------------------------
# CSV libre — colonnes: date, libellé, montant [, référence]
# ------------------------------------------------------------------
def parse_csv(content: bytes, filename: str = "") -> list[dict]:
    text = content.decode("utf-8-sig", errors="replace")
    # détection auto délimiteur
    sample = text[:2048]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=[",", ";", "\t", "|"])
    except csv.Error:
        class _D(csv.Dialect):
            delimiter = ";"; quotechar = '"'; doublequote = True
            skipinitialspace = True; lineterminator = "\n"; quoting = csv.QUOTE_MINIMAL
        dialect = _D()
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    out = []
    for i, row in enumerate(reader):
        # normalise clés (lowercase + strip accents/spaces)
        norm = {re.sub(r"[^a-z0-9]", "", (k or "").lower()): (v or "").strip() for k, v in row.items()}
        date = norm.get("date") or norm.get("dateoperation") or norm.get("datevaleur") or ""
        vdate = norm.get("datevaleur") or date
        label = norm.get("libelle") or norm.get("libell") or norm.get("libell") or norm.get("description") or ""
        # montant : accepte "1 234,56" ou "-45.00" ou séparé débit/crédit
        raw_amount = norm.get("montant") or norm.get("amount") or ""
        if not raw_amount:
            debit = norm.get("debit") or ""
            credit = norm.get("credit") or ""
            if credit:
                raw_amount = credit
            elif debit:
                raw_amount = "-" + debit.lstrip("-")
        amount = _parse_money(raw_amount)
        ref = norm.get("reference") or norm.get("ref") or None
        out.append({
            "external_id": _hash_line(filename, i, date, label, amount),
            "value_date": _parse_date(vdate) or _parse_date(date) or "",
            "operation_date": _parse_date(date) or "",
            "amount": amount,
            "currency": "EUR",
            "counterparty_name": normalize_name(label[:120]),
            "counterparty_iban": None,
            "label": label,
            "reference": ref,
            "raw": row,
        })
    return out


# ------------------------------------------------------------------
# CAMT.053 ISO 20022 — XML
# ------------------------------------------------------------------
_NS = {"c": "urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"}


def _try_parse_camt(content: bytes) -> ET.Element | None:
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return None
    # accepte tout namespace camt.053.*
    tag = root.tag
    if "camt.053" not in tag and root.find(".//*[local-name()='Stmt']") is None:
        # essaie sans namespace
        pass
    return root


def parse_camt053(content: bytes, filename: str = "") -> list[dict]:
    root = _try_parse_camt(content)
    if root is None:
        raise ValueError("XML CAMT.053 invalide")

    def xp(elem, path):
        """XPath qui ignore le namespace."""
        parts = path.strip("/").split("/")
        current = [elem]
        for p in parts:
            nxt = []
            for c in current:
                nxt.extend([e for e in c.iter() if e.tag.endswith("}" + p) or e.tag == p])
                # limite à enfants directs si possible
            current = nxt
        return current

    def find_first(elem, name) -> str | None:
        for e in elem.iter():
            if e.tag.endswith("}" + name) or e.tag == name:
                return (e.text or "").strip() or None
        return None

    def find_all(elem, name):
        return [e for e in elem.iter() if e.tag.endswith("}" + name) or e.tag == name]

    out = []
    for i, ntry in enumerate(find_all(root, "Ntry")):
        amount_el = None
        for e in ntry.iter():
            if e.tag.endswith("}Amt") or e.tag == "Amt":
                amount_el = e
                break
        amount = float(amount_el.text or 0) if amount_el is not None else 0.0
        currency = (amount_el.get("Ccy") if amount_el is not None else "EUR") or "EUR"
        cdt_dbt = find_first(ntry, "CdtDbtInd") or ""
        if cdt_dbt == "DBIT":
            amount = -abs(amount)
        else:
            amount = abs(amount)
        val_dt = find_first(ntry, "Dt") or ""
        bookg_dt = None
        for e in ntry.iter():
            if e.tag.endswith("}BookgDt") or e.tag == "BookgDt":
                for c in e.iter():
                    if c.tag.endswith("}Dt") or c.tag == "Dt":
                        bookg_dt = (c.text or "").strip()
                        break
                break
        label_parts = []
        for name in ("AddtlNtryInf", "Ustrd", "RmtInf", "AddtlTxInf"):
            for e in ntry.iter():
                if e.tag.endswith("}" + name) or e.tag == name:
                    txt = "".join(e.itertext()).strip()
                    if txt and txt not in label_parts:
                        label_parts.append(txt)
        label = " · ".join(label_parts)[:300] if label_parts else ""
        # contrepartie
        cp_name = None
        cp_iban = None
        for e in ntry.iter():
            tag = e.tag.split("}")[-1] if "}" in e.tag else e.tag
            if tag == "Dbtr" and amount > 0:  # crédit : donneur d'ordre = payeur
                for c in e.iter():
                    if (c.tag.endswith("}Nm") or c.tag == "Nm") and not cp_name:
                        cp_name = (c.text or "").strip()
                        break
            if tag == "Cdtr" and amount < 0:  # débit : bénéficiaire
                for c in e.iter():
                    if (c.tag.endswith("}Nm") or c.tag == "Nm") and not cp_name:
                        cp_name = (c.text or "").strip()
                        break
        # référence structurée
        ref = None
        for name in ("Ref", "EndToEndId", "CdtrRefInf"):
            for e in ntry.iter():
                if e.tag.endswith("}" + name) or e.tag == name:
                    txt = "".join(e.itertext()).strip()
                    if txt.startswith("RF") and len(txt) >= 5:
                        ref = txt
                        break
            if ref:
                break
        ntry_ref = find_first(ntry, "NtryRef") or find_first(ntry, "AcctSvcrRef") or ""
        ext_id = ntry_ref or _hash_line(filename, i, val_dt, label, amount)
        out.append({
            "external_id": ext_id,
            "value_date": val_dt,
            "operation_date": bookg_dt or val_dt,
            "amount": amount,
            "currency": currency,
            "counterparty_name": normalize_name(cp_name or label[:120]),
            "counterparty_iban": cp_iban,
            "label": label,
            "reference": ref,
            "raw": {"ntry_ref": ntry_ref, "cp_name_raw": cp_name},
        })
    return out


# ------------------------------------------------------------------
# CFONB 120 — bande caractères fixes, banques françaises legacy
# ------------------------------------------------------------------
def parse_cfonb120(content: bytes, filename: str = "") -> list[dict]:
    text = content.decode("cp1252", errors="replace")
    lines = [l for l in text.splitlines() if len(l) >= 120]
    out = []
    idx = 0
    for line in lines:
        code = line[0:2]
        if code != "04":  # 04 = mouvement (01=solde initial, 07=solde final, 05=complément)
            continue
        # positions officielles CFONB 120 (1-indexed dans la doc → 0-indexed ici)
        date_str = line[34:40].strip()  # JJMMAA
        # amount : positions 91-104 (14 chars), signe C11 ou D11 en dernier
        amount_str = line[90:104].strip()
        label = line[104:135].strip() if len(line) >= 135 else line[104:].strip()
        try:
            date = datetime.strptime(date_str, "%d%m%y").strftime("%Y-%m-%d")
        except ValueError:
            date = ""
        # signe : dernier caractère lettre (A-I=positif, J-R=négatif)
        try:
            last = amount_str[-1]
            num = amount_str[:-1]
            digits_map = "ABCDEFGHIJKLMNOPQR"
            if last in "ABCDEFGHI":
                last_digit = str(digits_map.index(last))
                sign = 1
            elif last in "JKLMNOPQR":
                last_digit = str(digits_map.index(last) - 9)
                sign = -1
            else:
                last_digit = "0"; sign = 1
            amount = sign * int(num + last_digit) / 100.0
        except Exception:
            amount = 0.0
        out.append({
            "external_id": _hash_line(filename, idx, date, label, amount),
            "value_date": date,
            "operation_date": date,
            "amount": amount,
            "currency": "EUR",
            "counterparty_name": normalize_name(label[:120]),
            "counterparty_iban": None,
            "label": label,
            "reference": None,
            "raw": {"cfonb_line": line[:60]},
        })
        idx += 1
    return out


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _parse_money(s: str) -> float:
    if not s:
        return 0.0
    s = s.strip().replace("\xa0", "").replace(" ", "")
    # format FR "1 234,56" ou EN "1,234.56"
    if "," in s and "." in s:
        # heuristique : dernier séparateur est décimal
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _parse_date(s: str) -> str | None:
    if not s:
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d/%m/%y", "%d.%m.%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def sniff_format(filename: str, content: bytes) -> str:
    """Retourne 'camt053', 'cfonb120', 'csv' ou lève ValueError."""
    fn = (filename or "").lower()
    if fn.endswith(".xml") or content[:200].lstrip().startswith(b"<?xml") or b"camt.053" in content[:2000].lower():
        return "camt053"
    # CFONB 120 : lignes de 120 chars commençant par 01/04/05/07
    first = content[:200].decode("cp1252", errors="ignore").splitlines()
    if first and len(first[0]) >= 120 and first[0][:2] in ("01", "04", "05", "07"):
        return "cfonb120"
    if fn.endswith(".csv") or b"," in content[:200] or b";" in content[:200]:
        return "csv"
    raise ValueError("Format inconnu")


PARSERS = {
    "csv": parse_csv,
    "camt053": parse_camt053,
    "cfonb120": parse_cfonb120,
}
