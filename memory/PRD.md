# BEVID — CRM Distribution de Boissons

## Architecture
FastAPI + MongoDB (UE) + React 19 + Tailwind + Dexie (offline) + Emergent Resend + html5-qrcode + qrcode.react.

## Product principles
- Mobile-first, ≥ 48px, thumb-zone, indicateur sync permanent
- Marges masquées tant que coûts non validés
- Géoloc ponctuelle uniquement, opt-in
- 2 rôles stricts, JWT 90 jours, 4 langues fr/en/es/de
- Typo ZT Nature + logo BEVID SVG

## Implemented — v5.2 (17/02/2026)
### Offline first (P0)
- Dexie DB `bevid_offline` : establishments, products, sync_queue, meta
- `/lib/db.js` : saveSnapshot, enqueueMutation, pendingCount
- `/lib/syncQueue.js` : flushQueue + startSyncListener (online + interval 60s)
- `/lib/api.js` : `postOffline(url, data)` — écrit local si offline, réessaie auto
- `AuthContext` : bootstrap Dexie au login + flushQueue au démarrage
- `SyncIndicator` : compte réel des mutations en attente (Dexie)
- Bootstrap endpoint : `/api/sync/bootstrap` (GET, respect ségrégation manager/commercial)

### Cron endpoints publics
- `POST /api/cron/bad-payer-scan` → programmé chaque jour 07:00 Paris
- `POST /api/cron/voice-purge` → programmé chaque jour 03:30 Paris
- Ajoutés à `/app/.emergent/crons.yml`

### QR Labels
- Page `/containers/labels` — grille A4 3×8 imprimable, sélection, `window.print()`, page-break contrôlé
- Chaque étiquette : QR (qrcode.react) + logo BEVID + produit + volume + lot

### BEVID branding
- Nouveau composant `BevidLogo` (SVG inline, currentColor)
- Login split-screen + sidebar desktop + top bar mobile utilisent le logo
- `EMAIL_FROM_NAME=BEVID`, PWA manifest, index.html title

## Rappels v5 / v4 déjà en place
- Vinovent (ex-Vinovendpro)
- Stock / DRM / Containers / Scan
- Password reset par email (Emergent Resend)
- Paiements DSO / mauvais payeurs
- Mobile order + tarif hecto + signature GPS
- i18n 4 langues + RGPD (audit, purge, export/erase)

## En attente / P0 restant
- Workbox service worker pour vraie mise en cache offline des assets (au-delà de Dexie data)
- Migrer les pages historiques (Visits, Orders) vers `postOffline` pour bénéficier de la queue

## Backlog / P2
- Icônes PWA BEVID en PNG (actuellement placeholder)
- Notification tag SW + localStorage key à re-préfixer bevid_
- Refactor server.py → /backend/routes/

## Credentials
Voir `/app/memory/test_credentials.md`.
