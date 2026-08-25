#!/usr/bin/env python3
"""Active l'exemption fondateur pour votre organisation.

Usage :
    python /app/backend/scripts/grant_founder_exemption.py <email>

Effet : votre org bascule à `billing_exempt=True`, `status="active"`, plan
`entreprise`, `trial_ends_at=None`. Vous et tous vos commerciaux ont accès
gratuit illimité à toutes les fonctionnalités.

Idempotent. Rejouable sans effet secondaire.
"""
import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone


async def main(email: str):
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    user = await db.users.find_one({"email": email.lower()}, {"_id": 0, "id": 1, "org_id": 1, "email": 1, "name": 1})
    if not user:
        print(f"✗ Aucun user avec email {email}")
        return 1
    if not user.get("org_id"):
        print(f"✗ Le user {email} n'a pas d'organisation")
        return 1
    org = await db.organizations.find_one({"id": user["org_id"]}, {"_id": 0, "id": 1, "name": 1, "billing_exempt": 1})
    if not org:
        print(f"✗ Organisation {user['org_id']} introuvable")
        return 1
    if org.get("billing_exempt"):
        print(f"= Organisation « {org.get('name')} » déjà en exemption fondateur")
        return 0
    now = datetime.now(timezone.utc).isoformat()
    await db.organizations.update_one(
        {"id": user["org_id"]},
        {"$set": {"billing_exempt": True, "billing_exempt_reason": "founder",
                   "status": "active", "trial_ends_at": None,
                   "plan": "entreprise", "billing_mode": "monthly",
                   "exempted_at": now, "exempted_by": user["id"]}},
    )
    print(f"✓ Exemption fondateur accordée à « {org.get('name')} » ({user['org_id']}) pour {user.get('name') or email}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage : python grant_founder_exemption.py <email>")
        sys.exit(2)
    sys.exit(asyncio.run(main(sys.argv[1])))
