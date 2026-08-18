"""Modèles du système d'enrichissement.

Un champ enrichi = { valeur, source, date_maj, fiabilite, verrouille_par_utilisateur, hash }.
Un cron n'écrase JAMAIS un champ dont `verrouille_par_utilisateur=True`.
Toute édition manuelle passe automatiquement le champ à `verrouille=True`.
"""
import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

SourceEnrichissement = Literal[
    "user",                    # édition manuelle — verrou automatique
    "recherche-entreprises",   # Couche A
    "sirene",                  # Couche A
    "rne-inpi",                # Couche A
    "bodacc",                  # Couche A (événements)
    "ban",                     # Couche A
    "vies",                    # Couche A
    "layer_b",                 # Couche B (anonymisé — jamais le nom du fournisseur)
    "osm",                     # Couche C
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_valeur(valeur: Any) -> str:
    """Hash stable d'une valeur pour détecter un changement entre 2 sources."""
    try:
        s = json.dumps(valeur, sort_keys=True, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        s = str(valeur)
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:16]


class EnrichedField(BaseModel):
    """Sous-document uniforme pour tout champ enrichi automatiquement."""
    valeur: Any = None
    source: SourceEnrichissement = "user"
    date_maj: str = Field(default_factory=now_iso)
    fiabilite: float = 1.0  # 0.0 → 1.0
    verrouille_par_utilisateur: bool = False
    hash: Optional[str] = None

    def with_valeur(self, valeur: Any, source: SourceEnrichissement, fiabilite: float = 0.9) -> "EnrichedField":
        return EnrichedField(
            valeur=valeur, source=source, date_maj=now_iso(),
            fiabilite=fiabilite, verrouille_par_utilisateur=self.verrouille_par_utilisateur,
            hash=hash_valeur(valeur),
        )


def apply_enriched_update(existing: Optional[dict], new_valeur: Any,
                          source: SourceEnrichissement, fiabilite: float = 0.9) -> tuple[dict, bool]:
    """Applique une mise à jour à un champ enrichi en respectant le verrou.

    Retourne (nouveau_document, changed).
    - Si `existing` est verrouillé : renvoie l'existant inchangé, changed=False.
    - Si `existing` a le même hash : renvoie l'existant, changed=False.
    - Sinon : renvoie le nouveau document, changed=True.
    """
    new_hash = hash_valeur(new_valeur)
    if existing:
        if existing.get("verrouille_par_utilisateur"):
            return existing, False
        if existing.get("hash") == new_hash:
            # Même valeur — on rafraîchit juste la date_maj sans passer en "modifié"
            existing["date_maj"] = now_iso()
            existing["source"] = source
            return existing, False
    doc = EnrichedField(
        valeur=new_valeur, source=source, date_maj=now_iso(),
        fiabilite=fiabilite,
        verrouille_par_utilisateur=(existing or {}).get("verrouille_par_utilisateur", False),
        hash=new_hash,
    ).model_dump()
    return doc, True


def user_locked_update(new_valeur: Any) -> dict:
    """Édition manuelle : verrouille automatiquement le champ."""
    return EnrichedField(
        valeur=new_valeur, source="user", fiabilite=1.0,
        verrouille_par_utilisateur=True, hash=hash_valeur(new_valeur),
    ).model_dump()


# Registre des champs enrichis reconnus (whitelist).
# Toute clé hors registre est rejetée côté endpoint.
CHAMPS_ENRICHIS_AUTORISES = {
    # identité légale
    "siren", "siret_siege", "denomination", "forme_juridique",
    "date_creation", "naf_code", "naf_libelle", "effectif_tranche",
    "capital_social", "etat_administratif",
    "dirigeants", "beneficiaires_effectifs", "comptes_annuels",
    # adresse
    "adresse_ligne", "code_postal", "commune", "insee_commune",
    "lat", "lng", "score_geocodage",
    # fiscal
    "tva_intracom", "tva_valide",
    # scoring (couche B — anonymisé côté métier)
    "score_solvabilite", "score_paiement", "score_alerte",
}
