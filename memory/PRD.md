# BEVID — CRM Distribution de Boissons

## Architecture
FastAPI + MongoDB (UE) + React 19 + Tailwind + Dexie + Emergent Resend/Storage + Leaflet + html5-qrcode + qrcode.react + cairosvg + reportlab.

**Sous-packages isolés (PARTIE 0 règle 1) :**
- `/app/backend/bank/` — validators, storage, importers, reconciliation
- `/app/backend/integrations/` — http_client, bodacc, recherche_entreprises, rappelconso, vies, naf_chr

## Implemented — v8.0 (18/02/2026) — Iter 12 : Amorce Phase 2

### Traçabilité lot + rappel sortant complet
- `POST /api/lots` — création lot (product_id, lot_number, gtin, ddm, quantité)
- `POST /api/delivery-lines` — ligne de livraison indexée sur `lot_id` (base du rappel sortant)
- `POST /api/veille/rappels/{event_id}/generate-declaration` — dossier réglementaire DGCCRF pré-rempli : quantité vendue totale, unité, motif, risques, nb clients notifiés

### Relevés terrain < 20 s (observatoire — PARTIE 14)
- `POST /api/releves-terrain` : marques présentes, prix consommateur constatés, nb lignes tirage, photo, GPS
- `GET /api/releves-terrain?client_id=` : historique par client
- `GET /api/observatoire/summary` : agrégat **anonymisé** — seuil min 5 relevés, top 10 marques, prix médian par marque (≥ 3 mesures)
- Frontend : FAB flottant sur ClientDetail, formulaire 3 champs + tableau prix dynamique, géoloc opt-in

### VIES — validation TVA intracom
- `POST /api/tools/vies-check` — appel POST natif VIES (Commission Européenne)
- Bouton "Vérifier VIES" dans `ClientBankingPanel`
- Tracé dans `ingestion_runs`, ajouté à `/sources-donnees`

## Implemented — v7.0 (18/02/2026) — Iter 11 Phase 1 Intégrations
- Socle HTTP (rate limiter par source, UA `BEVID/1.0`, tracing 90j `ingestion_runs`)
- Écran `/sources-donnees` (licences ouvertes, dernière sync)
- Prospection `/prospection` (Leaflet + OSM, 25 résultats Pau ✓)
- Radar `/radar` (BODACC → RE → CHR filter, 3 vrais nouveaux CHR dept 64 ✓)
- Veille `/veille` (RappelConso GTIN + fonction inverse impacted-clients)
- Bouclier `/bouclier` (procédures collectives → orders_blocked auto)
- Extensions modèle : siren, NAF double, GPS, admin_state, prospection_status

## Implemented — v6.0 Iter 10a Rapprochement bancaire
CSV/CAMT.053/CFONB 120 · moteur 4 niveaux confiance · lettrage réversible · cloisonnement DSP2.

## Implemented — v5.5 Iter 9
Conflict Playbook · PDF email Resend · œil password · fix dictée vocale.

## Backlog / Phase 2 (reste à faire)
- **Interface livreur ultra-simplifiée** — 3 saisies < 10 s (scan QR contenants, marque concurrente, photo back-bar)
- **Contenants consignés** — QR, scan sortie/retour, valeur immobilisée, alerte immobile, solde consigne intégré à l'encours
- **Fraîcheur stock client** — DLC probabilistique via `delivery_lines` + `lots.ddm`
- **Marge accises comprises** — référentiel fiscal 2026 versionné + calcul à la ligne

## Backlog / Phase 3 (intelligence territoriale)
- Indice de potentiel commune (INSEE Melodi)
- Prévision saisonnière (DS_TOUR_FREQ + calendrier scolaire + jours fériés)
- Agenda du territoire (DATAtourisme)
- Déclencheur météo (Météo-France AROME)

## Backlog / Phase 4
- Observatoire mutualisé anonymisé (calcul part de tirage, benchmark)
- Assistant terrain (briefing + dictée structurée)

## Tests
- `tests/test_iter12_phase2.py` — 5/5 (relevés, lots, delivery, observatoire, VIES)
- `tests/test_iter11_public_apis.py` — 16/16
- `tests/test_iter10a_banking.py` — 15/15
- `tests/test_iter9_playbook_pdf_email.py` — 10/10

## Credentials
Voir `/app/memory/test_credentials.md`.
