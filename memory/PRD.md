# BEVID — CRM Distribution de Boissons

## Architecture
FastAPI + MongoDB (UE) + React 19 + Tailwind + Dexie + Emergent Resend/Storage + Leaflet + html5-qrcode + qrcode.react + cairosvg + reportlab.

**Modules bancaire & intégrations publiques FR** : sous-packages isolés selon PARTIE 0 (adaptateurs autonomes).
- `/app/backend/bank/` — validators, storage, importers, reconciliation
- `/app/backend/integrations/` — http_client (rate limité par source, UA explicite), bodacc, recherche_entreprises, rappelconso, naf_chr mapping

## Product principles
- Mobile-first, ≥ 48px, thumb-zone, indicateur sync permanent
- Marges masquées tant que coûts non validés
- Géoloc ponctuelle uniquement, opt-in
- 2 rôles stricts, JWT 90 jours, 4 langues fr/en/es/de
- **Règle 0 : aucune API externe depuis l'UI**. Toutes ingestions via tâches de fond + endpoints backend rate-limités.
- Cloisonnement DSP2 : contreparties bancaires isolées de la base CRM

## Implemented — v7.0 (18/02/2026) — Iter 11 : Intégrations publiques FR Phase 1

### Socle intégration (partie 0)
- `integrations/http_client.py` : 1 seul client HTTP, rate limiter par source (7 rps BODACC/RE, 5 rps RappelConso), User-Agent `BEVID/1.0 (support@bevid.fr)`, retry backoff jitter sur 429/5xx, tracing 90 jours dans `ingestion_runs`
- Écran `/sources-donnees` (manager) : chaque producteur public + licence + fraîcheur + rate limit + dernier statut de sync + journal des 30 dernières ingestions

### Module 1 — Prospection autour de moi
- `GET /api/prospection/nearby?lat=&lng=&radius_km=` (max 50 km) : appelle `recherche-entreprises.api.gouv.fr/near_point`, filtre CHR via mapping, **exclut SIREN déjà en portefeuille**
- Badges: bio, entrepreneur_spectacle, confiance_sanitaire (data.gouv)
- `POST /api/prospection/convert` : convertit un prospect en client
- Frontend `/prospection` : Leaflet + OpenStreetMap tiles, géoloc navigateur, marqueurs prospects + popup

### Module 2 — Radar d'ouvertures CHR
- Cron `radar-ouvertures` 06h30 : `POST /api/cron/radar/creations` (protégé X-Cron-Secret)
- Bouton `POST /api/radar/scan-now` (manager) — même job à la demande
- Pipeline : BODACC (créations + immatriculations par département) → enrich SIREN via Recherche d'entreprises → filtre CHR via `naf_chr_mapping` (double NAF 2008/2025) → écriture `establishments` avec `source_decouverte=bodacc`
- Frontend `/radar` : liste des nouveaux CHR détectés, config départements surveillés, scan manuel
- Test réel : 36 annonces BODACC dept 64 → 2 CHR filtrés → 2 prospects créés

### Module 3 — Veille rappels produits
- Cron `rappels-conso` toutes les heures (min 5) : `POST /api/cron/rappels/scan`
- Match GTIN sur `products.gtin` + `lots.gtin` → écrit `watch_events` (source=rappelconso)
- **Fonction inverse** : `GET /api/veille/rappels/{event_id}/impacted-clients` remonte via `delivery_lines` les clients livrés + quantités + dernière date
- Frontend `/veille` : liste rappels avec gravité colorée + modal "Clients touchés"

### Module 4 — Bouclier encours
- Cron `bouclier-encours` 05h : `POST /api/cron/bouclier/scan`
- Pour chaque SIREN client actif → BODACC `familleavis=collective`
- Classifier : `liquidation → block` (bloque commandes + rouge), `redressement → watch` (paiement comptant + orange), `sauvegarde → watch`, `plan → info`
- Applique `admin_state`, `orders_blocked`, `orders_cash_only`, `credit_status` sur clients/establishments
- Frontend `/bouclier` : alerts colorées par gravité, scan manuel

### Extensions modèle
- `establishments/clients` : `siren`, `activite_principale`, `activite_principale_naf25`, `code_commune_insee`, `lat/lng`, `date_creation_entreprise`, `etat_administratif`, `source_decouverte`, `prospection_status`, `admin_state`, `admin_state_reason`, `orders_blocked`, `orders_cash_only`
- Nouvelles collections : `naf_chr_mapping`, `data_sources`, `ingestion_runs`, `watch_events`, `lots`, `delivery_lines`
- `naf_chr_mapping` seed au startup (idempotent) — 10 codes 2008 + équivalents NAF 2025 (56.30Y débits, 56.11G restau trad, 56.12Y food trucks, etc.)

### Crons ajoutés (`.emergent/crons.yml`)
- `bouclier-encours` 05h · `radar-ouvertures` 06h30 · `rappels-conso` chaque heure

## Implemented — v6.0 (18/02/2026) — Iter 10a Rapprochement bancaire
Voir historique complet dans le repo. Import CSV/CAMT.053/CFONB 120, moteur 4 niveaux confiance, lettrage réversible, cloisonnement DSP2.

## Implemented — v5.5 — Iter 9
Conflict Playbook, PDF email Resend, œil password toggle, fix dictée vocale.

## Backlog / P1
- Terrain relevés (`releves_terrain`) — collecte par les commerciaux à démarrer dès maintenant (l'observatoire = actif long terme, chaque semaine sans collecte est perdue)
- Interface livreur simplifiée (« Le livreur capteur ») — 3 saisies < 10s : contenants repris, marque concurrente, photo
- Assistant terrain — briefing pré-visite + extraction d'entités depuis dictée

## Backlog / Phase 2 (à venir)
- Marge accises comprises (référentiel fiscal 2026 versionné)
- Traçabilité de lot + rappel sortant complet (pain.008 SEPA)
- Fraîcheur du stock client (DLC probabilistique)
- Parc de contenants consignés (valeur immobilisée, rotations)

## Backlog / Phase 3
- Indice de potentiel commune (INSEE Melodi DS_TOUR_CAP + DS_BPE)
- Prévision saisonnière (DS_TOUR_FREQ + calendrier scolaire + jours fériés)
- Agenda du territoire (DATAtourisme)
- Déclencheur météo (Météo-France AROME)

## Backlog / Phase 4
- Observatoire mutualisé anonymisé
- Assistant terrain + dictée structurée

## Tests
- `/app/backend/tests/test_iter11_public_apis.py` — 16/16
- `/app/backend/tests/test_iter10a_banking.py` — 15/15
- `/app/backend/tests/test_iter9_playbook_pdf_email.py` — 10/10

## Credentials
Voir `/app/memory/test_credentials.md`.
