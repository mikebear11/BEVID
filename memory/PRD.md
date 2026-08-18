# BEVID — CRM Distribution de Boissons

## Architecture
FastAPI + MongoDB + React 19 + Tailwind + Dexie + Emergent Resend/Storage + Leaflet + reportlab + cairosvg + recharts.

**Sous-packages isolés :**
- `/app/backend/bank/` — validators, storage, importers, reconciliation
- `/app/backend/integrations/` — http_client, bodacc, recherche_entreprises, rappelconso, vies, naf_chr
- `/app/backend/enrichissement/` — models, layer_a, sirene, rne, ban, port, credits, adapters/{societe_com, pappers}
- `/app/backend/permissions.py` — registry features + `has_feature()` + `require_feature()` decorator
- `/app/frontend/src/design-system/` — jetons CSS uniques (source de vérité couleurs)
- `/app/frontend/src/components/system/` — composants système partagés (PuceEtat)

## Implemented — v11.0 (18/02/2026) — Enrichissement 3-couches + migration PuceEtat + lint anti-hex

### Enrichissement établissement (règle stricte : verrou utilisateur intouchable)
- **Modèle uniforme `EnrichedField`** `{valeur, source, date_maj, fiabilite, verrouille_par_utilisateur, hash}`
- **`apply_enriched_update()`** : ne modifie jamais un champ verrouillé, détecte les non-changements via hash
- **`user_locked_update()`** : édition manuelle → verrou automatique (source=user)
- **Registre 25 champs autorisés** (`CHAMPS_ENRICHIS_AUTORISES`) — clé hors registre rejetée en 400
- **Couche A (gratuite)** : Recherche-Entreprises → Sirene INSEE → RNE INPI → BAN → VIES
  - `layer_a.enrichir_couche_a(siren, db, adresse_saisie)` retourne dict de champs normalisés
  - Fallback BAN si RE ne fournit pas de GPS
  - Calcul TVA FR automatique (algorithme officiel clé mod 97)
- **Couche B (payante, port anonymisé)** :
  - `EnrichissementPort` abstrait, `resolve_port()` lit `ENRICHISSEMENT_PROVIDER` env
  - `SocieteComAdapter` (défaut, X-Authorization: socapi {token}, 60 req/min, source="societe-com")
  - `PappersAdapter` (manuel, source="pappers", 3 req/s)
  - **Le nom du fournisseur n'apparaît NULLE PART dans server.py** — juste `_layer_b_run`, `provider_key`
  - `CreditsGuard` : compteur mensuel + plafond `ENRICHISSEMENT_CREDITS_LIMIT_*`, bascule auto sur Couche A si épuisé ou provider indisponible
- **Endpoints** :
  - `GET  /api/enrichissement/autocomplete?q=` (Recherche-Entreprises)
  - `POST /api/establishments/{id}/enrichir` (Couche A)
  - `POST /api/establishments/{id}/enrichir-plus` (Couche B via port, fallback A)
  - `GET  /api/establishments/{id}/enriched`
  - `PUT  /api/establishments/{id}/enriched-field/{field}` (édition user → verrou)
  - `POST /api/establishments/{id}/enriched-field/{field}/lock`
  - `GET  /api/enrichissement/credits`
- **Env variables** : `SOCIETE_COM_TOKEN` (fourni), `PAPPERS_TOKEN`, `INSEE_SIRENE_TOKEN`, `INPI_RNE_LOGIN/PASSWORD`, `GOOGLE_PLACES_KEY`, `ENRICHISSEMENT_PROVIDER`, `ENRICHISSEMENT_CREDITS_LIMIT_SOCIETE=1000`, `ENRICHISSEMENT_CREDITS_LIMIT_PAPPERS=100`
- **Permissions** ajoutées : `page:enrichissement`, `enrichissement:layer_b`, `enrichissement:lock`
- **Rate-limits** ajoutés dans http_client : insee-sirene, inpi-rne, ban, societe-com, pappers, osm-overpass, google-places
- **Tests unitaires validés** : création, verrou, hash identique/différent, resolve port, fmt TVA (Danone → FR27552032534)
- **Test end-to-end** : autocomplete "danone" → 8 résultats, enrichir applique correctement les champs, verrou utilisateur intouchable après re-run

### Migration PuceEtat (unification badges)
- 11 fichiers migrés : `Clients`, `ClientDetail`, `Agents`, `AdminUsers`, `Confidentialite`, `Paiements`, `Layout`, `OverdueBanner`, `AnniversariesWidget`, `FollowUpsWidget`
- Mapping statut client : `actif→succes`, `vip→info`, `prospect→vigilance`, `inactif→info`
- Suppression des hex codés en dur remplacés par `var(--ds-*)` (OverdueBanner, AnniversariesWidget)

### Lint anti-hex
- `/app/frontend/.eslintrc.js` : `no-restricted-syntax` interdit les literal `#[0-9a-f]{3,8}` dans src/**/*, hors `src/design-system/`
- Alerte aussi sur les template strings contenant un hex

### Système de design (v10.0)
- Fichier unique `src/design-system/tokens.css` — TOUTES les valeurs hex
- 3 thèmes : clair (défaut) · sombre · soleil (21:1, bordures 2 px)
- ThemeContext + ThemeToggle (4 états : clair/sombre/soleil/système)
- Route `/design-system` — page démo 7 sections

### Historique
- v10.0 : Système de design 3-thèmes
- v9.0 Iter 13 : RBAC + per-user overrides
- v8.0 Iter 12 : Traçabilité lot + Relevés terrain + VIES
- v7.0 Iter 11 : Phase 1 intégrations FR
- v6.0 Iter 10a : Rapprochement bancaire
- v5.5 Iter 9 : Conflict Playbook + PDF email

## Tests
- Enrichissement : tests unitaires OK + e2e curl OK
- `test_iter13_permissions.py` — 9/9
- `test_iter12_phase2.py` — 5/5
- `test_iter11_public_apis.py` — 16/16
- `test_iter10a_banking.py` — 15/15
- `test_iter9_playbook_pdf_email.py` — 10/10

## Backlog

### Couche C (non commencée)
- Table `osm_places` isolée + import batch OSM
- Table `google_place_refs` : `{establishment_id, place_id}` uniquement, jamais de note/avis/horaires stockés
- Proxy endpoint `GET /api/establishments/{id}/place-preview` : appel Google Places live à l'ouverture, aucune persistance
- Attribution "© OpenStreetMap contributors" + attributions Google requises

### UI Enrichissement
- Onglet `/etab/:id/enrichissement` : badges source/date/fiabilité par champ, bouton verrou/déverrou, bouton "Enrichir Pappers"
- Autocomplete SIREN à la création d'établissement

### Crons enrichissement
- Ajouter à `.emergent/crons.yml` : `cron-enrichissement-sirene-refresh` (mensuel J1), `cron-enrichissement-scoring-mensuel` (J1), `cron-enrichissement-comptes-annuels` (avril)
- BODACC portefeuille : déjà présent via `bouclier-encours`

### Application du système de design
- Continuer la migration des couleurs codées en dur (Dashboard, Etablissement360, autres widgets)
- Faire tourner ESLint en CI pour bloquer les nouveaux hex

### Phase 2 restante
- Interface livreur ultra-simplifiée
- Contenants consignés (QR, immobilisation)
- Fraîcheur stock client (DLC probabiliste)

## Credentials
Voir `/app/memory/test_credentials.md`.
