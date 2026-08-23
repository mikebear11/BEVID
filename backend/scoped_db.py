"""Isolation multi-tenant par construction.

Principe : un wrapper `TenantDB` autour de l'objet Motor `db`. Toutes les
collections métier passent par un `TenantCollection` qui **injecte
automatiquement `org_id` sur les filtres et les documents insérés**.

Le contexte org est porté par un `ContextVar`, positionné par la dépendance
`with_org` juste après `get_current_user`. Chaque requête HTTP a son propre
contexte grâce à contextvars + asyncio (isolation par tâche).

Règles :
- Collection dans `SCOPED_COLLECTIONS` + contextvar défini → filtre injecté
- Collection dans SCOPED + contextvar None (endpoint public) → passthrough
  (les endpoints publics ne doivent pas toucher aux collections scopées
   sans passer explicitement par `db_raw`)
- Collection hors SCOPED (organisations, invitations, tokens uniques,
  seed global) → passthrough intégral

En cas de fuite (endpoint qui touche une collection scopée sans contextvar),
un log warning est émis pour repérer les oublis à l'audit.
"""
import logging
from contextvars import ContextVar
from typing import Any, Optional

logger = logging.getLogger("bevid.scoped_db")

_current_org: ContextVar[Optional[str]] = ContextVar("_current_org", default=None)


def set_current_org(org_id: Optional[str]) -> None:
    _current_org.set(org_id)


def get_current_org() -> Optional[str]:
    return _current_org.get()


# Collections métier : filtrage systématique par org_id
SCOPED_COLLECTIONS = {
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
    "objections",  # Lot 7 étape 1 — objections commerciales scopées par org
    "engagements", # Lot 7 étape 4 — promesses issues des visites
    "client_memory",  # Lot 7 étape 2 — mémoire client cache (recalcul événementiel)
    "establishment_comments",  # Lot 7 étape 5 — fil de commentaires libres
    "copilot_feedback",  # Lot 7 mesure — pouce haut/bas sur brief + suggestion réponse
    "document_sequences",  # Lot 8 étape 1 — compteurs atomiques factures/BL/devis…
    "business_documents",  # Lot 8 étape 1 — documents commerciaux et fiscaux
    "org_legal",  # Lot 8 étape 1 — mentions légales par organisation
    "contacts_v2",  # Lot 9 étape 1 — personnes physiques (déduplication cross-etab)
    "roles",  # Lot 9 étape 1 — liens datés contact ↔ établissement/société
}


class TenantCollection:
    """Proxy autour d'une collection Motor, injecte org_id automatiquement."""

    def __init__(self, coll, name: str):
        self._c = coll
        self._name = name

    def _needs_scope(self) -> bool:
        return self._name in SCOPED_COLLECTIONS

    def _scoped(self, filt: Optional[dict]) -> dict:
        filt = dict(filt) if filt else {}
        if not self._needs_scope():
            return filt
        org = _current_org.get()
        if org is None:
            # Endpoint public ou tâche système : autoriser mais tracer
            logger.warning("[scoped_db] accès non-scopé à %s (org=None)", self._name)
            return filt
        # Si l'appelant a déjà mis un org_id explicite, on le respecte
        if "org_id" not in filt:
            filt["org_id"] = org
        return filt

    async def find_one(self, filt=None, *args, **kwargs):
        return await self._c.find_one(self._scoped(filt), *args, **kwargs)

    def find(self, filt=None, *args, **kwargs):
        return self._c.find(self._scoped(filt), *args, **kwargs)

    async def insert_one(self, doc, *args, **kwargs):
        if self._needs_scope():
            org = _current_org.get()
            if org and doc.get("org_id") is None:
                doc["org_id"] = org
        return await self._c.insert_one(doc, *args, **kwargs)

    async def insert_many(self, docs, *args, **kwargs):
        if self._needs_scope():
            org = _current_org.get()
            if org:
                for d in docs:
                    if d.get("org_id") is None:
                        d["org_id"] = org
        return await self._c.insert_many(docs, *args, **kwargs)

    async def update_one(self, filt, update, *args, **kwargs):
        return await self._c.update_one(self._scoped(filt), update, *args, **kwargs)

    async def update_many(self, filt, update, *args, **kwargs):
        return await self._c.update_many(self._scoped(filt), update, *args, **kwargs)

    async def replace_one(self, filt, replacement, *args, **kwargs):
        if self._needs_scope():
            org = _current_org.get()
            if org and replacement.get("org_id") is None:
                replacement["org_id"] = org
        return await self._c.replace_one(self._scoped(filt), replacement, *args, **kwargs)

    async def delete_one(self, filt, *args, **kwargs):
        return await self._c.delete_one(self._scoped(filt), *args, **kwargs)

    async def delete_many(self, filt, *args, **kwargs):
        return await self._c.delete_many(self._scoped(filt), *args, **kwargs)

    async def count_documents(self, filt=None, *args, **kwargs):
        return await self._c.count_documents(self._scoped(filt), *args, **kwargs)

    def aggregate(self, pipeline, *args, **kwargs):
        if self._needs_scope():
            org = _current_org.get()
            if org:
                pipeline = [{"$match": {"org_id": org}}] + list(pipeline)
        return self._c.aggregate(pipeline, *args, **kwargs)

    async def distinct(self, key, filt=None, *args, **kwargs):
        return await self._c.distinct(key, self._scoped(filt), *args, **kwargs)

    async def find_one_and_update(self, filt, update, *args, **kwargs):
        return await self._c.find_one_and_update(self._scoped(filt), update, *args, **kwargs)

    async def find_one_and_delete(self, filt, *args, **kwargs):
        return await self._c.find_one_and_delete(self._scoped(filt), *args, **kwargs)

    # Fallback : accès direct aux méthodes non wrapées (create_index, etc.)
    def __getattr__(self, name: str) -> Any:
        return getattr(self._c, name)


class TenantDB:
    """Proxy autour d'une AsyncIOMotorDatabase."""

    def __init__(self, real_db):
        self._db = real_db
        self._cache: dict = {}

    def __getattr__(self, name: str) -> TenantCollection:
        if name.startswith("_"):
            raise AttributeError(name)
        if name not in self._cache:
            self._cache[name] = TenantCollection(self._db[name], name)
        return self._cache[name]

    def __getitem__(self, name: str) -> TenantCollection:
        return self.__getattr__(name)
