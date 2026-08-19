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
