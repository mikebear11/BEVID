# BEVID — CRM Distribution de Boissons

## Architecture
FastAPI + MongoDB (hébergement UE) + React 19 + Tailwind + Shadcn + Leaflet + reportlab + emergentintegrations + Emergent Resend + html5-qrcode + qrcode.react.

## Product principles
- Mobile-first, contrastes élevés, touches ≥ 48px, thumb-zone
- ≤ 2 niveaux nav, indicateur sync permanent
- Marges masquées tant que coûts non validés
- Géolocalisation ponctuelle uniquement (opt-in)
- 2 rôles stricts (manager / commercial)
- JWT 90 jours, multi-langues fr/en/es/de
- Typo : ZT Nature en display + Outfit body

## RGPD / CNIL
- Hébergement UE, TLS 1.3, AES-256
- Journal d'accès, export + effacement par contact
- Rétention audio paramétrable
- ⚠️ Géoloc à valider par DPO

## Implemented — v5.1 (17/02/2026)
### Rebrand & renommage connecteur
- App renommée **BEVID** (partout : sidebar, login, PWA manifest, index.html, emails, PDF)
- Password `Cellier2026!` conservé (credential, pas brand)
- Connecteur `Vinovent` (ex-Vinovend Pro) : enum backend + UI

### Stock / DRM / Contenants (v5)
- Container + StockMovement models
- QR code par contenant (qrcode.react), scan caméra (html5-qrcode) + saisie manuelle
- Endpoints scan/move/list/summary/deposits/DRM
- Product étendu : abv_pct, alcohol_type, volume_liters, hecto_tiers
- Pages : /stock, /containers, /containers/:id, /scan, /drm
- DRM mensuelle avec calcul alcool pur + export CSV

### Auth & Sécurité (v4)
- JWT 90j, 2 rôles, admin users
- Password reset par email (Emergent Resend) + token single-use 60min
- Fallback manager-approve

### Paiements (v4)
- DSO, mauvais payeurs, seuils configurables, alertes actives

### Écran commande mobile (v4)
- 3 étapes catalog/récap/signature avec GPS ponctuel
- Tarif hecto automatique (bière)

### i18n 4 langues + RGPD (v4)

## En attente / P0 restant
- P0 : Dexie/Workbox offline-first
- P1 : Cron .emergent/crons.yml pour bad-payers + purge audio
- P1 : Migration pages historiques vers t()
- P1 : Google Drive OAuth

## Backlog / P2
- Impression étiquettes QR en lot
- N° d'accise DRM officiel
- Refactor server.py > 3200 lignes → /backend/routes/
- Aligner identifiants internes restants (localStorage key + SW tag) sur BEVID

## Credentials
Voir `/app/memory/test_credentials.md`.
