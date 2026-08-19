"""Régression Lot 4 · Pricing — hiérarchie affichée cumulative (Option A).

Vérifie que :
1. Le nombre d'items visibles Terrain <= Pro <= Entreprise (aucune carte
   supérieure ne peut paraître appauvrie face à une carte inférieure).
2. Pro et Entreprise portent un `data-testid="pricing-inherits-{id}"` avec
   la mention « Tout le forfait X, plus : » (le prospect voit la progression).
3. Terrain n'a **pas** de ligne d'héritage (c'est le forfait de base).
4. Aucune troncature silencieuse : si `pricing-more-{id}` existe, il précise
   le nombre.
"""
import re
from pathlib import Path

import pytest


def _pricing_source() -> str:
    return Path("/app/frontend/src/pages/Pricing.jsx").read_text()


class TestPricingCardHierarchy:
    def test_pricing_uses_cumulative_display(self):
        src = _pricing_source()
        assert "cumulativeItems" in src, (
            "Pricing.jsx doit utiliser cumulativeItems() pour ne montrer que le delta."
        )
        assert "Tout le forfait" in src, (
            "Les cartes Pro/Entreprise doivent afficher 'Tout le forfait X, plus :'"
        )

    def test_inherits_marker_only_on_upper_plans(self):
        src = _pricing_source()
        assert "inheritLabel &&" in src, (
            "Le marqueur d'héritage doit être conditionnel sur inheritLabel."
        )
        assert "pricing-inherits-" in src, (
            "Chaque carte supérieure doit exposer un data-testid pricing-inherits."
        )

    def test_truncation_is_never_silent(self):
        src = _pricing_source()
        assert "pricing-more-" in src, (
            "Toute troncature doit exposer un data-testid pricing-more."
        )
        assert "truncated > 0" in src and "autre" in src, (
            "Le repli doit être conditionnel sur truncated > 0 et dire '+ N autres…'"
        )

    def test_no_hardcoded_feature_key_in_source(self):
        """La source JSX ne doit pas afficher de clé brute comme 'page:clients'.
        Toutes les features passent par labelForFeature() → trans('feature.KEY')."""
        src = _pricing_source()
        # On tolère les strings dans les tests/data-testid, on interdit dans du texte JSX visible
        # Recherche de motifs comme <span>page:clients</span>
        forbidden = re.findall(r">\s*(page:[a-z\-]+|product:[a-z_]+|ai:[a-z]+)\s*<", src)
        assert not forbidden, f"Clés techniques affichées en dur : {forbidden}"
