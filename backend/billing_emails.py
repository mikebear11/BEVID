"""
Emails de facturation (Resend via send_email de server.py) — Lot 4 suite.
Trois événements, un seul destinataire : l'owner de l'organisation.
Idempotence : collection `billing_emails` (org_id, kind, ref) — jamais deux envois pour la même référence.
"""
import asyncio
import logging
import os
from datetime import datetime, timezone
from html import escape

logger = logging.getLogger("billing_emails")

_db = None
_send_email = None


def configure(db, send_email):
    global _db, _send_email
    _db, _send_email = db, send_email


def _frontend_url() -> str:
    return (os.environ.get("FRONTEND_URL") or "").rstrip("/")


def _shell(title: str, name: str, paragraphs: list[str], cta_label: str, cta_url: str, tone: str = "#4A154B") -> str:
    body = "".join(f'<p style="margin:0 0 12px 0;line-height:1.5">{p}</p>' for p in paragraphs)
    return (
        '<table role="presentation" width="100%" style="background:#F7F5F2">'
        '<tr><td style="padding:32px 16px">'
        '<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;'
        'background:#fff;border-radius:12px;font-family:Arial,sans-serif;color:#1a1a1a">'
        '<tr><td style="padding:32px">'
        '<p style="margin:0 0 4px 0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#888">BEVID · Facturation</p>'
        f'<h1 style="margin:0 0 16px 0;font-size:22px;color:{tone}">{escape(title)}</h1>'
        f'<p style="margin:0 0 12px 0">Bonjour {escape(name)},</p>'
        f'{body}'
        f'<p style="margin:24px 0"><a href="{cta_url}" '
        f'style="background:{tone};color:#fff;padding:12px 24px;border-radius:8px;'
        f'text-decoration:none;font-weight:600">{escape(cta_label)}</a></p>'
        '<p style="margin:24px 0 0 0;font-size:11px;color:#888">'
        'Envoyé par BEVID. Nous ne vous demandons jamais votre mot de passe ni vos coordonnées bancaires par email : '
        'le paiement se fait uniquement sur la page sécurisée Stripe.</p>'
        '</td></tr></table></td></tr></table>'
    )


def _eur(cents: int) -> str:
    return f"{cents / 100:,.2f} €".replace(",", " ").replace(".", ",")


def build_payment_confirmed(name: str, org_name: str, plan_name: str, amount_cents: int, quantity: int, mode: str) -> tuple[str, str]:
    period = "an" if mode == "annual" else "mois"
    subject = f"Paiement confirmé — BEVID {plan_name}"
    html = _shell(
        "Paiement confirmé", name,
        [
            f"Merci ! Votre abonnement <strong>BEVID {escape(plan_name)}</strong> pour <strong>{escape(org_name)}</strong> est actif.",
            f"Montant : <strong>{_eur(amount_cents)} HT / {period}</strong> ({quantity} siège{'s' if quantity > 1 else ''}). "
            "La facture Stripe détaillée (TVA incluse) est disponible dans votre espace de gestion.",
            "Toute votre équipe retrouve immédiatement l'accès complet : commandes, visites, tournées, exports.",
        ],
        "Voir ma facturation", f"{_frontend_url()}/billing",
    )
    return subject, html


def build_payment_failed(name: str, org_name: str, amount_cents: int | None) -> tuple[str, str]:
    subject = "Échec de prélèvement — action requise sur votre abonnement BEVID"
    amt = f" de <strong>{_eur(amount_cents)}</strong>" if amount_cents else ""
    html = _shell(
        "Échec de prélèvement", name,
        [
            f"Le prélèvement{amt} de votre abonnement BEVID pour <strong>{escape(org_name)}</strong> n'a pas abouti.",
            "Stripe effectuera de nouvelles tentatives automatiquement. Pour éviter toute interruption, "
            "mettez à jour votre moyen de paiement depuis la page Facturation, bouton « Gérer mon abonnement ».",
            "Sans régularisation, l'accès passera en lecture seule : vos données restent consultables et exportables, "
            "mais les modifications seront bloquées.",
        ],
        "Mettre à jour mon moyen de paiement", f"{_frontend_url()}/billing", tone="#B45309",
    )
    return subject, html


def build_read_only(name: str, org_name: str, trial_ended: bool) -> tuple[str, str]:
    subject = "Votre espace BEVID est passé en lecture seule"
    why = ("Votre période d'essai gratuite est terminée." if trial_ended
           else "Votre abonnement n'a pas pu être renouvelé.")
    html = _shell(
        "Espace en lecture seule", name,
        [
            f"{why} L'espace <strong>{escape(org_name)}</strong> est désormais en <strong>lecture seule</strong>.",
            "Concrètement : toute l'équipe peut consulter clients, commandes et tournées et exporter ses données (CSV, PDF), "
            "mais aucune création ni modification n'est possible.",
            "Choisissez un forfait en deux minutes pour reprendre exactement là où vous en étiez — rien n'est perdu.",
        ],
        "Choisir mon forfait", f"{_frontend_url()}/billing", tone="#B45309",
    )
    return subject, html


async def _owner_of(org: dict) -> dict | None:
    if not org or not org.get("owner_user_id"):
        return None
    return await _db.users.find_one({"id": org["owner_user_id"]}, {"_id": 0, "email": 1, "name": 1})


async def _send_once(kind: str, org: dict, ref: str, subject: str, html: str) -> bool:
    key = {"org_id": org["id"], "kind": kind, "ref": ref}
    owner = await _owner_of(org)
    if not owner or not owner.get("email"):
        return False
    # Réservation atomique avant envoi : deux déclencheurs concurrents ne produisent qu'un email.
    res = await _db.billing_emails.update_one(
        key, {"$setOnInsert": {**key, "to": owner["email"], "status": "sending",
                               "created_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    if res.upserted_id is None:
        return False
    try:
        await _send_email(to=owner["email"], subject=subject, html=html)
    except Exception as e:  # noqa: BLE001 — un email raté ne doit jamais casser un webhook
        logger.warning("billing email %s failed for org %s: %s", kind, org.get("id"), e)
        await _db.billing_emails.delete_one({"_id": res.upserted_id})
        return False
    await _db.billing_emails.update_one({"_id": res.upserted_id},
                                        {"$set": {"status": "sent", "sent_at": datetime.now(timezone.utc).isoformat()}})
    return True


async def notify_payment_confirmed(org_id: str, session_id: str, plan_name: str, amount_cents: int, quantity: int, mode: str) -> bool:
    org = await _db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        return False
    owner = await _owner_of(org)
    subject, html = build_payment_confirmed(owner.get("name") if owner else "", org.get("name") or "votre entreprise",
                                            plan_name, amount_cents, quantity, mode)
    return await _send_once("payment_confirmed", org, session_id, subject, html)


async def notify_payment_failed(subscription_id: str, invoice_id: str, amount_cents: int | None) -> bool:
    org = await _db.organizations.find_one({"stripe_subscription_id": subscription_id}, {"_id": 0})
    if not org:
        return False
    owner = await _owner_of(org)
    subject, html = build_payment_failed(owner.get("name") if owner else "", org.get("name") or "votre entreprise", amount_cents)
    return await _send_once("payment_failed", org, invoice_id, subject, html)


async def notify_read_only(org: dict) -> bool:
    trial_ended = (org.get("billing_status_stripe") or "").lower() not in ("past_due", "unpaid", "canceled")
    ref = f"trial:{org.get('trial_ends_at')}" if trial_ended else f"stripe:{org.get('stripe_subscription_id')}"
    owner = await _owner_of(org)
    subject, html = build_read_only(owner.get("name") if owner else "", org.get("name") or "votre entreprise", trial_ended)
    return await _send_once("read_only", org, ref, subject, html)


def fire_read_only(org: dict) -> None:
    """Hook non bloquant appelé dès qu'un statut read_only est observé (middleware ou /billing/current)."""
    if _db is None or _send_email is None:
        return
    try:
        asyncio.get_running_loop().create_task(notify_read_only(org))
    except RuntimeError:
        pass
