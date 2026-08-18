"""Interface abstraite d'enrichissement — Couche B.

Aucun code métier n'importe un adaptateur concret. Le sélecteur `resolve_port()` lit
la variable d'environnement `ENRICHISSEMENT_PROVIDER` et retourne le port courant.
Le nom du fournisseur n'apparaît jamais dans server.py.
"""
import os
from abc import ABC, abstractmethod
from typing import Any


class EnrichissementPort(ABC):
    """Contrat unique pour tout fournisseur d'enrichissement de masse / scoring."""

    provider_key: str = "abstract"  # identifiant interne (jamais exposé côté UI)

    @abstractmethod
    async def enrichir(self, siren: str, db=None) -> dict:
        """Retourne un dict de champs enrichis (identité, comptes, dirigeants)."""
        raise NotImplementedError

    @abstractmethod
    async def score(self, siren: str, db=None) -> dict:
        """Retourne un dict de scores (solvabilité, paiement, alerte, 0-100)."""
        raise NotImplementedError


def resolve_port(override_provider: str | None = None) -> EnrichissementPort:
    """Résout le port courant. `override_provider` = pour un enrichissement manuel."""
    from .adapters.societe_com import SocieteComAdapter
    from .adapters.pappers import PappersAdapter

    provider = (override_provider or os.environ.get("ENRICHISSEMENT_PROVIDER", "societe_com")).lower()
    if provider == "pappers":
        return PappersAdapter()
    return SocieteComAdapter()
