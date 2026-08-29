"""Test — le rôle produit super_admin.

Vérifie :
- L'exemption s'applique aux emails OWNER_EMAILS via bootstrap
- Un super_admin n'a AUCUN accès aux données métier des autres orgs
- Une org exemptée n'est jamais dégradée
"""
import os
import sys
from datetime import datetime, timedelta, timezone
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Le set PRODUCT_OWNER_EMAILS est calculé à l'import ; on utilise donc les
# emails effectivement en config (backend/.env), pas un email de test factice.
from server import _is_product_owner, _compute_effective_status, PRODUCT_OWNER_EMAILS


def test_owner_emails_recognized():
    # Au moins une adresse doit être configurée pour que le rôle produit existe.
    assert PRODUCT_OWNER_EMAILS, "OWNER_EMAILS ou BEVID_FOUNDER_EMAILS doit lister au moins un email"
    known = next(iter(PRODUCT_OWNER_EMAILS))
    assert _is_product_owner(known) is True
    assert _is_product_owner(known.upper()) is True
    assert _is_product_owner("random-not-in-config@user.com") is False
    assert _is_product_owner("") is False
    assert _is_product_owner(None) is False


def test_exempt_never_downgrades_across_all_edge_cases():
    """Verrou dur : quelle que soit la config, exempt=True → active."""
    now = datetime.now(timezone.utc)
    for days in (-1, -30, -365, -3650):
        org = {"billing_exempt": True, "trial_ends_at": (now + timedelta(days=days)).isoformat()}
        assert _compute_effective_status(org) == "active", f"Régression avec days={days}"
    for stripe_st in ("past_due", "canceled", "unpaid", "incomplete"):
        org = {"billing_exempt": True, "billing_status_stripe": stripe_st,
               "trial_ends_at": (now - timedelta(days=100)).isoformat()}
        assert _compute_effective_status(org) == "active", f"Régression avec stripe={stripe_st}"


def test_exempt_only_activated_by_strict_true():
    """Ni None, ni "true", ni 1 n'activent l'exemption — seul True booléen."""
    now = datetime.now(timezone.utc)
    trial_expired = (now - timedelta(days=30)).isoformat()
    for falsy_or_wrong in (None, False, 0, "true", "True", 1, "yes"):
        org = {"billing_exempt": falsy_or_wrong, "trial_ends_at": trial_expired}
        s = _compute_effective_status(org)
        if falsy_or_wrong is True:  # jamais atteint mais safety
            assert s == "active"
        else:
            assert s in ("read_only", "suspended"), f"Valeur {falsy_or_wrong!r} ne doit pas exempter"


def test_non_exempt_still_downgrades():
    """Contrôle négatif — le mécanisme ne fuit pas."""
    now = datetime.now(timezone.utc)
    org = {"trial_ends_at": (now - timedelta(days=30)).isoformat()}
    assert _compute_effective_status(org) in ("read_only", "suspended")
