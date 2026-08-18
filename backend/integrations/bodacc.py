"""Adaptateur BODACC — Bulletin Officiel des Annonces Civiles et Commerciales.
API DILA opendatasoft ODS v2.1, sans clé, Licence Ouverte 2.0.
https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records
"""
from .http_client import fetch_json

BODACC_URL = "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records"


async def fetch_collective_by_siren(siren: str, since_iso: str, db=None) -> list[dict]:
    """Toutes les procédures collectives d'un SIREN depuis `since_iso` (YYYY-MM-DD)."""
    where = f"familleavis='collective' AND registre LIKE '{siren}' AND dateparution>='{since_iso}'"
    payload = await fetch_json(
        BODACC_URL, source="bodacc", db=db, kind="bouclier",
        params={"where": where, "limit": 50, "order_by": "dateparution DESC"},
    )
    return payload.get("results", [])


async def fetch_creations_by_department(dept: str, since_iso: str, db=None) -> list[dict]:
    """Créations + immatriculations pour un département sur période. dept = '64', '75', '971', etc."""
    where = (
        f"familleavis IN ('creation','immatriculation') "
        f"AND numerodepartement='{dept}' AND dateparution>='{since_iso}'"
    )
    all_results: list[dict] = []
    offset = 0
    limit = 100
    while True:
        payload = await fetch_json(
            BODACC_URL, source="bodacc", db=db, kind="radar",
            params={"where": where, "limit": limit, "offset": offset,
                    "order_by": "dateparution DESC"},
        )
        results = payload.get("results", [])
        all_results.extend(results)
        total = payload.get("total_count", 0)
        offset += limit
        if offset >= total or offset >= 1000 or not results:  # borne dure
            break
    return all_results


def classify_collective(jugement: dict | str) -> tuple[str, str]:
    """Retourne (severity, action) selon la nature du jugement.
    severity : "info" | "watch" | "block"
    action   : label lisible en français
    """
    nature = ""
    if isinstance(jugement, dict):
        nature = (jugement.get("nature") or "").lower()
    elif isinstance(jugement, str):
        nature = jugement.lower()
    if not nature:
        return ("watch", "Procédure collective (nature non précisée)")
    if "liquidation" in nature:
        return ("block", "Liquidation judiciaire — commandes bloquées")
    if "redressement" in nature:
        return ("watch", "Redressement judiciaire — paiement comptant uniquement")
    if "sauvegarde" in nature:
        return ("watch", "Sauvegarde — plafond d'encours abaissé")
    if "plan" in nature or "continuation" in nature:
        return ("info", "Plan de continuation adopté — retour progressif")
    return ("watch", f"Procédure collective : {nature}")
