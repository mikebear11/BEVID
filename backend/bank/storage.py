"""Adapter object storage — isolé, tout appel externe passe ici.
PARTIE 0 : aucun autre module ne connaît INTEGRATION_PROXY_URL."""
import os
import logging
import requests

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
APP_NAME = "bevid"

_storage_key: str | None = None
_log = logging.getLogger("bank.storage")


def init_storage(force: bool = False) -> str | None:
    """Idempotent. Retourne None si non provisionné (l'appelant doit gérer)."""
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    if not EMERGENT_KEY:
        _log.warning("EMERGENT_LLM_KEY manquant — object storage désactivé")
        return None
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        r.raise_for_status()
        _storage_key = r.json()["storage_key"]
        return _storage_key
    except Exception as e:
        _log.error(f"init_storage failed: {e}")
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise RuntimeError("Object storage indisponible")
    try:
        r = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120
        )
        if r.status_code in (403, 404):
            # key inactive → force re-init une fois puis retry
            key = init_storage(force=True)
            if not key:
                raise RuntimeError("Object storage indisponible")
            r = requests.put(
                f"{STORAGE_URL}/objects/{path}",
                headers={"X-Storage-Key": key, "Content-Type": content_type},
                data=data, timeout=120
            )
        r.raise_for_status()
        return r.json()
    except requests.HTTPError as e:
        raise RuntimeError(f"Upload échoué: {e.response.status_code}") from e


def get_object(path: str) -> tuple[bytes, str]:
    key = init_storage()
    if not key:
        raise RuntimeError("Object storage indisponible")
    try:
        r = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key}, timeout=60
        )
        if r.status_code == 404:
            key = init_storage(force=True)
            r = requests.get(
                f"{STORAGE_URL}/objects/{path}",
                headers={"X-Storage-Key": key}, timeout=60
            )
        r.raise_for_status()
        return r.content, r.headers.get("Content-Type", "application/octet-stream")
    except requests.HTTPError as e:
        if e.response.status_code == 404:
            raise FileNotFoundError(path) from e
        raise RuntimeError(f"Download échoué: {e.response.status_code}") from e
