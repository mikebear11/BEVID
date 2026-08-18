# BEVID — CRM Distribution de Boissons

## Architecture
FastAPI + MongoDB + React 19 + Tailwind + Dexie + Emergent Resend/Storage + Leaflet + reportlab + cairosvg.

**Sous-packages isolés (skill règle 0.5) :**
- `/app/backend/bank/` — validators, storage, importers, reconciliation
- `/app/backend/integrations/` — http_client, bodacc, recherche_entreprises, rappelconso, vies, naf_chr
- `/app/backend/permissions.py` — registry features + `has_feature()` + `require_feature()` decorator

## Implemented — v9.0 (18/02/2026) — Iter 13 : RBAC + per-user overrides

### Modèle d'autorisation (skill règle 0.5 : minimal — RBAC + overrides, PAS de policy engine)
- **35 features** groupées en 8 catégories : Pages, Client, Catalogue, Commande, Observatoire, Outils, Trésorerie, Admin
- **Defaults par rôle** : manager = tout ✓, commercial = restreint (rapprochement, bouclier, sources-donnees, view_cost, edit_banking, upload_docs = ✗)
- **Overrides par utilisateur** stockés dans `users.feature_overrides` : `{feature_key: true|false}` — surclasse le défaut du rôle
- **Deny-by-default** sur clé inconnue (le override ignoré si feature inexistante)
- **SoD** : impossible de modifier ses propres permissions (400)

### API
- `GET /api/permissions/features` (manager) — registre statique
- `GET /api/me/permissions` — permissions effectives du user courant (frontend cache via `PermContext`)
- `GET /api/admin/users/{uid}/permissions` — inspecte les overrides + effectives d'un user cible
- `POST /api/admin/users/{uid}/permissions` — set/reset (null = retour au défaut rôle) · audit_log

### Frontend
- **`PermContext`** : provider global, cache `/me/permissions`, expose `usePerms().has(key)`
- **`Layout.jsx`** : nav sidebar filtré par `has(feature)` au lieu de `role.includes` — masquage instantané pour un commercial d'une zone qu'il n'a pas
- **`/admin/permissions`** : matrice manager avec 3 états par cellule (✓ autorisé override / ✗ refusé override / — défaut rôle), catégories collapsibles, recherche user, sauvegarde delta

### Bonus micro-fix
- Deals : "Pipeline pondéré" → **"Deal pondérée"**

## Historique
- v8.0 Iter 12 : Traçabilité lot + delivery_lines + Relevés terrain + VIES (5/5 tests)
- v7.0 Iter 11 : Phase 1 intégrations FR (16/16 tests)
- v6.0 Iter 10a : Rapprochement bancaire CSV/CAMT/CFONB (15/15)
- v5.5 Iter 9 : Conflict Playbook + PDF email (10/10)

## Tests
- `test_iter13_permissions.py` — **9/9** (features registry, defaults manager/commercial, grant/revoke/reset, SoD, unknown ignored, commercial-403)
- `test_iter12_phase2.py` — 5/5
- `test_iter11_public_apis.py` — 16/16
- `test_iter10a_banking.py` — 15/15
- `test_iter9_playbook_pdf_email.py` — 10/10

## Backlog Phase 2 restant
- Interface livreur ultra-simplifiée (3 saisies < 10s)
- Contenants consignés (QR, valeur immobilisée, alerte immobile)
- Fraîcheur stock client (DLC probabilistique)
- Marge accises 2026 (référentiel versionné + calcul à la ligne)

## Backlog Phase 3 (intelligence territoriale)
- Potentiel commune (INSEE Melodi), prévision saisonnière, agenda territoire, déclencheur météo

## Backlog Phase 4
- Observatoire mutualisé anonymisé + Assistant terrain (briefing + dictée structurée)

## Credentials
Voir `/app/memory/test_credentials.md`.
