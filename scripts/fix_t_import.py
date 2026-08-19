#!/usr/bin/env python3
"""Corrige les fichiers où mon extract_toasts a inséré `import { t } from "@/lib/i18n";`
   au milieu d'un import multi-ligne. Stratégie : retirer toutes les occurrences de
   cette ligne puis réinsérer proprement après le dernier bloc d'import terminé."""
import re
from pathlib import Path

ROOT = Path("/app/frontend/src")
LINE = 'import { t } from "@/lib/i18n";'

count = 0
for jsx in sorted(ROOT.rglob("*.jsx")):
    src = jsx.read_text()
    if LINE not in src:
        continue
    # Retire toutes les occurrences de la ligne
    lines = [l for l in src.split("\n") if l.strip() != LINE]
    src2 = "\n".join(lines)

    # Trouve la fin du dernier bloc d'import (une ligne qui commence par un import
    # et se termine par un `;` — ou statement single-line `import X from ...`).
    # Parcours simple : compte les {} pour trouver le semicolon final.
    last_import_end = -1
    lines2 = src2.split("\n")
    i = 0
    while i < len(lines2):
        line = lines2[i]
        if re.match(r'^\s*import\b', line):
            # Trouve la fin du statement — le `;`
            j = i
            depth = 0
            while j < len(lines2):
                ln = lines2[j]
                depth += ln.count("{") - ln.count("}")
                if ";" in ln and depth == 0:
                    last_import_end = j
                    break
                j += 1
            i = (j if j > i else i) + 1
        else:
            i += 1

    if last_import_end >= 0:
        lines2.insert(last_import_end + 1, LINE)
    else:
        lines2.insert(0, LINE)
    jsx.write_text("\n".join(lines2))
    count += 1

print(f"[fix] {count} fichiers corrigés")
