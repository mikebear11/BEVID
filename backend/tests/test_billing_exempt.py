"""Test — une organisation exemptée n'est jamais dégradée.

Verrou contre une régression silencieuse du moteur de facturation : quelle
que soit la date `trial_ends_at` ou le `billing_status_stripe`, une org avec
`billing_exempt=True` doit toujours renvoyer `effective_status == "active"`.

Ce test doit rester vert. Une modification de `_compute_effective_status`
qui le casserait signifie que la logique d'exemption a été perdue.
"""
from datetime import datetime, timedelta, timezone
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server import _compute_effective_status


def _iso(days_offset: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days_offset)).isoformat()


def test_exempt_org_active_even_if_trial_expired_yesterday():
    org = {"billing_exempt": True, "trial_ends_at": _iso(-1)}
    assert _compute_effective_status(org) == "active"


def test_exempt_org_active_even_if_trial_expired_long_ago():
    org = {"billing_exempt": True, "trial_ends_at": _iso(-365)}
    assert _compute_effective_status(org) == "active"


def test_exempt_org_active_even_if_stripe_past_due():
    org = {"billing_exempt": True, "billing_status_stripe": "past_due", "trial_ends_at": _iso(-30)}
    assert _compute_effective_status(org) == "active"


def test_exempt_org_active_even_if_stripe_canceled():
    org = {"billing_exempt": True, "billing_status_stripe": "canceled", "trial_ends_at": _iso(-30)}
    assert _compute_effective_status(org) == "active"


def test_exempt_org_active_even_if_status_suspended_in_db():
    org = {"billing_exempt": True, "status": "suspended", "trial_ends_at": _iso(-100)}
    assert _compute_effective_status(org) == "active"


def test_non_exempt_org_still_downgrades_after_trial():
    # Contrôle négatif : le mécanisme d'exemption ne fuit pas.
    org = {"billing_exempt": False, "trial_ends_at": _iso(-30)}
    assert _compute_effective_status(org) in ("read_only", "suspended")


def test_missing_exempt_flag_still_downgrades():
    # Absence du champ ≠ exemption.
    org = {"trial_ends_at": _iso(-30)}
    assert _compute_effective_status(org) in ("read_only", "suspended")


def test_exempt_falsey_still_downgrades():
    # Seul True active l'exemption. Ni None, ni 0, ni "true" (string).
    for v in (False, None, 0, "true", 1):
        org = {"billing_exempt": v, "trial_ends_at": _iso(-30)}
        result = _compute_effective_status(org)
        if v is True:
            assert result == "active", f"True doit exempter, obtenu {result}"
        else:
            assert result != "active" or org.get("status") == "active", (
                f"Valeur {v!r} ne doit pas exempter mais retourne {result}"
            )
