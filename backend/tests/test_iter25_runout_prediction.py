"""Tests purs (sans FastAPI/DB) de l'algo de prédiction de rupture."""

from datetime import date, timedelta
from analytics.runout import compute_runouts


PRODUCTS = {
    "P1": {"id": "P1", "name": "Blonde 20L", "unit": "fût"},
    "P2": {"id": "P2", "name": "IPA carton", "unit": "carton"},
    "P3": {"id": "P3", "name": "Rouge Bio", "unit": "bouteille"},
}


def _order(days_ago, pid, qty, base=date(2026, 8, 20)):
    d = base - timedelta(days=days_ago)
    return {"created_at": d.isoformat(), "lines": [{"product_id": pid, "quantity": qty}]}


def test_prediction_regular_rhythm_emits():
    today = date(2026, 8, 20)
    # 4 commandes de blonde à 21 jours d'écart → rythme clair, doit émettre
    orders = [
        _order(63, "P1", 3), _order(42, "P1", 3),
        _order(21, "P1", 3), _order(0, "P1", 3),
    ]
    r = compute_runouts(orders, PRODUCTS, today=today)
    assert len(r["predictions"]) == 1, r
    p = r["predictions"][0]
    assert p["product_id"] == "P1"
    assert p["avg_interval_days"] == 21
    assert p["days_since_last_order"] == 0
    assert p["samples_used"] == 3
    assert "Commande tous les 21 jours" in p["explanation"]
    assert "il y a 0 jours" in p["explanation"]


def test_prediction_less_than_three_orders_stays_silent():
    """Règle : se taire si <3 commandes du même produit."""
    today = date(2026, 8, 20)
    orders = [_order(30, "P1", 3), _order(0, "P1", 3)]
    r = compute_runouts(orders, PRODUCTS, today=today)
    assert r["predictions"] == []
    assert r["excluded"]["too_few_orders"] == 1


def test_prediction_ignores_event_orders():
    """Une commande de 30 fûts (>2.5x médiane) pour un festival ne doit pas
    contaminer le rythme moyen."""
    today = date(2026, 8, 20)
    # Rythme normal 21j × qty 3, avec un pic à 30 fûts au milieu.
    orders = [
        _order(84, "P1", 3),
        _order(63, "P1", 3),
        _order(42, "P1", 30),   # ← événement, doit être ignoré dans les intervalles
        _order(21, "P1", 3),
        _order(0, "P1", 3),
    ]
    r = compute_runouts(orders, PRODUCTS, today=today)
    assert len(r["predictions"]) == 1
    p = r["predictions"][0]
    assert p["avg_interval_days"] == 21  # jamais tiré vers un rythme faussé
    assert p["samples_excluded_outliers"] >= 1


def test_prediction_irregular_rhythm_stays_silent():
    """CV > 0.6 → prédiction trop hasardeuse, on se tait."""
    today = date(2026, 8, 20)
    # Intervalles très irréguliers : 5, 40, 5, 40 jours
    orders = [
        _order(90, "P1", 3),
        _order(85, "P1", 3),
        _order(45, "P1", 3),
        _order(40, "P1", 3),
        _order(0, "P1", 3),
    ]
    r = compute_runouts(orders, PRODUCTS, today=today)
    assert r["predictions"] == []
    assert r["excluded"]["too_irregular"] >= 1


def test_explanation_contains_reasoning_line():
    """Règle NON négociable : le raisonnement figure toujours dans l'explication."""
    today = date(2026, 8, 20)
    orders = [_order(60, "P1", 2), _order(40, "P1", 2), _order(20, "P1", 2), _order(0, "P1", 2)]
    r = compute_runouts(orders, PRODUCTS, today=today)
    exp = r["predictions"][0]["explanation"]
    # phrase FR : produit, projection, moyenne, dernière commande
    assert "Blonde 20L" in exp
    assert "probablement à sec" in exp
    assert "en moyenne" in exp
    assert "il y a" in exp and "jours" in exp
