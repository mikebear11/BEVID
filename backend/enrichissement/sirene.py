"""Adaptateur API Sirene (INSEE).

Compte gratuit, 30 requêtes/minute (rate limit géré côté http_client via source="insee-sirene").
Doc : https://api.insee.fr/catalogue/site/themes/wso2/subthemes/insee/pages/item-info.jag?name=Sirene&version=V3&provider=insee
"""
import os
from .http_client_ext import fetch_json_optional_auth

SIRENE_BASE = "https://api.insee.fr/api-sirene/3.11"


async def get_by_siren(siren: str, db=None) -> dict | None:
    """Récupère l'unité légale par SIREN. Retourne None si non trouvé."""
    token = os.environ.get("INSEE_SIRENE_TOKEN", "").strip()
    headers = {"X-INSEE-Api-Key-Integration": token} if token else None
    try:
        payload = await fetch_json_optional_auth(
            f"{SIRENE_BASE}/siren/{siren}",
            source="insee-sirene", db=db, kind="enrichissement-sirene",
            headers=headers,
        )
    except RuntimeError:
        return None
    return (payload or {}).get("uniteLegale")


def extract_identity(unite_legale: dict) -> dict:
    """Normalise en champs Couche A à partir d'une unité légale Sirene."""
    if not unite_legale:
        return {}
    periodes = unite_legale.get("periodesUniteLegale") or []
    dernier = periodes[0] if periodes else {}
    return {
        "denomination": dernier.get("denominationUniteLegale") or unite_legale.get("prenom1UniteLegale"),
        "forme_juridique": dernier.get("categorieJuridiqueUniteLegale"),
        "date_creation": unite_legale.get("dateCreationUniteLegale"),
        "naf_code": dernier.get("activitePrincipaleUniteLegale"),
        "effectif_tranche": unite_legale.get("trancheEffectifsUniteLegale"),
        "etat_administratif": dernier.get("etatAdministratifUniteLegale"),
    }
