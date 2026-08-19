"""Migration idempotente vers le multi-tenant.

- Crée une organisation « BEVID Démo » si elle n'existe pas.
- Ajoute `org_id` sur tous les documents des collections scopées qui n'en ont pas.
- Vérifie au démarrage l'absence de documents orphelins et log une alerte.

Appelée depuis le startup event du serveur.
"""
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("bevid.tenant")

DEMO_ORG_NAME = "BEVID Démo"
DEMO_ORG_SLUG = "bevid-demo"

# Doit rester en phase avec scoped_db.SCOPED_COLLECTIONS
SCOPED = [
    "users", "clients", "establishments", "products", "orders", "visits",
    "tours", "containers", "stock_movements", "deals", "activities",
    "alert_rules", "alerts", "audit_logs", "bad_payer_alerts",
    "bank_counterparties", "bank_imports", "bank_lettrages", "bank_transactions",
    "conflicts", "connectors", "delivery_lines", "derogations",
    "drive_credentials", "events", "files", "goals", "ingestion_runs", "lots",
    "org_settings", "payment_transactions", "price_list_items", "price_lists",
    "product_costs", "product_enriched", "releves_terrain", "segments",
    "settings", "smart_goals", "sync_conflicts", "voice_uploads", "watch_events",
    "voice_recordings", "monthly_goals", "prospects", "radar_alerts",
    "veille_alerts", "bouclier_alerts", "drms",
]


async def ensure_demo_org(db_raw) -> str:
    """Crée BEVID Démo si absent. Retourne l'ID de l'org."""
    existing = await db_raw.organizations.find_one({"slug": DEMO_ORG_SLUG})
    if existing:
        return existing["id"]
    org_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": org_id,
        "name": DEMO_ORG_NAME,
        "slug": DEMO_ORG_SLUG,
        "created_at": now,
        "owner_user_id": None,   # rempli plus tard quand un manager est rattaché
        "plan": "pro",
        "trial_ends_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        "status": "active",
    }
    await db_raw.organizations.insert_one(doc)
    logger.info("[tenant] BEVID Démo créée id=%s", org_id[:8])
    return org_id


async def backfill_org_id(db_raw, org_id: str) -> dict:
    """Ajoute org_id sur tous les documents scopés qui n'en ont pas."""
    report = {}
    for coll_name in SCOPED:
        try:
            res = await db_raw[coll_name].update_many(
                {"org_id": {"$exists": False}},
                {"$set": {"org_id": org_id}},
            )
            if res.modified_count:
                report[coll_name] = res.modified_count
        except Exception as e:
            logger.warning("[tenant] backfill %s a échoué: %s", coll_name, e)
    if report:
        logger.info("[tenant] backfill terminé : %s", report)
    return report


async def ensure_owner_of_demo(db_raw, org_id: str) -> None:
    """S'assure qu'un compte manager de BEVID Démo est owner de l'org."""
    manager = await db_raw.users.find_one(
        {"org_id": org_id, "role": "manager"}, {"id": 1, "_id": 0}
    )
    if manager and manager.get("id"):
        await db_raw.organizations.update_one(
            {"id": org_id, "owner_user_id": None},
            {"$set": {"owner_user_id": manager["id"]}},
        )


async def check_orphans(db_raw) -> dict:
    """Retourne un dict {collection: count} des documents sans org_id."""
    orphans = {}
    for coll_name in SCOPED:
        try:
            n = await db_raw[coll_name].count_documents({"org_id": {"$exists": False}})
            if n > 0:
                orphans[coll_name] = n
        except Exception:
            pass
    if orphans:
        logger.warning("[tenant] documents orphelins détectés : %s", orphans)
    return orphans


async def create_indexes(db_raw) -> None:
    """Index composés (org_id, id) sur les collections scopées les plus requêtées."""
    priority = ["users", "clients", "establishments", "products", "orders",
                "visits", "tours", "deals", "containers", "activities"]
    for coll_name in priority:
        try:
            await db_raw[coll_name].create_index([("org_id", 1), ("id", 1)])
        except Exception as e:
            logger.warning("[tenant] index org_id sur %s : %s", coll_name, e)


async def run_tenant_migration(db_raw) -> dict:
    """Séquence complète, idempotente."""
    org_id = await ensure_demo_org(db_raw)
    backfill = await backfill_org_id(db_raw, org_id)
    await ensure_owner_of_demo(db_raw, org_id)
    await create_indexes(db_raw)
    orphans = await check_orphans(db_raw)
    return {"demo_org_id": org_id, "backfilled": backfill, "orphans": orphans}
