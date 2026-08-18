# BEVID — CRM Distribution de Boissons

## Architecture
FastAPI + MongoDB + React 19 + Tailwind + Dexie + Emergent Resend/Storage + Leaflet + reportlab + recharts.

**Sous-packages isolés :**
- `/app/backend/bank/`, `/app/backend/integrations/`, `/app/backend/enrichissement/`
- `/app/frontend/src/design-system/tokens.css` (source unique jetons)
- `/app/frontend/src/components/system/` (PuceEtat)

## Implemented — v13.0 (18/02/2026)

### Autocomplete SIREN à la création
- `src/components/SirenAutocomplete.jsx` — dropdown débouncé 250 ms, navigation clavier (↑↓ Enter Esc), affiche nom + SIREN + commune + NAF + état actif
- Route `/etab/new` avec `src/pages/EstablishmentNew.jsx`
- Auto-remplit nom/SIREN/adresse/ville depuis Recherche-Entreprises
- Case cochée par défaut : "Lancer immédiatement l'enrichissement Couche A" — création + verrou SIREN + Couche A + redirect `/etab/:id/enrichissement`
- Test e2e : "biocoop" → 8 résultats (BIOCOOP 382891752, etc.)

### Crons enrichissement planifiés (3 tâches)
Ajoutés dans `.emergent/crons.yml` + endpoints backend avec auth `WEBHOOK_CRON_SECRET` :
- **`enrichissement-sirene-refresh`** (mensuel J1 03:00) — `/api/cron/enrichissement/sirene-refresh` : rafraîchit identité Couche A sur tout le portefeuille, respecte les verrous. Test : 5 SIREN scannés, 68 champs mis à jour
- **`enrichissement-scoring-mensuel`** (mensuel J1 04:00) — `/api/cron/enrichissement/scoring-mensuel` : scoring Couche B via port anonymisé, bascule automatique Couche A si crédits épuisés ou provider indisponible. Test : 5 scannés, 5 fallback Couche A (pas de crédit test)
- **`enrichissement-comptes-annuels-rne`** (annuel 15 avril 05:00) — `/api/cron/enrichissement/comptes-annuels-rne` : charge dirigeants + bénéficiaires effectifs + comptes annuels depuis INPI RNE. Test : 5 scannés, 0 mis à jour (pas d'identifiants INPI)
- Endpoints protégés : sans secret → 401, avec secret → traitement complet

### v12.0 (rappel)
- Sombre corrigé (5 jetons)
- Onglet `/etab/:id/enrichissement`
- Couche C Places : `google_place_refs` (place_id seul), lecture live, `osm_places` isolée

## Backlog restant
- Clé Google Places (`GOOGLE_PLACES_KEY`) pour activer la lecture live
- Identifiants INPI RNE (`INPI_RNE_LOGIN`/`_PASSWORD`) pour comptes annuels
- Import OSM batch Overpass (infra prête, lanceur à écrire)
- Purge hex legacy (Dashboard, Etablissement360, Pipeline, Bouclier, Radar)
- Phase 2 : interface livreur, contenants consignés, DLC probabiliste, marge accises 2026

## Credentials
Voir `/app/memory/test_credentials.md`.
