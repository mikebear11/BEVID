"""Couche C — données de lieu.

RÈGLES CRITIQUES :
  - OSM : socle stockable dans `osm_places`, JAMAIS joint aux tables propriétaires,
          attribution "© OpenStreetMap contributors" affichée côté UI.
  - Google Places : SEUL le `place_id` peut être stocké (`google_place_refs`).
          note / avis / horaires / téléphone / site / niveau de prix / photos
          = appelés en direct à l'ouverture de la fiche, JAMAIS écrits en base
          ni dans un cache persistant. Aucune colonne `note_google`.
"""
import os
import time
import httpx

from datetime import datetime, timezone

GOOGLE_PLACES_DETAILS = "https://places.googleapis.com/v1/places"

# Champs Google autorisés en LECTURE DIRECTE uniquement (jamais persistés).
GOOGLE_FIELD_MASK = (
    "id,displayName,formattedAddress,rating,userRatingCount,priceLevel,"
    "regularOpeningHours,internationalPhoneNumber,websiteUri,googleMapsUri,"
    "photos.name,attributions,editorialSummary"
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def link_google_place(db, establishment_id: str, place_id: str) -> dict:
    """Enregistre UNIQUEMENT le place_id — jamais les données Google."""
    place_id = (place_id or "").strip()
    if not place_id:
        raise ValueError("place_id requis")
    doc = {
        "establishment_id": establishment_id,
        "place_id": place_id,
        "linked_at": now_iso(),
    }
    await db.google_place_refs.update_one(
        {"establishment_id": establishment_id},
        {"$set": doc},
        upsert=True,
    )
    return doc


async def unlink_google_place(db, establishment_id: str) -> None:
    await db.google_place_refs.delete_one({"establishment_id": establishment_id})


async def get_place_ref(db, establishment_id: str) -> dict | None:
    return await db.google_place_refs.find_one(
        {"establishment_id": establishment_id}, {"_id": 0}
    )


async def fetch_google_place_live(place_id: str) -> dict:
    """Appel LIVE à Google Places (New) — aucune persistance, aucun cache.

    Retourne :
      - _available: bool
      - _reason: raison de l'indisponibilité (si applicable)
      - _fetched_at: horodatage de l'appel (pour affichage "à l'instant")
      - data: payload Google brut + attributions
    """
    key = os.environ.get("GOOGLE_PLACES_KEY", "").strip()
    if not key:
        return {"_available": False, "_reason": "no_google_key"}
    if not place_id:
        return {"_available": False, "_reason": "no_place_id"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                f"{GOOGLE_PLACES_DETAILS}/{place_id}",
                headers={
                    "X-Goog-Api-Key": key,
                    "X-Goog-FieldMask": GOOGLE_FIELD_MASK,
                    "User-Agent": "BEVID/1.0",
                },
            )
            r.raise_for_status()
            payload = r.json()
    except httpx.HTTPStatusError as e:
        return {"_available": False, "_reason": f"http_{e.response.status_code}"}
    except Exception as e:
        return {"_available": False, "_reason": f"error_{type(e).__name__}"}
    return {
        "_available": True,
        "_fetched_at": now_iso(),
        "_attribution": "Données Google Maps — appelées en direct, non stockées",
        "data": payload,
    }


# ============================================================================
# OSM — table isolée, jamais jointe aux tables propriétaires côté requête
# ============================================================================

async def upsert_osm_place(db, osm_id: str, osm_type: str, payload: dict) -> None:
    """Enregistre un POI OSM. Ne relie JAMAIS à `establishments`."""
    doc = {
        "osm_id": osm_id,
        "osm_type": osm_type,       # node | way | relation
        "name": payload.get("name"),
        "amenity": payload.get("amenity"),
        "cuisine": payload.get("cuisine"),
        "lat": payload.get("lat"),
        "lng": payload.get("lng"),
        "tags": payload.get("tags") or {},
        "updated_at": now_iso(),
        "attribution": "© OpenStreetMap contributors",
    }
    await db.osm_places.update_one(
        {"osm_id": osm_id, "osm_type": osm_type},
        {"$set": doc, "$setOnInsert": {"created_at": now_iso()}},
        upsert=True,
    )


async def search_osm_places(db, lat: float, lng: float, radius_deg: float = 0.02, limit: int = 50) -> list[dict]:
    """Recherche géographique dans le socle OSM stocké (bounding box simple)."""
    q = {
        "lat": {"$gte": lat - radius_deg, "$lte": lat + radius_deg},
        "lng": {"$gte": lng - radius_deg, "$lte": lng + radius_deg},
    }
    return await db.osm_places.find(q, {"_id": 0}).limit(limit).to_list(limit)
