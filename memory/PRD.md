# Cellier — CRM Distribution de Boissons

## Architecture
FastAPI + MongoDB (hébergement UE) + React 19 + Tailwind + Shadcn + Leaflet + reportlab + emergentintegrations (Claude Sonnet 5, GPT 5.4, Gemini 3.1 Pro).

## Product principles (source de vérité)
- **Mobile-first**, contrastes élevés (lisibilité extérieure), touches ≥ 48px, actions primaires en thumb-zone.
- Aucun écran > 2 niveaux de navigation.
- **Indicateur de synchro permanent** (badge en-tête).
- **Marges masquées** tant que les coûts de revient n'ont pas été validés par le manager (verrou explicite : chiffres fondés sur coûts approximatifs = décisions fausses).
- **Géolocalisation strictement ponctuelle** (horodatage visite/signature) — jamais un traçage. Opt-in désactivable par utilisateur et au niveau organisation.
- **Deux rôles** :
  - `commercial` : son portefeuille, visites, commandes, catalogue, feux tricolores d'encours SANS montants globaux, marges masquées.
  - `manager` : tout + paramétrage (tarifs, coûts, objectifs, seuils, utilisateurs).
- **Session longue mobile** : JWT 90 jours.
- **Multi-langues** : fr / en / es / de (sélection à l'inscription + à tout moment). Reste basé sur clés `t()`.

## RGPD / CNIL
- Hébergement UE, TLS 1.3 en transit, AES-256 au repos.
- Journalisation des accès sensibles (`audit_logs`).
- Droit d'export + droit à l'effacement par contact (endpoints `/api/rgpd/clients/{id}`).
- Rétention paramétrable des transcriptions vocales + purge manuelle/cron.
- Option "supprimer audio brut après transcription".
- ⚠️ La géolocalisation, même ponctuelle, doit être justifiée, inscrite au registre des traitements, communiquée aux salariés, et le CSE consulté quand il existe. À valider par un DPO avant mise en service.

## Implemented history
### v1–v3 (déjà en place)
- Auth JWT bcrypt, CRUD clients/produits/commandes/tournées/activités
- Dashboard KPI, rapports 1-clic + IA + CSV
- Assistant IA + saisie vocale Web Speech
- Carte Leaflet + géocodage Nominatim
- Signature client + PDF reportlab
- Import CSV, alertes stock, follow-ups, Kanban
- Twilio SMS/WhatsApp + crons
- Stripe Payment Links + stub Tap-to-Pay
- PWA base (manifest + sw.js)
- Établissement 360° + Tournée

### v4 (17/02/2026) — Auth durcie, paiements, RGPD, i18n 4 langues
Backend :
- JWT étendu à 90 jours (session terrain sans reconnexion)
- User model : `language`, `active`, `must_reset`
- `Establishment.payment_terms_days` + `credit_status` recalculé automatiquement
- `POST /api/auth/forgot-password` (mode dégradé sans Resend : demande visible par manager)
- `POST /api/auth/change-password`
- `PUT /api/auth/language`
- Admin users : `/api/admin/users` (list/create/update/reset-password)
- `/api/admin/reset-requests` + approve
- `/api/admin/audit-logs`, helper `audit_log()` sur tous les endpoints sensibles
- RGPD : `/api/rgpd/clients/{cid}/export` + `DELETE /api/rgpd/clients/{cid}`
- Org settings : `/api/org/settings` (seuils, géoloc, rétention)
- Verrou marges : `/api/margins/lock-status`, `/api/admin/costs/validate|invalidate`
- Suivi paiements :
  - `/api/payments/client/{cid}` — délai contractuel, délai réel moyen, écart, montant en retard, ancienneté
  - `/api/payments/bad-payers` — classement composite
  - `/api/payments/dso?months=12` — courbe mensuelle + tendance
  - `POST /api/establishments/recompute-status` — bascule 🟢🟠🔴 automatique
- Purge vocale : `POST /api/admin/voice/purge`

Frontend :
- `I18nContext` refondu : 4 langues (fr/en/es/de) avec dictionnaire, persistance backend
- `Register.jsx` : sélecteur de langue obligatoire
- `Login.jsx` : lien "Mot de passe oublié" + sélecteur langue
- `ForgotPassword.jsx`
- `ChangePassword.jsx`
- `AdminUsers.jsx` (create/reset/toggle + demandes de reset en attente)
- `Paiements.jsx` — DSO, top mauvais payeurs, recalcul statuts
- `Confidentialite.jsx` — RGPD, CNIL, géoloc, rétention audio, export/delete client, journal des accès
- `Couts.jsx` — saisie coûts + verrou explicite marges
- `SyncIndicator.jsx` — état online/offline/syncing (permanent, en-tête)
- `Layout.jsx` — nav filtrée par rôle, thumb-zone 48px, dropdown 4 langues

## En attente / P0-P1
- P0 : Dexie.js IndexedDB + Workbox background sync (offline first) — pas encore fait
- P0 : Écran commande mobile `/etablissement/:id/commande` (catalogue offline + signature GPS)
- P1 : Migration progressive des pages historiques vers `t()` (Français hardcodé encore présent hors nouvelles pages)
- P1 : Resend pour email PDF (attend clé API user)
- P1 : Google Drive OAuth (attend Client ID/Secret user)

## Backlog / P2
- Automations no-code (triggers → actions)
- Custom fields dynamiques par organisation
- Refactor `server.py` (>2600 lignes) → `/app/backend/routes/`

## Credentials
Voir `/app/memory/test_credentials.md`.
