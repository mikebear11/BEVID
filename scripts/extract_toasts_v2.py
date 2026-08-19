#!/usr/bin/env python3
"""Extraction i18n v2 — corrige la regex qui bloquait sur l'apostrophe française
   dans les strings double-quote (ex : "l'IA"), et gère les toasts multi-args
   (ex : toast.success("Foo", { icon: "..." }))."""
import re, unicodedata
from pathlib import Path

ROOT = Path("/app/frontend/src")
I18N_FILE = ROOT / "lib" / "i18n.js"

METHOD = r'(error|success|info|warning|message|loading)'

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
total = 0

for jsx in sorted(ROOT.rglob("*.jsx")):
    src = jsx.read_text()
    file_count = [0]

    # C) fallback: toast.X(<expr> || "..."[, extras])
    def repl_fallback(m):
        method, expr, msg, extras = m.group(1), m.group(2), m.group(3), m.group(4)
        key = add_key(msg)
        file_count[0] += 1
        return f'toast.{method}({expr.rstrip()} || {build_t_call(key, {})}{extras or ""})'
    src = re.sub(
        r'toast\.' + METHOD + r'\(\s*([^"\'`\)]+?)\|\|\s*"([^"\\]*(?:\\.[^"\\]*)*)"(\s*,[^)]*)?\s*\)',
        repl_fallback, src)
    src = re.sub(
        r"toast\." + METHOD + r"\(\s*([^\"'`\)]+?)\|\|\s*'([^'\\]*(?:\\.[^'\\]*)*)'(\s*,[^)]*)?\s*\)",
        repl_fallback, src)

    # B) template `...`  (avec extras optionnels)
    def repl_template(m):
        method, msg, extras = m.group(1), m.group(2), m.group(3)
        key_text, args = template_to_key(msg)
        key = add_key(key_text)
        file_count[0] += 1
        return f'toast.{method}({build_t_call(key, args)}{extras or ""})'
    src = re.sub(
        r'toast\.' + METHOD + r'\(\s*`([^`]+)`(\s*,[^)]*)?\s*\)',
        repl_template, src)

    # A1) "static" — autorise ' à l'intérieur
    def repl_dq(m):
        method, msg, extras = m.group(1), m.group(2), m.group(3)
        if msg.startswith("t(") or msg.startswith("toast."):
            return m.group(0)
        key = add_key(msg)
        file_count[0] += 1
        return f'toast.{method}({build_t_call(key, {})}{extras or ""})'
    src = re.sub(
        r'toast\.' + METHOD + r'\(\s*"([^"\\\n]*(?:\\.[^"\\\n]*)*)"(\s*,[^)]*)?\s*\)',
        repl_dq, src)

    # A2) 'static' — autorise " à l'intérieur
    src = re.sub(
        r"toast\." + METHOD + r"\(\s*'([^'\\\n]*(?:\\.[^'\\\n]*)*)'(\s*,[^)]*)?\s*\)",
        repl_dq, src)

    if file_count[0] > 0:
        if not has_t_import(src):
            src = insert_t_import(src)
        jsx.write_text(src)
        per_file.append((str(jsx), file_count[0]))
        total += file_count[0]

print(f"[i18n v2] Fichiers modifiés : {len(per_file)}")
print(f"[i18n v2] Occurrences remplacées : {total}")
print(f"[i18n v2] Nouvelles clés uniques : {len(new_keys_fr)}")

# Traduction FR->EN naïve (mini glossaire — le reste garde le FR)
FR_EN = {
    "erreur": "error",
    "erreur ia": "AI error",
    "erreur scan": "scan error",
    "erreur chargement": "loading error",
    "erreur import": "import error",
    "erreur parsing": "parsing error",
    "erreur seed": "seed error",
    "erreur géocodage": "geocoding error",
    "erreur chargement kpis": "KPI loading error",
    "erreur chargement catalogue": "catalog loading error",
    "erreur coach ia": "AI coach error",
    "erreur extraction ia": "AI extraction error",
    "erreur extraction": "extraction error",
    "erreur envoi": "send error",
    "erreur suppression": "delete error",
    "impossible": "unable",
    "impossible de charger les propositions": "unable to load proposals",
    "aucune donnée": "no data",
    "compte créé": "account created",
    "commande créée": "order created",
    "commande signée": "order signed",
    "opportunité créée": "opportunity created",
    "utilisateur créé": "user created",
    "contenant enregistré": "container saved",
    "client ajouté": "client added",
    "produit ajouté": "product added",
    "note ajoutée": "note added",
    "établissement créé": "establishment created",
    "événement créé": "event created",
    "tournée créée": "route created",
    "coût enregistré": "cost saved",
    "coûts réinvalidés": "costs invalidated",
    "conflit écarté": "conflict dismissed",
    "coordonnées bancaires enregistrées": "bank details saved",
    "réglages sauvegardés": "settings saved",
    "seuils sauvegardés": "thresholds saved",
    "préférences enregistrées": "preferences saved",
    "permissions enregistrées": "permissions saved",
    "tarif hecto sauvegardé": "hecto price saved",
    "départements enregistrés": "departments saved",
    "champ enregistré (verrou automatique)": "field saved (auto-lock)",
    "place id lié": "place ID linked",
    "place id délié": "place ID unlinked",
    "copié": "copied",
    "position captée": "location captured",
    "mouvement enregistré": "movement saved",
    "introuvable": "not found",
    "compte-rendu enregistré": "report saved",
    "rapport exporté": "report exported",
    "export téléchargé": "export downloaded",
    "bilan trimestriel téléchargé": "quarterly review downloaded",
    "note ajoutée": "note added",
    "motif requis": "reason required",
    "nom requis": "name required",
    "sélectionnez un client": "select a client",
    "date de livraison obligatoire": "delivery date required",
    "date obligatoire": "date required",
    "panier vide": "empty cart",
    "signature client requise": "client signature required",
    "gps refusé/impossible": "GPS refused/unavailable",
    "géolocalisation désactivée par l'organisation": "geolocation disabled by organisation",
    "ajoutez au moins un client": "add at least one client",
    "identifiants invalides": "invalid credentials",
    "trop de tentatives. réessaie plus tard.": "too many attempts. try again later.",
    "les mots de passe ne correspondent pas": "passwords do not match",
    "✓ mot de passe mis à jour": "✓ password updated",
    "mot de passe temporaire généré": "temporary password generated",
    "demande envoyée au gérant": "request sent to manager",
    "demande traitée": "request processed",
    "3 objectifs proposés par l'ia": "3 goals proposed by AI",
    "champs remplis par l'ia": "fields filled by AI",
    "formulaire rempli par l'ia": "form filled by AI",
    "extraction ia échouée, complétez à la main": "AI extraction failed, complete manually",
    "commande + signature en file — synchro auto au retour du réseau": "order + signature queued — auto-sync when network returns",
    "enregistré hors-ligne — sera synchronisé au retour du réseau": "saved offline — will sync when network returns",
    "données de démo ajoutées": "demo data added",
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

print("\n=== Détail par fichier (v2) ===")
for f, n in per_file:
    print(f"  {n:3d}   {f.replace('/app/frontend/','')}")
