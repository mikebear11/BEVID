# BEVID — CRM Distribution de Boissons

## Architecture
FastAPI + MongoDB (UE) + React 19 + Tailwind + Dexie + Emergent Resend + html5-qrcode + qrcode.react + cairosvg (icons) + reportlab.

## Product principles
- Mobile-first, ≥ 48px, thumb-zone, indicateur sync permanent
- Marges masquées tant que coûts non validés
- Géoloc ponctuelle uniquement, opt-in
- 2 rôles stricts, JWT 90 jours, 4 langues fr/en/es/de
- Typo ZT Nature + logo BEVID SVG + PWA icons vectoriels
- Offline-first : Dexie + client_uuid idempotent + queue rejouée

## Implemented — v5.5 (17/02/2026)

### Conflict Playbook — Rembourser + prévenir client (1 clic)
- `GET /api/conflicts/{cid}/playbook-preview` (manager) : renvoie conflit + order + client + capacités (can_refund, already_refunded) + message pré-rempli contextualisé (stock/crédit rouge).
- `POST /api/conflicts/{cid}/playbook` (manager) : exécute en un seul appel
  - Refund Stripe si `stripe_payment_intent_id` présent + demandé
  - Réintégration du stock (loop sur order.lines)
  - Notification client via `whatsapp` (Twilio) ou `email` (Resend) — message éditable dans le modal
  - Marque le conflit `resolved_at` + trace complète dans `resolution`
  - Passe `order.has_conflict = false`
  - Activity + audit_log
- Frontend : `ConflictPlaybookModal.jsx` ouvert depuis un bouton `Rembourser + prévenir client` dans `SyncFeed.jsx`. Choix de canal auto selon coordonnées client (email par défaut si dispo, WhatsApp sinon).
- Double exécution bloquée (400 si `resolved_at` déjà présent).

### Envoi automatique du PDF de commande par email (Resend)
- Helper `_build_order_pdf_bytes(o, c)` factorisé (utilisé par `/orders/{oid}/pdf` et le lien public).
- `POST /api/orders/{oid}/send-pdf-email` : génère un `receipt_token` (24h), envoie email HTML avec CTA "Télécharger le PDF" pointant vers l'endpoint public.
- `GET /api/public/orders/{token}/pdf` : endpoint public, sert le PDF signé, vérifie l'expiration.
- Frontend : `MobileOrder.finalize` déclenche l'envoi automatique si `est.email` existe (fire-and-forget silencieux).
- Audit + activity + toast confirmation.

### Password Eye toggle
- Composant réutilisable `PasswordInput.jsx` (icône Eye/EyeOff, aria-label, tabIndex -1 pour ne pas casser tab-order).
- Appliqué sur Login, Register, ChangePassword (3 champs), ResetPassword (2 champs).

### Rappels v5.4 déjà en place
- Sync feed manager (`/api/dashboard/sync-feed`) + détection auto conflits (stock, crédit rouge)
- Onboarding tour 3 étapes
- PWA icons pixel-perfect (cairosvg)
- Password reset via Resend
- Visites + orders offline via `postOffline` + `client_uuid`
- Signature intégrée dans le POST order

## Backlog / P1
- Vue détaillée du catalogue produit (photo, ABV, formats, pitch, stock, PJ téléchargeables)
- Google Drive OAuth réel (attend Client ID + Secret utilisateur)

## Backlog / P2
- Onboarding vidéo/GIF (remplacer les 3 étapes texte par un GIF silencieux 20s)
- Filtre par agent sur le Sync Feed
- Multi-tenant SaaS (tenant_id partout)
- Refactor server.py 3600+ lignes → /backend/routes/

## Credentials
Voir `/app/memory/test_credentials.md`.

## Tests
- `/app/backend/tests/test_iter9_playbook_pdf_email.py` — 10/10 passent (playbook preview, restock, double-exec bloqué, permissions, PDF email, token public, override)
- Iterations 3–8 : voir tests précédents.
