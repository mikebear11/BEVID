#!/usr/bin/env python3
"""Extraction i18n : remplace tous les toast.X("literal") / toast.X(`tpl`) /
   toast.X(expr || "fallback") par toast.X(t("toast.slug")).
   Injecte les clés dans /app/frontend/src/lib/i18n.js (dict.fr + dict.en)."""
import re, unicodedata
from pathlib import Path

ROOT = Path("/app/frontend/src")
I18N_FILE = ROOT / "lib" / "i18n.js"

METHOD = r'(error|success|info|warning|message|loading)'

STATE = {"count": 0}

def slug(msg, taken):
    s = unicodedata.normalize('NFD', msg).encode('ascii', 'ignore').decode('ascii')
    s = re.sub(r'\$\{[^}]+\}', '', s)
    s = re.sub(r'[^a-zA-Z0-9]+', '_', s).strip('_').lower()
    s = re.sub(r'_+', '_', s)[:35] or 'msg'
    base = s; i = 2
    while f"toast.{s}" in taken:
        s = f"{base}_{i}"; i += 1
    return f"toast.{s}"

def template_to_key(msg):
    args = {}
    counter = {"i": 0}
    def repl(m):
        counter["i"] += 1
        name = f"v{counter['i']}"
        args[name] = m.group(1).strip()
        return "{" + name + "}"
    key_text = re.sub(r'\$\{([^}]+)\}', repl, msg)
    return key_text, args

def build_t_call(key, args):
    if not args:
        return f't("{key}")'
    parts = ", ".join(f"{k}: {v}" for k, v in args.items())
    return f't("{key}", {{ {parts} }})'

def has_t_import(src):
    return re.search(r'from\s+["\']@/lib/i18n["\']', src) is not None

def insert_t_import(src):
    lines = src.split("\n")
    last_import = -1
    for i, line in enumerate(lines):
        if line.startswith("import "):
            last_import = i
    if last_import >= 0:
        lines.insert(last_import + 1, 'import { t } from "@/lib/i18n";')
    else:
        lines.insert(0, 'import { t } from "@/lib/i18n";')
    return "\n".join(lines)

# ---- Charger clés existantes ---------------------------------
i18n_src = I18N_FILE.read_text()
existing_keys = set(re.findall(r'"(toast\.[a-z0-9_]+)"\s*:', i18n_src))
existing_fr = {}
for m in re.finditer(r'"(toast\.[a-z0-9_]+)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"', i18n_src):
    existing_fr[m.group(2)] = m.group(1)

new_keys_fr = {}

def add_key(fr_msg):
    if fr_msg in existing_fr:
        return existing_fr[fr_msg]
    for k, v in new_keys_fr.items():
        if v == fr_msg:
            return k
    key = slug(fr_msg, existing_keys | set(new_keys_fr.keys()))
    new_keys_fr[key] = fr_msg
    return key

per_file = []

for jsx in sorted(ROOT.rglob("*.jsx")):
    src = jsx.read_text()
    file_count = [0]

    # C) fallback: toast.X(<expr> || "...")
    def repl_fallback(m):
        method, expr, quote, msg = m.group(1), m.group(2), m.group(3), m.group(4)
        key = add_key(msg)
        file_count[0] += 1
        return f'toast.{method}({expr.rstrip()} || {build_t_call(key, {})})'
    src = re.sub(
        r'toast\.' + METHOD + r'\(\s*([^"\'`\)]+?)\|\|\s*(["\'])([^"\'\\]*(?:\\.[^"\'\\]*)*)\3\s*\)',
        repl_fallback, src)

    # B) template `...`
    def repl_template(m):
        method, msg = m.group(1), m.group(2)
        key_text, args = template_to_key(msg)
        key = add_key(key_text)
        file_count[0] += 1
        return f'toast.{method}({build_t_call(key, args)})'
    src = re.sub(
        r'toast\.' + METHOD + r'\(\s*`([^`]+)`\s*\)',
        repl_template, src)

    # A) static "..."
    def repl_static(m):
        method, quote, msg = m.group(1), m.group(2), m.group(3)
        if msg.startswith("t(") or msg.startswith("toast."):
            return m.group(0)
        key = add_key(msg)
        file_count[0] += 1
        return f'toast.{method}({build_t_call(key, {})})'
    src = re.sub(
        r'toast\.' + METHOD + r'\(\s*(["\'])([^"\'\\\n]*(?:\\.[^"\'\\\n]*)*)\1\s*\)',
        repl_static, src)

    if file_count[0] > 0:
        if not has_t_import(src):
            src = insert_t_import(src)
        jsx.write_text(src)
        per_file.append((str(jsx), file_count[0]))
        STATE["count"] += file_count[0]

print(f"[i18n] Fichiers modifiés : {len(per_file)}")
print(f"[i18n] Occurrences remplacées : {STATE['count']}")
print(f"[i18n] Nouvelles clés uniques : {len(new_keys_fr)}")

# Traduction FR->EN naïve
FR_EN = {
    "erreur": "error", "erreur ": "error ",
    "commande": "order", "commandes": "orders",
    "client": "client", "clients": "clients",
    "tournée": "route", "tournées": "routes",
    "visite": "visit", "visites": "visits",
    "produit": "product", "produits": "products",
    "contenant": "container", "contenants": "containers",
    "coordonnées bancaires": "bank details",
    "compte-rendu": "report",
    "coût": "cost", "coûts": "costs",
    "marge": "margin", "marges": "margins",
    "seuils": "thresholds",
    "champ": "field",
    "verrou": "lock",
    "signature": "signature", "signé": "signed",
    "conflit": "conflict", "écarté": "dismissed",
    "utilisateur": "user", "utilisateurs": "users",
    "prospects": "prospects", "trouvés": "found",
    "rayon": "radius",
    "alertes": "alerts",
    "scan": "scan",
    "objectifs": "goals",
    "proposés par l'ia": "proposed by AI",
    "mot de passe temporaire généré": "temporary password generated",
    "demande traitée": "request processed",
    "copié": "copied",
    "compte créé": "account created",
    "opportunité créée": "opportunity created",
    "commande créée": "order created",
    "commande signée": "order signed",
    "utilisateur créé": "user created",
    "contenant enregistré": "container saved",
    "coût enregistré": "cost saved",
    "coûts réinvalidés": "costs invalidated",
    "conflit écarté": "conflict dismissed",
    "coordonnées bancaires enregistrées": "bank details saved",
    "seuils sauvegardés": "thresholds saved",
    "compte-rendu enregistré": "report saved",
    "aucune donnée": "no data",
    "changement de statut": "status change",
    "champ enregistré (verrou automatique)": "field saved (auto-lock)",
    "identifiants invalides": "invalid credentials",
    "8 caractères minimum": "8 characters minimum",
    "ajoutez au moins un client": "add at least one client",
    "tournée créée": "route created",
    "trop de tentatives. réessaie plus tard.": "too many attempts. try again later.",
    "erreur scan": "scan error",
    "erreur ia": "AI error",
    "erreur chargement": "loading error",
    "erreur géocodage": "geocoding error",
    "erreur coach ia": "AI coach error",
    "erreur": "error",
}

def naive_en(fr):
    key = fr.lower().strip()
    if key in FR_EN:
        en = FR_EN[key]
        return en[0].upper() + en[1:] if fr[:1].isupper() else en
    out = fr
    for f_word, e_word in sorted(FR_EN.items(), key=lambda x: -len(x[0])):
        out = re.sub(rf'\b{re.escape(f_word)}\b', e_word, out, flags=re.I)
    return out

fr_entries = []
en_entries = []
for key, fr_msg in sorted(new_keys_fr.items()):
    fr_esc = fr_msg.replace('\\', '\\\\').replace('"', '\\"')
    en_esc = naive_en(fr_msg).replace('\\', '\\\\').replace('"', '\\"')
    fr_entries.append(f'    "{key}": "{fr_esc}",')
    en_entries.append(f'    "{key}": "{en_esc}",')

def inject(marker, entries, src):
    m = re.search(rf'  {marker}: \{{', src)
    if not m: return src
    idx = m.end()
    depth = 1; j = idx
    while j < len(src) and depth > 0:
        if src[j] == '{': depth += 1
        elif src[j] == '}': depth -= 1
        j += 1
    insert_pos = j - 1
    return src[:insert_pos] + "\n" + "\n".join(entries) + "\n  " + src[insert_pos:]

i18n_src = inject('fr', fr_entries, i18n_src)
i18n_src = inject('en', en_entries, i18n_src)
I18N_FILE.write_text(i18n_src)

print("\n=== Détail par fichier ===")
for f, n in per_file:
    print(f"  {n:3d}   {f.replace('/app/frontend/','')}")
