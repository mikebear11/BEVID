"""Sync catalogue Stripe pour BEVID — idempotent.

Produits SaaS (BEVID Terrain / Pro / Entreprise) exposés en Stripe avec 2 prix
chacun (mensuel · annuel avec 2 mois offerts). Tax code SaaS.

À exécuter :
    python /app/backend/setup_stripe.py

Idempotent : re-run met à jour uniquement ce qui a bougé (montants).
"""
import os
import sys
sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
import stripe
from billing_config import PLANS

stripe.api_key = os.environ["STRIPE_SECRET_KEY"]

CATALOG = []
for pid, plan in PLANS.items():
    unit = plan["price_per_seat_month_cents"]
    yearly = int(unit * 10)  # 10 mois payés
    CATALOG.append({
        "emergent_product_id": f"bevid_{pid}",
        "name": f"BEVID {plan['name']}",
        "tax_code": "txcd_10103001",  # SaaS
        "prices": [
            {"lookup_key": f"bevid_{pid}_monthly", "amount": unit, "currency": "eur", "interval": "month"},
            {"lookup_key": f"bevid_{pid}_yearly",  "amount": yearly, "currency": "eur", "interval": "year"},
        ],
    })


def get_or_create_product(entry):
    for p in stripe.Product.list(active=True, limit=100).auto_paging_iter():
        if p.to_dict().get("metadata", {}).get("emergent_product_id") == entry["emergent_product_id"]:
            return p
    return stripe.Product.create(
        name=entry["name"],
        tax_code=entry.get("tax_code"),
        metadata={"managed_by": "bevid", "emergent_product_id": entry["emergent_product_id"]},
    )


def sync_price(product_id, price_cfg):
    existing = stripe.Price.list(lookup_keys=[price_cfg["lookup_key"]], active=True, limit=1).data
    if existing and (existing[0].unit_amount != price_cfg["amount"] or existing[0].currency != price_cfg["currency"]):
        stripe.Price.modify(existing[0].id, active=False)
        existing = []
    if not existing:
        kwargs = dict(
            product=product_id, unit_amount=price_cfg["amount"],
            currency=price_cfg["currency"], lookup_key=price_cfg["lookup_key"],
            transfer_lookup_key=True,
        )
        if price_cfg.get("interval"):
            kwargs["recurring"] = {"interval": price_cfg["interval"]}
        stripe.Price.create(**kwargs)
        print(f"  ✓ price {price_cfg['lookup_key']} créé ({price_cfg['amount']/100:.2f} €)")
    else:
        print(f"  = price {price_cfg['lookup_key']} inchangé")


if __name__ == "__main__":
    print(f"Sync Stripe · account {stripe.Account.retrieve()['id']}")
    for entry in CATALOG:
        prod = get_or_create_product(entry)
        print(f"produit {entry['name']} → {prod.id}")
        for price in entry["prices"]:
            sync_price(prod.id, price)
    print("Done.")
