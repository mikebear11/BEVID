"""Adaptateur Pappers — Couche B (second adaptateur, déclenché manuellement).

Token via env `PAPPERS_TOKEN`.
Rate limit conservateur (source="pappers", 3 req/s dans http_client).
"""
import os

from ..http_client_ext import fetch_json_optional_auth
from ..port import EnrichissementPort

BASE = "https://api.pappers.fr/v2"


class PappersAdapter(EnrichissementPort):
    provider_key = "pappers"

    async def enrichir(self, siren: str, db=None) -> dict:
        token = os.environ.get("PAPPERS_TOKEN", "").strip()
        if not token:
            return {"_available": False, "_reason": "no_token"}
        try:
            payload = await fetch_json_optional_auth(
                f"{BASE}/entreprise",
                source="pappers", db=db, kind="enrichissement-layer-b",
                params={"api_token": token, "siren": siren},
            )
        except RuntimeError as e:
            return {"_available": False, "_reason": f"http_error: {e}"}
        if not isinstance(payload, dict) or not payload.get("siren"):
            return {"_available": False, "_reason": "empty_payload"}
        return {
            "_available": True,
            "denomination": payload.get("nom_entreprise"),
            "forme_juridique": payload.get("forme_juridique"),
            "capital_social": payload.get("capital"),
            "etat_administratif": payload.get("statut_rcs") or payload.get("etat_administratif"),
            "effectif_tranche": payload.get("tranche_effectif"),
            "date_creation": payload.get("date_creation"),
            "naf_code": payload.get("code_naf"),
            "comptes_annuels": payload.get("comptes") or [],
            "dirigeants": [
                {"nom": r.get("nom_complet"), "fonction": r.get("qualite"), "date_nomination": r.get("date_prise_de_poste")}
                for r in (payload.get("representants") or [])
            ],
            "beneficiaires_effectifs": payload.get("beneficiaires_effectifs") or [],
        }

    async def score(self, siren: str, db=None) -> dict:
        # Pappers ne fournit pas de scoring standardisé dans son offre de base.
        # On renvoie une réponse structurée "non disponible" pour permettre au caller
        # de fallback vers la Couche A ou d'appeler l'autre adaptateur.
        return {"_available": False, "_reason": "not_supported_by_provider"}
