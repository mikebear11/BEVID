"""Régression Lot 4 P5 — Cohérence 404 sur PUT/DELETE cross-tenant.

Vérifie que 14 endpoints scopés renvoient bien 404 quand :
- une org B tente de muter une ressource de l'org A (isolation multi-tenant)
- un ID inexistant est passé (cohérence REST)

Et que les mutations locales renvoient toujours 200.
"""
import os, time, subprocess
import httpx
import pytest


def _api_url() -> str:
    return subprocess.check_output(
        ["grep", "REACT_APP_BACKEND_URL", "/app/frontend/.env"]
    ).decode().strip().split("=", 1)[1]


@pytest.mark.asyncio
async def test_cross_tenant_and_missing_id_return_404():
    api = _api_url()
    ts = int(time.time())
    async with httpx.AsyncClient(base_url=api, timeout=30) as cli:
        # 2 orgs fraîches
        A_email, B_email = f"reg20A_{ts}@bevid.fr", f"reg20B_{ts}@bevid.fr"
        rA = await cli.post("/api/auth/register", json={
            "email": A_email, "password": "PassRegAAA123",
            "password_confirm": "PassRegAAA123", "name": "RegA",
            "accept_terms": True, "accept_privacy": True,
        })
        rB = await cli.post("/api/auth/register", json={
            "email": B_email, "password": "PassRegBBB123",
            "password_confirm": "PassRegBBB123", "name": "RegB",
            "accept_terms": True, "accept_privacy": True,
        })
        assert rA.status_code == 200, f"A register: {rA.text[:200]}"
        assert rB.status_code == 200, f"B register: {rB.text[:200]}"
        hA = {"Authorization": "Bearer " + rA.json()["token"]}
        hB = {"Authorization": "Bearer " + rB.json()["token"]}

        async def _post(url, body):
            r = await cli.post(url, json=body, headers=hA)
            return r.json().get("id") if r.status_code == 200 else None

        pid   = await _post("/api/products",      {"name": "Bière A", "sku": "BA-1", "unit_price": 3.5, "stock": 100})
        cid   = await _post("/api/clients",       {"name": "BarA", "status": "actif"})
        tid   = await _post("/api/tours",         {"name": "T1", "date": "2026-08-20", "stops": []})
        eid   = await _post("/api/events",        {"title": "V", "start": "2026-08-20T10:00:00Z", "end": "2026-08-20T11:00:00Z"})
        did   = await _post("/api/deals",         {"title": "D1", "client_id": cid, "amount": 1000})
        estid = await _post("/api/establishments",{"name": "EstA", "address": "1r", "postal_code": "59000", "city": "Lille", "status": "actif"})
        oid   = await _post("/api/orders",        {"client_id": cid, "client_name": "BarA",
                                                    "lines": [{"product_id": pid, "product_name": "Bière A", "quantity": 1, "unit_price": 3.5}]})

        # --- Cross-tenant : B tente de muter les ressources de A → 404 ---
        cross = [
            ("PUT",    f"/api/products/{pid}",         {"name": "H"}),
            ("DELETE", f"/api/products/{pid}",         None),
            ("PUT",    f"/api/orders/{oid}",           {"total": 0}),
            ("PUT",    f"/api/tours/{tid}",            {"date": "2099-01-01"}),
            ("PUT",    f"/api/events/{eid}",           {"title": "H"}),
            ("DELETE", f"/api/events/{eid}",           None),
            ("PUT",    f"/api/clients/{cid}/status",   {"status": "inactif"}),
            ("PUT",    f"/api/deals/{did}",            {"amount": 0}),
            ("DELETE", f"/api/deals/{did}",            None),
            ("PUT",    f"/api/establishments/{estid}", {"name": "H"}),
            ("DELETE", f"/api/rgpd/clients/{cid}",     None),
        ]
        for method, url, body in cross:
            r = await cli.request(method, url, json=body or {}, headers=hB)
            assert r.status_code == 404, f"CROSS {method} {url} → {r.status_code} (attendu 404)"

        # --- A vérifie que ses données sont intactes ---
        r = await cli.get("/api/products", headers=hA)
        p = next(x for x in r.json() if x["id"] == pid)
        assert p["name"] == "Bière A", f"product name modifié : {p['name']}"
        r = await cli.get("/api/deals", headers=hA)
        d = next(x for x in r.json() if x["id"] == did)
        assert d["amount"] == 1000, f"deal amount modifié : {d['amount']}"

        # --- A fait ses propres PUT/DELETE → 200 ---
        own = [
            ("PUT",    f"/api/products/{pid}",         {"name": "BA-renamed"}),
            ("PUT",    f"/api/tours/{tid}",            {"date": "2026-08-21"}),
            ("DELETE", f"/api/events/{eid}",           {}),
            ("PUT",    f"/api/establishments/{estid}", {"name": "EstA renamed"}),
        ]
        for method, url, body in own:
            r = await cli.request(method, url, json=body, headers=hA)
            assert r.status_code == 200, f"OWN {method} {url} → {r.status_code} (attendu 200)"

        # --- ID inexistant → 404 partout ---
        missing = [
            ("PUT",    "/api/products/nope-xyz",     {"name": "x"}),
            ("PUT",    "/api/orders/nope-xyz",       {"total": 0}),
            ("PUT",    "/api/tours/nope-xyz",        {"date": "2099-01-01"}),
            ("PUT",    "/api/deals/nope-xyz",        {"amount": 0}),
            ("DELETE", "/api/deals/nope-xyz",        {}),
            ("PUT",    "/api/establishments/nope",   {"name": "x"}),
            ("DELETE", "/api/rgpd/clients/nope",     {}),
            ("PUT",    "/api/segments/nope",         {"code": "A", "label": "y", "target_visit_days": 21}),
            ("PUT",    "/api/clients/nope/status",   {"status": "inactif"}),
        ]
        for method, url, body in missing:
            r = await cli.request(method, url, json=body, headers=hA)
            assert r.status_code == 404, f"MISSING {method} {url} → {r.status_code} (attendu 404)"
