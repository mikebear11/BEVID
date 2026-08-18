"""Moteur de rapprochement — 4 niveaux de confiance.
PARTIE 4.4 — chaque règle produit un score, pas une décision binaire.

`tx` : {amount (signé), value_date, counterparty_name (normalisé), label, reference}
`open_orders` : liste de commandes {id, total, created_at, client_id, client_name (normalisé), invoice_number, payment_status, remaining_amount}
"""
import re
from datetime import datetime, timedelta
from itertools import combinations

from .validators import is_valid_rf_reference, normalize_name

CONFIDENCE_CERTAIN = 100
CONFIDENCE_HIGH = 85
CONFIDENCE_MEDIUM = 60
CONFIDENCE_LOW = 30

INVOICE_REGEX = re.compile(r"\b(?:BEVID[-_]?)?(FA|F|BC|INV|CDE)[-_]?(\d{4,10})\b", re.IGNORECASE)
AUTO_LETTRAGE_THRESHOLD = 85  # à partir de ce score, lettrage automatique


def propose(tx: dict, open_orders: list[dict], settings: dict | None = None) -> list[dict]:
    """Retourne une liste de propositions triées par score desc.
    Chaque proposition : {order_ids, amount_applied, confidence, level, reason}
    """
    settings = settings or {}
    tolerance_abs = settings.get("tolerance_abs", 0.01)  # 1 cent
    tolerance_pct = settings.get("tolerance_pct", 0.5)  # 0.5%
    window_days = settings.get("window_days", 90)
    max_combo = settings.get("max_combo", 10)

    if tx.get("amount", 0) <= 0:
        # débit sortant → hors périmètre encaissement client
        return []

    amount = round(float(tx["amount"]), 2)
    tx_date = _parse_iso(tx.get("value_date") or tx.get("operation_date"))
    tx_name = normalize_name(tx.get("counterparty_name") or "")
    tx_label = (tx.get("label") or "").upper()
    tx_ref = (tx.get("reference") or "").upper()

    # fenêtre 90j
    orders_in_window = []
    for o in open_orders:
        if o.get("remaining_amount", o.get("total", 0)) <= 0:
            continue
        odate = _parse_iso(o.get("created_at", ""))
        if tx_date and odate and (tx_date - odate).days > window_days:
            continue
        orders_in_window.append(o)

    proposals: list[dict] = []

    # === 1. CONFIANCE CERTAINE ===
    # 1a. RF valide + montant exact d'une facture ouverte
    if is_valid_rf_reference(tx_ref):
        for o in orders_in_window:
            remaining = round(o.get("remaining_amount", o.get("total", 0)), 2)
            if _amount_matches(amount, remaining, tolerance_abs, tolerance_pct):
                if (o.get("rf_reference") or "").upper() == tx_ref:
                    proposals.append({
                        "order_ids": [o["id"]], "amount_applied": remaining,
                        "confidence": CONFIDENCE_CERTAIN, "level": "certain",
                        "reason": f"Référence RF valide {tx_ref} + montant exact",
                    })

    # 1b. EndToEndId qu'on a émis nous (marqué sur la commande)
    for o in orders_in_window:
        if o.get("emitted_e2e_id") and o["emitted_e2e_id"] in tx_label:
            remaining = round(o.get("remaining_amount", o.get("total", 0)), 2)
            if _amount_matches(amount, remaining, tolerance_abs, tolerance_pct):
                proposals.append({
                    "order_ids": [o["id"]], "amount_applied": remaining,
                    "confidence": CONFIDENCE_CERTAIN, "level": "certain",
                    "reason": f"EndToEndId émis {o['emitted_e2e_id']}",
                })

    if any(p["level"] == "certain" for p in proposals):
        return _dedupe(proposals)

    # === 2. CONFIANCE ÉLEVÉE ===
    # 2a. Numéro de facture regex dans le libellé + montant exact
    invoice_hits = INVOICE_REGEX.findall(tx_label + " " + tx_ref)
    for prefix, num in invoice_hits:
        for o in orders_in_window:
            inv_num = str(o.get("invoice_number") or "")
            short_id = (o.get("id", "")[:8]).upper()
            if inv_num.endswith(num) or short_id.endswith(num.upper()):
                remaining = round(o.get("remaining_amount", o.get("total", 0)), 2)
                if _amount_matches(amount, remaining, tolerance_abs, tolerance_pct):
                    proposals.append({
                        "order_ids": [o["id"]], "amount_applied": remaining,
                        "confidence": CONFIDENCE_HIGH, "level": "high",
                        "reason": f"N° facture détecté ({prefix}{num}) + montant exact",
                    })

    # 2b. Nom payeur normalisé = client + montant exact d'une facture unique
    if tx_name:
        matching_orders = [
            o for o in orders_in_window
            if o.get("client_name_normalized")
            and _name_matches(tx_name, o["client_name_normalized"])
        ]
        for o in matching_orders:
            remaining = round(o.get("remaining_amount", o.get("total", 0)), 2)
            if _amount_matches(amount, remaining, tolerance_abs, tolerance_pct):
                # unique ? on vérifie qu'aucune autre commande de ce client n'a le même montant
                same_amount = [x for x in matching_orders
                               if _amount_matches(amount, round(x.get("remaining_amount", x.get("total", 0)), 2),
                                                  tolerance_abs, tolerance_pct)]
                if len(same_amount) == 1:
                    proposals.append({
                        "order_ids": [o["id"]], "amount_applied": remaining,
                        "confidence": CONFIDENCE_HIGH, "level": "high",
                        "reason": f"Nom payeur '{tx_name}' + montant exact unique",
                    })
                else:
                    # ambiguïté → dégrade en moyenne
                    proposals.append({
                        "order_ids": [o["id"]], "amount_applied": remaining,
                        "confidence": CONFIDENCE_MEDIUM, "level": "medium",
                        "reason": f"Nom payeur '{tx_name}' + montant exact (mais {len(same_amount)} commandes candidates)",
                    })

    if any(p["level"] == "high" for p in proposals):
        return _dedupe(proposals)

    # === 3. CONFIANCE MOYENNE ===
    # 3a. Montant exact correspondant à une seule facture ouverte tous clients confondus
    exact_matches = [o for o in orders_in_window
                     if _amount_matches(amount, round(o.get("remaining_amount", o.get("total", 0)), 2),
                                        tolerance_abs, tolerance_pct)]
    if len(exact_matches) == 1:
        o = exact_matches[0]
        proposals.append({
            "order_ids": [o["id"]], "amount_applied": round(o.get("remaining_amount", o.get("total", 0)), 2),
            "confidence": CONFIDENCE_MEDIUM, "level": "medium",
            "reason": "Montant exact d'une facture ouverte unique (fenêtre 90j)",
        })

    # 3b. Somme d'un sous-ensemble ≤ max_combo de factures ouvertes du même client (si nom matché) ou global
    combo_pool = []
    if tx_name:
        combo_pool = [o for o in orders_in_window
                      if _name_matches(tx_name, o.get("client_name_normalized") or "")]
    if not combo_pool:
        combo_pool = orders_in_window
    combo_pool = combo_pool[:30]  # borne pour éviter explosion combinatoire
    if len(combo_pool) >= 2:
        found_solutions = []
        for r in range(2, min(max_combo, len(combo_pool)) + 1):
            for combo in combinations(combo_pool, r):
                total = round(sum(o.get("remaining_amount", o.get("total", 0)) for o in combo), 2)
                if _amount_matches(amount, total, tolerance_abs, tolerance_pct):
                    found_solutions.append(combo)
                    if len(found_solutions) > 1:
                        break
            if len(found_solutions) > 1:
                break
        if len(found_solutions) == 1:
            combo = found_solutions[0]
            proposals.append({
                "order_ids": [o["id"] for o in combo],
                "amount_applied": amount,
                "confidence": CONFIDENCE_MEDIUM, "level": "medium",
                "reason": f"Somme unique de {len(combo)} factures = montant",
            })

    # === 4. CONFIANCE FAIBLE — paiement partiel ===
    # (uniquement si aucune proposition ≥ moyenne, et si nom match)
    if not proposals and tx_name:
        for o in orders_in_window:
            if _name_matches(tx_name, o.get("client_name_normalized") or ""):
                remaining = round(o.get("remaining_amount", o.get("total", 0)), 2)
                if 0 < amount < remaining:
                    proposals.append({
                        "order_ids": [o["id"]], "amount_applied": amount,
                        "confidence": CONFIDENCE_LOW, "level": "low",
                        "reason": f"Paiement partiel probable — reste {remaining - amount:.2f} €",
                    })

    return _dedupe(proposals)


def _dedupe(proposals: list[dict]) -> list[dict]:
    seen = {}
    for p in proposals:
        key = (tuple(sorted(p["order_ids"])), round(p["amount_applied"], 2))
        if key not in seen or seen[key]["confidence"] < p["confidence"]:
            seen[key] = p
    return sorted(seen.values(), key=lambda x: -x["confidence"])


def _amount_matches(a: float, b: float, tol_abs: float, tol_pct: float) -> bool:
    diff = abs(a - b)
    if diff <= tol_abs:
        return True
    ref = max(abs(a), abs(b), 1.0)
    return diff / ref * 100 <= tol_pct


def _name_matches(a: str, b: str) -> bool:
    if not a or not b:
        return False
    if a == b:
        return True
    # inclusion mutuelle sur mots ≥ 4 chars
    words_a = {w for w in a.split() if len(w) >= 4}
    words_b = {w for w in b.split() if len(w) >= 4}
    if not words_a or not words_b:
        return False
    common = words_a & words_b
    return len(common) >= min(2, len(words_a), len(words_b))


def _parse_iso(s: str) -> datetime | None:
    """Parse une date ISO et retourne un datetime naive UTC (comparable partout)."""
    if not s:
        return None
    s = str(s).strip()
    # date pure YYYY-MM-DD (venant des relevés)
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d")
    except ValueError:
        pass
    # ISO complet avec tz
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            # convertir en UTC puis retirer la tz pour être naive
            from datetime import timezone as _tz
            dt = dt.astimezone(_tz.utc).replace(tzinfo=None)
        return dt
    except (ValueError, TypeError):
        return None
