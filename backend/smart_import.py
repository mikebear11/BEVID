"""Import intelligent des fichiers clients existants.

Objectif : accepter n'importe quel CSV/XLSX/XLS venant du terrain et le
transformer en `establishments` sans exiger un format.

Pipeline en trois passes :
  1. `sniff_file(bytes, filename)` : détecte l'encodage, le séparateur CSV
     ou les feuilles XLSX. Retourne un `SniffResult`.
  2. `detect_columns(rows, headers)` : mappe chaque colonne du fichier vers
     un champ interne (nom, siret, siren, adresse, code_postal, ville,
     telephone, email, contact, type, notes). Deux couches — intitulé
     et contenu — avec un niveau de certitude par colonne.
  3. `clean_and_normalize(row, mapping)` : téléphones au format E.164 FR,
     emails minuscules, noms en casse titre avec préservation des sigles,
     codes postaux à 5 chiffres avec zéro initial restauré. Toute correction
     est tracée pour l'aperçu.

Module autonome — pas d'accès Mongo direct. Les endpoints (dans server.py)
appellent ces fonctions puis persistent. Cela garantit une couverture par
tests unitaires sans base.
"""
from __future__ import annotations

import csv
import io
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

try:
    import chardet  # noqa
except ImportError:  # pragma: no cover
    chardet = None

try:
    from openpyxl import load_workbook
except ImportError:  # pragma: no cover
    load_workbook = None

try:
    from rapidfuzz import fuzz  # noqa
except ImportError:  # pragma: no cover
    fuzz = None


# =============================================================
# 1. Sniff — détection encodage / séparateur / feuille
# =============================================================
@dataclass
class SniffResult:
    kind: str  # "csv" | "xlsx" | "paste"
    encoding: Optional[str] = None
    separator: Optional[str] = None
    sheets: List[str] = field(default_factory=list)
    active_sheet: Optional[str] = None
    warnings: List[str] = field(default_factory=list)


def _looks_like_xlsx(data: bytes, filename: str) -> bool:
    return filename.lower().endswith((".xlsx", ".xls")) or data[:4] == b"PK\x03\x04"


def sniff_file(data: bytes, filename: str) -> SniffResult:
    """Renvoie un `SniffResult` décrivant le fichier téléversé.

    Ne lit pas les lignes ; identifie uniquement le format. Les appelants
    itèrent ensuite via `read_csv_rows` ou `read_xlsx_rows` en streaming.
    """
    if _looks_like_xlsx(data, filename):
        if load_workbook is None:
            raise RuntimeError("openpyxl absent")
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        sheets = wb.sheetnames
        return SniffResult(kind="xlsx", sheets=sheets, active_sheet=sheets[0] if sheets else None)

    # CSV : détection encoding puis séparateur
    encoding = "utf-8"
    if chardet is not None:
        guess = chardet.detect(data[:8192]) or {}
        candidate = (guess.get("encoding") or "").lower()
        if candidate:
            # Excel FR exporte majoritairement en Windows-1252. Chardet
            # confond souvent avec Windows-1250 (Europe centrale) ou Latin-1
            # sur de courts échantillons : on force le mapping FR pour ces
            # deux cas qui recouvrent 95 % des CSV français réels.
            if candidate in ("iso-8859-1", "latin-1", "windows-1250", "windows-1252", "cp1252"):
                encoding = "windows-1252"
            else:
                encoding = candidate
    try:
        sample = data[:4096].decode(encoding, errors="replace")
    except Exception:
        sample = data[:4096].decode("utf-8", errors="replace")

    sniffer = csv.Sniffer()
    sep = ","
    try:
        dialect = sniffer.sniff(sample, delimiters=";,|\t")
        sep = dialect.delimiter
    except csv.Error:
        # Heuristique de secours : le CSV FR utilise majoritairement `;`
        # dès qu'il apparaît autant ou plus que `,` dans les 4 Ko d'échantillon.
        if sample.count(";") >= max(1, sample.count(",")):
            sep = ";"
    return SniffResult(kind="csv", encoding=encoding, separator=sep)


def read_csv_rows(data: bytes, encoding: str, sep: str, max_rows: int = 5000):
    """Générateur `(index, row_dict)` — flux ligne à ligne, jamais tout en mémoire."""
    text = data.decode(encoding, errors="replace")
    reader = csv.reader(io.StringIO(text), delimiter=sep)
    headers: List[str] = []
    for i, row in enumerate(reader):
        if i == 0:
            headers = [(c or f"Colonne{ix+1}").strip() for ix, c in enumerate(row)]
            continue
        if i > max_rows:
            break
        # Ignorer lignes entièrement vides
        if not any((c or "").strip() for c in row):
            continue
        d = {headers[j] if j < len(headers) else f"Colonne{j+1}": (row[j] if j < len(row) else "") for j in range(max(len(headers), len(row)))}
        yield i, d, headers


def read_xlsx_rows(data: bytes, sheet_name: str, max_rows: int = 5000):
    """Générateur `(index, row_dict, headers)` pour une feuille XLSX."""
    if load_workbook is None:
        raise RuntimeError("openpyxl absent")
    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb[sheet_name]
    headers: List[str] = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            headers = [(str(c) if c is not None else f"Colonne{ix+1}").strip() for ix, c in enumerate(row)]
            continue
        if i > max_rows:
            break
        if not any((str(c).strip() if c is not None else "") for c in row):
            continue
        d = {headers[j] if j < len(headers) else f"Colonne{j+1}": (str(row[j]) if row[j] is not None else "") for j in range(max(len(headers), len(row)))}
        yield i, d, headers


# =============================================================
# 2. Détection colonnes — intitulés puis contenu
# =============================================================
INTERNAL_FIELDS = [
    "nom", "siret", "siren", "adresse", "code_postal", "ville",
    "telephone", "email", "contact", "type", "notes",
]

# Synonymes normalisés (accents et casse retirés).
SYNONYMS: Dict[str, List[str]] = {
    "nom": ["nom", "raisonsociale", "etablissement", "client", "enseigne", "bar", "societe", "name", "companyname", "denomination", "nomdubar"],
    "siret": ["siret", "nsiret", "numerosiret"],
    "siren": ["siren", "nsiren", "numerosiren"],
    "adresse": ["adresse", "adresse1", "rue", "address", "streetaddress"],
    "code_postal": ["cp", "codepostal", "zip", "postalcode", "postal", "zipcode"],
    "ville": ["ville", "commune", "city", "town", "localite"],
    "telephone": ["tel", "telephone", "portable", "mobile", "gsm", "phone", "phonenumber", "numero"],
    "email": ["email", "mail", "courriel", "emailpro"],
    "contact": ["contact", "interlocuteur", "gerant", "responsable", "patron", "referent"],
    "type": ["type", "categorie", "segment", "canal", "typologie"],
    "notes": ["notes", "remarques", "commentaire", "observations", "commentaires"],
}


def _norm_header(s: str) -> str:
    """Enlève accents, ponctuation, espaces et met en minuscules."""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "", s)


def _score_by_header(header: str) -> Optional[Tuple[str, float]]:
    """Renvoie `(field, certitude)` si l'intitulé matche un synonyme."""
    n = _norm_header(header)
    if not n:
        return None
    for fname, syns in SYNONYMS.items():
        for s in syns:
            if n == s:
                return fname, 1.0
        for s in syns:
            if s in n or n in s:
                return fname, 0.75
    return None


# Regex compilés une fois pour l'inférence par contenu.
_RE_DIGITS = re.compile(r"\D+")
_RE_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")
_RE_DATE = re.compile(r"^\d{1,4}[-/.]\d{1,2}([-/.]\d{1,4})?$")


def _sample_infer(field_name: str, samples: List[str]) -> float:
    """Retourne un score [0..1] indiquant la probabilité que la colonne
    corresponde à `field_name` d'après le contenu."""
    non_empty = [s for s in samples if s and str(s).strip()]
    if not non_empty:
        return 0.0
    n = len(non_empty)

    if field_name == "email":
        hits = sum(1 for s in non_empty if _RE_EMAIL.match(str(s).strip()))
        return hits / n

    if field_name == "telephone":
        hits = 0
        for s in non_empty:
            digits = _RE_DIGITS.sub("", str(s))
            if 9 <= len(digits) <= 13 and (digits.startswith("0") or digits.startswith("33") or digits.startswith("330")):
                hits += 1
        return hits / n

    if field_name == "siret":
        hits = sum(1 for s in non_empty if len(_RE_DIGITS.sub("", str(s))) == 14)
        return hits / n

    if field_name == "siren":
        hits = sum(1 for s in non_empty if len(_RE_DIGITS.sub("", str(s))) == 9)
        return hits / n

    if field_name == "code_postal":
        hits = sum(1 for s in non_empty if 4 <= len(_RE_DIGITS.sub("", str(s))) <= 5 and str(s).strip().replace(".0", "").isdigit())
        return hits / n

    if field_name == "type":
        # Faible cardinalité (petit ensemble de valeurs répétées).
        distinct = len(set(str(s).strip().lower() for s in non_empty))
        if distinct == 0 or n < 3:
            return 0.0
        ratio = distinct / n
        return 0.8 if ratio <= 0.3 else 0.0

    return 0.0


@dataclass
class ColumnDetection:
    header: str
    field: Optional[str]          # champ interne, None si ignoré
    certainty: float              # 0..1
    source: str                   # "header" | "content" | "none" | "user"
    samples: List[str] = field(default_factory=list)


def detect_columns(headers: List[str], sample_rows: List[Dict[str, str]]) -> List[ColumnDetection]:
    """Renvoie une détection par colonne.

    Priorité : intitulé > contenu. Ne renvoie jamais deux colonnes pour le
    même champ (une seule gagne, l'autre passe en None avec certainty=0).
    """
    detections: List[ColumnDetection] = []
    taken: Dict[str, ColumnDetection] = {}  # field -> best detection

    for h in headers:
        samples = [str(r.get(h, "") or "").strip() for r in sample_rows[:50]]
        det = ColumnDetection(header=h, field=None, certainty=0.0, source="none", samples=samples[:3])

        # Couche 1 — intitulé
        hit = _score_by_header(h)
        if hit:
            det.field, det.certainty, det.source = hit[0], hit[1], "header"

        # Couche 2 — inférence par contenu si l'intitulé n'a rien donné
        # ou si le score par intitulé est faible (<0.9).
        if det.certainty < 0.9:
            best_field, best_score = None, 0.0
            for fname in INTERNAL_FIELDS:
                sc = _sample_infer(fname, samples)
                if sc > best_score:
                    best_field, best_score = fname, sc
            if best_field and best_score >= 0.6 and best_score > det.certainty:
                det.field, det.certainty, det.source = best_field, best_score, "content"

        # Résolution des conflits : le score le plus haut gagne le champ.
        if det.field:
            prev = taken.get(det.field)
            if prev is None or det.certainty > prev.certainty:
                if prev is not None:
                    prev.field, prev.certainty, prev.source = None, 0.0, "none"
                taken[det.field] = det

        detections.append(det)
    return detections


# =============================================================
# 3. Nettoyage — téléphones, emails, noms, CP
# =============================================================
_SIGLE_UPPER = {"SARL", "SAS", "SASU", "SA", "SCI", "EURL", "SNC", "GAEC", "SCOP", "ASBL", "ONG", "TVA", "BP", "CS", "ZA", "ZI", "ZAC", "SICA"}
_PARTICULES = {"de", "du", "des", "le", "la", "les", "l'", "d'", "au", "aux", "à", "et", "en", "un", "une"}
_FR_COMMON_WORDS = _PARTICULES  # sera étendu plus bas



def normalize_phone_fr(raw: str) -> Tuple[str, bool]:
    """Renvoie `(formatted, is_valid)`. Format cible : `+33 6 12 34 56 78`.

    Ne perd jamais la valeur d'origine. En cas d'invalidité, `is_valid=False`
    et la valeur normalisée retourne la saisie initiale nettoyée d'espaces.
    """
    if not raw:
        return "", False
    digits = re.sub(r"\D+", "", str(raw))
    if digits.startswith("0033"):
        digits = "33" + digits[4:]
    if digits.startswith("33") and len(digits) == 11:
        rest = digits[2:]  # 9 chiffres restants
    elif digits.startswith("0") and len(digits) == 10:
        rest = digits[1:]
    else:
        return str(raw).strip(), False
    if not rest.startswith(("1", "2", "3", "4", "5", "6", "7", "8", "9")):
        return str(raw).strip(), False
    grouped = " ".join([rest[0], rest[1:3], rest[3:5], rest[5:7], rest[7:9]])
    return f"+33 {grouped}", True


def normalize_email(raw: str) -> Tuple[str, bool]:
    if not raw:
        return "", False
    v = str(raw).strip().replace(" ", "").lower()
    return v, bool(_RE_EMAIL.match(v))


def normalize_postal_code(raw: str) -> Tuple[str, bool]:
    """Restaure le zéro initial mangé par Excel (Corse 20xxx, Ain 01xxx)."""
    if not raw:
        return "", False
    s = str(raw).strip().replace(".0", "")
    digits = re.sub(r"\D+", "", s)
    if not digits:
        return s, False
    if len(digits) == 4:
        digits = "0" + digits
    return digits.zfill(5)[:5], len(digits) == 5


_PARTICULES = {"de", "du", "des", "le", "la", "les", "l'", "d'", "au", "aux", "à", "et", "en", "un", "une"}
_FR_COMMON_WORDS = _PARTICULES | {
    "cafe", "bar", "restaurant", "brasserie", "hotel", "bistrot", "pub", "club", "salon",
    "sports", "sport", "cave", "vin", "vins", "bieres", "chateau", "maison", "chez",
    "grand", "grande", "petit", "petite", "nouveau", "nouvelle", "vieux", "vieille",
    "centre", "rue", "place", "port", "gare", "marche", "marches",
}


def normalize_name(raw: str) -> str:
    """Casse titre en respectant particules, mots communs et sigles.

    Deux modes selon la source :
      - Source ENTIÈREMENT en majuscules (« LE CAFE DES SPORTS ») → casse
        titre appliquée aux mots courants FR ; les autres courts (≤4) restent
        en majuscules (protection acronyme dans les sigles « SARL JLM »).
      - Source à casse mixte → tout mot uppercase de 2+ chars est conservé.
    """
    if not raw:
        return ""
    s = str(raw).strip()
    all_upper = s.isupper()
    words = re.split(r"(\s+)", s)
    result = []
    for i, w in enumerate(words):
        if not w or w.isspace():
            result.append(w)
            continue
        if w.upper() in _SIGLE_UPPER:
            result.append(w.upper())
            continue
        lower = w.lower()
        if all_upper:
            # Mot commun FR (bar, cafe, sports…) → casse titre + particules mini.
            if lower in _FR_COMMON_WORDS:
                if i > 0 and lower in _PARTICULES:
                    result.append(lower)
                else:
                    result.append(lower.capitalize())
                continue
            # Sinon : mot court (≤4 lettres) all-caps dans une source all-caps
            # → probablement un acronyme (JLM, ADT). Préservé.
            if len(w) <= 4 and w.isalpha():
                result.append(w)
                continue
            # Long mot inconnu en all-caps → casse titre par défaut.
            result.append(lower.capitalize())
            continue
        # Casse mixte : préserve les uppercase 2+
        if len(w) >= 2 and w.isupper() and w.isalpha():
            result.append(w)
            continue
        if i > 0 and lower in _PARTICULES:
            result.append(lower)
            continue
        result.append("-".join(p.capitalize() for p in lower.split("-")))
    return "".join(result)


_ADDRESS_ONE_CELL = re.compile(r"^(?P<street>.+?)\s+(?P<cp>\d{5})\s+(?P<city>.+)$")


def split_address_if_possible(raw: str) -> Optional[Dict[str, str]]:
    """Si `raw` ressemble à « 12 rue X 75001 Paris », renvoie
    `{adresse, code_postal, ville}`. Sinon `None` — on ne découpe pas au hasard."""
    if not raw:
        return None
    m = _ADDRESS_ONE_CELL.match(str(raw).strip())
    if not m:
        return None
    return {"adresse": m.group("street").strip(), "code_postal": m.group("cp"), "ville": m.group("city").strip().title()}


def clean_row(raw: Dict[str, str], mapping: Dict[str, str]) -> Tuple[Dict[str, Any], List[Dict[str, str]]]:
    """Applique le nettoyage à une ligne en respectant `mapping[header] = field`.

    Retourne `(cleaned_row, corrections)`. `corrections` = liste de
    `{field, original, cleaned, valid}` pour l'aperçu tracé.
    """
    cleaned: Dict[str, Any] = {}
    corrections: List[Dict[str, str]] = []

    for header, raw_value in raw.items():
        field = mapping.get(header)
        if not field:
            continue  # colonne non mappée : on ne stocke pas « au cas où »
        original = str(raw_value or "").strip()
        if not original:
            continue

        if field == "telephone":
            norm, ok = normalize_phone_fr(original)
            cleaned["telephone"] = norm
            if norm != original:
                corrections.append({"field": "telephone", "original": original, "cleaned": norm, "valid": ok})
        elif field == "email":
            norm, ok = normalize_email(original)
            cleaned["email"] = norm
            if norm != original:
                corrections.append({"field": "email", "original": original, "cleaned": norm, "valid": ok})
        elif field == "code_postal":
            norm, ok = normalize_postal_code(original)
            cleaned["code_postal"] = norm
            if norm != original:
                corrections.append({"field": "code_postal", "original": original, "cleaned": norm, "valid": ok})
        elif field == "nom":
            norm = normalize_name(original)
            cleaned["nom"] = norm
            if norm != original:
                corrections.append({"field": "nom", "original": original, "cleaned": norm, "valid": True})
        elif field == "adresse":
            split = split_address_if_possible(original)
            if split and "code_postal" not in cleaned and "ville" not in cleaned:
                cleaned.update(split)
                corrections.append({"field": "adresse", "original": original, "cleaned": f"{split['adresse']} · {split['code_postal']} {split['ville']}", "valid": True})
            else:
                cleaned["adresse"] = original
        elif field in ("siret", "siren"):
            digits = re.sub(r"\D+", "", original)
            cleaned[field] = digits
            if digits != original:
                corrections.append({"field": field, "original": original, "cleaned": digits, "valid": (len(digits) == 14 if field == "siret" else len(digits) == 9)})
        else:
            cleaned[field] = original

    return cleaned, corrections


# =============================================================
# 4. Doublons — dans le fichier + contre la base
# =============================================================
def dup_confidence(row_a: Dict[str, Any], row_b: Dict[str, Any]) -> Tuple[str, float]:
    """Renvoie `(niveau, score)` :
       - "certain" (1.0) si SIRET identique
       - "very_likely" (0.9) si SIREN+ville identiques
       - "likely" (0.8) si email identique
       - "likely" (0.75) si nom normalisé + code postal identiques
       - "possible" (0.6) si téléphone identique
       - "to_confirm" (0.5..0.7) si nom approchant + même ville
       - "" (0.0) sinon
    """
    a_siret = (row_a.get("siret") or "").strip()
    b_siret = (row_b.get("siret") or "").strip()
    if a_siret and a_siret == b_siret:
        return "certain", 1.0

    a_siren = (row_a.get("siren") or "").strip()
    b_siren = (row_b.get("siren") or "").strip()
    a_city = (row_a.get("ville") or "").strip().lower()
    b_city = (row_b.get("ville") or "").strip().lower()
    if a_siren and a_siren == b_siren and a_city and a_city == b_city:
        return "very_likely", 0.9

    a_email = (row_a.get("email") or "").strip().lower()
    b_email = (row_b.get("email") or "").strip().lower()
    if a_email and a_email == b_email:
        return "likely", 0.8

    a_name_n = _norm_header(row_a.get("nom") or "")
    b_name_n = _norm_header(row_b.get("nom") or "")
    a_cp = (row_a.get("code_postal") or "").strip()
    b_cp = (row_b.get("code_postal") or "").strip()
    if a_name_n and a_name_n == b_name_n and a_cp and a_cp == b_cp:
        return "likely", 0.75

    a_phone = (row_a.get("telephone") or "").strip()
    b_phone = (row_b.get("telephone") or "").strip()
    if a_phone and a_phone == b_phone:
        return "possible", 0.6

    if a_name_n and b_name_n and a_city and a_city == b_city and fuzz is not None:
        ratio = fuzz.ratio(a_name_n, b_name_n) / 100.0
        if ratio >= 0.9:
            return "to_confirm", ratio * 0.7
    return "", 0.0
