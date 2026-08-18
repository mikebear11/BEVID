# BEVID — CRM Distribution de Boissons

## Architecture
FastAPI + MongoDB + React 19 + Tailwind + Dexie + Emergent Resend/Storage + Leaflet + reportlab + recharts.

**Sous-packages isolés :**
- `/app/backend/bank/` — validators, storage, importers, reconciliation
- `/app/backend/integrations/` — http_client, bodacc, recherche_entreprises, rappelconso, vies
- `/app/backend/enrichissement/` — models, layer_a, sirene, rne, ban, port, credits, places, adapters/{societe_com, pappers}
- `/app/backend/permissions.py` — registry features + `has_feature()`
- `/app/frontend/src/design-system/tokens.css` — source unique des jetons couleur (3 thèmes)
- `/app/frontend/src/components/system/` — composants système partagés (PuceEtat)

## Implemented — v12.0 (18/02/2026)

### Couche C — Places (isolation stricte)
- **`osm_places`** : table stockable OSM, jamais jointe aux `establishments`, attribution "© OpenStreetMap contributors"
- **`google_place_refs`** : `{establishment_id, place_id, linked_at}` — RIEN d'autre en base
- **`/api/establishments/{id}/link-place`** enregistre uniquement le place_id
- **`/api/establishments/{id}/place-preview`** appelle Google Places v1 en LIVE, aucune persistance, aucun cache serveur
- Champs Google autorisés en lecture directe : displayName, formattedAddress, rating, userRatingCount, priceLevel, openingHours, phone, websiteUri, photos, attributions, editorialSummary
- Vérifié en base : ZÉRO colonne `note_google` / `rating` / `reviews` dans `establishments`

### UI Enrichissement `/etab/:id/enrichissement`
- Groupes : Identité légale · Adresse · Fiscal · Scoring · Google Places
- Chaque champ affiche : valeur, source, date_maj, fiabilité %, bouton verrou/déverrou
- Édition inline : passe automatiquement le champ en `verrouille_par_utilisateur=true` (source="user")
- Boutons d'enrichissement : Couche A (gratuit) · Couche B (défaut) · Couche B Pappers (manuel)
- Panneau Google Places : lecture directe live, mention "Non stocké" affichée, bouton "Recharger en direct"
- Compteur de crédits Couche B affiché par provider (non-nommé côté UI — c'est la clé, pas la marque)

### Ajustements thème sombre (5 corrections validées)
- `--ds-border` : `#2b2925` → `#3a3630` (cartes mieux dessinées)
- `--ds-border-strong` : `#423f39` → `#4f4a42`
- `--ds-text-muted` : `#7d7a72` → `#948e83` (contraste ≥ 5:1 sur libellés)
- `--ds-accent` : `#5b9ee6` → `#7fb0e8` (moins agressif la nuit)
- `--ds-state-info-solid-bg` : `#8892a3` → `#3f4a5c` + fg blanc (contraste correct)
- `--grid-dot-*` : transparent (fond uni en sombre)

### v11.0 (rappel) — Enrichissement 3-couches
- `EnrichedField` avec hash + verrou utilisateur, `apply_enriched_update()`, `user_locked_update()`
- Couche A : Recherche-Entreprises + Sirene + RNE + BAN + VIES
- Couche B : `EnrichissementPort` + adaptateurs Societe.com / Pappers, `CreditsGuard` avec bascule auto
- Test e2e Danone : 16 champs remplis, TVA `FR27552032534`, verrou respecté au re-run
- Migration PuceEtat sur 11 fichiers
- Lint `.eslintrc.js` warn sur hex hors `src/design-system/`

### v10.0 — Système de design
- Tokens uniques CSS, 3 thèmes (clair/sombre/soleil), PuceEtat, page démo `/design-system`

## Backlog

### Enrichissement — restant
- Autocomplete SIREN à la création (endpoint `/api/enrichissement/autocomplete` déjà OK, à câbler côté UI création)
- Crons planifiés à ajouter dans `.emergent/crons.yml` : sirene-refresh mensuel J1, scoring-mensuel J1, comptes-annuels annuel avril
- Import OSM batch (Overpass API) — infra prête (`upsert_osm_place`, `search_osm_places`), lanceur à écrire
- INPI RNE : nécessite `INPI_RNE_LOGIN` + `INPI_RNE_PASSWORD` pour activer dirigeants + comptes annuels
- Google Places : nécessite `GOOGLE_PLACES_KEY` pour activer la lecture live

### Purge Hex Legacy
- Migrer Dashboard, Etablissement360, Pipeline, Bouclier, Radar vers `var(--ds-*)`
- Passer ESLint en `error` (aujourd'hui `warn`) une fois le code propre

### Phase 2 restante
- Interface livreur ultra-simplifiée (< 10 s)
- Contenants consignés (QR + valeur immobilisée)
- Fraîcheur stock client (DLC probabiliste)
- Marge accises 2026

### Phase 3-4
- Intelligence territoriale (INSEE Melodi, DATAtourisme, météo)
- Observatoire mutualisé anonymisé
- Assistant terrain (briefing + dictée structurée)

## Credentials
Voir `/app/memory/test_credentials.md`.
