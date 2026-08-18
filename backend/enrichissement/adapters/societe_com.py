"""Adaptateur Societe.com — Couche B (défaut, enrichissement de masse + scoring mensuel).

Endpoint : https://api.societe.com/api/v1
En-tête : X-Authorization: socapi {token}
Rate limit : 60 requêtes/minute (source="societe-com").

Token via env `SOCIETE_COM_TOKEN`.
Aucun code métier ne référence cette classe directement — passage obligé par `EnrichissementPort`.
"""
import os

from ..http_client_ext import fetch_json_optional_auth
from ..port import EnrichissementPort

BASE = "https://api.societe.com/api/v1"


class SocieteComAdapter(EnrichissementPort):
    provider_key = "societe_com"

    def _headers(self) -> dict | None:
        token = os.environ.get("SOCIETE_COM_TOKEN", "").strip()
        if not token:
            return None
        return {"X-Authorization": f"socapi {token}"}

    async def enrichir(self, siren: str, db=None) -> dict:
        headers = self._headers()
        if not headers:
            return {"_available": False, "_reason": "no_token"}
        try:
            payload = await fetch_json_optional_auth(
                f"{BASE}/entreprise/{siren}",
                source="societe-com", db=db, kind="enrichissement-layer-b",
                headers=headers,
            )
        except RuntimeError as e:
            return {"_available": False, "_reason": f"http_error: {e}"}
        # Normalisation minimale — l'API peut renvoyer différentes structures selon l'offre
        ent = payload.get("entreprise") if isinstance(payload, dict) else None
        if not ent:
            return {"_available": False, "_reason": "empty_payload"}
        return {
            "_available": True,
            "denomination": ent.get("denomination"),
            "forme_juridique": ent.get("forme_juridique"),
            "capital_social": ent.get("capital"),
            "etat_administratif": ent.get("etat"),
            "effectif_tranche": ent.get("effectif"),
            "date_creation": ent.get("date_creation"),
            "naf_code": ent.get("naf") or ent.get("code_naf"),
            "comptes_annuels": ent.get("comptes") or [],
            "dirigeants": ent.get("dirigeants") or [],
        }

    async def score(self, siren: str, db=None) -> dict:
        headers = self._headers()
        if not headers:
            return {"_available": False, "_reason": "no_token"}
        try:
            payload = await fetch_json_optional_auth(
                f"{BASE}/entreprise/{siren}/score",
                source="societe-com", db=db, kind="scoring-layer-b",
                headers=headers,
            )
        except RuntimeError as e:
            return {"_available": False, "_reason": f"http_error: {e}"}
        # Normalisation vers 3 scores 0-100
        sc = payload.get("score") if isinstance(payload, dict) else {}
        return {
            "_available": True,
            "score_solvabilite": sc.get("solvabilite") or sc.get("solidite"),
            "score_paiement":    sc.get("paiement") or sc.get("comportement"),
            "score_alerte":      sc.get("alerte") or sc.get("defaillance"),
        }
