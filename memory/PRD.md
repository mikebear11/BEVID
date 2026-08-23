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

### Lot 5 — Durcissement de la couche publique (livré 20 février 2026)

**P1 — En-têtes de sécurité (dev server + API)**
- `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` (protection clickjacking).
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` : `camera=(self)`, `microphone=(self)`, `geolocation=(self)`,
  `fullscreen=(self)` autorisés ; tout le reste (payment, usb, midi, accelerometer,
  gyroscope, magnetometer, autoplay, ambient-light-sensor) refusé.
- **CSP en Report-Only** avec `report-uri /api/csp-report`. Bascule bloquante planifiée
  après période d'observation (~2 semaines de trafic).
- Endpoint `POST /api/csp-report` : accepte `application/csp-report`, rate limité
  60 rapports / 15 min / IP, silencieux si rate-limité (204), aucune persistance MongoDB.
- **CORS restreint** : `CORS_ORIGINS` env → une seule origine autorisée. Exception
  ouverte (`Access-Control-Allow-Origin: *`) uniquement sur `/api/billing/plans` et
  `/api/config/features` (contenus marketing publics).
- Middleware `SecurityHeadersMiddleware` FastAPI : applique les en-têtes sur toutes
  les réponses `/api` et retire `X-Powered-By` si le proxy amont l'a injecté.

**P2 — Dépendances externes purgées**
- Leaflet CSS : `@import unpkg.com/leaflet@1.9.4/dist/leaflet.css` → `import "leaflet/dist/leaflet.css"` bundlé.
- Marker icons TourMap : `unpkg.com/leaflet/.../marker-icon*.png` → imports webpack depuis `leaflet/dist/images/`.
- Google Fonts (Playfair Display, Outfit, Inter) : purgés. `Inter` retiré (reliquat inutilisé). `Playfair Display` + `Outfit` servis via `@fontsource/*` bundlés. **Zéro appel réseau vers fonts.googleapis.com ni fonts.gstatic.com**. Bénéfice bonus : disponibles hors-ligne.
- Script Emergent (`assets.emergent.sh/scripts/emergent-main.js`) : chargé conditionnellement à l'exécution uniquement si `hostname` contient `preview.emergentagent.com` ou `localhost`. Jamais dans un déploiement production.
- **Beacon Cloudflare** (`beacon.min.js`) : injecté par le proxy CF, échappe au contrôle code. Sera bloqué naturellement par CSP en mode bloquant (post-période d'observation).

**P3 — Référencement de la page de vente**
- `robots.txt` : remplace celui par défaut du CDN. Autorise `/`, `/pricing`, `/tarifs`, `/plans`, `/login`, `/register`. Interdit explicitement `/activate/`, `/sign/`, `/reset-password/` et toutes les routes authentifiées.
- `sitemap.xml` : liste les 6 pages publiques (`/`, `/pricing`, `/tarifs`, `/plans`, `/login`, `/register`).
- **Vrai statut HTTP 404** : middleware `bevid-spa-404` inséré via `devServer.app.use` APRÈS `withVisualEdits` (qui écrasait `setupMiddlewares`). Compare `req.originalUrl` (préservé avant historyApiFallback) à une liste de 55 patterns regex de routes valides extraite de `App.js`. Assets statiques et `/api/*` traités normalement.
- **Titres et canonical par page publique** : hook `usePageMeta` (sans dépendance react-helmet). Appliqué sur Login, Register, ForgotPassword, Pricing, NotFound. Titre unique + `<link rel="canonical">` par page.
- **Pré-rendu SSR** : non implémenté. CRA ne le supporte pas nativement, coût disproportionné pour la page vendeuse actuelle. Question rouverte si besoin de SEO plus poussé.

**Fichiers modifiés / créés**
- `/app/backend/server.py` : `POST /api/csp-report`, `SecurityHeadersMiddleware`, CORS strict + exception marketing.
- `/app/backend/.env` : `CORS_ORIGINS` restreint à `FRONTEND_URL`.
- `/app/frontend/craco.config.js` : en-têtes de sécurité dev server + middleware 404 SPA (avec 55 patterns de routes).
- `/app/frontend/public/index.html` : suppression fonts.googleapis.com + Emergent script conditionnel + `<link rel=canonical>` par défaut.
- `/app/frontend/src/index.css` : suppression `@import unpkg` et `@import fonts.googleapis`.
- `/app/frontend/src/App.js` : imports `@fontsource/*` + `leaflet/dist/leaflet.css` bundlés.
- `/app/frontend/src/components/TourMap.jsx` : imports webpack pour marker icons.
- `/app/frontend/src/lib/pageMeta.js` : hook `usePageMeta` (nouveau).
- `/app/frontend/src/pages/{Login,Register,ForgotPassword,Pricing,NotFound}.jsx` : application du hook.
- `/app/frontend/public/{robots.txt,sitemap.xml}` : nouveaux (le CDN externe peut cependant intercepter robots.txt en amont — vérifié sur preview).
- `/app/backend/tests/test_iter24_lot5_public_hardening.py` : 5 tests dédiés, tous verts.

### Lot 8 — Barre latérale gauche refondue (livré 21 février 2026)

**Reclassement (7 défauts corrigés)** :
- `/tournee` (Terrain) et `/tours` (Ventes) ne cohabitent plus. Un seul emplacement pour chacun : `/tournee` en zone épinglée quotidienne, `/tours` dans Logistique.
- Tableau de bord (`/`) sorti de section repliable → **entrée fixe hors pli**, sous le logo, jamais cachée.
- Paiements/Rapprochement/Coûts extraits de Pilotage → nouvelle section **« Argent »** (encaissement ≠ pilotage).
- Prospection sortie de Terrain → rejoint **« Acquisition »** (mêmes finalités).
- `scan` a désormais **sa propre permission `page:scan`** (nouvelle entrée dans `permissions.py`). Plus jamais dépendante de `page:stock` qui appartient à un autre domaine.
- `/profile` désormais dans la **zone d'identité en bas** (avatar cliquable + nom + org + pastille rôle), plus perdue dans l'admin.
- Sections vides masquées entièrement.

**Zone épinglée « Aujourd'hui »** — non repliable, toujours visible :
- Ma tournée (avec **compteur d'arrêts** — approximation portefeuille commercial pour le MVP, à affiner quand la notion de planning quotidien sera formalisée)
- Nouvelle visite (`/visit`)
- Scanner (`/scan`)

**Structure figée** — 6 sections repliables, ordre définitif du quotidien vers l'exceptionnel :
`Clients et ventes` → `Logistique` → `Argent` → `Pilotage` → `Acquisition` → `Administration`. Aucune réorganisation automatique.

**Ouverture initiale selon rôle** — commercial → `section_sales` ; manager/gérant/owner → `section_pilotage`. Ensuite : choix utilisateur mémorisé dans `bevid_nav_open_sections_v2`, jamais contredit.

**Accessibilité renforcée** — `<nav aria-label>`, `<button aria-expanded aria-controls>` sur les headers de section, `aria-current="page"` sur l'entrée active, `aria-hidden` sur les icônes décoratives, targets ≥ 40px.

**Compteur pertinent** — badge chiffré sur Ma tournée uniquement (« un chiffre utile, jamais une pastille rouge »).

**Zone d'identité repensée** — avatar rond, nom, org, pastille rôle, cloche notifications sur la même ligne cliquable qui mène au profil. Thème, langue et déconnexion en dessous.

**Barre mobile inchangée** — `MOBILE_NAV` reste littéral, 5 entrées fixes, jamais dérivé de la sidebar desktop.

**Renommages i18n cohérents** (fr/en) :
- `Ventes` → `Clients et ventes` / `Customers & sales`
- Nouvelles : `section_today`, `section_logistics`, `section_finance`
- `Connecteurs` → `Intégrations` / `Integrations`
- `Réglages` → `Paramètres` / `Settings`
- `Utilisateurs` → `Membres` / `Members`
- `Paiements` → `Paiements et relances` / `Payments & follow-ups`
- `Coûts de revient` → `Coûts et marges` / `Costs & margins`
- `Rapprochement` → `Rapprochement bancaire` / `Bank reconciliation`

**Suite reportée dans l'ordre demandé** :
1. Épinglage manuel (clic droit / appui long)
2. Compteurs impayés / fûts en retour / signatures en attente (max 3 simultanés)
3. Mode rail réduit (icônes seules)

**Seed démo enrichi — `POST /api/admin/demo/enrich-history`**
- Injecte 6 mois d'historique de commandes régulières pour montrer le Lot 6.2 en action sans attendre les vraies données.
- Rythmes tournants : 14, 21, 28, 35 jours selon le client — variété volontaire pour couvrir les différents cas de figure.
- Commande d'événement (qty × 5) glissée au milieu de chaque historique client → vérifie que le filtrage IQR fait bien son travail sur données réalistes.
- **Idempotence dure** : plafond de 10 clients enrichis au total. Un rejeu ne gonfle jamais ce nombre (nouvelle logique après premier bug d'idempotence identifié).
- Réservé aux managers/gérants/owners.
- Résultat sur données de démo : **8 clients enrichis, 132 commandes créées → 16 prédictions émises, aucune hallucination.** Exemples :
  - *« IPA Fût 30L — probablement à sec vers le 05/09. Commande tous les 21 jours en moyenne, dernière il y a 6 jours. »*
  - *« Blonde 30L — probablement à sec vers le 14/09. Commande tous les 28 jours en moyenne, dernière il y a 4 jours. »*
- Ratio prédictions / silence : 8/99 clients avec prédiction — silence total sur les 91 restants (majorité `too_few_orders`). L'outil se tait exactement là où il ne sait pas.

**Interface livreur — `/livreur`**
- Page dédiée, accessible aux utilisateurs authentifiés (rôle non discriminant pour le MVP — un dépôt peut avoir un livreur qui n'est ni commercial ni manager).
- **Contraste maximal** : fond noir absolu (`bg-black`), texte blanc, badge d'action vert émeraude fluo. Adapté à la lumière crue du camion.
- **Cibles ≥ 64px de haut** (bouton LIVRÉE `min-h-[64px]`, appel client dédié) — adapté aux gants.
- **Un seul geste par arrêt** : tap sur « LIVRÉE » → `POST /api/orders/{id}/mark-delivered` → l'item disparaît de la liste, compteur mis à jour. Aucun formulaire, aucune signature obligatoire (celle-ci reste disponible via le flux commercial standard si l'entreprise l'exige).
- Fallback téléphone : bouton d'appel direct si `phone` renseigné (col-span-1) — un livreur perdu doit pouvoir joindre le client sans quitter l'écran.
- Compteur restant en gros dans le header. Écran vide de fin de tournée : icône verte + « Aucune livraison ».
- Titre `Livraison du jour · BEVID` via `usePageMeta`. Aucun menu de navigation dans la page (règle « pas de nouvelle entrée de menu »).

**Endpoints backend supports**
- `GET /api/deliveries/today` : liste des commandes `status ∈ {signee, confirme, validee}` non livrées, avec `delivery_date = today OR null`, enrichi bulk depuis `db.clients` pour l'adresse/téléphone.
- `POST /api/orders/{id}/mark-delivered` : `status=livre`, `delivery_status=livree`, `delivered_at`, `delivered_by` (id + nom) — traçabilité complète en un tap. Idempotent (404 si commande inexistante).

**Fichiers**
- `/app/backend/server.py` : 3 endpoints nouveaux (seed démo, deliveries/today, mark-delivered).
- `/app/frontend/src/pages/Livreur.jsx` : composant nouveau.
- `/app/frontend/src/App.js` + `craco.config.js` : route `/livreur` enregistrée (+ dans KNOWN_ROUTES du middleware 404 SPA).

**Backend — `/app/backend/analytics/runout.py` (module pur, testable sans DB)**
- Regroupement par produit → intervalles entre commandes → moyenne pondérée.
- Écart des commandes d'événement (quantité > 2,5× médiane) : un bar qui a pris 10 fûts pour le 14 juillet n'a pas changé de rythme, l'intervalle contaminant est retiré du calcul.
- Filtrage IQR sur les intervalles restants pour retirer les valeurs très atypiques.
- **Se tait** si <3 commandes du même produit (`too_few_orders`), si tous les intervalles écartés (`all_outliers`), ou si CV > 0,6 (`too_irregular`).
- Retourne toujours `explanation` en clair : « Blonde 20 L — probablement à sec vendredi. Commande tous les 21 jours en moyenne, dernière il y a 23 jours. »
- Résolution en langage naturel : `aujourd'hui`, `demain`, `vendredi`, `vendredi prochain`, `vers le 12/03`.

**Endpoint — `GET /api/clients/{cid}/predicted-runouts`**
- Tenant-scoped, 404 si client inconnu.
- Retourne `{predictions: [...], excluded: {too_few_orders, too_irregular, all_outliers}}` triées par `days_until_out` ascendant.

**Frontend — intégration discrète**
- `RunoutList.jsx` : composant réutilisable, affiche une ligne par prédiction avec icône `Clock` neutre. **Aucune alerte, aucun badge rouge, aucune notification.**
- **Fiche établissement (`Etablissement360.jsx`)** : bloc « Prochaines ruptures probables », affiché après les Top 3 références. Vide et silencieux si l'historique est insuffisant.
- **Tournée (`Tournee.jsx`)** : chaque carte établissement affiche la 1ʳᵉ prédiction en ligne discrète sous l'adresse. Bouton « Trier : bientôt en rupture » optionnel — remonte les clients concernés sans jamais réorganiser d'autorité. Le commercial garde la main.
- Chargement par lots de 5 en arrière-plan, chaque erreur silencieuse pour ne pas bloquer l'affichage.

**Corrections après revue PO** :
- **Seuil ≥3 intervalles APRÈS filtrage** (nouvelle constante `MIN_INTERVALS_AFTER_FILTER=3`). Nouvelle clé `excluded.too_few_after_outliers`. Une moyenne sur 1 mesure n'est plus jamais présentée comme un rythme. Test verrouillant : 4 commandes dont 1 événement au milieu → 0 prédiction.
- **Phrase naturelle sur cas limites** : « commandé aujourd'hui » / « commandé hier » / « il y a N jours ». Plus jamais de « dernière il y a 0 jours ».
- **Ne pas prédire sur commande trop récente** (`MIN_DAYS_SINCE_LAST_ORDER=2` jours, nouvelle clé `excluded.too_recent`). La rupture réapparaîtra d'elle-même en approchant de l'échéance ; en attendant, l'information n'encombre pas la tournée.

**7/7 tests pytest verts** — rythme régulier, <3 commandes, <3 intervalles après filtrage, événement isolé sur historique suffisant, CV élevé, commande trop récente, phrase naturelle.

### Résidu robots.txt — limite plateforme confirmée
- Vérification finale : `curl localhost:3000/robots.txt` = notre fichier (correct), `curl preview publique` = fichier Cloudflare par défaut. **Le proxy CDN Emergent en preview intercepte et sert son propre robots.txt. Non contournable côté code.** Sera correctement servi sur un déploiement production hors preview.
- **Protection réelle qui ne peut être écrasée** : `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">` désormais posé côté application sur les 4 pages à jetons (`/activate/:token`, `/sign/:token`, `/reset-password/:token`, `/change-password`) via extension du hook `usePageMeta({noindex: true})`.

### Résidu Cloudflare beacon — correction reçue
- La balise `<script>` n'est pas dans notre `index.html` (diff local vs preview le prouve). Injectée par le proxy Cloudflare en périphérie. Non retirable côté code. Le sujet se règle dans le tableau de bord Cloudflare, hors périmètre. Filtrage silencieux des rapports CSP correspondants côté serveur (fait au Lot 6.1).

### Améliorations Lot 6.1 (rupture réseau terrain)
- `VoiceOrderReview.jsx` : compteur de secondes affiché pendant l'interprétation. Après 10s, bouton « Trop long — passer au texte » apparaît. Timeout dur à 25s (AbortController) → fallback silencieux automatique. L'utilisateur n'est jamais bloqué à attendre.

**Backend — `POST /api/voice/interpret-order`**
- Nouveau endpoint dédié à l'interprétation dictée → commande structurée, séparé de `/api/ai/parse-voice` (qui reste pour client / activité / résumé).
- Contexte injecté au modèle (**clé de la fiabilité, pas la puissance du LLM**) :
  - **Catalogue produits** de l'organisation (nom, catégorie, format, prix, volume, ABV) borné à 200 entrées.
  - **Historique client** : 5 dernières commandes de ce client précis, avec produits/quantités/dates — permet à « la blonde » de résoudre en produit habituel.
  - **Date d'aujourd'hui** (UTC ISO) pour résoudre les dates relatives (« jeudi », « la semaine prochaine »).
- Modèle : `claude-sonnet-5` via `emergentintegrations` (clé `EMERGENT_LLM_KEY`).
- Sortie strictement validée côté serveur :
  - `product_id` inconnu → ligne rejetée silencieusement (le modèle ne peut pas inventer).
  - Max 2 alternatives par ligne (jamais plus — écran mobile, pas de scroll).
  - Cap dur à 20 lignes par dictée.
  - Champs obligatoires : `product_id`, `product_name`, `quantity`, `unit`, `unit_price`, `source_phrase`, `confidence`, `alternatives`.
- **Fallback silencieux** avec 5 raisons distinctes (`llm_key_missing`, `empty_transcript`, `catalog_empty`, `llm_error`, `no_lines_interpreted`) → l'UI retombe sur le compte rendu texte actuel, jamais d'écran d'erreur.
- Client inconnu → 404 explicite (bug d'appelant, pas un fallback).

**Frontend — `VoiceOrderReview.jsx`**
- Composant modal invocable depuis n'importe quel écran passant `transcript + clientId`. Aucun nouveau menu, aucun nouvel écran de premier niveau.
- Chaque ligne affiche : produit, quantité (éditable), format (résolu), prix (éditable), **fragment source** en italique, badge « À confirmer » si `confidence === "low"`.
- Alternatives affichées comme puces cliquables (max 2). Un tap → échange le produit courant avec l'alternative sans perdre la quantité.
- Date de livraison éditable, affichée en clair pour confirmation.
- Total HT calculé en direct.
- Bouton « Revenir au texte » (fallback explicite utilisateur) et « Valider la commande » (aucune création automatique).
- `postOffline("/orders", ...)` : hors-ligne, l'ordre part dans la file de sync existante.
- Chronomètre côté client : dictée → validation, retourné dans le toast de succès (« Commande créée en Ns »).

**Point d'entrée — `VisitReport.jsx`**
- Bouton discret « Interpréter en commande » (icône `ShoppingCart`) apparaît à côté du « Remplir formulaire avec l'IA » existant, uniquement si un client est sélectionné et transcript ≥ 9 caractères.
- Aucun nouveau bouton dans la nav, aucune nouvelle page. Même geste (dictée), meilleur résultat.
- Fallback géré via `onFallback(txt, reason)` : le texte est réinjecté dans le champ `summary`, l'utilisateur poursuit son compte rendu sans friction.

**Validation LLM sur cas réaliste**
- Input : *« trois fûts de blonde et deux cartons d'IPA, livraison jeudi »*
- Catalogue : Blonde de Ratisbonne fût 20L, Blonde Bio fût 30L, IPA Houblonée carton 24×33cl
- Sortie :
  - Ligne 1 : 3 × Blonde Bio 30L (source_phrase="trois fûts de blonde", **confidence=low**, alternative proposée = Blonde de Ratisbonne 20L) — désambiguïsation correcte.
  - Ligne 2 : 2 × IPA Houblonée (source_phrase="deux cartons d'IPA", **confidence=high**, un seul IPA au catalogue).
  - delivery_date : `2026-08-27` (jeudi suivant, calculé depuis today=20/08).
- Aucune ligne inventée, aucune hallucination.

**Résidu CSP CF fermé**
- Filtrage des rapports CSP dans `routes/telemetry.py` : les blocked-uri contenant `cloudflareinsights` ou `cdn-cgi/challenge-platform` sont ignorés (204 silencieux, pas de log). Élimine le bruit du beacon injecté par le proxy Cloudflare en preview.
- Ajout `https://ap.emergent.sh` au CSP `script-src` + `connect-src` : PostHog légitime (après opt-in) n'est plus bloqué à tort.

**Fichiers**
- `/app/backend/server.py` : nouveau modèle `VoiceOrderRequest` + endpoint `/api/voice/interpret-order`.
- `/app/backend/routes/telemetry.py` : filtre bruit CSP.
- `/app/frontend/craco.config.js` : CSP ajusté (`ap.emergent.sh` autorisé).
- `/app/frontend/src/components/VoiceOrderReview.jsx` : composant nouveau.
- `/app/frontend/src/pages/VisitReport.jsx` : bouton « Interpréter en commande ».
- Créé `/app/backend/routes/telemetry.py` : `POST /api/errors` et `POST /api/csp-report` extraits via fabrique `build_router(db, client_ip_fn, rate_limit_check, rate_limit_record)`. Injection de dépendances → zéro import circulaire avec server.py.
- Créé `/app/backend/core/` et `/app/backend/routes/` (packages `__init__.py`) — squelette prêt pour phases suivantes.
- **Incident de production** (résolu) : montage du sous-routeur placé **après** `app.include_router(api_router)` → FastAPI avait déjà figé l'agrégation, les 2 endpoints retournaient 404 côté application servie. Corrigé en inversant l'ordre : `api_router.include_router(_build_telemetry_router(...))` **avant** `app.include_router(api_router)`. Règle mémorisée : ne jamais retirer un endpoint de son emplacement d'origine sans vérifier que le nouveau répond en HTTP réel externe.
- **Découpage server.py stoppé après cette phase** sur décision utilisateur. Le fichier reste à 6393 lignes. Reprise reportée quand le reste sera stabilisé.

### Lot 5 P1 — Bascule CSP bloquante + resserrement
- CSP passée de Report-Only à double émission (`Content-Security-Policy` + `Content-Security-Policy-Report-Only` identiques) — le blocage est effectif, les violations continuent d'être remontées pendant la période d'observation.
- **CSP resserrée** : suppression de `https://static.cloudflareinsights.com` du `script-src`. Vérifié via Playwright : le beacon Cloudflare est **bloqué par CSP** (2 requêtes échouées, 4 rapports remontés à `/api/csp-report`). Résultat : cohérence avec PostHog opt-in strict — plus aucun traceur ne s'exécute sans consentement.
- `assets.emergent.sh` conservé dans `script-src` uniquement pour visual-edits en preview (chargé conditionnellement via hostname check). Sera bloqué automatiquement sur un déploiement production.
- `X-Powered-By` retiré côté webpack-dev-server via `devServer.headers` (émis vide). Le proxy CDN amont peut le réinjecter en preview, hors périmètre code.

### Lot 5 P5 — Twilio SMS branché (avec mode simulation)
- Fonction `send_sms()` refactorée avec fallback simulation transparent :
  - Si `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_SMS_FROM` présents → envoi réel via Twilio SDK.
  - Sinon → log `bevid.sms.simulate` (numéro masqué `+336 1****78`, corps tronqué à 200 chars) + retour `{ok: true, simulated: true}`.
- `POST /api/org/invitations` avec `channel="sms"` déclenche automatiquement l'envoi (réel ou simulé). Le doc invitation est persisté avant tentative d'envoi (l'échec ne rollback pas la création — le lien reste consultable par QR/copie).
- Champs `delivery_status` (`sent`/`simulated`/`failed`) + `delivery_reason` remontés dans la réponse et dans le doc Mongo pour traçabilité.
- Aucune persistance MongoDB des simulations SMS (log serveur uniquement — traçabilité minimale).
- **Activation live** : dès que les 3 variables Twilio sont renseignées dans `/app/backend/.env`, l'envoi devient réel sans aucune modification de code.

**Ce qui reste dépendant du proxy amont (non maîtrisable côté code)**
- `robots.txt` sur `preview.emergentagent.com` intercepté par Cloudflare — le nôtre est correctement servi par webpack (`localhost:3000/robots.txt` OK) et sera correctement exposé sur un déploiement final.
- `access-control-allow-origin: *` observé sur `/` : injecté par le proxy Cloudflare, hors périmètre. Nos réponses `/api` non-marketing n'émettent plus `*`.
- `X-Powered-By: Express` peut réapparaître sur `/` en preview si le proxy CDN le réinjecte APRÈS webpack-dev-server (hors périmètre code — nos réponses `/api` et `/` webpack émettent bien un en-tête vide).

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

### Lot 4 · Cohérence tarifs ↔ RBAC (livré 19 août 2026, itération 22)

**Contexte** : la page /pricing utilisait `"*"` pour Entreprise (0 fonctionnalités affichées) et le forfait Pro promettait la DRM douane sans l'inclure dans ses entitlements. En creusant, deuxième bug plus grave : `has_feature()` n'a jamais vérifié le plan de facturation — seul le rôle comptait. Résultat : un compte Terrain à 15 € avait le même accès qu'un compte Entreprise à 49 €.

**Backend — 3 corrections coordonnées**
1. `billing_config.py` : suppression du joker `{"*"}`. Entreprise expose désormais **21 features** explicites. Terrain retiré de `page:prospection` (argument Entreprise). Constantes `_TERRAIN ⊂ _PRO ⊂ _ENTREPRISE` avec chaînage garanti.
2. `_plan_public` (server.py) : anomalie journalisée si un forfait affiché a < 3 features (`billing.plan.features_too_short`).
3. `permissions.py` — `has_feature` prend en compte **3 verrous** :
   - Plan de facturation (`user["org_plan_features"]`) — nouveau, deny hors plan
   - Override manuel utilisateur
   - Rôle par défaut
   `get_current_user` charge désormais `PLANS[org.plan]["features"]` et le pose sur le user.
4. Ajout de 3 features manquantes dans `FEATURES_INDEX` : `page:drm`, `ai:coach`, `ai:voice` (sinon deny-by-default silencieux).

**Frontend**
- `BillingBanner` : lien « Voir les tarifs » ajouté dans les bandeaux `read_only` et `suspended` (`data-testid="banner-{status}-pricing"`).
- `Layout.jsx` : lien `/drm` passe de `feature: "page:stock"` à `feature: "page:drm"` (chacun sa clé).
- Pricing.jsx : 22 clés `feature.*` en FR/EN pour les 21 features + `feature.page:integrations` ajoutée.

**Test de régression** — `/app/backend/tests/test_iter22_pricing_coherence.py` (8 assertions)
1. Aucun `"*"` dans une réponse publique
2. Chaque forfait ≥ 3 features
3. Hiérarchie stricte Terrain ⊂ Pro ⊂ Entreprise
4. **Chaque promesse marketing** (mot dans `description`) → clé correspondante dans `features` (le bug historique aurait été bloqué au moindre commit)
5. Chaque feature d'un forfait est soit citée dans la description, soit héritée, soit dans une allowlist transverse (users, integrations, ai:voice, sources)
6. Terrain ne peut leaker aucune feature avancée (`page:stock`, `page:drm`, `page:reports`, `page:paiements`, `page:rapprochement`, `page:prospection`, `page:radar`, `page:veille`, `page:bouclier`, `product:view_cost`, `ai:coach`)
7. `page:drm` explicitement dans Pro et Entreprise (régression du bug)
8. Chaque feature de plan a un libellé i18n FR — sinon la page /pricing masquerait la ligne

**Preuves runtime (21 tests curl verts)**
- `/api/me/permissions` (compte Terrain) : `page:drm=false, page:stock=false, page:radar=false, product:view_cost=false, ai:coach=false, page:dashboard=true` ✅
- `/api/me/permissions` (compte Pro) : `page:drm=true, page:stock=true, page:radar=false, product:view_cost=false, ai:coach=false` ✅
- `/api/me/permissions` (compte Entreprise) : tout à `true` ✅
- Suite complète pytest : `test_iter20_cross_tenant_404.py` + `test_iter21_paywall.py` + `test_iter22_pricing_coherence.py` = **10/10** ✅

**Page /pricing carte par carte (Option A cumulative — screenshot validé)**
- Affichage **différentiel** : chaque carte n'affiche que ce qu'elle **ajoute** au forfait précédent
- **Terrain (15 €/mois)** : 2 transverses + 6 features de base (Clients, Tableau de bord, Prise de commande, Catalogue, Tournées, Comptes rendus)
- **Pro (29 €/mois)** : 2 transverses + « **Tout le forfait Terrain, plus :** » + 5 nouveautés (DRM douane, Paiements, Rapports, Rapprochement, Stock)
- **Entreprise (49 €/mois)** : 2 transverses + « **Tout le forfait Pro, plus :** » + 10 nouveautés (Assistant vocal IA, Bouclier, Coach IA, Coûts et marges, Users, Intégrations, Prospection, Radar, Sources, Veille)
- **Annuel par défaut** (livré 20 août 2026) : le sélecteur ouvre sur `annual`, prix affichés en équivalent mensuel avec 2 mois offerts — Terrain 12,50 €, Pro 24,17 €, Entreprise 40,83 € (formule `cents × 10 / 12 / 100`). Bug corrigé au passage : l'ancien calcul `cents × 10 / 100` affichait le montant annuel entier (150 €, 290 €, 490 €) alors que le suffix disait « / mois ».
- **Aucune troncature silencieuse** : si un jour on ajoute plus d'items que ce que la carte peut afficher, la ligne `pricing-more-{id}` précisera « + N autres fonctionnalités »
- Test régression `/app/backend/tests/test_iter23_pricing_hierarchy.py` : hiérarchie affichée Terrain ≤ Pro ≤ Entreprise, marqueur d'héritage présent uniquement sur Pro/Entreprise, jamais de clé technique brute affichée

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
- PUT/DELETE cross-tenant sur endpoints autres que `/clients/{id}` : ✅ **livré** (Lot 4 P5 · 19/08/2026) — 14 endpoints patchés avec `matched_count == 0 → 404` (`/products`, `/orders`, `/tours`, `/events`, `/clients/{cid}/status`, `/deals`, `/connectors`, `/goals/smart`, `/establishments`, `/derogations`, `/segments`, `/admin/users` PUT + `/admin/users/{uid}/reset-password`, `/rgpd/clients`, `/establishments/{eid}/enriched-field/{field}`). 24 tests curl verts (11 cross-tenant + 4 same-tenant + 9 IDs inexistants). Test de régression : `/app/backend/tests/test_iter20_cross_tenant_404.py`.

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

## Lot 8 — Reclassement logique de la sidebar (21/02/2026)
Ordre revu par fréquence d'usage réel + logique de groupe métier :
- **section_sales** : Clients → Commandes → Produits → Pipeline → Deals
  (quotidien : ouvrir client, prendre commande, chercher produit ; pilotage commercial après)
- **section_growth** : Prospection → Radar → Bouclier → Veille → Sources
  (Radar + Bouclier regroupés défensif ; Veille + Sources en support)
- Autres sections (Logistique, Argent, Pilotage, Admin) déjà correctement ordonnées.
- Ordre des sections inchangé (Ventes → Logistique → Argent → Pilotage → Acquisition → Admin) : flux naturel commercial ; le manager voit Pilotage ouvert par défaut via `defaultOpenByRole`.



## Lot 8 — Personnalisation utilisateur de la sidebar (21/02/2026, option b)
### Backend
- `GET /api/me/sidebar-prefs` — retourne toujours `{pinned_user: [], section_order: {}}` (jamais 404).
- `PUT /api/me/sidebar-prefs` — merge partiel :
  - `pinned_user`: liste de max 3 clés d'entrées, déduplication, cap serveur, regex `[a-zA-Z0-9_-]+`.
  - `section_order`: `{section_key: [entry_keys]}` — la clé de section doit préfixer `section_`.
  - Stocké dans `users.sidebar_prefs` (multi-tenant safe : scoped par `user.id`).
- Tests : `/app/backend/tests/test_iter26_sidebar_prefs.py` — 9/9 verts.

### Frontend (`Layout.jsx`)
- **Épinglage manuel** : clic droit sur toute entrée → ContextMenu shadcn avec "Épingler à Aujourd'hui" (disabled si 3 épingles atteintes) ou "Détacher d'Aujourd'hui".
- **Drag & drop natif HTML5** dans les sections repliables : icône `GripVertical` visible au hover, feedback visuel `ring-2 ring-[#B076B4]` sur la cible de drop.
- **Réinitialisation par section** : entrée "Réinitialiser cette section" dans le menu contextuel, visible uniquement si un ordre custom existe pour cette section.
- **Persistance** : cache localStorage (`bevid_sidebar_prefs_v1`) + sync backend débouncé 400ms → fonctionne offline-first.
- **Résilience** : nouvelles entrées ajoutées ultérieurement au catalogue apparaissent automatiquement en queue de section (jamais perdues). Clés inconnues côté frontend sont ignorées silencieusement.
- **RBAC prioritaire** : la personnalisation est appliquée AVANT le filtre RBAC — un commercial ne verra jamais une entrée qu'il a épinglée mais qui a perdu sa permission.
- **Astuce discrète** : "Clic droit pour épingler · Glisser pour réordonner" affichée sous les sections tant que l'utilisateur n'a rien personnalisé.

## Iter26 — Walkthrough commercial + fixes (21/02/2026)
Suite au walkthrough utilisateur en tant que commercial (testing_agent iteration_20.json) :
- **Layout.jsx L65-66** : `pipeline` et `deals` passent en `feature: "manager_only"` → invisibles pour les commerciaux (avant : visibles par erreur via `feature: "page:clients"`).
- **Layout.jsx L54** : `scan` passe en `feature: null` → outil terrain universel toujours visible dans la zone Aujourd'hui, indépendant du plan et des perms (avant : caché aux commerciaux car `page:scan` absent des defaults `permissions.py`).
- **Layout.jsx badge stops_today** : compte désormais les client_ids des tournées du jour non terminées via `/api/tours` (avant : `.length` du portefeuille — trompeur).
- **i18n `new_visit`** : label "Nouvelle visite" → "Visite" (plus concis, cohérent avec la spec).
- **db.clients purge** : suppression de 86 clients de test polluants (TESTP_*, PROPTEST-*, BK_*, MANUAL_*, PROP_TEST, TEST_client_*, Bar Le Central, Bar Test Import, Client T1, FrontImport) et réassignation des 6 clients restants au commercial démo → la page /clients affiche uniquement les vrais clients.
- **Seed démo** : 5 établissements (ADT 64, BEKAST, Brasserie Test 3, SAS CASSOULET, Tour Eiffel Test) réassignés au commercial via db.establishments + tournée du jour créée avec 4 arrêts.

**Backend tests iter26** : 9/9 verts (sidebar prefs).
**Frontend walkthrough** : preview cloud en veille lors du re-test, code compile OK, fixes vérifiables au prochain reload utilisateur.

**Note dual collection legacy** : `db.clients` (6 items) et `db.establishments` (5 items) coexistent — décision produit pendante pour merger. La page /clients lit `db.clients`, la fiche 360° lit `db.establishments`.


## Iter27 — Compteurs métier + Grisage forfait + Rail réduit (21/02/2026)

### Backend
- **`GET /api/sidebar/counters`** — retourne `{payments_overdue, containers_out, orders_pending_signature}` (int, >= 0). Filtré par `agent_id`/`owner_id` pour les commerciaux. Scoped multi-tenant via `db`.
  - `payments_overdue` : orders non payées créées il y a > 30j.
  - `containers_out` : containers avec `status ∈ {chez_client, sorti}`.
  - `orders_pending_signature` : orders `status=confirme` sans signature.
- **`/auth/me`** expose désormais `plan_id` (`terrain`/`pro`/`entreprise`) — nécessaire pour piloter le grisage forfait côté frontend.
- Tests `test_iter27_sidebar_counters.py` — 5/5 verts (shape, manager >= commercial, auth requise, plan_id présent, features cohérentes).

### Frontend (`Layout.jsx`)
- **Compteurs métier** : badge ambré discret (99+ max) sur Paiements (impayés dépassés), Contenants (à retourner), Commandes (à signer). Refresh sur chaque changement de route. En mode collapsed, un point ambré indique l'existence d'un compteur.
- **Grisage forfait** : mapping `FEATURE_MIN_PLAN` dupliqué du `billing_config.py` backend. Pour chaque entrée :
  - Si sa feature est absente de `org_plan_features` du user :
    - Manager/gérant/owner → affichée en gris avec pastille "Pro" ou "Entreprise", clic redirige vers `/billing`.
    - Commercial → cachée (deny-by-default strict).
  - Sinon → suit le RBAC standard (has(feature) pour commercial).
- **Mode rail réduit** :
  - Bouton toggle (`sidebar-collapse-toggle`) dans le header avec icônes `PanelLeftClose` / `PanelLeftOpen`.
  - Largeur `w-64` ↔ `w-16` (transition CSS).
  - Labels masqués, tooltips Radix (side="right", délai 300ms) sur chaque entrée + toggle + palette + profil + logout.
  - Sections toujours "ouvertes" en collapsed (divider fin entre sections).
  - Préférence sauvegardée en `localStorage.bevid_sidebar_collapsed_v1`.
- **Cohabitation des 3 features** : les compteurs et pastilles Pro sont mutuellement exclusifs (locked prioritaire). Le drag & drop est désactivé en collapsed ou sur entrée locked.


## Lot 7 étapes 2, 3, 4 — Mémoire client + Brief + Engagements (21/02/2026)

### Backend
- Collections `engagements` et `client_memory` ajoutées à `SCOPED_COLLECTIONS`.
- **Modèle Engagement** : id, establishment_id, label, owner ∈ {agent, client}, due_date, status ∈ {ouvert, tenu, oublie, annule}, source_visit_id.
- **Endpoints Engagements** :
  - `GET /api/establishments/{eid}/engagements` — liste triée due_date asc.
  - `GET /api/engagements/due?days=N` — ouverts dont la date approche (≤ today+N). Filtré par `owner_id` pour les commerciaux.
  - `PATCH /api/engagements/{id}` — status/due_date/label.
  - `POST /api/visits/{vid}/extract-engagements` (GPT-5.6 Sol) → propose.
  - `POST /api/visits/{vid}/confirm-engagements` → persiste + trigger recompute mémoire.
- **Mémoire client** (`_recompute_client_memory`) : agrégation pure (5 sections max) — Contexte, Ce qu'il achète et à quel rythme, Objections ouvertes, Engagements en cours, Points de vigilance. Chaque item porte une `source` structurée `{type, id, label, date}`. Aucun appel LLM.
  - `GET /api/establishments/{eid}/memory` — retourne cache, recalcule si absent OU > 24h.
  - `POST /api/establishments/{eid}/memory/recompute` — force recompute.
  - **Trigger événementiel** : POST /visits recompute automatiquement. POST /visits/{vid}/confirm-engagements aussi.
- **Brief avant visite** (`_compute_brief`, 5 lignes max, agrégation pure) :
  - `GET /api/establishments/{eid}/brief` — jusqu'à 5 lignes {text, source}.
  - `GET /api/tours/{tid}/briefs` — pré-calcul batch pour la tournée du jour (embarquable snapshot).
  - Fallback "Rien de particulier depuis la dernière visite" si aucune ligne à afficher.
- **RGPD étendu** : `/rgpd/clients/{cid}/export` ajoute `engagements` + `client_memory`. `/rgpd/clients/{cid}` (DELETE) purge les deux.

### Frontend
- **`ClientMemory.jsx`** (nouveau) : bloc « Ce qu'il faut savoir » avec sources cliquables, timestamp de mise à jour, bouton recompute discret.
- **`BriefButton.jsx`** (nouveau) : bouton compact + modal 5 lignes.
- **`EngagementExtractPanel.jsx`** (nouveau) : modal type Objections avec owner + due_date éditables.
- **`Etablissement360.jsx`** : nouveau bloc `etab-memory` en haut + bouton « Préparer » dans le bandeau vital.
- **`VisitReport.jsx`** : chaîne Objections → Engagements après soumission ; navigation reportée à la fermeture du 2e panel.

### Tests
- **`test_iter29_memory_brief_engagements.py`** : 9/9 verts (memory shape, recompute timestamp, brief ≤ 5, confirm engagement, due list, patch enum, extract 404, extract vide, auth).

### Règles respectées
- Aucune écriture automatique (extraction propose, l'utilisateur valide).
- Sources affichées sur chaque ligne (« pas de source, pas de ligne »).
- Aucun appel LLM sur affichage (mémoire, brief : agrégation pure MongoDB).
- Recalcul événementiel, jamais à l'affichage.
- Cloisonnement multi-tenant natif via TenantDB.
- RGPD : export + purge couvrent les nouvelles collections.

### Prochaines étapes du Lot 7
5. Commentaires libres + épinglage (fil sur la fiche établissement, lu par la mémoire).
6. Réponses qui marchent — pour chaque objection, taux de réussite des `response_used` observés dans l'entreprise.

### À noter (dette technique connue)
- Le brief n'est pas encore embarqué dans le snapshot hors-ligne — endpoint `/tours/{tid}/briefs` créé mais pas encore consommé par `bootstrap`.
- Extraction engagements : owner_id du commercial pour les engagements attribués au « client » — à revoir en étape 4.2 pour distinguer clairement.


## Lot 7 étapes 5, 6 + snapshot offline (21/02/2026)

### Backend
- **Collection `establishment_comments`** scoped multi-tenant.
- **Endpoints commentaires** :
  - `GET /api/establishments/{eid}/comments` — épinglés d'abord, puis chrono desc.
  - `POST /api/establishments/{eid}/comments` — création (auteur = user courant).
  - `PATCH /api/comments/{cid}` — texte : auteur uniquement (403 sinon) ; épinglage : tout user.
  - `DELETE /api/comments/{cid}` — auteur ou manager.
- **Mémoire client** : nouvelle section `pinned_comments` insérée juste après `context`. Recompute automatique sur POST/PATCH/DELETE commentaire.
- **`GET /api/objections/effective-responses?category=X`** — agrège les `response_used` déjà utilisées dans l'entreprise avec taux de réussite (outcome=levee / uses). Cap 10 items, triés par successes desc puis uses desc.
- **`/sync/bootstrap`** enrichi : ajoute `tour_briefs` — briefs pré-calculés pour la tournée du jour de l'utilisateur (manager voit toutes les tournées du jour, commercial les siennes).
- **RGPD étendu** aux commentaires (export + purge).

### Frontend
- **`CommentsThread.jsx`** (nouveau) : fil complet avec draft, épinglage (tout user), édition/suppression (auteur seul), pinned en tête avec bord ambré.
- **`Etablissement360.jsx`** : nouveau bloc `etab-comments` sous `etab-objections`.
- **`ObjectionsList.jsx`** : lors de l'ouverture de « Traiter » sur une objection, charge `/objections/effective-responses?category=...` et affiche les 3 meilleures réponses de l'entreprise avec taux de succès. Clic sur une suggestion → pré-remplit le champ.
- **`BriefButton.jsx`** : bascule automatique sur le brief en cache IndexedDB (`db.tour_briefs`) si l'API échoue → indicateur `CloudOff` ambré dans le header du modal.
- **`db.js` v3** : nouveau store `tour_briefs` clé `establishment_id`. `saveSnapshot` bulk put les briefs. Helper `getOfflineBrief(eid)` exposé.

### Règles spec appliquées
- Auteur seul modifie le texte de son commentaire (test coverage).
- Commentaire épinglé remonte dans la mémoire client (test coverage).
- Réponses cross-tenant strictement impossibles (via scoped_db).
- Brief disponible hors-ligne dans la cave (snapshot embarqué).

## Lot 9 étapes 2-3 — UI : 4 questions + liste contacts + changement de gérant (23/02/2026)

### Composants livrés
- **`FourQuestions.jsx`** — bloc haut de fiche avec les 4 questions (spec §2).
  Chaque slot affiche : initiales colorées déterministes (hash prénom/nom),
  contact + rôle + canal préféré, actions rapides tel/mail. Trous en creux
  « À renseigner · <hint> » cliquables pour ouvrir l'ajout.
- **`ContactsPanelV2.jsx`** — liste contacts groupée par catégorie
  (Direction / Opérationnel / Administratif / Autre), création en 3 champs
  (prénom facultatif, nom + rôle + établissement déjà connu), historique
  replié par défaut avec dates de début/fin, actions rapides principal/clôturer.
- **`ChangeManagerModal`** (dans ContactsPanelV2) — parcours guidé 2 étapes :
  saisie nouveau gérant → question « équipe entière renouvelée ? » avec
  rappel visuel du bouclier orange qui va s'appliquer.

### Ergonomie clef (spec §9)
- **3 champs pour créer un contact** — le reste au fil des visites.
- **Actions primaires 1-tap** : tel: sur portable, mailto: sur email.
- **Trous visibles** dans les 4 questions (« À renseigner » cliquable).
- **Bannière requalification** affichée en tête de fiche quand
  `to_requalify=True`, avec explicitation des 3 points à revalider.
- **Historique replié** — un rôle clos reste consultable mais n'encombre pas.

### Validation runtime (ADT 64)
- 4 questions : `Paul Acheteur` (Qui commande) + `Marie Compta` (Qui paie)
  auto-affichés depuis les rôles migrés ; 2 slots vides « À renseigner ».
- Bannière requalification affichée suite au test de changement de gérant.
- 5 rôles actifs listés (chef barman, chef cuisine, acheteur ×2, comptable
  interne) groupés par catégorie.

## Lot 9 étape 1 — Contacts (personnes) + Rôles datés + migration (23/02/2026)

### Modèle
Trois niveaux distincts pour refléter la réalité CHR :
- `contacts_v2` — la personne physique unique. **Un comptable externe qui
  suit 12 établissements = 1 seule entité**, jamais dupliquée.
- `roles` — le lien daté entre un contact et un établissement / une société.
  `date_debut` obligatoire (défaut = aujourd'hui), `date_fin` renseignée à la
  clôture. **Aucune suppression jamais.**
- `establishments` — existant, avec bientôt `societe_id` pour les groupes.

### Catalogue fermé de 20 rôles (spec §3)
- **Direction** (5) : gérant, co-gérant, directeur d'exploitation,
  propriétaire du fonds, associé — hints `peut_engager` par défaut.
- **Opérationnel** (7) : acheteur, responsable de salle, chef barman,
  sommelier, responsable de cave, chef de cuisine, économe.
- **Administratif** (4) : comptable interne, cabinet externe, responsable
  administratif, contact facturation — hint `pays=True` pour la relance.
- **Autre** (4) : contact livraison, contact technique pression,
  repreneur pressenti, autre.

### Migration idempotente au startup
`_migrate_contacts_v2_on_startup` :
- Lit `establishments.contacts` (embarqué), pour chaque contact :
  - Match par email > mobile (dédoublonnage cross-établissement).
  - Sinon crée un contact v2 avec split naïf « Prénom Nom ».
- Crée un rôle daté avec mapping legacy → v9 (`proprietaire` → `proprietaire_fonds`,
  `chef_cave` → `responsable_cave`, etc.).
- Marque le contact embarqué `_migrated_to_v2=True` + `_v2_contact_id=<id>`.
- **Ne supprime rien** : les données embarquées restent pour rétro-compat UI.
- **Résultat runtime** : 4 établissements, **8 contacts créés, 8 rôles créés**,
  0 erreur.

### Endpoints livrés
- `GET /api/roles/catalog` — catalogue rôles + canaux + créneaux.
- `POST /api/contacts-v2` — création **en 3 champs max** (nom seul obligatoire),
  raccourci pour créer aussi le rôle si `role + establishment_id` fournis.
- `GET /api/contacts-v2` — recherche par nom/prénom/email (comptable multi-clients).
- `GET /api/contacts-v2/{cid}` — détail + historique complet des rôles.
- `PATCH /api/contacts-v2/{cid}` — update (canaux/créneaux validés).
- `GET /api/establishments/{eid}/roles?include_closed=` — rôles + snapshot
  contact enrichi + hint `role_meta`.
- `POST /api/establishments/{eid}/roles` — rattache un contact existant.
- `PATCH /api/roles/{rid}` — édition (clôture = date_fin, principal auto-démote
  les autres actifs).
- `GET /api/establishments/{eid}/four-questions` — Qui commande / décide / paie / signe.
  Retourne 4 slots, chaque slot `None` (à afficher « À renseigner ») ou un dict
  avec contact + rôle.
- `POST /api/establishments/{eid}/change-of-manager` — parcours guidé :
  clôture rôles direction actifs, création nouveau gérant, option
  `close_all_other_contacts`, marquage établissement `to_requalify=True`,
  **bouclier crédit orange** (revalidation manager requise).

### Tests
- `/app/backend/tests/test_iter39_contacts_v2.py` : **13/13 verts** couvrant
  migration (contacts créés depuis embarqué), catalogue fermé (rejet
  `empereur`), création rapide 1 champ, dédoublonnage par email lowercase,
  démotion `principal`, clôture jamais destructive (rôle clos toujours
  accessible via `include_closed`), les 4 questions, changement de gérant
  avec bouclier orange, historique multi-rôles par contact.

## Lot 8 étapes 2-5 — BusinessDocument, émission, PDF, auto-facturation (23/02/2026)

### Modèle unifié
Un seul modèle `business_documents` pour les 7 types (devis, BC, BL, proforma,
facture, avoir, feuille dépôt). Cycle de vie commun (brouillon → envoyé /
émis / livré / soldé / annulé) piloté par `doc_type`. Les transitions
(devis → BC → BL → facture) sont de simples reclassements + report de lignes,
**jamais de ressaisie**.

### Endpoints livrés
- `POST /api/documents` — création brouillon (aucun numéro attribué).
- `GET /api/documents` — liste filtrable (type / client / status), RBAC.
- `GET /api/documents/{id}` — détail.
- `PATCH /api/documents/{id}` — édition (bloqué **423 Locked** pour facture/avoir émis).
- `POST /api/documents/{id}/emit` — validation → allocation atomique → verrouillage.
- `POST /api/documents/{id}/mark-delivered` — BL livré → auto-émission facture.
- `POST /api/documents/{id}/create-avoir` — avoir depuis facture (motif obligatoire).
- `GET /api/documents/{id}/pdf` — WeasyPrint (A4, mentions légales, TVA ventilée).

### Validateurs métier
- **BL / Facture** : `lot_number` obligatoire par ligne non-consigne (règlement CE 178/2002).
- **BL** : `driver_name` + `receiver_name` obligatoires.
- **Facture / Avoir** : SIREN client obligatoire + mentions légales complètes
  (via `_validate_org_legal_for_invoice`).
- **Avoir** : `original_invoice_id` + `reason` obligatoires.
- **Facture / Avoir émis** : PATCH bloqué (423). Correction uniquement par avoir.

### Auto-facturation (étape 5)
Passage BL → `livre` déclenche `_auto_emit_invoice_from_bl` :
- **Idempotent** par `source_bl_id` : rejeu = même facture, jamais de doublon.
- **Facture ce qui a été livré**, pas ce qui a été commandé.
- Si mentions légales incomplètes : reste en brouillon avec
  `emit_blocked_reason` — signalée dans la file « à envoyer ».
- Échec réseau → facture reste émise et valide, retry côté worker.

### Pennylane (étape 6)
`_push_to_pennylane` déclenché **automatiquement** à l'émission facture/avoir :
- Lit `PENNYLANE_API_KEY` de l'env — absent → statut `non_configure`, aucun blocage.
- Envoie le **numéro BEVID** en `label` — Pennylane ne re-numérote pas.
- Erreur → statut `erreur` + `pennylane_error` capturé, facture reste valide.
- Statut visible sur la facture (`pennylane_status`, `pennylane_id`, `pennylane_synced_at`).

**⚠️ Configuration Pennylane requise côté utilisateur** : le token doit avoir
le scope `customer_invoices` activé. Test runtime a retourné :
`HTTP 403 — Access to this resource requires scope "customer_invoices"`.
Action utilisateur : Pennylane > Paramètres > API > cocher `customer_invoices`
puis re-tester (l'émission facture retentera automatiquement au prochain appel).

### PDF (WeasyPrint + Jinja2)
Template unique (`document_pdf_template.py`) avec sections conditionnelles :
- Badge type + numéro grand format.
- Bandeau **PROFORMA** ambré, bandeau **AVOIR** rouge avec réf. facture.
- Émetteur + destinataire (SIREN, TVA intra, accise).
- Table lignes avec lot + DDM + format + remise + ligne consigne distincte.
- Totaux : HT produits + HT consignes + TVA ventilée par taux + TTC.
- Bloc règlement : IBAN, échéance, pénalités, indemnité 40 €, escompte.
- Signatures livreur + réceptionnaire (BL).
- Footer légal + clause réserve de propriété.
- Pagination avec compteur bas de page.

### Tests
- `/app/backend/tests/test_iter38_business_documents.py` : **14/14 verts**.
- Cas clés couverts : draft sans numéro, émission alloue le numéro,
  idempotence émission, BL sans lots → 422, BL avec lots + signatures → OK,
  facture sans SIREN client → 422, facture émise immuable (423), PDF %PDF
  header présent, auto-facturation depuis BL livré, `mark-delivered`
  idempotent (rejeu → même facture), avoir sans motif → 422, avoir avec
  référence + motif, ventilation TVA par taux, filtre par doc_type.

### Points restants (à finir en étape 7)
- Devis / BC / proforma / feuille de dépôt : contrat unifié déjà supporté
  (juste besoin des écrans UI + validateurs spécifiques feuille de dépôt +
  plafond espèces 1000 €).
- UI React (`/documents` + modal formulaire) — à venir.
- Envoi email automatique de la facture au contact facturation — 3 tentatives
  avec back-off.

## Lot 8 étape 1 — Chaîne documentaire : modèle + numérotation atomique (22/02/2026)

### Contexte
Le point 1 conditionne toute la chaîne documentaire (devis → BC → BL → facture
→ avoir + proforma + feuille de dépôt). Toute erreur ici expose l'entreprise à
un redressement fiscal (art. 242 nonies A CGI).

### Backend
- **`DOCUMENT_TYPES`** : 7 types avec préfixe et nature juridique (`fiscal: bool`).
  - Commerciaux (sans valeur fiscale) : `devis` (DEV), `bon_commande` (BC),
    `bon_livraison` (BL), `proforma` (PRO), `feuille_depot` (FD).
  - Fiscaux (immuables, conservation 10 ans) : `facture` (F), `avoir` (AV).
- **`_allocate_document_number(org_id, doc_type)`** : compteur atomique via
  `find_one_and_update` avec `$inc` + `upsert` + `ReturnDocument.AFTER`.
  Cloisonnement par `(org_id, doc_type, year)`. Réinitialisation implicite au
  1er janvier. **Zéro doublon garanti par MongoDB en concurrence**.
- **`_peek_next_document_number`** : aperçu sans consommation (usage UI only).
- **Séquences scopées** : nouvelles collections `document_sequences`,
  `business_documents`, `org_legal` ajoutées à `SCOPED_COLLECTIONS`.
- **Mentions légales par organisation** (`OrgLegalUpdate` + collection
  `org_legal`) : 24 champs — identité, adresse, banque, règlement, accises,
  clauses. Défauts légaux conformes (recovery 40 €, cash pro 1 000 €).
- **Validateur `_validate_org_legal_for_invoice`** : retourne la liste des
  champs manquants pour émettre — utilisé plus tard par l'étape 3 pour bloquer
  l'émission d'une facture non conforme.

### API
- `GET /api/documents/types` — liste des 7 types + prefix + fiscal.
- `GET /api/documents/preview-number/{doc_type}` — aperçu sans consommation.
- `GET /api/org/legal` — lecture mentions légales + `_missing_for_invoice`.
- `PUT /api/org/legal` — écriture (manager only, cleanup strings, audit log).
- `POST /api/_internal/allocate-doc-number` — endpoint réservé aux tests
  (manager only). NON documenté publiquement.

### Tests
- `/app/backend/tests/test_iter37_numbering.py` : **12/12 verts** dont le
  test critique **`test_hundred_concurrent_allocations_produce_unique_consecutive_numbers`**
  — 100 allocations en parallèle via `asyncio.gather` produisent 100 numéros
  uniques et strictement consécutifs. Zéro doublon, zéro trou.
- Isolation par doc_type vérifiée. Aperçu non-consommant vérifié. RBAC
  commercial→403 vérifié sur `/_internal/allocate` et `PUT /org/legal`.

### État de la chaîne documentaire — 7 étapes prévues (spec 20/08/2026)
- ✅ **Étape 1** — Modèle + séquences atomiques + mentions légales
- ⏳ Étape 2 — Bon de livraison modifiable et signable, avec lots + consignes
- ⏳ Étape 3 — Facture, validateur de mentions, PDF Factur-X
- ⏳ Étape 4 — Avoir (référence facture d'origine + motif)
- ⏳ Étape 5 — Génération auto + envoi email au pointage « livré », idempotent
- ⏳ Étape 6 — Transmission Pennylane (mode simulation si pas de clé env)
- ⏳ Étape 7 — Devis, bon de commande, proforma, feuille de dépôt

## Lot 8 — Contacts enrichis : fixe + portable + fonction + email secondaire (22/02/2026)

### Contexte
Le premier passage sur les Interlocuteurs (21/02) offrait un seul téléphone
générique. En usage réel, le commercial a besoin de distinguer **le fixe pro
(heures ouvrées, standard)** du **portable direct** — et souvent un même
interlocuteur a un email principal + un email compta/service.

### Backend
- `EstablishmentContact` étendu (rétro-compat conservée) :
  - `phone_landline` (fixe)
  - `phone_mobile` (portable)
  - `phone` (existant — mode legacy, affiché seulement si aucun fixe/portable)
  - `email` + `email_secondary`
  - `job_title` — texte libre pour préciser (« Directeur des achats »).
- `ContactCreate` / `ContactPatch` couvrent les nouveaux champs.
- Endpoints `POST` / `PATCH` sur `/establishments/{eid}/contacts[/{cid}]`
  gèrent tous les champs avec cap 60 (téléphones), 200 (emails), 120 (fonction),
  500 (notes) et **démotion automatique du principal**.
- Format XLSX enrichi : 11 colonnes (au lieu de 7) sur la feuille Contacts,
  avec fixe / portable / fonction / email secondaire. Template + export + import
  round-trip vérifiés.

### Frontend — `ContactsPanel.jsx` refondu
- **Affichage** : chaque téléphone porte son propre libellé (`FIXE` / `PORTABLE`)
  avec l'icône dédiée (Phone vs Smartphone). Deux emails distincts si présents
  (avec badge `2e` sur le secondaire). Fonction affichée à côté du rôle avec
  icône « Briefcase ».
- **Modal** : formulaire à 2 colonnes pour Rôle + Fonction, puis Fixe + Portable
  côte à côte, puis Email principal + secondaire empilés. Sticky header et
  footer pour toujours voir « Enregistrer » sur mobile.
- **Rétro-compat** : les anciens contacts qui n'ont que `phone` continuent de
  l'afficher tel quel. Dès qu'un fixe OU portable est renseigné, `phone` legacy
  est masqué pour éviter la redondance.

### Tests
- `test_iter33_contacts.py` : 7/7 verts (crédible sur le nouveau schéma).
- `test_iter34_xlsx.py` : 10/10 verts (template + round-trip xlsx avec 11 colonnes).

## Lot 8 — Récupération par code OTP (22/02/2026)

### Contexte
L'utilisateur ne recevait pas les emails de récupération (Resend en mode
dégradé sur preview). Sans mécanisme de secours, un compte était impossible
à récupérer sans intervention manager.

### Backend
- Nouveaux endpoints :
  - `POST /api/auth/forgot-password-code` — génère un code OTP à 6 chiffres,
    valable 15 min, à usage unique. Rate limit 3/15min/IP+email.
  - `POST /api/auth/reset-password-code` — vérifie {email, code, new_password}
    et applique le changement. 5 tentatives max par code (verrouillage au-delà).
- **Mode dégradé assumé** : quand l'envoi email échoue (Resend indisponible),
  le code est retourné dans la réponse JSON avec `fallback_reason=email_service_unavailable`
  et `email_delivered=false`. Documenté côté UX.
- **Anti-énumération** : un email inconnu retourne toujours 200 avec un message
  générique et sans champ `code`.
- **Codes précédents invalidés** dès qu'un nouveau est généré (évite l'ambiguïté).
- **Rate limits login purgés** après reset réussi pour ne pas bloquer la
  reconnexion immédiate.
- Audit trail : `password_reset_code_sent` (avec `delivered` bool) et
  `password_reset_via_code`.

### Frontend
- `/forgot-password` refondu en **2 étapes sur la même page** :
  1. Saisie de l'email → « Recevoir un code »
  2. Saisie du code + nouveau mot de passe → reset immédiat, redirection login
- **Bandeau ambré de secours** affiche le code à l'écran quand l'email n'est
  pas parti + bouton « Copier ». Explicite que c'est un mode dégradé.
- Bandeau vert de confirmation quand l'email est réellement délivré.
- Champ code : input mono, `inputMode=numeric`, `autocomplete=one-time-code`
  (autofill iOS/Android depuis SMS/mail), placeholder `••••••`, filtrage
  automatique des non-chiffres.

### Tests
- `/app/backend/tests/test_iter36_otp_recovery.py` : **7 tests** (email inconnu → 200 sans code, email connu → code renvoyé, reset + login OK, code réutilisé → 400, mauvais code → 400, mot de passe court → 422, invalidation du code précédent quand un nouveau est demandé, rate limit après 3 demandes → 429).
- Chaque test utilise un email unique généré à la volée pour ne pas déclencher
  le rate limit sur `otp-test-user@bevidcrm.fr` fixe.

## Lot 8 — Consolidation Test Data (21/02/2026)

### Contexte
Après 30+ itérations de dev + tests, la base démo était polluée par 300+ fake
orders (TESTPDF_, PROP_XXX, MANUAL_, BAR LE CENTRAL, BK_…), 13 établissements
fantômes et 17 produits `TESTP2_prod_*`. Impossible de faire une démo crédible
sans nettoyer manuellement pendant 20 minutes.

### Backend
- Nouveau endpoint `POST /api/admin/demo/consolidate` (manager only, 403 sinon).
- **Étape 1 — Purge** :
  - Établissements dont le nom n'est pas dans la liste réelle
    (ADT 64, BEKAST, SAS CASSOULET, Bar de la Poste, Tour Eiffel Test).
  - `db.clients` (legacy) : mêmes noms + motifs junk explicites
    (TESTP_, PROPTEST-, MANUAL, TESTPDF_, PROP_XYZ, BAR LE CENTRAL, …).
  - Cascade sur orders/visits/activities/objections/engagements/comments/memory.
  - Produits `TESTP*`, `PROP_TEST*`, `MANUAL*` supprimés en masse (regex Mongo).
- **Étape 2 — Enrichissement** (idempotent via flag `demo_history_seeded`) :
  - Rythmes de commandes personnalisés par établissement (14/21/28/35 j).
  - 3 lignes par commande (panier bière + vin + soft).
  - 1 commande d'événement (qty×4) au milieu de l'historique pour valider
    le filtrage IQR de la prédiction de rupture.
  - 1-3 visites par établissement avec `voice_transcript` réaliste.
  - 0-2 objections crédibles CHR (prix, contrat concurrent, rotation lente).
  - 0-1 engagement à J+4 à J+14.
  - Recompute automatique de la mémoire client.

### Frontend
- Section « Consolidation des données de démo » dans `/org/settings`
  (manager only) avec bouton `orgsettings-consolidate-btn` + confirmation
  native + rapport 8 KPI (purgés / créés) après exécution.

### Résultats runtime (base démo)
- **Purgé** : 13 établissements, 6 clients legacy, 341 commandes, 39 visites,
  17 produits.
- **Créé** : 40 commandes, 9 visites, 6 objections, 4 engagements sur 5 vrais
  établissements.
- **Idempotence** : 2e et 3e appels → tous compteurs à 0.
- **État final** : 5 établissements réels, 40 commandes propres, 0 fake data.

### Tests
- `/app/backend/tests/test_iter35_consolidate.py` : **7 tests**.
  - 403 pour commercial, shape du rapport, idempotence, aucun junk restant
    (établissements + orders), établissements réels préservés, historique
    correctement créé sur ADT 64.

## Lot 8 — Import / Export XLSX (21/02/2026)

### Contexte
Les commerciaux et le back-office fournissent régulièrement de la donnée en tableur
(catalogues fournisseurs, listing de bars repris, grilles tarifaires négociées).
Sans import xlsx, la seule alternative est la saisie manuelle ou l'API brute.

### Backend
- Nouvelle dépendance : `openpyxl==3.1.5`.
- **Formats fermés** : chaque fichier respecte des colonnes documentées (avec
  suffixe `*` sur les obligatoires + fond rouge). Jamais de mapping devinable.
- **6 endpoints GET** (renvoient `application/vnd.openxmlformats-...`) :
  - `/xlsx/template/establishments` (2 feuilles : Etablissements + Contacts)
  - `/xlsx/template/products`
  - `/xlsx/template/pricelists` (2 feuilles : Tarifs + Lignes)
  - `/xlsx/export/establishments` (avec contacts)
  - `/xlsx/export/products`
  - `/xlsx/export/pricelists`
  - `/xlsx/export/orders` (aplati une ligne par produit — 351 lignes sur base démo)
- **3 endpoints POST d'import** avec cap 5 Mo (413 sinon), extension `.xlsx`
  vérifiée (422 sinon), rapport d'erreurs ligne par ligne (jamais d'arrêt sur
  première erreur) :
  - `/xlsx/import/establishments` — upsert par `name`, contacts dédoublonnés
    par `(role, name)`.
  - `/xlsx/import/products` — upsert par SKU sinon par nom.
  - `/xlsx/import/pricelists` — upsert par nom de grille, résolution produit
    par SKU puis nom.
- **Erreurs métier remontées** : type/catégorie/rôle inconnu → remis à `autre`
  avec message d'avertissement, jamais silencieux.
- **Commandes en export seul** : l'import de commandes passe par la prise de
  commande dictée (LLM + validation ligne à ligne), pas par tableur.

### Frontend
- Nouveau composant `XlsxIO.jsx` — bouton dropdown compact avec 3 actions
  (Télécharger un modèle, Exporter, Importer) et modal de rapport
  (créés / mis à jour / erreurs détaillées).
- Le mode "export seul" masque les actions modèle/import (utilisé pour
  Commandes).
- Ajouté sur les pages `/clients` (établissements), `/products` (produits),
  `/orders` (commandes, export seul).

### Tests
- `/app/backend/tests/test_iter34_xlsx.py` : **10/10 verts**.
  - 3 templates lisibles avec bonnes feuilles.
  - Round-trip template → import sans erreur.
  - Extension .csv rejetée (422).
  - Fichier > 5 Mo rejeté (413).
  - Rôle/catégorie inconnu signalé mais ligne créée avec fallback.

### Validation runtime
- Template établissements : 6 260 octets, 2 feuilles avec exemple pré-rempli.
- Export commandes : 25 805 octets, 351 lignes (une par ligne de commande).
- 3 imports round-trip verts : 1 créé, 0 erreur pour chaque type.

## Lot 8 — Interlocuteurs multiples par établissement (21/02/2026)

### Contexte
Une fiche établissement n'avait qu'un champ `phone` unique. Les commerciaux terrain
avaient besoin de garder les coordonnées des différents acteurs qui interviennent
dans la relation : gérant, comptable, acheteur, chef de cuisine, sommelier, etc.

### Backend
- Nouveau modèle embarqué `EstablishmentContact` — id (uuid), role, name, phone,
  email, notes, is_primary, created_at, updated_at.
- **10 rôles fermés** (`gerant`, `proprietaire`, `comptable`, `acheteur`,
  `chef_cuisine`, `chef_cave`, `sommelier`, `responsable_achats`, `reception`,
  `autre`) — pas de champ libre, pour permettre du filtrage/analyse ultérieur.
- Champ `contacts: List[EstablishmentContact] = []` ajouté au modèle
  `Establishment` (stocké embarqué, jamais 2 requêtes pour lire la fiche).
- **4 endpoints CRUD** :
  - `GET /api/establishments/{eid}/contacts` — liste
  - `POST /api/establishments/{eid}/contacts` — création (name obligatoire, role
    validé)
  - `PATCH /api/establishments/{eid}/contacts/{cid}` — édition partielle
  - `DELETE /api/establishments/{eid}/contacts/{cid}` — suppression, 404 si
    inconnu
- **Un seul contact principal à la fois** : si un nouveau contact ou une
  promotion arrive avec `is_primary=true`, le serveur démote automatiquement
  les autres. Simplifie la logique frontend.
- **`PUT /establishments/{eid}` protégé** : le champ `contacts` est retiré du
  payload avant l'update pour empêcher un update global d'écraser la
  sous-collection.

### Frontend
- `ContactsPanel.jsx` (nouveau) : bloc « Interlocuteurs » sur la fiche
  Établissement 360°, sous « Ce qu'il faut savoir ».
- Liste triée : principal d'abord, puis rôle métier, puis nom.
- Icône étoile ambrée pour le contact principal.
- Téléphone → `tel:` cliquable, email → `mailto:` cliquable.
- Ajout/édition via mini-modal (jamais d'inline sur mobile — mises à jour
  partielles perdues sinon).
- Confirmation native avant suppression.

### Tests
- `/app/backend/tests/test_iter33_contacts.py` : **7/7 verts**.
  - Liste vide par défaut, création requiert `name` non-vide, rejette rôle
    inconnu, cycle CRUD complet avec démotion automatique du principal,
    PATCH 404 sur contact inconnu, GET 404 sur établissement inconnu, PUT
    global ne wipe pas `contacts`.

### Validation runtime
- 3 contacts créés sur ADT 64 (Ratisbonne) via curl → rendu vérifié en
  screenshot preview (Jean Ratisbonne gérant principal, Marie Compta comptable,
  Paul Acheteur acheteur).

## Lot 7 — Mesure utilité + fusion clients/etabs sur RGPD (21/02/2026)

### Backend
- **Collection `copilot_feedback`** scoped, upsert idempotent par (kind, target_id, user_id).
- **`POST /api/copilot/feedback`** : {kind ∈ brief|response_suggestion|objection_extract|engagement_extract, target_id, useful, context}. Rejette kind invalide (422) et target_id vide (422).
- **`GET /api/copilot/feedback/stats`** : deux chiffres exigés par la spec :
  - `useful_rate` : part de suggestions jugées utiles (tout kind confondu + détail by_kind).
  - `memory_coverage.rate` : part d'établissements ayant une mémoire remplie (`sections.0` existe).
- **Fix fusion clients/etabs sur RGPD** : `/rgpd/clients/{cid}/export` et DELETE acceptent désormais un id d'établissement (avant : 404 systématique si cid présent uniquement dans db.establishments). Purge conjointe des deux collections.

### Frontend
- **`FeedbackThumbs.jsx`** (nouveau) : composant réutilisable pouce haut/bas. Idempotent, disabled après tap, couleurs actives distinctes (vert / rouge).
- **`BriefButton.jsx`** : pouce sous le brief avec `data-testid="brief-fb-thumbs"`.
- **`ObjectionsList.jsx`** : chaque suggestion « Ce qui a déjà fonctionné » a son propre pouce `data-testid="resp-fb-{oid}-{i}-thumbs"`.

### Tests
- **`test_iter31_feedback_fusion.py`** : 5/5 verts (upsert idempotent + stats structure + kind invalide 422 + target vide 422 + auth requise + RGPD accepte establishment_id).

### Régression complète Lot 7
28 tests backend précédents (iter28+29+30) + 5 nouveaux (iter31) = **33/33 verts**.

- Aucun appel LLM ajouté par ces 3 features — agrégations pures.

### Tests
- **`test_iter30_comments_effective_offline.py`** : 8/8 verts (CRUD comments, auteur only edit, texte vide 422, pinned en mémoire, effective shape/rejet catégorie, bootstrap contient tour_briefs, auth).
- **Régression Lot 7 complet** : 28/28 verts sur iter28+29+30.

### Prochaines étapes du Lot 7
- **Mesure d'utilité** (pouce haut/bas sur brief + suggestions de réponse) : reste à faire.
- Vérification à froid par le testing agent : test complet du parcours commercial avec les 6 features branchées.


## Fixes intégration walkthrough copilote (iter21, 21/02/2026)

Suite au walkthrough copilote (iteration_21.json — 5 bugs P0-P1 identifiés) :

- **P0 VisitReport dropdown** (`visit-client`) : fusionne désormais `/api/clients` + `/api/establishments` en un seul dropdown dédupliqué. Le commercial peut enfin sélectionner ADT 64 / BEKAST / etc. pour dicter un CR.
- **P0 Navigation post-copilote** : après confirmation d'engagements, navigation vers `/etab/{id}` (fiche copilote complète) au lieu de `/clients/{id}` (legacy sans blocs Lot 7). Effectif aussi en mode offline.
- **P0 ClientDetail fallback** : si `/api/clients/{id}` renvoie 404 mais `/api/establishments/{id}` existe, redirection automatique via `<Navigate to="/etab/{id}" replace />`. Les URLs `/clients/{establishment_id}` ne plantent plus.
- **P1 CommentsThread → ClientMemory recompute événementiel** : `Etablissement360` maintient un `memoryVer` state incrémenté à chaque `onMemoryChange` (pin/unpin/edit/delete). `ClientMemory` reçoit `refreshTrigger` et refetch. Le commentaire épinglé apparaît immédiatement dans la mémoire, sans clic manuel de recompute.
- **P3 FeedbackThumbs UX** : vote unique côté UI (`disabled={busy || vote !== null}`) pour éviter les re-clics muets. L'API upsert reste idempotente.

Reste ouvert (P2-P3 non bloquants) :
- Sources cliquables dans ClientMemory (badge date/type sans onClick).
- Skeleton pendant l'extraction LLM (5-8s).
- Bouton « Nouveau CR » depuis /tournee vers /visit avec pré-remplissage client_id.

**Régression** : 33/33 tests backend Lot 7 verts (iter28-31).

### Cause racine documentée
Deux collections MongoDB coexistent : `db.clients` (legacy) et `db.establishments` (Lot 5+). Les fixes ci-dessus créent des ponts fonctionnels sans migration destructive. Une consolidation propre reste au backlog (P1 refactor).


## Iter32 — Fusion collections + sources cliquables + skeleton LLM (21/02/2026)

### Backend — Migration idempotente clients → establishments
- **`_merge_clients_into_establishments()`** exécutée au startup (`@app.on_event("startup")`).
- Pour chaque doc de `db.clients`, upsert dans `db.establishments` s'il n'y existe pas déjà (dédup par `id`).
- Valeurs par défaut ajoutées pour les champs Establishment (`current_credit=0`, `credit_status="vert"`, `overdue_days=0`, `volumes_12m=[]`…).
- `db.clients` **n'est pas supprimée** (rollback possible + compatibilité endpoints legacy).
- **Résultat au premier boot** : 15 fiches unifiées. Deuxième boot : 0 (idempotent).
- Tests `test_iter32_client_merge.py` : 2/2 verts (chaque client atteignable via /establishments/{id} + idempotence).

### Frontend
- **`ClientMemory.jsx`** — sources cliquables : les badges de type `visit` avec `id` deviennent des `<button>` navigables (`hover:underline`, `cursor-pointer`, testid `memory-source-{type}-{id}`) redirigeant vers `/etab/{establishmentId}` (contient l'historique visites). Les autres sources restent des `<span>` informatifs.
- **`ObjectionExtractPanel.jsx`** — skeleton animé (3 cards `animate-pulse`) + message « Analyse du compte rendu par l'IA (5-8s)… » pendant l'appel GPT-5.6 Sol. Testid `objections-skeleton`.
- **`EngagementExtractPanel.jsx`** — même pattern (2 cards). Testid `engagements-skeleton`.

### Régression complète Lot 7 : **35/35 verts** (iter28+29+30+31+32).


## Lot QA — Rapport bugs P0 (livré 23/02/2026)

### P0 — Login CSP image bloquée
- `Login.jsx`, `Register.jsx`, `ForgotPassword.jsx` : suppression du `backgroundImage: url('https://images.unsplash.com/...')` bloqué par CSP.
- Remplacé par un dégradé radial + linéaire CSS pur + pattern de points (radial-gradient). Zéro octet, zéro requête externe.
- Rendu vérifié en screenshot : panneau de marque affiche un vrai fond violet texturé + typographie centrée.

### P0 — Tableaux amputés sur mobile (perte de données)
- Écrans impactés (`overflow-hidden` sur wrapper de tableau plus large que le conteneur) : `/stock`, `/drm`, `/rapprochement`, `/paiements` (partiellement scrollable), plus balayage sur `/reports`, `/admin/users`, `/couts`, `/confidentialite`.
- Correction appliquée : `overflow-hidden` → `overflow-x-auto scroll-shadow` + `min-w-[720px]`/`[560px]`/`[820px]` sur `<table>` + **1ère colonne figée** via `sticky left-0 z-10`.
- Nouvelle classe `.scroll-shadow` dans `/app/frontend/src/index.css` : dégradé radial violet à droite indiquant qu'il reste du contenu à scroller (dark mode inclus).
- Vérifié via screenshot : les 8 colonnes de `/stock` sont visibles et scrollables sans troncature.

### P0 — Fuites anglais → français
- 130+ nouvelles clés i18n (FR + EN) ajoutées à `lib/i18n.js` : `empty.*`, `column.*`, `filter.*`, `new_client`, `new_order`, `new_establishment`, `activate_camera`, `stop_camera`, `manual_entry`, `dashboard_greeting`, `revenue_evolution`, `top_products`, `settings.preferences`, `automations`, `bad_payers_help`, `reconciliation_help`, `login_hero_*`, `forgot_hero_*`, `see_pricing`, `manager_only`, etc.
- Titres/overlines/colonnes/états vides remplacés par `t(key)` sur : Dashboard, Clients, Orders, Stock, DRM, Rapprochement, Paiements, Settings, Reports, Products, Team, Containers, ScanContainer, Login, Register, ForgotPassword.
- État vide "Aucun client" / "Aucune commande" / "Aucune donnée" / "Aucune ligne" tous traduits.

### P0 — Accessibilité + métadonnées
- `usePageMeta` étendu à Dashboard, Clients, Orders, Stock, DRM, Rapprochement, Paiements, Settings, Reports, Products, Team, Containers, ScanContainer. Titre onglet distinct par écran (`{Page} · BEVID`).
- **H1 dédoublonnés** : `Layout.jsx` (top bar mobile) `<h1>BEVID</h1>` → `<span aria-hidden>BEVID</span>`. Chaque page conserve son `<h1>` unique (titre de page). Les cartes internes (`<h3>` sur Dashboard/Settings/Paiements) rétrogradées à `<h2>` pour respecter la hiérarchie.
- **Cibles tactiles ≥ 32px desktop / ≥ 44px mobile** : bouton `sidebar-collapse-toggle` passe de `p-1.5` (28px) à `min-w-[32px] min-h-[32px]`. Boutons secondaires sur Clients/Orders/Products/Containers/Rapprochement gagnent `min-h-[44px]`. Filtres Rapprochement gagnent `min-h-[36px]`.
- **Inputs avec `id` + `<label>`** : Rapprochement search, Clients search, ScanContainer manual code — tous avec `label sr-only` + `id` + `autoComplete`.
- **aria-label** partout : "Ouvrir la palette de commandes" → `t("open_command_palette")`, "Rechercher" → `t("search_verb")`, `t("activate_camera")`, `t("stop_camera")`, boutons icônes sur Dashboard/Clients/Orders/Products.
- **`ambient-light-sensor` retiré** de `Permissions-Policy` (backend `server.py` + frontend `craco.config.js`). Vérifié via `curl -sI` : plus de `ambient-light-sensor` dans les en-têtes.

### P0 — /scan : caméra plus démarrée au montage
- `ScanContainer.jsx` réécrit intégralement.
- `useEffect` réduit à un nettoyage `return () => stop()`. **Aucun démarrage automatique.**
- Nouveau bouton `data-testid="start-camera-btn"` avec libellé "Activer la caméra" — la demande d'autorisation navigateur ne se déclenche qu'après clic explicite.
- Message de pré-permission affiché dans le viewfinder tant que l'utilisateur n'a pas cliqué.
- Bouton "Arrêter la caméra" séparé après démarrage.
- Saisie manuelle inchangée (fallback intact).

### Fichiers modifiés
- Backend : `/app/backend/server.py` (Permissions-Policy).
- Frontend :
  - `/app/frontend/craco.config.js` (Permissions-Policy)
  - `/app/frontend/src/index.css` (nouvelle classe `.scroll-shadow`)
  - `/app/frontend/src/lib/i18n.js` (130+ clés FR + EN)
  - `/app/frontend/src/components/Layout.jsx` (aria-label, h1 → span, min-h collapse)
  - Pages: `Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`, `Dashboard.jsx`, `Clients.jsx`, `Orders.jsx`, `Stock.jsx`, `DRM.jsx`, `Rapprochement.jsx`, `Paiements.jsx`, `Settings.jsx`, `Reports.jsx`, `Products.jsx`, `Team.jsx`, `Containers.jsx`, `ScanContainer.jsx`, `Couts.jsx`, `AdminUsers.jsx`, `Confidentialite.jsx`.

### Bloqueurs restants (à surveiller ou nécessitent user)
- Sweep des 45 écrans pour d'autres tables `overflow-hidden` fait sur les principaux; balayage exhaustif à confirmer via testing_agent.
- Tables restées scrollables sans stacked-cards mobile (approche minimum acceptée par user : `overflow-x-auto` + `scroll-shadow` + `sticky left-0`).
- Bandeau consent PostHog "Statistiques d'usage anonymisées" reste en FR par design (composant global).

## Lot QA — Retest iteration_23 : ✅ 7/7 P0 VERTS (23/02/2026)

Après un premier passage testing agent (iteration_22) qui a détecté 4 bugs critiques :
1. **Paiements TDZ** — `const { t } = useI18n()` shadowait `import { t } from lib/i18n` utilisé par `usePageMeta` avant déclaration → ReferenceError sur toute visite `/paiements`. Fix : suppression du `useI18n` (l'import statique suffit, ré-évalué à chaque re-render context).
2. **Sidebar H1 dupliqué** — `<h1 className="font-display text-2xl">BEVID</h1>` dans la sidebar rendait 2 h1 sur chaque page authentifiée. Fix : `<span aria-hidden="true">` (Layout.jsx L553).
3. **Tables Reports/AdminUsers/Confidentialite** — wrapper avait bien `.scroll-shadow overflow-x-auto` mais tables sans `min-width` ni `sticky left-0` sur 1ère colonne. Fix : `min-w-[640/720px]` + `sticky left-0 bg-* z-10` sur th/td de la 1ère col.
4. **Frontend static Permissions-Policy** — malgré la correction `craco.config.js`, le webpack-dev-server devait redémarrer pour reprendre la config. Fix : `sudo supervisorctl restart frontend` après changement de config.

Bonus i18n : `low_stock_alert` (Alerte stock bas / Low-stock alert), `others`, `empty.no_products`, `stock` remontés en clés.

### Régressions vérifiées ✅
- `/paiements` : rend, h2 + heading + KPI DSO OK
- H1 = 1 sur les 10 pages internes
- Tables : min-width appliqué, sticky first col sur th ET td
- Curl `/login` : plus d'`ambient-light-sensor`
- i18n EN/FR aller-retour : `Low-stock alert` ↔ `Alerte stock bas`
- Login manager fonctionnel, navigation 10 pages sans erreur fatale

## Lot Compliance — Mise aux normes légales (23/02/2026)

Ajout complet des pages légales exigées pour la conformité française (RGPD, LCEN, article 6 CNIL/CGV) :

### Pages créées (5 nouvelles)
- `/legal/mentions-legales` (`LegalMentions.jsx`) — éditeur, hébergeur, propriété intellectuelle, RGPD summary, contact DPO, CNIL.
- `/legal/cgv` (`LegalCGV.jsx`) — Conditions Générales de Vente — 10 sections (objet, tarifs, souscription, paiement, résiliation, obligations, disponibilité, responsabilité, propriété données, loi applicable).
- `/legal/cgu` (`LegalCGU.jsx`) — Conditions Générales d'Utilisation — 8 sections (acceptation, comptes, usage autorisé, contenu utilisateur, disponibilité, sécurité, suspension, modifications).
- `/legal/cookies` (`LegalCookies.jsx`) — Politique cookies — table détaillée des traceurs (bevid_auth, bevid_session, ph_*, __cf_bm etc), boutons "Accepter"/"Refuser/révoquer" fonctionnels, statut courant affiché.
- `/legal/politique-confidentialite` (`LegalPrivacy.jsx`) — RGPD complet — responsables, données collectées, finalités (art. 6 RGPD), sous-traitants (Emergent/Stripe/Twilio/Resend/PostHog/Anthropic-OpenAI/Pennylane), transferts hors UE, durées de conservation, 7 droits, sécurité.

### Composant transverse
- `LegalFooter.jsx` — pied de page avec 6 liens légaux, ajouté à Login, Pricing (+ page Register/Forgot conservent le layout brand-panel).

### Intégrations
- **App.js** : 5 routes lazy `/legal/*` enregistrées.
- **craco.config.js KNOWN_ROUTES** : 5 regex ajoutés (le middleware 404 SPA reconnaît les nouvelles routes).
- **robots.txt** : 6 `Allow: /legal/*` ajoutés pour indexation SEO.
- **sitemap.xml** : 5 URLs légales ajoutées avec priority 0.4.
- **PostHogConsent.jsx** : lien "Modifiable depuis Confidentialité" → "Politique cookies" (`/legal/cookies`).
- **Register.jsx** : checkbox de consentement mise à jour — accepte CGU + CGV + politique de confidentialité (3 liens vers `/legal/*`).
- **Login.jsx** : import `LegalFooter` + bandeau de 5 liens légaux en bas du formulaire.

### Conformité couverte
- **LCEN 2004-575** (mentions légales éditeur/hébergeur) ✓
- **RGPD** (politique de confidentialité + droits + DPO + CNIL + sous-traitants art. 28) ✓
- **Directive ePrivacy / recommandation CNIL cookies** (opt-in strict, révocable, détail des traceurs, durée ≤ 13 mois) ✓
- **Code de commerce / art. L.441-1** (CGV professionnelles) ✓
- **CGU** (usage acceptable, modération, résiliation) ✓

### À personnaliser par l'éditeur (placeholders)
- Raison sociale exacte, SIREN, capital social, siège, RCS, TVA intracom, directeur publication — bloc "à compléter" dans `/legal/mentions-legales`. Aucune information inventée ; l'organisation utilisatrice doit renseigner avant mise en production commerciale.

## Lot Compliance V2 — Identité éditeur + Cookies personnaliser (23/02/2026)

### Backend
- `OrgSettingsUpdate` model étendu de 9 champs : `legal_name`, `siren`, `rcs`, `capital_social`, `legal_address`, `director_publication`, `tva_intracom`, `legal_email`, `dpo_email`.
- `GET /api/org/branding` : renvoie les 9 nouveaux champs.
- `PUT /api/org/branding` : accepte les 9 nouveaux champs (manager only).
- **NOUVEAU** `GET /api/config/legal-identity` (public, sans auth) : renvoie l'identité éditeur pour affichage sur les pages légales publiques. Fallback `{configured: false, commercial_name: "BEVID"}` si aucune org n'a rempli `legal_name`.

### Frontend
- **`OrgSettings.jsx`** : nouvelle section « Identité éditeur légale » avec 9 champs éditables (auto-save onBlur) + composant `SirenAutocomplete` existant réutilisé au top de la section pour remplir `legal_name` + `siren` + `legal_address` en un clic.
- **`LegalMentions.jsx`** : fetch `/api/config/legal-identity` au mount, affiche les vraies infos si `configured=true`, sinon garde les placeholders « à compléter ». Email DPO dynamique.
- **`PostHogConsent.jsx`** : troisième bouton **« Personnaliser »** (data-testid=`consent-customize`) → lien vers `/legal/cookies` où l'utilisateur voit le détail complet et peut accepter/révoquer séparément. Rendu vérifié via screenshot.

### Vérifications
- `curl /api/config/legal-identity` : `{"configured":false,"commercial_name":"BEVID"}` ✅
- Screenshot Login : 3 boutons consent visibles (Accepter / Refuser / Personnaliser) ✅
- Autocomplete SIREN branché sur `/api/enrichissement/autocomplete` (déjà existant, appelle Recherche-Entreprises API gouv).

### Reste à faire (non traité par manque de contexte)
- Lot 8 Devis/BC/Proforma/Feuille de dépôt : les `DOCUMENT_TYPES` sont déjà déclarés dans server.py L739-747 avec préfixes et flags fiscaux ; il reste à ajouter les endpoints CRUD + UI d'émission (voir `_allocate_document_number` L758 et le template Jinja WeasyPrint `document_pdf_template.py`).
- Lot 9 Société hierarchy : à démarrer sur `db.companies` (nouvelle collection) reliée à `db.establishments.company_id`.
- Legacy `db.clients` : suppression après migration des 6 clients restants.

## Lot 8 + Lot 9 + Legacy — livrés en batch (23/02/2026)

### Lot 8 — Documents CRUD étendu
- Backend déjà prêt (`DOCUMENT_TYPES` + `_allocate_document_number` + endpoints `/documents/*` L1858-2286 couvrent devis, bon_commande, proforma, feuille_depot, bon_livraison, facture, avoir).
- **Frontend nouveau** : `/app/frontend/src/pages/Documents.jsx` — liste unifiée avec filtres par type (Tous · Devis · BC · Proforma · Feuille de dépôt · BL · Facture · Avoir), création via modal multi-type avec preview du prochain numéro (`GET /documents/preview-number/{type}`), émission (`POST /documents/{id}/emit`), téléchargement PDF (`GET /documents/{id}/pdf`).
- Route `/documents` protégée + craco KNOWN_ROUTES + lazy import.

### Lot 9 — Sociétés (companies)
- **Backend nouveau** : collection `db.companies` + endpoints CRUD `GET/POST/PATCH/DELETE /api/companies`, `GET /api/companies/{id}` (avec établissements rattachés), `GET /api/companies/{id}/aggregate` (CA total + encours factures), `POST /api/companies/{id}/attach|detach/{eid}`.
- Modèle `CompanyCreate` / `CompanyPatch` : legal_name, siren, ownership_type (SAS/SARL/EURL/SA/SCI/SNC), headquarters_address, capital_social, tva_intracom, rcs, naf_code, director, notes.
- Établissements liés via `establishments.company_id` (nullable, backward compat garantie — pas de migration destructive).
- **Frontend nouveau** : `Companies.jsx` (liste + recherche + création avec `SirenAutocomplete` pré-remplissage), `CompanyDetail.jsx` (KPI agrégés + liste établissements rattachés).
- Routes `/companies` et `/companies/:id` protégées + craco KNOWN_ROUTES.

### Legacy Clients — dépréciation soft + migration
- **Toutes les routes `/api/clients*` renvoient désormais l'en-tête** `X-BEVID-Deprecated: db.clients → use /api/establishments` (list, create, get, put, delete). Vérifié via `curl -sI` en LIVE.
- **Nouveau endpoint** `POST /api/admin/legacy/migrate-clients-to-establishments` (manager only) : parcourt `db.clients`, tente un merge sur `siret` puis `name` (soft — ne remplit que les champs vides), sinon crée un nouveau `establishment` avec un `legacy_client_id` de traçabilité. Idempotent : rejouable. Retourne `{total, moved, merged, errors}` + `audit_log`.
- Pas de suppression physique de `db.clients` pour l'instant (12+ pages frontend l'utilisent encore : Pipeline, Planning, Deals, Tours, ClientDetail, Radar…). La migration prépare le terrain sans casser l'existant.

### Vérifications LIVE
- `curl POST /api/companies` avec SIREN 999999999 renvoie un doc valide, `GET /api/companies` liste avec `establishments_count: 0`.
- `curl -sI /api/clients` renvoie bien `X-BEVID-Deprecated: db.clients → use /api/establishments`.
- Frontend rebuild via `supervisorctl restart frontend`.

### Reste à faire (à venir)
- Ajouter les items « Documents » et « Sociétés » à la Sidebar (Layout.jsx nav sections).
- Écran `EtablissementDetail` — bouton « Rattacher à une société » (attach/detach existent déjà côté backend).
- Migration réelle des 12+ pages frontend depuis `/api/clients` vers `/api/establishments` (backlog Legacy phase 2).

## Lot Import intelligent — Backend + Frontend (23/02/2026)

### Livré
- **`/app/backend/smart_import.py`** — module autonome (0 dépendance Mongo). Pipeline :
  - `sniff_file(bytes, filename)` : détecte CSV vs XLSX, encoding (chardet + mapping FR forcé pour ISO/Latin-1/1250/1252 → windows-1252), séparateur (csv.Sniffer + heuristique FR `;`), feuilles.
  - `read_csv_rows` / `read_xlsx_rows` : générateurs streaming, jamais tout en mémoire.
  - `detect_columns(headers, sample)` : Couche 1 dictionnaire synonymes FR/EN normalisés (nom, siret, siren, adresse, code_postal, ville, telephone, email, contact, type, notes) + Couche 2 inférence contenu (regex email, digits pour SIRET/SIREN/CP/tel, valeurs répétées pour type). Certitude par colonne, source `header`/`content`/`none`.
  - `clean_row(raw, mapping)` : téléphone → `+33 6 12 34 56 78`, email lowercase, code postal avec zéro initial restauré (Corse/Ain), nom en casse titre avec sigles préservés + particules FR, adresse mono-cellule découpée si motif reconnaissable. Traçabilité `corrections[]`.
  - `dup_confidence(a, b)` : SIRET → certain, SIREN+ville → very_likely, email → likely, nom+CP → likely, tel → possible, nom flou + ville → to_confirm (via rapidfuzz).
- **`/app/backend/tests/test_smart_import.py`** — 18 tests unitaires verts (sniff CSV FR Latin-1, XLSX streaming, détection colonnes par intitulé ET par contenu quand headers sont `Colonne1`, normalisation téléphone dans 7 formats, restauration zéro CP, casse titre sigles, split adresse).
- **Endpoints server.py** :
  - `POST /api/import/analyze` (upload fichier + sheet optionnel) → session_id + colonnes détectées + samples.
  - `POST /api/import/{session_id}/preview` → counts (lues, importables, sans nom, doublons fichier, doublons base) + 20 lignes nettoyées + corrections tracées + doublons DB avec niveau de confiance.
  - `POST /api/import/{session_id}/commit` (avec `duplicate_decisions` + `force`) → crée les `establishments`, chaque doc porte `import_batch_id`. Idempotent : refuse par 409 si fingerprint déjà committé sauf `force=true`.
  - `GET /api/import/history` → liste des lots.
  - `POST /api/import/{batch_id}/undo` (manager only) → supprime les fiches non modifiées depuis, conserve les autres.
  - Session store en mémoire par (org_id, user_id), TTL 30 min, purge auto avant chaque accès.
  - Limite dur 10 Mo.
- **Frontend `/import`** (`ImportIntelligent.jsx`) — parcours 4 étapes : drop-zone (upload) → mappage (dropdown corrigeable + badges certitude) → aperçu (5 KPI + décisions doublons + 20 lignes) → done. Historique avec bouton « Annuler cet import ».
- **App.js route `/import` protégée** + craco KNOWN_ROUTES.

### Points 1-7 spec couverts
1. ✅ Lecture XLSX/XLS/CSV, sniff séparateur `;,\t|`, encoding windows-1252/utf-8, choix feuille
2. ✅ Détection colonnes 2 couches, badges certitude, dropdown corrigeable
3. ✅ Nettoyage tracé — corrections visibles au survol
4. ✅ Aperçu obligatoire — 20 lignes + counts avant commit
5. ✅ Doublons intra-fichier + contre base, décisions ignore/merge/create par ligne
6. ✅ Idempotence par fingerprint SHA1 (filename + headers)
7. ✅ Marche arrière (`/import/{batch_id}/undo`) — ne supprime que les fiches non modifiées

### Reste à faire (points 8-10 + files_of_reference)
- Collage direct depuis presse-papier (paste TSV/CSV) — pas encore d'endpoint dédié
- Enrichissement Recherche-Entreprises quand SIRET/SIREN présent (endpoint existe : `/api/enrichissement/autocomplete`)
- Fichier de rejets XLSX au même format que l'original
- Mémorisation du mappage par utilisateur × fingerprint (déjà stocké côté session, à persister dans une collection `import_mappings`)
- Import asynchrone au-delà de 500 lignes (aujourd'hui synchrone)
- 3 fichiers de test réels pour mesurer le taux 80% cible

### File d'attente pour prochain lot
- **Travail en équipe** (spec reçue, non commencée) — messagerie contextuelle, portefeuilles, demandes/validations, revue hebdo composée

## Lot Import (paste+enrich) + Travail en équipe Item 1 (23/02/2026)

### Import — Collage direct
- **Backend** `POST /api/import/paste` : accepte `{text}` (TSV Excel ou CSV Sheets), détecte le séparateur sur la 1ère ligne (`\t;,`), passe par `smart_import.detect_columns`, renvoie un session_id compatible avec l'endpoint `/preview` existant.
- **Frontend** `/import` — bloc « Ou collez vos lignes depuis Excel / Google Sheets » sous la drop-zone, `onPaste` intercepte, appelle `/import/paste`, bascule direct en étape mappage. Test curl : 2 lignes collées → 3 colonnes détectées (nom, telephone, code_postal).

### Import — Enrichissement Recherche-Entreprises
- **Backend** `POST /api/import/{session_id}/enrich` : parcourt les lignes de la session, quand SIREN présent (ou dérivé du SIRET), appelle Recherche-Entreprises via `integrations.http_client.fetch_json` (rate-limité côté serveur), remplit **uniquement les champs vides**, marque chaque champ enrichi dans `_enriched_fields[]`. Ne bloque jamais l'import si l'API tombe.
- **Frontend** appel `enrich` en fire-and-forget après `preview` — toast d'information quand des lignes ont été enrichies.

### Travail en équipe — Item 1 : Messagerie contextuelle
- **Modèle** `messages` : `object_type` ∈ {establishment, order, document, tour, container, team}, `object_id`, `author_id`, `text` (2000 chars), `mentions[]`, `voice_transcript`, `photos[]` (3 max), `due_date`, `edited`, `read_by{}`. Cloisonnement `org_id` obligatoire.
- **Modèle** `message_actions` : chaque mention crée une action `pending` datée dans la boîte du destinataire.
- **Endpoints** :
  - `POST /api/messages` : cloisonne l'accès à l'objet (vérifie que `establishment.org_id == user.org_id`), crée actions pour chaque mention.
  - `GET /api/messages?object_type=X&object_id=Y` : fil chronologique plat.
  - `PATCH /api/messages/{mid}` : édition auteur seul, 15 min max, marque `edited=true`.
  - `POST /api/messages/{mid}/mark-read` : accusé sur mentions uniquement.
  - `GET /api/inbox` : mentions en attente + preview + auteur + due_date + `unread_count`.
- **Composant** `MessageThread.jsx` : fil chronologique intégré dans `Etablissement360.jsx` en bas de page. Édition inline, autocomplete `@Nom` depuis `/team/members`, échéance optionnelle. Mentions rendues en violet `#4A154B`. Aucune suppression du message d'un autre. Pas de canal généraliste — le fil vit sur l'objet.
- **Règles respectées** : aucune entrée sidebar, aucune saisie en plus, cloisonnement org strict, pas de surveillance. « Vu » uniquement sur mentions.

### Vérifications LIVE
- `POST /import/paste` : sépration TSV/CSV OK, session créée
- `POST /messages` : création OK avec cloisonnement établissement
- `GET /messages` : fil chronologique renvoyé
- `GET /inbox` : mentions pending + unread_count

### Reste à faire pour Travail en équipe
- Item 2 (Boîte de réception dans la barre du haut) : composant `InboxDropdown` à côté de la cloche
- Item 3 (Mentions → engagements datés visibles dans la tournée)
- Item 4 (Hors-ligne + file d'envoi via Dexie)
- Item 5 (Notifications 3 niveaux + plage silence)
- Item 6 (Message vocal via `MediaRecorder` + `/api/voice/transcribe`)
- Items 7-15 (Demandes/validations, portefeuilles, relais, planning équipe, revue hebdo, savoir partagé, recherche ⌘K, messages directs en dernier)

## Lot Travail équipe Items 2-3-6 + Import rejets + mémoire mapping (23/02/2026)

### Item 2 — Boîte de réception dans la barre du haut
- **Composant `InboxDropdown.jsx`** : bouton `Inbox` à côté de la cloche + badge `unread`. Panneau déroulant listant les mentions pending avec preview, échéance, lien vers l'objet source. Refresh 60 s. Click sur item → `POST /messages/{id}/mark-read` + navigation.
- Ajouté dans Layout.jsx desktop (près profil user) + mobile (barre haut).

### Item 3 — Mentions → engagements datés dans la tournée
- **Endpoint `GET /api/tour/engagements`** : mentions pending du user courant avec `due_date` ≤ 7 jours, enrichies avec nom d'établissement + ville + auteur.
- **Composant `EngagementsWidget.jsx`** intégré en haut de `/tournee` (rendu conditionnel : rien si 0 engagement). Chaque item : mention @auteur, échéance amber, preview 1 ligne, lien vers fiche, bouton « traité » (CheckCircle) qui `mark-read` et rafraîchit.

### Item 6 — Message vocal
- **Composant `MessageThread`** enrichi : bouton micro à côté de « Envoyer ». Click → `MediaRecorder` (getUserMedia audio), animation pulse rouge en cours d'enregistrement. Stop click ou auto 30 s → upload à `/api/voice/transcribe` (endpoint existant) → texte transcrit inséré dans la zone de saisie pour édition avant envoi (comme demandé par la spec : « modifiable avant envoi »). Perte d'accès au micro gérée avec toast d'erreur.

### Import — Fichier de rejets
- **Endpoint `GET /api/import/{batch_id}/rejects`** : génère un XLSX au format standard (12 colonnes : nom, siret, siren, telephone, email, adresse, code_postal, ville, contact, type, notes + `motif`) via openpyxl streaming. `Content-Disposition: attachment`.
- **UI** : bouton « Rejets » (icône Download) sur chaque ligne de l'historique. Le commercial corrige dans son propre outil et réimporte.

### Import — Mémoire de mapping
- **Collection `import_mappings`** : `{user_id, fingerprint, mapping, org_id, created_at, updated_at}`, unique par (user_id, fingerprint).
- **Endpoints** `GET /api/import/mapping/{fingerprint}` (retourne mapping ou `{mapping: null}`) et `POST /api/import/mapping/{fingerprint}` (upsert).
- **UI** : après `analyze`, appel automatique de `GET` — si mapping trouvé, il pré-remplit les colonnes avec source `user` + certainty 1.0 et affiche un toast « Mappage précédent restauré ». Après `preview` succès, appel `POST` pour persister le mapping courant.

### Vérifications LIVE
- `GET /tour/engagements` : `[]` (pas de mention pending pour manager)
- `POST /import/mapping/abc123` : `{"ok":true}`
- `GET /import/mapping/abc123` : `{"mapping":{"NOM":"nom","TEL":"telephone"},...}`

### Reste à faire pour Travail en équipe
- Item 4 : Hors-ligne + file d'envoi via Dexie
- Item 5 : Notifications 3 niveaux + plage silence 20h-8h
- Items 7-15 : Demandes/validations, portefeuilles, relais, planning équipe, revue hebdo composée, savoir partagé, recherche ⌘K, messages directs (dernier)


## Lot Travail en équipe — Items 4, 5, 7, 8, 12 (23/02/2026)

### Item 4 — Hors-ligne robuste (file d'envoi Dexie)
- `db.js` v4 : nouveau store `message_outbox` (id, at, object_type, object_id, payload, status, tries).
- **Horodatage capturé à la rédaction** (jamais réécrit à l'envoi). Champ `drafted_at` inséré dans le payload avant enqueue.
- `MessageThread.jsx` : envoi passe toujours par `enqueueMessage` puis `flushQueue()` non-bloquant. Fil affiche les messages `pending`/`failed` avec badge `⏳ En attente d'envoi` (icône `CloudOff` amber). Rechargement automatique via `CustomEvent bevid:message-delivered` quand un message quitte la file.
- `syncQueue.js` : nouvelle fonction `flushMessageOutbox` incorporée dans `flushQueue`. Retry auto au retour réseau + 60s interval, jamais perdu même app fermée.
- `pendingCount` inclut désormais les 3 files (mutations + voix + messages).

### Item 5 — Notifications 3 niveaux + plage silence
- **3 niveaux configurables par utilisateur** (`GET/PUT /api/notifications/preferences`) :
  - `mentions_immediate` : @user → notif temps réel (hors silence)
  - `digest_owned_objects` : résumé 2×/jour (8h + 14h) sur activité de mes objets
  - `inbox_only_rest` : le reste → inbox seulement, jamais de push
- **Plage silence obligatoire par défaut** : 20h → 8h + dimanche entier. Personnalisable (`silence_start`, `silence_end`, `silence_sundays`). Fenêtre traversant minuit gérée. Fuseau Paris DST calculé sans pytz.
- **Notification queue** : `notification_queue` collection. Si silence actif → différée avec `deliver_at` = prochain 8h non-dimanche.
- **Cron `notifications-flush`** toutes les 30 min : distribue les notifs différées dont `deliver_at ≤ now`.
- **Push navigateur opt-in** : `POST /api/notifications/push-subscribe` persiste subscription. `_try_send_push` utilise `pywebpush` si `VAPID_PRIVATE_KEY` env présent, sinon simulé silencieux (log info uniquement).
- **Digest 2×/jour** : `POST /api/cron/digest-morning` (8h, depuis 14h veille) + `POST /api/cron/digest-afternoon` (14h, depuis 8h même jour). Agrège commandes/messages nouveaux sur les clients dont je suis assigned_to/owner_id.
- **Hook mention** : `_dispatch_mention_notifs(msg)` appelé après création d'un message avec `mentions`. Respecte les prefs individuelles + silence.
- **UI** : `NotificationSettings.jsx` intégré dans `/profile` sous le bloc rappels courriel. Toggles 3 niveaux, sliders temps silence, checkbox dimanche, bouton opt-in push (`subscribePush` → VAPID sinon simulé).

### Item 7 — Demandes/validations généralisées
- **Collection `approval_requests`** (db_raw, filtre org_id explicite).
- **6 types** : `remise`, `avoir`, `prix_negocie`, `delai_paiement`, `derogation`, `autre`. Context libre (establishment_id, order_id, pct, amount, days…).
- **Endpoints** :
  - `POST /api/approvals` : commercial crée → manager par défaut approver → message + mention dans l'inbox du manager → push immédiat.
  - `GET /api/approvals?status=pending|approved|rejected&mine=true|false` : manager voit tout, commercial voit ses demandes + celles où il est approver.
  - `PATCH /api/approvals/{aid}` : manager approuve/refuse → mention au demandeur en retour.
- **Cron `approval-reminders`** 2×/jour (9h + 15h) : rappelle le manager sur toute demande pending > 24h non déjà relancée (`reminded_at` marque idempotent).
- **UI `/approvals`** : filtres (pending/approved/rejected/tous), badge statut coloré, actions ✓/✗ inline pour manager avec zone réponse optionnelle. Modal création avec 3 champs numériques (pct/amount/days) + motif obligatoire + lien optionnel fiche client.

### Item 8 — Portefeuilles commerciaux
- **Endpoints (manager/gerant/owner only)** :
  - `GET /api/portfolios` : liste par commercial (nb clients + nb commandes 30j) + `unassigned_count`.
  - `GET /api/portfolios/user/{uid}` : détail clients d'un commercial.
  - `GET /api/portfolios/unassigned` : file des clients sans commercial attribué.
  - `POST /api/portfolios/reassign` : `{client_ids, to_user_id}`, cap 500 par lot, audit log inséré (`kind=portfolio_reassign`).
- **UI `/portefeuilles`** : grille commerciaux (nb clients + commandes 30j), fiche détail au clic, file non-attribués avec cases à cocher + dropdown cible + bouton « Attribuer (N) ». Sélection multi persistante entre listes (unassigned + détail).
- Ajouté dans nav sidebar section Administration (`feature: manager_only`).

### Item 12 — Revue hebdo composée
- **Endpoints** :
  - `GET /api/weekly-review/me` : renvoie le brouillon de la semaine courante (lundi calendaire Paris). Génère à la volée si inexistant.
  - `PATCH /api/weekly-review/{wid}` : 2 champs libres (`notes`, `focus_next`). Auteur ou manager uniquement.
- **Cron `weekly-review-monday`** lundi 7h : compose un brouillon pour chaque commercial actif (idempotent).
- **KPIs composés** depuis la semaine passée (J-7 → J-1) : commandes, visites, mentions, engagements ouverts.
- **UI `WeeklyReviewCard.jsx`** : affiché en haut de `/tournee` uniquement le lundi. Repliable. 4 KPIs en grille + 2 textarea + bouton Enregistrer.

### Nouveaux fichiers
- `/app/backend/tests/test_iter40_teamwork_items.py` — 11 tests pytest verts (defaults, silence window, push, approvals workflow, portfolios manager-only, weekly review, cron endpoints).
- `/app/frontend/src/lib/push.js` — helper Web Push (subscribe/unsubscribe/pushSupported), retombe en simulé si `REACT_APP_VAPID_PUBLIC_KEY` absent.
- `/app/frontend/src/components/NotificationSettings.jsx` — bloc réglages 3 niveaux + silence + push.
- `/app/frontend/src/components/WeeklyReviewCard.jsx` — affichage revue lundi.
- `/app/frontend/src/pages/Portefeuilles.jsx` — vue équipe manager.
- `/app/frontend/src/pages/Approvals.jsx` — inbox validations.

### Preuves runtime (curl, 23 août 2026)
- `GET /notifications/preferences` : `{mentions_immediate:true, silence_start:"20:00", silence_end:"08:00", silence_sundays:true, push_enabled:false}`
- `PUT /notifications/preferences {silence_start:"22:00"}` : silence_start=22:00 persisté
- `POST /approvals {kind:"remise", reason:"…", context:{pct:15}}` : status=pending, message + mention créés, push simulé
- `GET /portfolios` (manager) : 2 commerciaux, 4 clients pour le démo
- `GET /weekly-review/me` (manager) : brouillon auto généré, KPIs {orders:3, visits:0, mentions:0, engagements_open:4}
- `POST /cron/digest-morning` : `{"users_notified":1}`
- `POST /cron/weekly-review-monday` : `{"drafts_created":35}`
- **pytest** : 11/11 verts (4.3 s)

### Cron ajoutés à `.emergent/crons.yml`
- `notifications-flush` : `*/30 * * * *` (toutes 30 min)
- `digest-morning` : `0 8 * * *`
- `digest-afternoon` : `0 14 * * *`
- `approval-reminders` : `0 9,15 * * *`
- `weekly-review-monday` : `0 7 * * 1`


## Lot Travail en équipe · Item 8bis — Équilibrage charge portefeuille (23/02/2026)

### Backend (append `_analyze_workload` dans `/api/portfolios`)
- `workload_score` = `clients_count` (charge statique lisible sans context supplémentaire).
- **Médiane** calculée sur les commerciaux avec ≥ 1 client (les nouveaux à 0 ne biaisent pas).
- **Overload threshold** = `max(médiane × 1.5, médiane + 3)` — évite les faux positifs quand la médiane est basse.
- **Underload threshold** = `médiane × 0.7` (capacité restante).
- **Suggestions** algorithme greedy : pour chaque surchargé, cible le moins chargé avec capacité, `move_count = min(excès/2 + 1, capacité, cap dur 10)`.
- Retourne `{median, overload_threshold, underload_threshold, overloaded_ids, underloaded_ids, suggestions[]}`.
- **Endpoint `POST /api/portfolios/apply-suggestion`** — 1 clic : réattribue les N clients les plus récents du source vers la cible. Audit log inséré (`kind=portfolio_reassign_suggestion`).

### Frontend `Portefeuilles.jsx`
- Nouveau bandeau **« Charge d'équipe »** en tête : médiane, seuil, liste des suggestions avec bouton « Appliquer » (icône `Sparkles`).
- **Heatmap** : chaque carte commercial reçoit un `bg` teinté selon la charge — bleu (capacité), vert (équilibré), ambre (au-dessus), rouge (surchargé). Barre horizontale de 4-100% de la charge maximale visible.
- Icône `AlertTriangle` sur les cartes surchargées + label texte sous la barre.
- Légende accessible en tête de section (aria-label).

### Tests (2 nouveaux)
- `test_portfolios_workload_analysis` : shape complète du champ `workload` dans /portfolios.
- `test_workload_analysis_helper` : scénario contrôlé Alice=30/Bob=1/Charlie=10/David=10 → suggestion Alice→Bob avec `move_count > 0`.
- `test_apply_workload_suggestion_authz` : commercial → 403.

Tests suite complète : **14/14 pytest verts**.


## Lot Fiabilité PWA (23/02/2026) — prioritaire, avant Travail équipe

### 1. Stockage persistant (priorité 1)
- **`lib/pwa.js`** : `requestPersistentStorage()`, `isPersistentStorage()`, `estimateQuota()`, `purgeIfQuotaHigh()`, `pwaDiagnostics()`.
- **Enchaîné dans `AuthContext.login`/`register`** — appel non bloquant après connexion. Sur iOS, `persist()` refuse tant que la permission notification n'est pas accordée : l'UI `/pwa-status` guide l'enchaînement.
- **Purge défensive à 80 % du quota** : supprime les `voice_recordings` déjà synchronisés + les `tour_briefs` datant de >7 jours. **File d'envoi (`sync_queue` pending + `message_outbox` pending) INTOUCHABLE** — c'est du travail non enregistré.

### 2. Notifications terminées (VAPID auto-gen)
- **`_ensure_vapid_keys()`** au démarrage : génère paire VAPID via `py_vapid` + `cryptography`, persiste dans `db.system_settings.key='vapid_keys'`. Idempotent. Zéro clé à demander à l'utilisateur.
- **`GET /api/notifications/vapid-public-key`** : endpoint public retournant la clé publique base64url pour `pushManager.subscribe`.
- **`POST /api/notifications/test-push`** : envoi test au user courant, ignore silence (déclenchement manuel).
- **`_try_send_push` surchargée** : prend en compte les clés DB si les env `VAPID_PRIVATE_KEY` sont absentes. Priorité env > DB.
- **`lib/push.js` refondu** : `subscribePush()` fetch la clé publique dynamiquement, réutilise l'abonnement navigateur existant, retombe en mode simulé si serveur sans VAPID.
- **Désabonnement à la déconnexion** : `AuthContext.logout` appelle `unsubscribePush()` avant de purger la session → l'ancien appareil ne reçoit plus les notifs.

### 3. Manifest — shortcuts + screenshots
- **3 raccourcis** appui long sur l'icône : `/tournee` (Ma tournée), `/visit` (Nouvelle visite), `/scan` (Scanner).
- **2 screenshots** au format `narrow` pour la fenêtre d'installation Android.
- `orientation: "portrait"` conservé (adapté à la cible mobile — à évaluer si tablette devient un vrai cas d'usage).

### 4. Rappel d'installation
- **`PwaInstallBanner.jsx`** monté globalement dans `App.js`. S'affiche uniquement si `!isStandalone()` && `!installDismissed()`. Android/Chrome/Edge : bouton natif via `beforeinstallprompt`. iOS : instructions manuelles Partager → Sur l'écran d'accueil.
- Persistance de refus dans `localStorage.bevid_install_dismissed`.

### 5. Écran de diagnostic `/pwa-status`
- **6 lignes lecture seule** avec pastille verte/rouge/grise :
  - Application installée
  - Stockage persistant accordé
  - Notifications (Accordées / Refusées / Non demandées)
  - Espace utilisé sur quota (Mo / Mo · %)
  - Date du dernier instantané hors-ligne
  - Nombre d'éléments en attente de synchronisation (dont messages)
- **4 actions** : Demander le stockage persistant · Activer les notifications · Envoyer notification de test · Nettoyer les anciens instantanés (préserve la file).
- Rafraîchissement automatique toutes les 30 s.
- Accessible via nav sidebar section Administration (icône `Smartphone`).

### Preuves runtime (23 août 2026)
- `GET /api/notifications/vapid-public-key` : `{"public_key":"BP_UCARSE8xZM7F2ORkC1EwaxKjriWws0ttCs3mAiQDUg8VdUuviMKKle_qwr_VaR92aBQ69UdKnTkaSOTgA5PY"}` — clé bien générée en base
- `POST /api/notifications/test-push` (sans subscription) : `{"ok":false,"reason":"push_disabled"}` — comportement attendu
- pywebpush 2.4.0 + py-vapid 1.9.4 ajoutés à requirements.txt

### Scénario critique (à valider par l'utilisateur sur un vrai iPhone)
Installer via Partager → Sur l'écran d'accueil, se connecter, activer notifications + persist, couper le réseau, saisir une visite, fermer l'app, rouvrir hors réseau → **la visite doit être là et partir à la reconnexion**. La file `message_outbox` + `sync_queue` (Dexie IndexedDB) survit dès que le stockage persistant est accordé.


## Lot Fiabilité PWA — Compléments (23/02/2026 · soir)

### Storage Quota Warning — bandeau discret dans /settings
- **`StorageQuotaBanner.jsx`** monté en tête de `SettingsPage`.
- Affiché uniquement si `persistent_storage=false`.
- Message contextuel selon la cause (app non installée / notifications refusées / persist refusé).
- Clic → redirige vers `/pwa-status` où l'utilisateur peut agir.
- Auto-caché quand persist est accordé — ne pollue pas les Réglages en usage nominal.

### Screenshots réels du manifest
- 3 captures mobile 390×844 (iPhone 14 narrow) prises depuis le preview :
  - `/screenshot-tournee.png` — Ma tournée avec portefeuille et prédictions de rupture
  - `/screenshot-clients.png` — Liste clients & filtres
  - `/screenshot-etablissement.png` — Fiche client 360°
- `manifest.json` mis à jour avec ces 3 entrées `form_factor: narrow` — améliore la fenêtre d'installation Android.

### Runbook `/app/PWA_MOBILE_TEST.md`
- Documente le scénario critique iPhone en 6 étapes (install → connexion → permissions → mode avion → visite → fermeture → réouverture hors réseau → sync).
- Fournit un mode d'emploi de dépannage à distance via `/pwa-status` (6 lignes de diagnostic).

**Statut** : reste à valider par l'utilisateur sur un vrai iPhone (le scénario complet ne peut pas être scripté depuis le serveur).
