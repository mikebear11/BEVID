"""Compteur mensuel de crédits d'enrichissement Couche B, avec plafond et bascule.

Utilisation :
    guard = await CreditsGuard.check(db, provider_key="societe_com")
    if not guard.allowed:
        # bascule automatique sur la Couche A gratuite
        ...
    else:
        await guard.consume(db, 1)

Collection Mongo `enrichment_credits` :
    { provider, month (YYYY-MM), count, plafond, updated_at }
"""
import os
from dataclasses import dataclass
from datetime import datetime, timezone


def _current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


DEFAULT_LIMITS = {
    "societe_com": int(os.environ.get("ENRICHISSEMENT_CREDITS_LIMIT_SOCIETE", "1000")),
    "pappers":     int(os.environ.get("ENRICHISSEMENT_CREDITS_LIMIT_PAPPERS", "100")),
}


@dataclass
class CreditsGuard:
    provider: str
    month: str
    count: int
    plafond: int

    @property
    def allowed(self) -> bool:
        return self.count < self.plafond

    @classmethod
    async def check(cls, db, provider_key: str) -> "CreditsGuard":
        month = _current_month()
        doc = await db.enrichment_credits.find_one({"provider": provider_key, "month": month}, {"_id": 0})
        plafond = DEFAULT_LIMITS.get(provider_key, 1000)
        if not doc:
            return cls(provider=provider_key, month=month, count=0, plafond=plafond)
        return cls(
            provider=provider_key, month=month,
            count=int(doc.get("count", 0)),
            plafond=int(doc.get("plafond", plafond)),
        )

    async def consume(self, db, n: int = 1) -> None:
        await db.enrichment_credits.update_one(
            {"provider": self.provider, "month": self.month},
            {
                "$inc": {"count": n},
                "$set": {"plafond": self.plafond, "updated_at": datetime.now(timezone.utc).isoformat()},
                "$setOnInsert": {"created_at": datetime.now(timezone.utc).isoformat()},
            },
            upsert=True,
        )
        self.count += n


async def get_credits_report(db) -> list[dict]:
    """Retourne l'usage du mois courant pour chaque provider connu."""
    month = _current_month()
    out = []
    for provider, plafond in DEFAULT_LIMITS.items():
        guard = await CreditsGuard.check(db, provider)
        out.append({
            "provider": provider,
            "month": month,
            "count": guard.count,
            "plafond": guard.plafond,
            "remaining": max(0, guard.plafond - guard.count),
            "exhausted": not guard.allowed,
        })
    return out
