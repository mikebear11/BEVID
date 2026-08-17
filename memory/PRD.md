# BEVID — CRM Distribution de Boissons

## Architecture
FastAPI + MongoDB (UE) + React 19 + Tailwind + Dexie + Emergent Resend + html5-qrcode + qrcode.react + cairosvg (icons).

## Product principles
- Mobile-first, ≥ 48px, thumb-zone, indicateur sync permanent
- Marges masquées tant que coûts non validés
- Géoloc ponctuelle uniquement, opt-in
- 2 rôles stricts, JWT 90 jours, 4 langues fr/en/es/de
- Typo ZT Nature + logo BEVID SVG + PWA icons vectoriels

## Implemented — v5.4 (17/02/2026)
### Sync log & conflits
- `GET /api/dashboard/sync-feed?minutes=60` (manager only) — feed des visites/orders remontés du terrain (client_uuid présent) + conflits
- Composant `SyncFeed` sur Dashboard (refresh 30s)
- Détection conflits automatique sur `POST /api/orders` (credit_status rouge, stock insuffisant) → order créée (server-wins) MAIS marquée `has_conflict:true` + trace dans `conflicts` visible du manager
- `POST /api/conflicts/{id}/dismiss` — écarter un conflit

### Onboarding
- Composant `OnboardingTour` : 3 étapes avec spotlight (indicateur sync → scan → visite)
- Trigger localStorage `bevid_onboarded`, skip disponible

### Icons pixel-perfect
- `cairosvg` rend le SVG exact de `BevidLogo` en `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`
- Match parfait entre logo in-app et icon home-screen

### Rappels v5.3 déjà en place
- Visites + orders offline via `postOffline` + `client_uuid` idempotent
- Signature intégrée dans le POST order (1 seul appel resyncable)

## Backlog / P2
- Migrer d'autres mutations (activities, follow-ups) vers postOffline
- Refactor server.py > 3500 lignes → /backend/routes/

## Credentials
Voir `/app/memory/test_credentials.md`.
