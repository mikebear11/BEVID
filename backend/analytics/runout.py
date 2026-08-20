"""Prédiction de rupture par (client, produit) — Lot 6 point 2.

Contrat produit (rappel exact des règles fixées) :
  1. Pas de modèle compliqué. Moyenne des intervalles entre commandes du même
     produit — la sophistication n'apporte rien et coûte la confiance.
  2. Toujours afficher le raisonnement dans la même phrase. C'est LE point le
     plus important, avant même la justesse du calcul.
  3. Se taire quand on ne sait pas : <3 commandes, intervalles trop irréguliers,
     tous les intervalles écartés → aucune prédiction émise.
  4. Écarter les valeurs aberrantes (grosse commande d'événement) via IQR.
     Un bar qui a pris 10 fûts pour le 14 juillet n'a pas changé de rythme.
  5. Aucune alerte, aucun badge rouge. Résultat retourné brut, l'UI l'affiche
     discrètement dans la liste tournée / fiche établissement.

Testable à part sans dépendance FastAPI/DB (fonction pure).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from statistics import mean, stdev
from typing import Iterable

# Seuils métier — issues des règles fournies par le PO
MIN_ORDERS_PER_PRODUCT = 3          # se taire en-dessous
MAX_COEFFICIENT_OF_VARIATION = 0.6  # au-delà : rythme trop irrégulier, se taire
QUANTITY_OUTLIER_RATIO = 2.5        # x médiane → commande d'événement, exclue


def _parse_iso_date(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except Exception:
        return None


def _iqr_filter(values: list[int]) -> tuple[list[int], int]:
    """Écarte les intervalles hors [Q1-1.5·IQR, Q3+1.5·IQR].
    Retourne (kept, excluded_count).
    """
    if len(values) < 4:
        return list(values), 0
    s = sorted(values)
    n = len(s)
    q1 = s[n // 4]
    q3 = s[(3 * n) // 4]
    iqr = q3 - q1
    low = q1 - 1.5 * iqr
    high = q3 + 1.5 * iqr
    kept = [v for v in values if low <= v <= high]
    return kept, len(values) - len(kept)


def compute_runouts(
    orders: Iterable[dict],
    products_by_id: dict[str, dict],
    today: date | None = None,
) -> dict:
    """Calcule les prédictions de rupture pour un client.

    Args:
        orders: itérable de commandes brutes MongoDB (dict avec created_at + lines).
        products_by_id: {product_id: {name, unit, ...}} — pour rendre l'explication lisible.
        today: date de référence (défaut = aujourd'hui UTC).

    Returns:
        {
          "predictions": [ {product_id, product_name, avg_interval_days,
                            days_since_last_order, last_order_date,
                            predicted_out_date, days_until_out,
                            samples_used, samples_excluded_outliers,
                            explanation }, … ] triées par days_until_out asc,
          "excluded": { "too_few_orders": N, "too_irregular": N, "all_outliers": N },
        }
    """
    today = today or date.today()

    # Regrouper par produit : dates de commande + quantités
    dates_by_pid: dict[str, list[date]] = defaultdict(list)
    qtys_by_pid: dict[str, list[float]] = defaultdict(list)
    for o in orders:
        d = _parse_iso_date(o.get("created_at"))
        if not d:
            continue
        for line in (o.get("lines") or []):
            pid = line.get("product_id")
            if not pid:
                continue
            dates_by_pid[pid].append(d)
            try:
                qtys_by_pid[pid].append(float(line.get("quantity") or 0))
            except Exception:
                qtys_by_pid[pid].append(0.0)

    predictions: list[dict] = []
    excluded = {"too_few_orders": 0, "too_irregular": 0, "all_outliers": 0}

    for pid, dates in dates_by_pid.items():
        if len(dates) < MIN_ORDERS_PER_PRODUCT:
            excluded["too_few_orders"] += 1
            continue

        # 1) Écarter les commandes d'événement (quantité aberrante) — on garde
        # la commande dans l'historique mais on retire l'intervalle qui la suit
        # pour ne pas contaminer la moyenne.
        pairs = sorted(zip(dates, qtys_by_pid[pid]), key=lambda p: p[0])
        sorted_dates = [d for d, _ in pairs]
        sorted_qtys = [q for _, q in pairs]
        median_qty = sorted(sorted_qtys)[len(sorted_qtys) // 2] or 1

        raw_intervals: list[int] = []
        for i in range(len(sorted_dates) - 1):
            # Si l'une des deux commandes est un événement (qtx >> médiane), on
            # écarte l'intervalle : il n'est représentatif ni d'un stock normal
            # ni d'un rythme reproductible.
            is_event = (sorted_qtys[i] > median_qty * QUANTITY_OUTLIER_RATIO
                        or sorted_qtys[i + 1] > median_qty * QUANTITY_OUTLIER_RATIO)
            if is_event:
                continue
            raw_intervals.append((sorted_dates[i + 1] - sorted_dates[i]).days)

        if not raw_intervals:
            excluded["all_outliers"] += 1
            continue

        # 2) Filtrage IQR pour retirer les intervalles très atypiques restants.
        clean_intervals, outliers_removed = _iqr_filter(raw_intervals)
        if not clean_intervals:
            excluded["all_outliers"] += 1
            continue

        avg = mean(clean_intervals)
        if avg <= 0:
            excluded["too_irregular"] += 1
            continue

        # 3) Se taire si le rythme est trop irrégulier (CV > 0.6).
        if len(clean_intervals) >= 2:
            sd = stdev(clean_intervals)
            cv = sd / avg
            if cv > MAX_COEFFICIENT_OF_VARIATION:
                excluded["too_irregular"] += 1
                continue

        last_date = sorted_dates[-1]
        days_since = (today - last_date).days
        avg_int = int(round(avg))
        predicted_out = last_date + timedelta(days=avg_int)
        days_until_out = (predicted_out - today).days

        product = products_by_id.get(pid) or {}
        product_name = product.get("name") or "?"

        # Phrase de raisonnement — ordre EXACT convenu avec le PO.
        explanation = (
            f"{product_name} — probablement à sec {_fr_relative_day(predicted_out, today)}. "
            f"Commande tous les {avg_int} jours en moyenne, dernière il y a {days_since} jours."
        )

        predictions.append({
            "product_id": pid,
            "product_name": product_name,
            "unit": product.get("unit", ""),
            "avg_interval_days": avg_int,
            "samples_used": len(clean_intervals),
            "samples_excluded_outliers": outliers_removed + (len(sorted_dates) - 1 - len(raw_intervals)),
            "last_order_date": last_date.isoformat(),
            "days_since_last_order": days_since,
            "predicted_out_date": predicted_out.isoformat(),
            "days_until_out": days_until_out,
            "explanation": explanation,
        })

    predictions.sort(key=lambda p: p["days_until_out"])
    return {"predictions": predictions, "excluded": excluded}


_DAYS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]


def _fr_relative_day(d: date, today: date) -> str:
    """« vendredi », « la semaine prochaine », « le 12 mars » — en clair FR."""
    delta = (d - today).days
    if delta < 0:
        return f"depuis le {d.strftime('%d/%m')}"
    if delta == 0:
        return "aujourd'hui"
    if delta == 1:
        return "demain"
    if delta < 7:
        return _DAYS_FR[d.weekday()]
    if delta < 14:
        return f"{_DAYS_FR[d.weekday()]} prochain"
    if delta < 30:
        return f"vers le {d.strftime('%d/%m')}"
    return f"vers le {d.strftime('%d/%m/%Y')}"
