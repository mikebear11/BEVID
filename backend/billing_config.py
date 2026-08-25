"""Configuration des forfaits BEVID — modifiable sans redéploiement.

Prix HT provisoires par utilisateur et par mois.
La dégressivité s'applique sur le prix unitaire dès qu'on franchit un palier de sièges.
Le premier utilisateur (le manager qui crée l'org) est inclus, non facturé.
Deux mois offerts sur annuel = 10 mois payés au lieu de 12.

**Règle d'invariance descriptif ↔ features** : chaque item cité dans la
`description` marketing doit avoir sa clé dans `features`, et inversement.
Un test de régression (`test_iter22_pricing_coherence.py`) échoue sinon.
Aucun forfait n'utilise `"*"` : chaque feature est listée explicitement pour
alimenter la page publique `/pricing` en libellés clairs.
"""

# Toutes les fonctionnalités du produit (utile pour construire Entreprise et
# pour vérifier la cohérence des listes par forfait).
ALL_FEATURES = {
    # Terrain
    "page:dashboard", "page:clients", "page:orders", "page:products",
    "page:tours", "page:visits",
    # Pro
    "page:stock", "page:drm", "page:reports", "page:paiements",
    "page:rapprochement",
    # Entreprise
    "page:prospection", "page:users", "page:integrations",
    "product:view_cost", "ai:coach", "ai:voice",
}

_TERRAIN = {
    "page:dashboard", "page:clients", "page:orders", "page:products",
    "page:tours", "page:visits",
}
_PRO = _TERRAIN | {
    "page:stock", "page:drm", "page:reports", "page:paiements",
    "page:rapprochement",
}
_ENTREPRISE = _PRO | {
    "page:prospection", "page:users", "page:integrations",
    "product:view_cost", "ai:coach", "ai:voice",
}

PLANS = {
    "terrain": {
        "id": "terrain",
        "name": "Terrain",
        "price_per_seat_month_cents": 1500,   # 15,00 €
        "features": _TERRAIN,
        "description": "Tableau de bord, clients, prise de commande, catalogue, tournées, comptes rendus. Hors-ligne + dictée vocale.",
    },
    "pro": {
        "id": "pro",
        "name": "Pro",
        "price_per_seat_month_cents": 2900,   # 29,00 €
        "features": _PRO,
        "description": "Tout Terrain + stock et contenants, DRM douane, rapports et pilotage, paiements, rapprochement bancaire.",
    },
    "entreprise": {
        "id": "entreprise",
        "name": "Entreprise",
        "price_per_seat_month_cents": 4900,   # 49,00 €
        "features": _ENTREPRISE,
        "description": "Tout Pro + prospection, coûts et marges, IA (copilote et dictée), administration fine et intégrations.",
    },
}

VOLUME_DISCOUNTS = [
    (25, 0.20),   # -20% à partir de 25 sièges
    (10, 0.10),   # -10% à partir de 10 sièges
]

# Facturation
FIRST_SEAT_FREE = True             # le créateur de l'org est offert
ANNUAL_MONTHS_PAID = 10            # 12 mois -> 10 payés
TRIAL_DAYS = 7                     # essai gratuit à l'inscription, plan = pro
TRIAL_PLAN = "pro"                 # forfait offert pendant l'essai
READ_ONLY_DAYS_AFTER_TRIAL = 15    # lecture seule après expiration
SUSPEND_AFTER_DAYS = 15            # puis suspension (données conservées 90j)
DATA_RETENTION_DAYS = 90


def unit_price_cents(plan_id: str, seats: int, billing: str = "monthly") -> int:
    """Prix unitaire par siège, avec dégressivité et remise annuelle."""
    plan = PLANS.get(plan_id)
    if not plan:
        return 0
    base = plan["price_per_seat_month_cents"]
    discount = 0.0
    for threshold, rate in VOLUME_DISCOUNTS:
        if seats >= threshold:
            discount = rate
            break
    if billing == "annual":
        # 12 mois de service payés au tarif de ANNUAL_MONTHS_PAID mois
        # => remise supplémentaire multiplicative
        annual_ratio = ANNUAL_MONTHS_PAID / 12.0
        return int(round(base * (1 - discount) * annual_ratio))
    return int(round(base * (1 - discount)))


def total_price_cents(plan_id: str, seats: int, billing: str = "monthly") -> int:
    """Prix total mensuel/annuel pour N sièges, premier siège offert."""
    billable = max(0, seats - (1 if FIRST_SEAT_FREE else 0))
    unit = unit_price_cents(plan_id, seats, billing)
    if billing == "annual":
        return unit * billable * 12
    return unit * billable
