# BEVID — CRM Distribution de Boissons

## Architecture
FastAPI + MongoDB (UE) + React 19 + Tailwind + Dexie + Emergent Resend/Storage + html5-qrcode + qrcode.react + cairosvg (icons) + reportlab.

Module bancaire (Iter 10a) : sous-package `/app/backend/bank/` isolé selon PARTIE 0 (adaptateurs autonomes).

## Product principles
- Mobile-first, ≥ 48px, thumb-zone, indicateur sync permanent
- Marges masquées tant que coûts non validés
- Géoloc ponctuelle uniquement, opt-in
- 2 rôles stricts, JWT 90 jours, 4 langues fr/en/es/de
- Typo ZT Nature + logo BEVID SVG + PWA icons vectoriels
- Offline-first : Dexie + client_uuid idempotent + queue rejouée
- Cloisonnement DSP2 : contreparties bancaires JAMAIS fusionnées avec CRM commercial

## Implemented — v6.0 (18/02/2026) — Iter 10a Rapprochement bancaire

### Client model enrichi (KYB)
- `iban` (validation mod-97), `bic`, `siret` (Luhn 14), `siren` (Luhn 9), `tva_intra`
- `kbis_path` + `rib_path` (Emergent Object Storage, PDF/PNG/JPEG, ≤ 10 Mo)
- `POST /api/clients/{id}/banking` : update strict avec validators
- `POST /api/clients/{id}/documents?kind=kbis|rib` : upload + audit
- `GET /api/files/{path}` : download authentifié (JWT header OR ?auth= query pour img src)
- Frontend : `ClientBankingPanel.jsx` intégré dans ClientDetail

### Bank statement importers (aucun appel API externe requis)
- **CSV libre** : détection auto délimiteur, montant FR/EN, colonnes date/libellé/montant/debit/credit/référence
- **CAMT.053** (ISO 20022 XML) : Ntry, CdtDbtInd, RmtInf/Ustrd, Dbtr/Cdtr, EndToEndId
- **CFONB 120** (bandes fixes legacy FR) : code 04, signe A-I/J-R, positions officielles
- `POST /api/banque/imports` (multipart) : sniff format, parse, insertion idempotente par `external_id` hash, auto-lettrage immédiat sur nouvelles écritures

### Moteur de rapprochement — 4 niveaux de confiance (PARTIE 4.4)
- **Certaine (100)** : référence RF ISO 11649 (mod-97) + montant exact, OU EndToEndId émis
- **Élevée (85)** : n° facture regex `BEVID-FA/BC/INV-XXXX` + montant, OU nom payeur normalisé unique + montant
- **Moyenne (60)** : montant exact d'une seule facture ouverte (fenêtre 90j), OU somme unique ≤10 factures = montant
- **Faible (30)** : paiement partiel (nom match + montant < reste)
- Seuil auto-lettrage : ≥ 85. En dessous → propositions triées, validation manager 1 clic.
- Normalisation FR : accents, formes sociales (SARL/SAS/...), casse

### Lettrage réversible (PARTIE 4.5)
- Table `bank_lettrages` : N tx ↔ N orders, montant affecté, méthode (auto/manual), confidence, reason
- `payment_status` de l'order calculé dynamiquement (`paid` / `partial` / `pending`)
- **Dé-lettrage** : `POST /banque/lettrages/{id}/delettrer` → recalcule status order + tx (SEPA 8 sem / retour chèque)

### Frontend
- Page `/rapprochement` (manager only) : KPI cards (total, ouvertes, lettrées %, taux auto), filtres statut, recherche, table, modal Propositions avec badges de confiance colorés
- Nav sidebar + i18n fr/en/es/de

### Cloisonnement DSP2
- Collection isolée `bank_counterparties` (nom normalisé + first_seen/last_seen/count) — jamais fusionnée avec `clients`

## Implemented — v5.5 (17/02/2026) — Iter 9
- Conflict Playbook 1 clic (refund Stripe + restock + notif WhatsApp/Email)
- Envoi PDF commande par email (Resend + lien public token 24h)
- PasswordInput réutilisable avec œil afficher/masquer
- Bug dictée vocale corrigé (isFinal vs interim distinction)

## Rappels v5.4
- Sync feed manager + détection auto conflits, onboarding tour, PWA icons cairosvg
- Password reset via Resend, offline visits/orders via postOffline + client_uuid
- Signature intégrée dans POST order

## Backlog / P1
- **Iter 10b (socle intégration)** : interfaces `BanquePort`/`ComptabilitePort`/`FacturePort`, retry+backoff, circuit breaker, rate limiter, file persistante Mongo, sondes 15min, tests de contrat nocturnes
- Vue détaillée du catalogue produit (photo, ABV, formats, pitch, PJ)

## Backlog / P2
- **Bridge** (agrégation DSP2) — expiration 180j, moniteur J-30/-15/-7/-1
- **Qonto direct** (webhooks natifs, meilleures données)
- **Mandats SEPA + pain.008/pain.002/CAMT.054**
- **Bordereau de remise chèques** (chauffeur encaisse sur place)
- Onboarding vidéo/GIF, Filtre agent Sync Feed, Multi-tenant SaaS
- Refactor server.py 4000+ lignes → /backend/routes/

## Credentials
Voir `/app/memory/test_credentials.md`.

## Tests
- `/app/backend/tests/test_iter10a_banking.py` — **15/15 passent** (validators, endpoints, CSV+CAMT importers, auto-lettrage, dé-lettrage, propose, manual lettrage)
- `/app/backend/tests/test_iter9_playbook_pdf_email.py` — 10/10 passent
- Iterations 3–8 : voir tests précédents
