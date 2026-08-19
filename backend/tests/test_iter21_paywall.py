"""Régression Lot 4 P4.3 — Paywall en lecture seule et cohérence exemptions.

Vérifie :
- Trial → écritures acceptées (200)
- read_only → mutations retournent 402 avec effective_status
- Exemptions (billing, me/profile, errors, sync/push, auth) continuent de passer
- Suspended → 402 avec effective_status suspended
- Retour à `active` → écritures débloquées
- PUT et DELETE sont aussi bloqués en read_only (pas seulement POST)
"""
import os, time, subprocess, sys
import httpx
import pytest
sys.path.insert(0, "/app/backend")


def _api_url() -> str:
    return subprocess.check_output(
        ["grep", "REACT_APP_BACKEND_URL", "/app/frontend/.env"]
    ).decode().strip().split("=", 1)[1]


@pytest.mark.asyncio
async def test_paywall_full_cycle():
    from motor.motor_asyncio import AsyncIOMotorClient
    import billing_guard as bg

    api = _api_url()
    ts = int(time.time())
    async with httpx.AsyncClient(base_url=api, timeout=30) as cli:
        email = f"pwreg_{ts}@bevid.fr"
        r = await cli.post("/api/auth/register", json={
            "email": email, "password": "PwStrong12345",
            "password_confirm": "PwStrong12345", "name": "PWReg",
            "accept_terms": True, "accept_privacy": True,
        })
        assert r.status_code == 200
        h = {"Authorization": "Bearer " + r.json()["token"]}
        org_id = r.json()["user"]["org_id"]

        # 1. Trial → OK
        r = await cli.post("/api/clients", json={"name": "Bar Trial", "status": "actif"}, headers=h)
        assert r.status_code == 200

        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]

        # 2. Force read_only
        await db.organizations.update_one(
            {"id": org_id},
            {"$set": {"trial_ends_at": "2026-08-16T00:00:00+00:00", "status": "trial"}},
        )
        bg.invalidate_status(org_id)
        r = await cli.post("/api/clients", json={"name": "X", "status": "actif"}, headers=h)
        assert r.status_code == 402
        assert r.json().get("effective_status") == "read_only"

        # 3. Exemptions en read_only doivent passer
        assert (await cli.get("/api/clients", headers=h)).status_code == 200
        assert (await cli.get("/api/billing/current", headers=h)).status_code == 200
        assert (await cli.put("/api/me/profile", json={"display_name": "X"}, headers=h)).status_code == 200
        assert (await cli.post("/api/auth/logout", headers=h)).status_code == 200

        # 4. Suspended
        await db.organizations.update_one(
            {"id": org_id}, {"$set": {"trial_ends_at": "2026-07-15T00:00:00+00:00"}},
        )
        bg.invalidate_status(org_id)
        r = await cli.post("/api/clients", json={"name": "S", "status": "actif"}, headers=h)
        assert r.status_code == 402
        assert r.json().get("effective_status") == "suspended"

        # 5. Active → OK
        await db.organizations.update_one(
            {"id": org_id},
            {"$set": {"status": "active", "trial_ends_at": None, "billing_status_stripe": None}},
        )
        bg.invalidate_status(org_id)
        r = await cli.post("/api/clients", json={"name": "Bar Active", "status": "actif"}, headers=h)
        assert r.status_code == 200
        cid = r.json()["id"]

        # 6. Re-read_only : PUT et DELETE bloqués
        await db.organizations.update_one(
            {"id": org_id},
            {"$set": {"status": "trial", "trial_ends_at": "2026-08-16T00:00:00+00:00"}},
        )
        bg.invalidate_status(org_id)
        r = await cli.put(f"/api/clients/{cid}", json={"name": "H"}, headers=h)
        assert r.status_code == 402
        r = await cli.delete(f"/api/clients/{cid}", headers=h)
        assert r.status_code == 402
