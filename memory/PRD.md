# BEVID — CRM Distribution de Boissons

## Architecture
FastAPI + MongoDB (UE) + React 19 + Tailwind + Dexie (offline) + Emergent Resend + html5-qrcode + qrcode.react + PIL (icons).

## Product principles
- Mobile-first, ≥ 48px, thumb-zone, indicateur sync permanent
- Marges masquées tant que coûts non validés
- Géoloc ponctuelle uniquement, opt-in
- 2 rôles stricts, JWT 90 jours, 4 langues fr/en/es/de
- Typo ZT Nature + logo BEVID SVG (Login + Layout) + PWA icons PNG (192/512/maskable)

## Implemented — v5.3 (17/02/2026)
### Offline first opérationnel (P0)
- `postOffline(url, data)` : enfile la mutation dans Dexie si offline OU network-error, renvoie `{data: {pending: true, local_id}}`.
- **VisitReport.jsx** : utilise `postOffline("/visits", ...)` + `client_uuid` généré au submit.
- **MobileOrder.jsx** : POST unique `/orders` avec `signature_data_url + signature_gps + signature_signed_at` inline + `client_uuid`. La signature capturée en cave est donc emportée par la même mutation.
- **Backend** : Order + VisitReport reçoivent `client_uuid` (idempotence). Si même uuid rejoué au retour de connexion → renvoie l'existant sans doublon. Signature inline persistée sur l'order document.
- Toast dédié "Enregistré hors-ligne — synchro auto au retour du réseau".

### PWA icons BEVID
- `/public/icon-192.png`, `/public/icon-512.png`, `/public/icon-maskable-512.png` générés via PIL (fond violet BEVID, "B" blanc, point houblon doré).
- `manifest.json` mis à jour (any + maskable).

### Rappels v5.2 déjà en place
- Dexie infra (db.js, syncQueue.js), sync bootstrap, cron endpoints, QR labels A4, BevidLogo SVG.

## Backlog / P2
- Générer des icons vectoriels plus détaillés (le "B" PIL est simple, remplacer par le SVG converti)
- Migrer d'autres mutations (activities, follow-ups) vers postOffline
- Refactor server.py

## Credentials
Voir `/app/memory/test_credentials.md`.
