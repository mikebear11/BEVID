"""Test des 3 emails de facturation (Resend) — envoi réel vers delivered@resend.dev + idempotence."""
import asyncio, os, sys, uuid
sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import billing_emails as be
import server


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    await db.billing_emails.create_index([("org_id", 1), ("kind", 1), ("ref", 1)], unique=True)
    be.configure(db, server.send_email)
    org_id, owner_id, sub_id = f"org-test-{uuid.uuid4()}", f"u-test-{uuid.uuid4()}", f"sub_test_{uuid.uuid4().hex[:8]}"
    await db.users.insert_one({"id": owner_id, "email": "delivered@resend.dev", "name": "Owner Test", "org_id": org_id, "role": "manager"})
    await db.organizations.insert_one({"id": org_id, "name": "Brasserie Test", "owner_user_id": owner_id, "status": "trial",
                                       "trial_ends_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
                                       "stripe_subscription_id": sub_id})
    try:
        ok1 = await be.notify_payment_confirmed(org_id, "cs_test_1", "Pro", 5800, 2, "monthly")
        dup = await be.notify_payment_confirmed(org_id, "cs_test_1", "Pro", 5800, 2, "monthly")
        ok2 = await be.notify_payment_failed(sub_id, "in_test_1", 5800)
        org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
        r = await asyncio.gather(be.notify_read_only(org), be.notify_read_only(org), be.notify_read_only(org))
        sent = await db.billing_emails.count_documents({"org_id": org_id, "status": "sent"})
        print("payment_confirmed:", ok1, "| doublon ignoré:", dup is False, "| payment_failed:", ok2,
              "| read_only x3 concurrent → 1 envoi:", sum(r) == 1, "| total envoyés:", sent)
        assert ok1 and not dup and ok2 and sum(r) == 1 and sent == 3
        print("PASS")
    finally:
        await db.users.delete_one({"id": owner_id}); await db.organizations.delete_one({"id": org_id})
        await db.billing_emails.delete_many({"org_id": org_id})

asyncio.run(main())
