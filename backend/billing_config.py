"""Configuration des forfaits BEVID — modifiable sans redéploiement.

Prix HT provisoires par utilisateur et par mois.
La dégressivité s'applique sur le prix unitaire dès qu'on franchit un palier de sièges.
Le premier utilisateur (le manager qui crée l'org) est inclus, non facturé.
Deux mois offerts sur annuel = 10 mois payés au lieu de 12.
"""

PLANS = {
    "terrain": {
        "id": "terrain",
        "name": "Terrain",
        "price_per_seat_month_cents": 1500,   # 15,00 €
        "features": {
            "page:dashboard", "page:tours", "page:visits", "page:clients",
            "page:orders", "page:products", "page:prospection",
        },
        "description": "Tournée, visites, clients, commandes, produits. Hors-ligne + dictée.",
    },
    "pro": {
        "id": "pro",
        "name": "Pro",
        "price_per_seat_month_cents": 2900,   # 29,00 €
        "features": {
            "page:dashboard", "page:tours", "page:visits", "page:clients",
            "page:orders", "page:products", "page:prospection",
            "page:stock", "page:reports", "page:paiements",
            "page:rapprochement",
        },
        "description": "Tout Terrain + stock, DRM douane, rapports, paiements, rapprochement.",
    },
    "entreprise": {
        "id": "entreprise",
        "name": "Entreprise",
        "price_per_seat_month_cents": 4900,   # 49,00 €
        "features": {"*"},   # tout
        "description": "Tout Pro + prospection avancée, IA, coûts et marges, permissions fines.",
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
