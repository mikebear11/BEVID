# BEVID — CRM Distribution de Boissons

## Implemented — v15.0 (18/02/2026) — Lot 1 finition + Lot 2 (P2 + P3 partiel)

### Lot 1 — Vérification des régressions signalées par l'utilisateur
- **A. Layout.jsx `MOBILE_NAV`** : le fichier avait été rétabli sur une version antérieure lors d'un tour précédent. Désormais : constante littérale exportable, **jamais dérivée** de navAll/slice ; entrées fixes `Ma tournée · Visite · Scanner · Clients · Tableau` ; ordre invariable, indépendant des permissions. `/tournee` ajouté à navAll pour le desktop.
- **B. `OfflineBanner`** : composant présent + importé + monté en haut de `<main>`. Affiche "Mode hors-ligne — données du <snapshotAt>" quand `AuthContext.offlineMode=true`.

### Lot 2 — Fiabilité + Accessibilité
- **4. Page 404 chartée** : `/app/frontend/src/pages/NotFound.jsx`. Route catch-all `*` en fin de `<Routes>`. CTA contextuel : "Retour au tableau de bord" si authentifié, "Retour à la connexion" sinon. Charte 100 % via jetons `--ds-*`.
- **5. Deep-link login** : `<Protected>` passe `state={{ from: location }}` à `Navigate("/login")`. `Login.submit()` lit `location.state?.from?.pathname` et redirige vers l'URL demandée après connexion (au lieu de `/`).
- **7. Erreurs réseau login** : distinction status HTTP vs `!err.response` (panne réseau). Bandeau charté `login-net-error` avec message "Connexion impossible. Vérifie ton réseau et réessaie.", plus de page blanche/écran figé. 429 relayé en toast propre.
- **8. Viewport WCAG 1.4.4** : `<meta viewport>` corrigé — retire `maximum-scale=1, user-scalable=no`, ajoute `viewport-fit=cover`. Zoom pincé actif partout.
- **9. Accessibilité formulaires (Login + Register)** : `id` unique + `htmlFor` sur label, `autocomplete="username email"` / `"current-password"` / `"new-password"`, `aria-invalid` et `aria-describedby` liés aux messages d'erreur inline. Cibles ≥ 44 px (via `min-h-[44px]`/`min-h-[48px]`). Focus visible partout via `.ds-focus`.
- **10. `<html lang>` dynamique** : `I18nProvider` applique `document.documentElement.setAttribute("lang", lang)` à chaque changement, persisté dans `localStorage["crm_lang"]`, initialisé depuis `navigator.language` ou "fr".
- **11sexies. `window.confirm` → `ConfirmDialog`** : composant `<ConfirmProvider>` + hook `useConfirm()` dans `App.js`. Les 5 `window.confirm` de `Products`, `Confidentialite` (×2) et `Couts` (×2) remplacés par des dialogues chartés (Enter/Escape/ARIA modal, tone `danger` pour la suppression).
- **13 partiel** : `<meta description>` réelle + Open Graph title/description/type/site_name (favicon + OG image reportés).

### Reportés au Lot 3
- 11 (audit 375 px exhaustif) — nécessite revue écran par écran
- 11ter (nav desktop 6 sections repliables + palette Cmd/Ctrl+K) — refonte majeure
- 11quater · 11quinquies · 12 · 14 · 15 · 16 · 17

### Enrichissement — Dégradé propre pour clés absentes
- Google Places : sans `GOOGLE_PLACES_KEY` OU si Places API New désactivée → l'onglet affiche "Données Google indisponibles (http_403)", `place_id` reste stocké
- INPI RNE : sans identifiants → cron annuel scanne mais `0 mis à jour` sans erreur

## Credentials
- Manager : `manager.demo@bevidcrm.fr` / `Manager!2026Demo`
- Commercial : `commercial.demo@bevidcrm.fr` / `Commercial!2026Demo`
- Seed idempotent au démarrage.
