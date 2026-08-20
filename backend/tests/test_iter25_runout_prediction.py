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
    # 5 commandes de blonde à 21 jours d'écart → 4 intervalles retenus, doit émettre
    orders = [
        _order(84, "P1", 3), _order(63, "P1", 3), _order(42, "P1", 3),
        _order(21, "P1", 3), _order(2, "P1", 3),  # 2 jours = pas trop récent
    ]
    r = compute_runouts(orders, PRODUCTS, today=today)
    assert len(r["predictions"]) == 1, r
    p = r["predictions"][0]
    assert p["product_id"] == "P1"
    assert p["avg_interval_days"] == 20 or p["avg_interval_days"] == 21  # 84/4 pattern
    assert p["days_since_last_order"] == 2
    assert p["samples_used"] >= 3
    assert "Commande tous les" in p["explanation"]
    assert "il y a 2 jours" in p["explanation"]


def test_prediction_less_than_three_orders_stays_silent():
    """Règle : se taire si <3 commandes du même produit (avant tout filtrage)."""
    today = date(2026, 8, 20)
    orders = [_order(30, "P1", 3), _order(0, "P1", 3)]
    r = compute_runouts(orders, PRODUCTS, today=today)
    assert r["predictions"] == []
    assert r["excluded"]["too_few_orders"] == 1


def test_prediction_less_than_three_intervals_after_filter_stays_silent():
    """Règle CRITIQUE : se taire si <3 intervalles RETENUS après exclusion des
    commandes d'événement. Une moyenne sur 1 mesure n'est pas une moyenne.

    Cas : 4 commandes, dont 1 d'événement au milieu → 3 intervalles bruts, mais
    2 écartés par filtrage événement → 1 seul retenu → silence obligatoire.
    """
    today = date(2026, 8, 20)
    orders = [
        _order(63, "P1", 3),
        _order(42, "P1", 30),   # ← événement, écarte les 2 intervalles adjacents
        _order(21, "P1", 3),
        _order(0, "P1", 3),
    ]
    r = compute_runouts(orders, PRODUCTS, today=today)
    assert r["predictions"] == [], f"attendu vide, obtenu {r['predictions']}"
    assert r["excluded"]["too_few_after_outliers"] == 1


def test_prediction_ignores_event_orders_with_enough_history():
    """Une commande de 30 fûts (>2.5x médiane) pour un festival ne doit pas
    contaminer le rythme moyen — mais seulement si l'historique restant suffit."""
    today = date(2026, 8, 20)
    # 6 commandes normales + 1 événement → 5 intervalles bruts, 2 écartés (adjacents
    # à l'événement), 4 retenus. Assez pour émettre.
    orders = [
        _order(126, "P1", 3),
        _order(105, "P1", 3),
        _order(84, "P1", 3),
        _order(63, "P1", 30),   # ← événement
        _order(42, "P1", 3),
        _order(21, "P1", 3),
        _order(3, "P1", 3),
    ]
    r = compute_runouts(orders, PRODUCTS, today=today)
    assert len(r["predictions"]) == 1
    p = r["predictions"][0]
    assert p["avg_interval_days"] == 21
    assert p["samples_used"] >= 3
    assert p["samples_excluded_outliers"] >= 1


def test_prediction_irregular_rhythm_stays_silent():
    """CV > 0.6 → prédiction trop hasardeuse, on se tait."""
    today = date(2026, 8, 20)
    # 6 commandes, intervalles très irréguliers : 5, 40, 5, 40, 5
    orders = [
        _order(95, "P1", 3),
        _order(90, "P1", 3),
        _order(50, "P1", 3),
        _order(45, "P1", 3),
        _order(5, "P1", 3),
        _order(3, "P1", 3),
    ]
    r = compute_runouts(orders, PRODUCTS, today=today)
    assert r["predictions"] == []
    assert r["excluded"]["too_irregular"] >= 1


def test_prediction_too_recent_order_stays_silent():
    """Commande passée aujourd'hui/hier → prédiction lointaine inutile, on ne l'affiche pas."""
    today = date(2026, 8, 20)
    orders = [
        _order(84, "P1", 3), _order(63, "P1", 3), _order(42, "P1", 3),
        _order(21, "P1", 3), _order(0, "P1", 3),  # ← commandé aujourd'hui
    ]
    r = compute_runouts(orders, PRODUCTS, today=today)
    assert r["predictions"] == []
    assert r["excluded"]["too_recent"] == 1


def test_explanation_natural_language_for_edge_cases():
    """Cas particuliers de la dernière commande : commandé aujourd'hui / hier / il y a N jours."""
    today = date(2026, 8, 20)
    # 5 commandes normales, dernière il y a 3 jours → phrase "il y a 3 jours"
    orders = [
        _order(84, "P1", 3), _order(63, "P1", 3), _order(42, "P1", 3),
        _order(21, "P1", 3), _order(3, "P1", 3),
    ]
    r = compute_runouts(orders, PRODUCTS, today=today)
    assert len(r["predictions"]) == 1
    exp = r["predictions"][0]["explanation"]
    assert "il y a 3 jours" in exp
    # Format phrase toujours conforme
    assert "Blonde 20L" in exp
    assert "probablement à sec" in exp
    assert "en moyenne" in exp
