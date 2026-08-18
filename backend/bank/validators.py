"""Validators bancaires — IBAN mod-97, SIRET/SIREN Luhn, référence RF ISO 11649."""
import re

IBAN_LEN = {
    "FR": 27, "MC": 27, "BE": 16, "DE": 22, "ES": 24, "IT": 27, "LU": 20,
    "NL": 18, "PT": 25, "CH": 21, "GB": 22, "IE": 22, "AT": 20,
}


def clean_iban(iban: str) -> str:
    return re.sub(r"\s+", "", (iban or "")).upper()


def is_valid_iban(iban: str) -> bool:
    iban = clean_iban(iban)
    if not iban or len(iban) < 15 or len(iban) > 34:
        return False
    if not re.match(r"^[A-Z]{2}\d{2}[A-Z0-9]+$", iban):
        return False
    cc = iban[:2]
    expected = IBAN_LEN.get(cc)
    if expected and len(iban) != expected:
        return False
    rearranged = iban[4:] + iban[:4]
    numeric = ""
    for ch in rearranged:
        numeric += str(ord(ch) - 55) if ch.isalpha() else ch
    try:
        return int(numeric) % 97 == 1
    except ValueError:
        return False


def is_valid_siren(siren: str) -> bool:
    """Luhn sur 9 chiffres."""
    s = re.sub(r"\s+", "", siren or "")
    if not s.isdigit() or len(s) != 9:
        return False
    total = 0
    for i, d in enumerate(reversed(s)):
        n = int(d)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def is_valid_siret(siret: str) -> bool:
    """Luhn sur 14 chiffres + SIREN(9 premiers) doit être valide."""
    s = re.sub(r"\s+", "", siret or "")
    if not s.isdigit() or len(s) != 14:
        return False
    if not is_valid_siren(s[:9]):
        return False
    # cas particulier La Poste 356 000 000 : dérogation Luhn — on l'accepte
    if s.startswith("356000000"):
        return sum(int(c) for c in s) % 5 == 0
    total = 0
    for i, d in enumerate(reversed(s)):
        n = int(d)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def is_valid_rf_reference(ref: str) -> bool:
    """Référence structurée ISO 11649 (RFXX...) — mod-97 sur ref+RF00 = 1."""
    ref = re.sub(r"\s+", "", (ref or "")).upper()
    if not re.match(r"^RF\d{2}[A-Z0-9]{1,21}$", ref):
        return False
    rearranged = ref[4:] + ref[:4]
    numeric = ""
    for ch in rearranged:
        numeric += str(ord(ch) - 55) if ch.isalpha() else ch
    try:
        return int(numeric) % 97 == 1
    except ValueError:
        return False


def normalize_name(name: str) -> str:
    """Normalise un nom pour rapprochement fuzzy (accents, casse, ponctuation, forme sociale)."""
    if not name:
        return ""
    s = name.upper()
    # remplace accents grossièrement
    trans = str.maketrans("ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ", "AAAAAACEEEEIIIINOOOOOUUUUY")
    s = s.translate(trans)
    # ponctuation → espace
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    # supprime formes sociales et sigles courants
    s = re.sub(r"\b(SARL|SAS|EURL|SASU|SA|SNC|SCI|SCEA|EARL|EI|EIRL|GAEC|SEP|SPA|LTD|LLC|GMBH)\b", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s
