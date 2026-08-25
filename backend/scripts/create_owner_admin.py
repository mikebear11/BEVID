#!/usr/bin/env python3
"""Crée (ou met à jour) un compte admin propriétaire avec accès illimité.

Effets :
- L'utilisateur est **manager** de son organisation.
- L'organisation est marquée `billing_exempt=True` → paywall désactivé.
- Plan = `entreprise` (le plus haut, active toutes les fonctions).
- Statut = `active`, sans date de fin d'essai.
- Idempotent : rejouable sans effet secondaire (met à jour le mdp si fourni).

Usage :
    python /app/backend/scripts/create_owner_admin.py \
        --email owner.bevid@bevidcrm.fr \
        --name  "Propriétaire BEVID" \
        --password "OwnerBevid!2026" \
        --org-name "BEVID Owner"
"""
import argparse
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(pwd: str) -> str:
    return bcrypt.hashpw(pwd.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


async def upsert_owner(email: str, name: str, password: str, org_name: str) -> int:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    email = email.strip().lower()
    now = now_iso()

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        # Mise à jour minimale : reset mdp + rôle + activation. On garde l'org
        # existante pour ne pas casser les liens portefeuilles / historique.
        org_id = existing.get("org_id")
        await db.users.update_one(
            {"id": existing["id"]},
            {"$set": {
                "password": hash_password(password),
                "role": "manager",
                "active": True,
                "must_reset": False,
                "name": name or existing.get("name") or email,
                "updated_at": now,
            }},
        )
        print(f"= User existant mis à jour : {email} (org_id={org_id})")
    else:
        org_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        user_doc = {
            "id": user_id,
            "email": email,
            "name": name or email,
            "role": "manager",
            "language": "fr",
            "active": True,
            "must_reset": False,
            "org_id": org_id,
            "password": hash_password(password),
            "terms_accepted_at": now,
            "terms_accepted_ip": "127.0.0.1",
            "created_at": now,
        }
        org_doc = {
            "id": org_id,
            "name": org_name,
            "slug": org_name.lower().replace(" ", "-"),
            "created_at": now,
            "owner_user_id": user_id,
            "plan": "entreprise",
            "trial_ends_at": None,
            "status": "active",
            "billing_exempt": True,
            "billing_exempt_reason": "owner_admin",
            "billing_mode": "monthly",
            "exempted_at": now,
            "exempted_by": user_id,
        }
        await db.organizations.insert_one(org_doc)
        await db.users.insert_one(user_doc)
        print(f"✓ Nouveau user créé : {email} (org_id={org_id})")

    if not org_id:
        print("✗ User sans org_id, impossible d'appliquer l'exemption")
        return 1

    # Toujours forcer l'exemption facturation + plan max sur l'org (idempotent).
    await db.organizations.update_one(
        {"id": org_id},
        {"$set": {
            "billing_exempt": True,
            "billing_exempt_reason": "owner_admin",
            "status": "active",
            "trial_ends_at": None,
            "plan": "entreprise",
            "billing_mode": "monthly",
            "exempted_at": now,
        }},
    )
    print(f"✓ Organisation {org_id} : billing_exempt=True, plan=entreprise, status=active")
    print(f"→ Connexion : {email} / {password}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", required=True)
    ap.add_argument("--name", default="Propriétaire BEVID")
    ap.add_argument("--password", required=True)
    ap.add_argument("--org-name", default="BEVID Owner")
    args = ap.parse_args()
    return asyncio.run(upsert_owner(args.email, args.name, args.password, args.org_name))


if __name__ == "__main__":
    sys.exit(main())
