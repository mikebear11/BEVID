"""Rate limiter en mémoire, sliding window, clé par (kind, ip, email).

Suffit pour un déploiement mono-process. En cluster, migrer vers Redis.

Utilisé pour :
  - /auth/login       : progressif par email, permissif par IP
  - /auth/register    : 5 créations / 15 min
  - /auth/forgot-password : 3 demandes / 15 min
  - /api/errors       : 20 / 15 min
"""
import time
from collections import defaultdict
from threading import Lock
from typing import Tuple

# Structure : {(kind, key): [timestamp, timestamp, …]}
_buckets: dict[Tuple[str, str], list[float]] = defaultdict(list)
_lock = Lock()


def _now() -> float:
    return time.time()


def _prune(key_bucket: list[float], window_sec: float) -> list[float]:
    """Retire les timestamps hors fenêtre."""
    cutoff = _now() - window_sec
    return [t for t in key_bucket if t >= cutoff]


def check(kind: str, key: str, max_attempts: int, window_min: int) -> tuple[bool, int]:
    """Retourne (allowed, retry_after_seconds).

    allowed=False si le compteur a atteint max_attempts sur la fenêtre.
    retry_after = temps en secondes avant que le premier hit ne sorte de la fenêtre.
    """
    window_sec = window_min * 60
    with _lock:
        arr = _prune(_buckets[(kind, key)], window_sec)
        _buckets[(kind, key)] = arr
        if len(arr) >= max_attempts:
            oldest = arr[0]
            retry = int(oldest + window_sec - _now())
            return False, max(retry, 1)
        return True, 0


def check_progressive(kind: str, key: str, hard_cap: int, window_min: int,
                      delays: tuple = (0, 1, 2, 4, 8)) -> tuple[bool, int, int]:
    """Contrôle par compte (email) avec délai exponentiel entre tentatives.

    Retourne (allowed, retry_after_seconds, attempts_in_window).
    - attempts_in_window : nombre d'échecs cumulés sur la fenêtre AVANT cette tentative.
    - delays[i] : délai minimum requis (secondes) depuis la dernière tentative,
      pour le (i+1)-ième échec. Pour i >= len(delays), on retombe sur le hard_cap.
    - hard_cap : à partir de ce nombre d'échecs cumulés, blocage sec jusqu'à ce
      que le premier hit sorte de la fenêtre.
    """
    window_sec = window_min * 60
    with _lock:
        arr = _prune(_buckets[(kind, key)], window_sec)
        _buckets[(kind, key)] = arr
        attempts = len(arr)

        # Blocage sec au-delà du hard cap
        if attempts >= hard_cap:
            oldest = arr[0]
            retry = int(oldest + window_sec - _now())
            return False, max(retry, 1), attempts

        # Délai exponentiel : basé sur la dernière tentative
        if attempts > 0 and attempts <= len(delays) - 1:
            required = delays[attempts]
            last = arr[-1]
            elapsed = _now() - last
            if elapsed < required:
                return False, int(required - elapsed) + 1, attempts

        return True, 0, attempts


def record(kind: str, key: str) -> None:
    """Ajoute un hit au compteur."""
    with _lock:
        _buckets[(kind, key)].append(_now())


def clear(kind: str, key: str) -> None:
    """Purge le compteur (typiquement après une connexion réussie)."""
    with _lock:
        _buckets.pop((kind, key), None)
