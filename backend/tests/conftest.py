"""Garde-fou de tests — bloque toute exécution ciblant la production.

Chargé automatiquement par pytest depuis /app/backend/tests. Aucun test
ne peut s'exécuter si REACT_APP_BACKEND_URL ou MONGO_URL pointe sur
`bevid-crm.com` (le domaine de production du client). Empêche la
recréation de fixtures de démonstration en base réelle après un run
CI ou local mal configuré.

Trois surfaces couvertes :
  - REACT_APP_BACKEND_URL (URL d'API cible)
  - MONGO_URL (URI Mongo directe)
  - BEVID_ENV (refus explicite si "production")

Le refus est déclenché AVANT la collecte pytest, pas en fixture, pour
qu'aucun test — même mal isolé — ne puisse en réchapper.
"""
import os
import sys

_PRODUCTION_MARKERS = ("bevid-crm.com",)


def _reject(reason: str) -> None:
    msg = (
        f"\n\n"
        f"╔══════════════════════════════════════════════════════════════╗\n"
        f"║  REFUS — la suite de tests ne s'exécute PAS contre la prod. ║\n"
        f"╠══════════════════════════════════════════════════════════════╣\n"
        f"║  Motif : {reason:<52s}║\n"
        f"║  Corriger : REACT_APP_BACKEND_URL et MONGO_URL doivent      ║\n"
        f"║  pointer sur le preview ou un environnement local. Ne       ║\n"
        f"║  jamais lancer pytest avec une cible bevid-crm.com.         ║\n"
        f"╚══════════════════════════════════════════════════════════════╝\n"
    )
    print(msg, file=sys.stderr, flush=True)
    # Exit non-zéro immédiat, pas un skip discret : le job CI doit rougir.
    raise SystemExit(2)


def _check_env_var(name: str) -> None:
    value = (os.environ.get(name) or "").lower()
    for marker in _PRODUCTION_MARKERS:
        if marker in value:
            _reject(f"{name} contient {marker!r}")


# S'exécute dès l'import du conftest par pytest, avant toute collecte.
_check_env_var("REACT_APP_BACKEND_URL")
_check_env_var("MONGO_URL")

if (os.environ.get("BEVID_ENV") or "").strip().lower() == "production":
    _reject("BEVID_ENV=production")
