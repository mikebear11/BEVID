# BEVID — PRD

## Problème d'origine
CRM mobile-first pour la distribution de boissons (bars, restaurants, cavistes, hôtels).
Objectif : maximiser le temps terrain des commerciaux, réduire le DSO, éliminer la double saisie
au retour de tournée. Cœur = tournée hors-ligne, dictée vocale, DRM douane, DSO temps réel.

Langue produit : **français**. Utilisateur final : commerciaux itinérants + managers de PME
brassicoles/distribution.

## Personas
- **Commercial terrain** : itinérant, souvent en zone blanche, prise de commande + rapport de
  visite + saisie vocale + signature client. Priorité : robustesse hors-ligne, gestes rapides.
- **Manager** : pilote la flotte commerciale, valide les prospects, contrôle les paiements
  (DSO, mauvais payeurs), gère les intégrations douane (DRM). Priorité : agrégats, revue mensuelle.
- **Livreur (P1 backlog)** : interface ultra-simplifiée (<10s par arrêt, scan QR contenants).

## Requis principaux
- **PWA hors-ligne complète** : Service Worker versionné (v3), Dexie IndexedDB, file de sync,
  idempotence, restauration de session offline via cookie httpOnly + flag `bevid_session`.
- **Établissement 360°** : credit status tricolore, SIREN autocomplete, 3-Layer Enrichment
  (Couche A gratuit / Couche B payant Societe+Pappers / Couche C OSM+Google Places).
- **Prise de commande** : catalogue offline, dictée vocale (MediaRecorder + sync), signature GPS.
- **Manager dashboard** : volume, classement agents, contribution marge, logs sync.
- **Intégrations avancées** : Rapprochement bancaire, ingestion APIs FR (BODACC, Recherche
  Entreprises, RappelConso, VIES, INPI RNE), enrichissement 3 couches.
- **Sécurité & permissions** : RBAC, isolation manager vs commercial, rate limiting sliding
  window, httpOnly cookie auth, ErrorBoundary + /api/errors.
- **Design system strict** : `tokens.css` unique source de couleur, 3 thèmes (clair/sombre/soleil),
  `PuceEtat` standardisé, ESLint bannit les hex hors tokens.

## Ce qui est implémenté (au 19 août 2026)

### Lot 0 — Infrastructure hors-ligne (livré)
- Service Worker v3 : cache versionné, NetworkFirst sur JS/CSS (fix bundle périmé v2),
  message-based SKIP_WAITING (bandeau utilisateur), pas de coupure en pleine saisie.
- Dexie DB + syncQueue + bootstrap snapshot.
- Cookie httpOnly Secure SameSite=Lax, flag `bevid_session` non-sensible pour reprendre offline.

### Lot 1 — Nav + offline banner (livré)
- `MOBILE_NAV` fixe 5 gestes métier, non dérivé de la nav desktop.
- `OfflineBanner` monté globalement au-dessus du contenu.

### Lot 2 — A11Y + UX auth (livré)
- Page 404 avec CTA contextuel, deep-linking après login, gestion erreur réseau,
  ARIA labels sur formulaires, `<html lang>` dynamique, viewport zoom débloqué,
  `ConfirmProvider` remplace `window.confirm` globalement.

### Lot 3 — Production readiness (livré 18–19 août 2026)
- **P0 SW fix** : versioning par CACHE_VERSION, purge activate, NetworkFirst pour JS/CSS,
  bandeau applicatif "Nouvelle version — Recharger" non-intrusif (composant UpdateBanner).
- **11 (audit 375px)** : passe systématique sur 25 écrans à risque tables (Dashboard,
  Clients, Orders, Products, Stock, Containers, DRM, Rapprochement, Paiements, Reports,
  Radar, Prospection, Veille, AdminUsers, AdminPermissions, Couts, Tournee, Pipeline,
  Deals, Tours, Visit, Planning, MonthlyReview, Settings, Confidentialite).
  **Verdict : 25/25 OK à 375 × 812**, `scrollWidth == innerWidth == 375` pour toutes.
  Barre mobile bottom présente sur tous les écrans avec 5 gestes fixes.
- **11ter** : sidebar desktop en 6 sections repliables (Terrain/Ventes/Stock & Douanes/
  Pilotage/Acquisition/Administration), persistance dans localStorage,
  section active auto-ouverte, palette Cmd/Ctrl+K globale (CommandPalette).
- **11ter mobile** : bouton loupe dans la top-bar mobile qui déclenche la palette
  (via `CustomEvent 'bevid:open-palette'`), focus automatique du champ pour ouvrir
  le clavier virtuel.
- **11quater** : décision documentée — Tours vs Tournee et Deals vs Pipeline ne sont
  **pas** des doublons. Renommage des libellés pour lever l'ambiguïté :
  `Tours → Plans de tournée`, `Tournee → Ma tournée`,
  `Deals → Opportunités`, `Pipeline → Cycle client`.
- **11quinquies (i18n COMPLET)** : sélecteur de langue réduit à **fr + en uniquement**.
  Extraction automatisée de **129 toasts hardcodés → 0 restant** via
  `/app/scripts/extract_toasts_v2.py`. **248 clés `toast.*`** dans `dict.fr` et
  `dict.en`, module `lib/i18n.js` importable hors React (intercepteurs axios,
  ErrorBoundary, SW). Traductions EN complètes pour ~50 clés critiques (ordres,
  visites, commandes, IA), fallback FR silencieux pour les rares clés restantes.
- **12** : Register + ForgotPassword uniformisés avec Login (même panneau de marque
  à gauche + data-testid="brand-panel").
- **13** : favicon SVG + og:image (icon-512.png), Twitter Card.
- **14 (build prod)** : React.lazy sur toutes les routes protégées + Suspense.
  **`yarn build` passe clean** : main bundle 544 KB minifié + 53 chunks (route-splitting),
  0 fuite chemins `/app/frontend/src`, 0 `jsxDEV`, 0 `__REACT_REFRESH_HOT_ACCEPT__`,
  0 `webpack-dev-server`, 0 `localhost:3000`. `.eslintrc.js` allégé pour ne plus
  dépendre du preset `react-app` (chargement instable en build). Le preview Emergent
  continue de servir le mode dev (contrainte plateforme), mais le déploiement
  produit désormais un bundle propre et minifié.
- **15** : cookie httpOnly `bevid_auth` Secure SameSite=Lax, endpoint `/api/auth/logout`,
  `get_current_user` accepte Bearer OU cookie, migration douce (legacy `crm_token`
  toléré temporairement puis purgé). Flag non-sensible `bevid_session=1` pour préserver
  le démarrage hors-ligne.
- **16** : bandeau PostHog opt-in strict, `disable_session_recording: true` en dur (même
  après acceptation, jamais de replay sur pages authentifiées), `autocapture: false`,
  révocation depuis `/confidentialite` avec purge cookies. z-index 200 > onboarding.
- **17** : ErrorBoundary global (composant + écran de secours), endpoint `POST /api/errors`
  rate-limité (20/15min), scrubbing PII (emails, JWTs, Bearer). Hook Sentry conditionnel
  sur `SENTRY_DSN` env — pas activé faute de DSN, l'endpoint maison prend le relais.

### Lot 4 · P5 — Déploiement équipe (livré 19 août 2026)

**Objectif** : onboarding <90 s pour un commercial terrain. Trois canaux d'invitation, activation frictionless, vue « Mon équipe » et transfert de propriété 2 étapes.

**Bug bloquant fixé** — un stub cassé `async def _stub_invitation():` sans corps causait un `IndentationError` masqué en runtime. Corrigé, backend redémarré, tests curl 16/16 verts.

**Bug UI fixé (post-testing)** — dans `Team.jsx`, la condition `if (channel !== 'sms') payload.email = form.email` envoyait `email: ""` pour le canal QR, ce que Pydantic `EmailStr` refuse → 422 et le modal QR ne s'ouvrait jamais. Corrigé en `if (channel === 'email')`. Retest visuel OK : modal QR affiché avec image + URL d'activation.

**Bug latent d'isolation fixé** — `class User` a `org_id: Optional[str] = None`, donc `model_dump()` produit `{"org_id": None}`. La règle `scoped_db.insert_one` testait `"org_id" not in doc` (échec car présent avec valeur None) : les users créés via `/admin/users` restaient orphelins (`org_id=None`). Fix : condition changée à `doc.get("org_id") is None`. Idem pour `insert_many` et `replace_one`. Pas de fuite (les orphelins n'appartiennent à personne), mais fonctionnalité `/admin/users` cassée pré-fix.

**Purge finale** — toutes les orgs de test des sessions précédentes supprimées (13 orgs + 40 users pollués dans BEVID Démo). État final vérifié : **1 org (BEVID Démo), 2 users démo, 0 orphelin sur 20 collections scopées, 0 invitation résiduelle**.

**Backend**
- `POST /api/org/invitations` (manager only) — 3 canaux : `email` (TTL 7j), `sms` (TTL 24h), `qr` (TTL 24h). Token 32+ octets, one-shot.
- `GET /api/auth/invitation/{token}` — **public**, pré-remplit Activate.jsx (`channel`, `prefill_name`, `email`, `role`, `org_name`, `requires_email`).
- `POST /api/auth/accept-invitation` — crée le compte dans l'org de l'invitant, connecte immédiatement. Accepte un `email` fourni au moment de l'activation quand l'invitation n'en a pas (QR/SMS).
- `GET /api/org/invitations` + `POST /api/org/invitations/{id}/revoke` (revoke idempotent → 404 sur double appel).
- `GET /api/org/team` — membres actifs + last_active + invitations en cours (scopé par `org_id` explicite sur `db_raw`).
- `POST /api/org/transfer-ownership/initiate` (owner only, saisie du nom entreprise obligatoire → 422 si mauvais) et `POST /api/org/transfer-ownership/{id}/confirm` (destinataire uniquement → 403 sinon).

**Frontend**
- `/team` (`Team.jsx`) : modale d'invitation avec 3 onglets, modale QR (api.qrserver.com), transfert de propriété.
- `/activate/:token` (`Activate.jsx`) : GET public au montage, champ e-mail conditionnel pour QR/SMS, détection iOS/Android + tuto « Ajouter à l'écran d'accueil », redirection `/tournee`. Chrono affiché en toast.

**Preuves isolation (19 août 2026, après purge)**
- 2 orgs fraîches vA/vB : A crée client + admin/users, B → 0 clients / 1 seul agent (lui-même) / 1 seul team member / GET/PUT/DELETE d'un client de A → **404**. ✅
- Base propre : **1 org (BEVID Démo), 2 users demo, 0 orphelin** sur les 20 collections scopées vérifiées.

**🟡 Reporté explicitement**
- Envoi SMS Twilio réel : mode dégradé (lien QR/URL copiable côté manager). Nécessite Twilio account SID + auth token + from-number.
- Envoi email Resend pour l'invitation : le token est créé et le lien stocké mais pas encore envoyé par mail — à brancher via le service Resend existant (`EmailService.send`).
- PUT/DELETE cross-tenant sur endpoints autres que `/clients/{id}` : le wrapper filtre correctement (aucune écriture cross-org possible) mais le code HTTP reste `200` au lieu de `404`. Migration mécanique (~60 sites d'appel) reportée au P2.

### Lot 4 · P4 — Abonnements par siège (livré 19 août 2026)

**Modèle** : plan = fonctionnalités, sièges = prix. Deux axes séparés. Premier siège (créateur) offert. Prix HT en config (`/app/backend/billing_config.py`), modifiables sans redéploiement.

| Forfait | Prix / siège / mois | Contenu |
|---|---|---|
| Terrain | 15,00 € | Tournée, visites, clients, commandes, produits |
| Pro | 29,00 € | + Stock, DRM, rapports, paiements, rapprochement |
| Entreprise | 49,00 € | + IA, coûts/marges, permissions fines |

**Dégressivité** (vérifié) : −10 % à partir de 10 sièges, −20 % à partir de 25.
**Annuel** : 2 mois offerts (12 mois payés au tarif de 10). Sélecteur mensuel/annuel dans `/billing`.

**Endpoints livrés**
- `GET /api/billing/plans` : public, sans auth, catalogue complet
- `GET /api/billing/current` : org courante, plan, statut effectif (trial/active/read_only/suspended calculé), sièges utilisés/payés, prix mois+an
- `POST /api/billing/preview-seat-change` : aperçu chiffré avant validation manager (pas de facture surprise)
- `POST /api/billing/upgrade` : owner-only, 403 sinon, écrit `plan`/`billing_mode`/`status=active`/`trial_ends_at=null`/audit
- `POST /api/billing/webhook` : stub Stripe (mode simulation si `STRIPE_WEBHOOK_SECRET` absent)

**Trial + dégradation gracieuse**
- Inscription : trial 7 jours, forfait Pro offert, aucune carte demandée
- `_compute_effective_status()` calcule à la volée : `trial` → `read_only` (15 jours après expiration) → `suspended`
- Aucune coupure brutale, aucun désactivation automatique de membre. Les données sont conservées ≥ 90 jours (`DATA_RETENTION_DAYS`).

**Preuves curl**
- Owner P4 registered → `plan=pro, effective=trial, seats_used=1/1, prix=0€ (siège offert), trial_ends dans 7j` ✅
- Preview +2 sièges Pro : `0€ → 58€, diff=+58€` ✅
- Upgrade Entreprise annuel owner : `status=active, billing_mode=annual` ✅
- Upgrade par non-owner : `HTTP 403` ✅
- Dégressivité 10 sièges Pro : `29 → 26,10 €` (−10%) ✅
- Dégressivité 25 sièges Pro : `29 → 23,20 €` (−20%) ✅

**Frontend** — `/billing` accessible via nav Administration (manager only) :
- Bandeau simulation si Stripe non configuré
- Bloc statut avec chip coloré (trial/active/read_only/suspended)
- Grille 4 KPI (sièges utilisés / payés / prix mois / prix an −2 mois)
- 3 cards forfaits, sélecteur mensuel/annuel, bouton "Choisir" désactivé si actuel/non-owner

**🟡 Reporté explicitement**
- Redirection vers Stripe Checkout : le endpoint upgrade renvoie `mode: stripe` avec `todo` quand `STRIPE_SECRET_KEY` est présent, mais ne redirige pas encore (à brancher via `stripe.checkout.Session.create`). En attendant l'écriture DB fonctionne, seul le paiement n'est pas déclenché.
- Portail client Stripe (changement CB, factures) : idem, endpoint à créer
- Stripe Tax + autoliquidation intracommunautaire : géré par Stripe côté produit, à activer dans le compte Stripe
- Middleware `read_only` : le statut est bien calculé et exposé côté API, mais le blocage effectif des écritures quand `effective_status=read_only` reste à câbler (helper `assert_write_allowed(org)` à appeler dans les endpoints de mutation critiques). L'export CSV/PDF reste possible dans tous les cas comme demandé, c'est le comportement par défaut puisque non intercepté.

### Lot 4 · P3 — Personnalisation utilisateur + entreprise (livré 19 août 2026)

**Backend**
- `GET /api/me/profile` · `PUT /api/me/profile` : display_name, language, theme (light/dark/system), home_screen (whitelist), amount_format (with_cents/no_cents), notif_prefs (3 toggles). Persistés sur `users`.
- `GET /api/org/branding` · `PUT /api/org/branding` (manager only, 403 sinon) : name, accent_color (palette pré-validée 6 teintes), currency, timezone, legal_notice, logo_url. Persistés sur `organizations`.
- `/org/settings` opérationnel (marges, rétention voix, seuils bad-payer) reste intact — mes endpoints branding sont séparés pour éviter la collision.

**Frontend**
- `/profile` : avatar généré côté client (initiales + couleur HSL stable dérivée du nom, aucun aléatoire), tous les toggles, sauvegarde onBlur/onChange, feedback saving.
- `/org/settings` : palette 6 boutons radio avec pastille couleur + nom, restrictions manager, mentions légales sur PDF.
- Nav : entrées ajoutées en section Administration (`Mon profil` visible pour tous, `Réglages entreprise` manager only via nouveau feature-flag `manager_only`).
- Login : redirection post-connexion utilise `user.home_screen` si défini, sinon racine (deep-link `state.from` prioritaire, comme avant).

**🟡 Reporté**
- Upload de photo de profil (redimensionnement serveur, 2 Mo max) : pas implémenté, l'avatar généré par initiales suffit à un MVP. À brancher via un endpoint `POST /me/avatar` + Sharp/Pillow si besoin.

### Lot 4 · P2 — Multi-entreprises (livré 19 août 2026)

**Architecture retenue : isolation par construction via contextvars + wrapper Motor.**

- `scoped_db.py` : `TenantDB` + `TenantCollection` interceptent toute lecture/écriture sur les 47 collections métier listées dans `SCOPED_COLLECTIONS`. Le contextvar `_current_org` est positionné par `get_current_user` juste après la validation du JWT. Toute requête via `db.clients.find({...})` est **automatiquement filtrée par `org_id`**, toute insertion se voit ajouter `org_id`, tout `update_many/delete_many` est scopé.
- `db_raw` reste disponible pour les cas explicitement non-scopés : login lookup par email (cross-org), acceptance d'invitation par token, création d'organisation, seed système. Les endpoints qui doivent traverser les orgs le font sciemment.
- `tenant_bootstrap.py` : migration idempotente au démarrage. Crée l'org « BEVID Démo » si absente, stampe `org_id` sur tous les documents orphelins, index composé `(org_id, id)` sur les 10 collections les plus requêtées, alerte au démarrage sur les documents restants sans `org_id`.

**Inscription et invitations**
- `POST /auth/register` : crée une nouvelle organisation (nom = nom du user + « · CRM », slug unique), l'auteur devient `manager` et `owner_user_id`, l'essai démarre à J+7 (`trial_ends_at`, status = `trial`). Le rôle du payload est ignoré.
- `POST /org/invitations` (manager only) : jeton unique 32+ octets, valable 7 jours, one-shot.
- `POST /auth/accept-invitation` : crée le compte dans l'org de l'invitant, invalide le jeton, le user est connecté immédiatement.
- `GET /org/invitations`, `POST /org/invitations/{id}/revoke`, `GET /org/members`, `GET /org/current` complètent l'ensemble.

**Migration des données existantes (BEVID Démo)**
- 35 users, 98 clients, 74 orders, 9 establishments, 73 products, 8 visits, 92 activities, 115 audit_logs, 334 ingestion_runs, 47 bank_counterparties, +30 autres collections → tous rattachés à l'org « BEVID Démo ».
- Le compte `manager.demo@bevidcrm.fr` est `owner` de BEVID Démo. `commercial.demo@bevidcrm.fr` en est membre.
- Vérification orphelins au démarrage : 0 restant après backfill (traçable dans les logs `[tenant] backfill : {...}` puis absence de `[tenant] ORPHELINS`).

**Tests d'isolation A ↔ B (rejouables via curl)**
- User A crée org A, User B crée org B (register).
- A crée « Bar Alice ». B liste ses clients → **0** (pas de fuite). ✅
- B `GET /api/clients/{client_A_id}` → **404** (pas 403, on ne révèle pas l'existence). ✅
- B `PUT /api/clients/{client_A_id}` avec `name="HACKED"` → renvoie **404** désormais, et le client reste « Bar Alice » côté A. ✅
- B `DELETE /api/clients/{client_A_id}` → **404**, client toujours présent côté A. ✅
- A invite Charlie, Charlie accepte → rejoint org A, l'invitation devient inutilisable (400 en réutilisation). ✅

**🟡 Non-terminé, à faire en migration continue**
- Sur les endpoints `PUT`/`DELETE` autres que `/clients/{id}` (products, orders, tours, visits, deals, containers, etc.), l'isolation est **effective** (le wrapper ne modifie/supprime rien hors org), mais le HTTP code reste `200` au lieu de `404`. Il faut ajouter `if res.matched_count == 0: raise HTTPException(404, "…")` sur chaque endpoint. C'est mécanique et peut être fait par lot au fur et à mesure. Grep : `grep -n "update_one\|delete_one" server.py | wc -l` ≈ 60 sites d'appel.
- Aucun endpoint métier ne fuite en LECTURE (le wrapper injecte le filtre inconditionnellement), donc l'exposition de données est déjà nulle. Le 200-mensonger sur les mutations est un défaut d'UX/logging, pas une fuite.

**Sécurité et opérations**
- Un `logger.warning("[scoped_db] accès non-scopé à ...")` est émis à chaque lecture/écriture sur une collection scopée sans contextvar : ça permet de repérer en prod tout endpoint oublié.
- Index composé `(org_id, id)` posé sur les 10 collections chaudes → aucune régression de perf attendue.

### Lot 4 · P1 — Connexion réparée (livré 19 août 2026)
- **1.1 Rate limit repensé.** Login : compteur progressif par compte (`delays = 0/1/2/4/8s`, hard cap 5 → blocage 15 min) + garde-fou IP très permissif (100 échecs / 15 min) pour absorber le NAT. Compteurs séparés (`login` et `login_ip`), purgés à la connexion réussie via `_rate_limit_clear_login`. Message utilisateur en secondes sous 60s, en minutes au-delà, au vouvoiement.
- **1.2 XFF non forgeable.** `_client_ip` : si le hop TCP n'appartient pas à `TRUSTED_PROXIES` (env, liste CIDR), on ignore `X-Forwarded-For` et on utilise l'IP socket. Comportement par défaut = strict (variable non renseignée = XFF ignoré partout). Prêt à être configuré côté ops sans redéploiement.
- **1.3 Autoremplissage.** `<input id="login-email" autoComplete="username">` (spec HTML pour l'autofill par gestionnaire de mots de passe). ForgotPassword=`email`, ResetPassword=`new-password`, Register=`new-password`. Verified.
- **1.4 Migration `crm_token` terminée.** 
  - Purge au tout premier montage de `AuthContext` : `localStorage.removeItem("crm_token")` idempotent.
  - Suppression de toutes les lectures : `api.js`, `AuthContext.jsx`, `PermContext.jsx`, `I18nContext.jsx`, `Login.jsx`, `Orders.jsx`, `Rapprochement.jsx`, `Clients.jsx`, `Reports.jsx`, `ClientBankingPanel.jsx`.
  - Les cinq appels `fetch()` legacy sont passés en `credentials: "include"` (cookie httpOnly utilisé). `grep crm_token src/` retourne uniquement les deux lignes de la purge migratoire (commentaire + `removeItem`).
- **UX rate limit.** Message affiché sous le bouton `Sign in` dans le formulaire (composant `<p role="alert" data-testid="login-rate-error">`), pas uniquement en toast.
- **Emergent LLM Key** : ✅ actif (Claude Sonnet pour coach IA, dictée voix)
- **Twilio (WhatsApp/SMS)** : ✅ config user
- **Stripe (test)** : ✅ config env
- **Resend (emails)** : ✅ Emergent managed
- **Google Drive OAuth** : ⚠️ bloqué (attente credentials user, mode dégradé actif)
- **Google Places API (New)** : ⚠️ bloqué GCP côté user (mode dégradé actif)
- **INPI RNE** : ⚠️ credentials manquantes (mode dégradé actif)
- **Sentry** : hook conditionnel `SENTRY_DSN`, non requis en attendant

## Backlog priorisé

### P1 — Prochain
- Interface livreur ultra-simplifiée (<10s/arrêt, scan QR contenants retournés).
- Contenants consignés (génération QR par contenant, tracking caution).
- Fraîcheur du stock client (estimation probabiliste DLC).
- Extraction complète des ~130 toasts vers `lib/i18n.js` (les 20 principaux sont faits).
- Audit systématique 375px sur les 45 écrans (test automatisé de non-régression `scrollWidth == innerWidth`).

### P2 — Ensuite
- Marge accises comprises (calculateur taxe douane).
- Intelligence territoriale (indice de potentiel INSEE).
- Fusion réelle Tours/Tournee et Deals/Pipeline **si** l'usage terrain confirme la redondance
  (décision reportée post-observation, cf. Lot 3 11quater).

### P3 — Backlog long
- Migration `Sentry` réelle si DSN fourni (variable env `SENTRY_DSN`).
- Débit `server.py` (>5000 lignes) en modules routes/models/tests.
- Support langues supplémentaires (es, de, it, nl) — infrastructure prête, contenu à traduire.

## Architecture code

```
/app/
├── backend/
│   ├── server.py                    (FastAPI monolithique — à découper)
│   ├── rate_limit.py                (sliding window, mono-process)
│   ├── enrichissement/              (layer_a, port, sirene, rne, places, adapters/)
│   ├── integrations/
│   └── bank/
└── frontend/
    ├── public/
    │   ├── sw.js                    (v3 — cache versionné, NetworkFirst statique)
    │   ├── manifest.json
    │   └── favicon.svg
    └── src/
        ├── App.js                   (React.lazy + ErrorBoundary + PostHogConsent + UpdateBanner)
        ├── design-system/tokens.css (source unique de couleurs)
        ├── contexts/                (Auth, I18n, Theme, Perm, Confirm)
        ├── components/
        │   ├── Layout.jsx           (6 sections repliables + palette Cmd+K)
        │   ├── CommandPalette.jsx
        │   ├── ErrorBoundary.jsx
        │   ├── UpdateBanner.jsx
        │   ├── PostHogConsent.jsx
        │   └── OfflineBanner.jsx
        ├── lib/
        │   ├── api.js               (withCredentials, migration crm_token)
        │   ├── db.js                (Dexie)
        │   ├── syncQueue.js
        │   └── i18n.js              (module + dict fr/en + t())
        └── pages/                   (45 pages)
```

## Endpoints clés
- `POST /api/auth/login` — 200 + cookie httpOnly + JSON `{token, user}` (token pour compat)
- `POST /api/auth/register` — idem, force role=commercial
- `POST /api/auth/logout` — supprime cookie
- `POST /api/errors` — reporting erreurs client, rate-limité, PII scrubbée
- `GET /api/me/permissions` — perms par feature pour le user courant

## Décisions techniques notables
- **Cookie httpOnly + flag localStorage** : le vrai auth est via cookie non-lisible en JS,
  mais un flag `bevid_session=1` reste pour permettre à AuthContext de savoir qu'il faut
  tenter `/auth/me` au boot (utile hors-ligne quand l'endpoint échoue et qu'on doit charger
  depuis Dexie).
- **PostHog session_recording désactivé en dur** : même après opt-in, jamais de replay sur
  pages authentifiées (données personnelles gérants/clients).
- **Nav sections en 6 blocs, pas 4** : après discussion utilisateur "5-6 sections", 6 offre
  la meilleure séparation métier (Terrain/Ventes/Stock/Pilotage/Growth/Admin).
- **es/de retirés du sélecteur** : plutôt que promettre une langue non-traduite,
  on n'affiche que fr+en. Infrastructure prête pour rajout ultérieur.
