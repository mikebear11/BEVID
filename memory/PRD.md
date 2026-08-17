# Cellier — CRM Distribution de Boissons

## Architecture
FastAPI + MongoDB (hébergement UE) + React 19 + Tailwind + Shadcn + Leaflet + reportlab + emergentintegrations (Claude Sonnet 5) + Emergent Resend (email transactionnel).

## Product principles
- Mobile-first, contrastes élevés, touches ≥ 48px, thumb-zone.
- ≤ 2 niveaux de navigation.
- Indicateur de synchro permanent.
- Marges masquées tant que coûts non validés (verrou explicite).
- Géolocalisation ponctuelle uniquement (opt-in).
- Deux rôles (manager / commercial) avec segregation stricte.
- JWT 90 jours pour session terrain.
- Multi-langues fr/en/es/de.

## RGPD / CNIL
- Hébergement UE, TLS 1.3, AES-256.
- Journalisation des accès sensibles.
- Export + effacement par contact.
- Rétention audio paramétrable.
- ⚠️ Géoloc à valider par DPO avant mise en service.

## Implemented — v4 (17/02/2026)
### Auth & Sécurité
- JWT 90j, 2 rôles, admin users (create/reset/toggle).
- **Password reset par email** (Emergent Resend) : `POST /api/auth/forgot-password` → email avec lien https, token à usage unique 60min → `POST /api/auth/reset-password`.
- Guardrails email G2/G3 (`_assert_safe_email`) : pas de form/input, https only, anchor-host check.
- Fallback mode dégradé (approve manuel via manager) toujours dispo.

### Paiements & Pilotage
- DSO mensuel + tendance, mauvais payeurs (score composite), analyse par client (délai contractuel, réel, écart, montant/ancienneté retard).
- Auto-bascule 🟢🟠🔴 avec seuils configurables.
- **Alertes mauvais payeurs** : seuils (score + montant) configurables par manager, endpoint scan `/api/alerts/bad-payers/scan`, alertes actives listées + dismiss, écho dans NotificationBell.

### Écran commande mobile terrain
- `/etab/:id/commande` — 3 étapes : catalogue+panier / récap+livraison / signature.
- Catalogue offline-friendly (données catalog cached), tarif spécifique client via price_list, quantité habituelle affichée.
- **Blocage rouge** : écran refus + bouton dérogation.
- Contrôle remise max par ligne + calcul live HT/TVA/TTC.
- Signature canvas doigt + horodatage + GPS ponctuel (opt-in org).
- POST /orders + /orders/{id}/signature.

### Tarification à l'hecto (bière)
- Product model : `volume_liters` + `hecto_tiers: [{min_hl, discount_pct}]`.
- Catalog renvoie tiers au client.
- MobileOrder : calcul automatique du palier applicable (qty × volume / 100 = hL), affichage palier actif + palier suivant, remise cumulée avec remise ligne (plafonnée 100%).
- Modal admin sur `/products` pour paramétrer paliers.

### i18n 4 langues
- Dictionnaire fr/en/es/de dans I18nContext.
- Sélecteur à l'inscription + persistance backend (`PUT /api/auth/language`).

### RGPD
- Export/effacement client, journal audit, purge audio, réglages org.

## En attente / P0 restant
- P0 : Dexie/Workbox offline-first (IndexedDB + sync queue) — pas encore fait.
- P1 : Migration des pages historiques vers `t()`.
- P1 : Google Drive OAuth (attend Client ID/Secret).
- P1 : Cron `.emergent/crons.yml` pour scan bad-payers quotidien (endpoint prêt).

## Backlog / P2
- Automations no-code
- Custom fields dynamiques
- Refactor server.py (>3000 lignes) → `/backend/routes/`

## Credentials
Voir `/app/memory/test_credentials.md`.
