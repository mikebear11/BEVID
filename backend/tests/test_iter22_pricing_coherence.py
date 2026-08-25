"""Régression Lot 4 · Pricing — cohérence descriptifs ↔ features.

Vérifie invariants essentiels de la page tarifs publique :

1. Aucun forfait n'expose `"*"` (joker) dans son entitlement public : la page
   `/pricing` ne peut afficher que des libellés clairs.
2. Chaque forfait a au moins 3 fonctionnalités listées.
3. Chaque item explicitement cité dans `description` doit être présent dans
   `features` du même forfait — c'est le contrat commercial.
4. La hiérarchie tarifaire est respectée : Pro ⊇ Terrain, Entreprise ⊇ Pro.
5. Points sensibles historiquement mal câblés :
   - `page:drm` doit être dans Pro et Entreprise (obligation déclarative des brasseurs)
   - `page:stock` ne doit **pas** être dans Terrain
   - `page:prospection` ne doit **pas** être dans Terrain (argument Entreprise)
6. Toute clé `features` doit avoir un libellé i18n dans `feature.<clé>`
   (sinon la page /pricing masquerait la ligne — un forfait payant ne peut pas
   avoir de trou d'affichage silencieux).
"""
import re
from pathlib import Path

import pytest

from billing_config import PLANS


# Termes marketing → clés d'entitlement qu'ils doivent impliquer.
# Contrat vérifié dans les deux sens : si le mot apparaît dans la description,
# la clé doit exister dans features.
_MARKETING_TO_FEATURES = {
    "tableau de bord":   {"page:dashboard"},
    "clients":           {"page:clients"},
    "commande":          {"page:orders"},
    "catalogue":         {"page:products"},
    "tournées":          {"page:tours"},
    "comptes rendus":    {"page:visits"},
    "stock":             {"page:stock"},
    "contenants":        {"page:stock"},
    "drm":               {"page:drm"},
    "rapports":          {"page:reports"},
    "pilotage":          {"page:reports"},
    "paiements":         {"page:paiements"},
    "rapprochement":     {"page:rapprochement"},
    "prospection":       {"page:prospection"},
    "coûts":             {"product:view_cost"},
    "marges":            {"product:view_cost"},
    "ia":                {"ai:coach"},
}


def _i18n_labels() -> set[str]:
    """Extrait toutes les clés `feature.*` du dictionnaire FR."""
    src = Path("/app/frontend/src/lib/i18n.js").read_text()
    m = re.search(r"^\s+fr\s*:\s*\{", src, re.M)
    if not m:
        pytest.skip("Bloc `fr:` introuvable dans i18n.js")
    start = m.end() - 1
    depth = 0
    end = start
    for i in range(start, len(src)):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    fr_block = src[start:end]
    return set(re.findall(r'"(feature\.[^"]+)"', fr_block))


class TestPricingCoherence:
    def test_no_wildcard_in_public_features(self):
        for pid, plan in PLANS.items():
            assert "*" not in plan["features"], (
                f"{pid} expose '*' — la page publique ne peut pas l'afficher"
            )

    def test_each_plan_has_min_3_features(self):
        for pid, plan in PLANS.items():
            assert len(plan["features"]) >= 3, (
                f"{pid} n'a que {len(plan['features'])} fonctionnalités "
                f"(minimum 3 pour justifier son prix)"
            )

    def test_hierarchy_terrain_subset_pro_subset_entreprise(self):
        assert PLANS["terrain"]["features"] <= PLANS["pro"]["features"], (
            "Pro doit contenir tout Terrain"
        )
        assert PLANS["pro"]["features"] <= PLANS["entreprise"]["features"], (
            "Entreprise doit contenir tout Pro"
        )

    def test_marketing_promises_are_in_features(self):
        """Bug historique : Pro vend DRM mais ne la donne pas."""
        for pid, plan in PLANS.items():
            desc = plan["description"].lower()
            for phrase, required_keys in _MARKETING_TO_FEATURES.items():
                if phrase in desc:
                    missing = required_keys - plan["features"]
                    assert not missing, (
                        f"{pid} : la description mentionne « {phrase} » mais "
                        f"les entitlements ne contiennent pas {missing}. "
                        f"Vendre une fonctionnalité sans la donner = litige client."
                    )

    def test_features_are_all_declared_in_marketing_or_transverse(self):
        """Symétrie : chaque feature doit soit être citée dans la description,
        soit être une catégorie transverse (ex: ai:voice = argument produit)."""
        _ALLOWED_UNDECLARED = {  # features valides sans citation directe
            "page:users", "page:integrations", "ai:voice",
            "page:sources-donnees",
        }
        for pid, plan in PLANS.items():
            desc = plan["description"].lower()
            declared = set()
            for phrase, keys in _MARKETING_TO_FEATURES.items():
                if phrase in desc:
                    declared |= keys
            declared |= _ALLOWED_UNDECLARED
            # Fonctionnalités héritées d'un forfait inférieur : considérées déclarées
            inherited = set()
            if pid == "pro":
                inherited = PLANS["terrain"]["features"]
            elif pid == "entreprise":
                inherited = PLANS["pro"]["features"]
            undeclared = plan["features"] - declared - inherited
            assert not undeclared, (
                f"{pid} contient des fonctionnalités non citées dans la description "
                f"et non transverses : {undeclared}"
            )

    def test_terrain_does_not_leak_advanced_features(self):
        forbidden_in_terrain = {
            "page:stock", "page:drm", "page:reports", "page:paiements",
            "page:rapprochement", "page:prospection", "page:radar",
            "page:veille", "page:bouclier", "product:view_cost", "ai:coach",
        }
        leaked = PLANS["terrain"]["features"] & forbidden_in_terrain
        assert not leaked, f"Terrain ne doit pas contenir {leaked}"

    def test_drm_is_in_pro_and_entreprise(self):
        # Régression du bug : Pro annonçait DRM mais ne la donnait pas.
        assert "page:drm" in PLANS["pro"]["features"], "Pro doit inclure page:drm"
        assert "page:drm" in PLANS["entreprise"]["features"], (
            "Entreprise doit inclure page:drm"
        )

    def test_every_feature_key_has_i18n_label(self):
        labels = _i18n_labels()
        for pid, plan in PLANS.items():
            for feat in plan["features"]:
                key = f"feature.{feat}"
                assert key in labels, (
                    f"Aucun libellé i18n `{key}` pour la feature `{feat}` du forfait {pid}. "
                    f"La page /pricing masquerait la ligne silencieusement."
                )
