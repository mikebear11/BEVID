# BLOCAGES — éléments hors de portée du code

## 1. Clickjacking en production (X-Frame-Options / CSP frame-ancestors) — TICKET EMERGENT À ENVOYER

**Contexte** : une CSP en balise `<meta>` ne protège pas du clickjacking (`frame-ancestors` est ignorée en meta, elle n'agit qu'en en-tête HTTP). Le Nginx du conteneur de production est un template Emergent scellé, non versionné dans `/app`.

**Contournement de transition livré (M1-F)** : script anti-cadre exécuté avant tout rendu dans `frontend/public/index.html` (page masquée + sortie du cadre) ; formulaires Connexion / Inscription / Mot de passe oublié / Réinitialisation remplacés par un écran « Ouvrez BEVID directement » quand la page est encadrée (`lib/frameGuard.js`, `components/FramedBlock.jsx`).

**Texte du ticket, prêt à copier (support Emergent)** :

> Objet : Ajout d'en-têtes de sécurité HTTP sur l'app publiée www.bevid-crm.com
>
> Bonjour,
> Notre application publiée (www.bevid-crm.com, projet « drink-sales-hub-8 ») sert le frontend statique via le Nginx du conteneur de production, que nous ne pouvons pas configurer depuis le dépôt. Nous avons besoin que les en-têtes suivants soient ajoutés à **toutes les réponses HTML et statiques** du frontend (pas aux routes `/api/*`, déjà gérées par notre backend FastAPI) :
>
> ```
> X-Frame-Options: DENY
> Content-Security-Policy: frame-ancestors 'none'
> X-Content-Type-Options: nosniff
> Referrer-Policy: strict-origin-when-cross-origin
> Permissions-Policy: camera=(self), microphone=(self), geolocation=(self)
> ```
>
> Motif : la protection anti-clickjacking (`frame-ancestors`) n'est effective qu'en en-tête HTTP ; notre balise `<meta http-equiv>` ne suffit pas. Application concernée : formulaires de connexion et de paiement.
> Pouvez-vous soit appliquer ces en-têtes côté plateforme, soit nous indiquer le fichier de configuration Nginx à versionner dans le dépôt pour qu'il soit embarqué au Republish ?
> Merci.

**Statut** : en attente d'action du client (envoi du ticket).

## 2. Republication production
Le bundle `main.505b4ed4.js` est toujours servi sur www.bevid-crm.com. Rien de la refonte mobile n'est visible avant Republish (Secrets à vérifier : `BEVID_ENV=production`, `REACT_APP_BACKEND_URL`, `CORS_ORIGINS`, `OWNER_EMAILS`). La migration clients legacy → établissements s'exécute automatiquement au premier démarrage du nouveau conteneur et se journalise dans `migration_journal` (`GET /api/admin/legacy/migration-journal`).

## 3. Plan applications iPhone / Android (N0–N8) — non commencé (16/09, 17 h)
La nuit a été consacrée à M1→M4 (+ onglet Ventes de M5). La prise de commande mobile (M5) reste à livrer avant d'attaquer Capacitor. Rien ne bloque côté environnement pour N0–N8 hors comptes du client (Apple Developer, Google Play Console, Firebase/APNs) — à lister dès N0.

## 4. Photos en base (transition)
Photos de devanture (`facade_photo`) et de visite (`photo`) stockées en miniature JPEG ≤ 100 Ko (data URL) dans MongoDB pour tenir le hors-ligne sans dépendance. À basculer vers le stockage objet Emergent (playbook `integration_expert`) dès qu'un lot le prévoit — le champ reste une URL, la bascule est transparente pour l'UI.

## 5. Applications iPhone / Android — démarches du CLIENT, dans l'ordre (N0, 16/09)
1. **Numéro D-U-N-S** (gratuit, 5–10 jours) : https://developer.apple.com/enroll/duns-lookup/ — requis pour l'inscription Apple en tant qu'organisation (SULAUZE / BEVID).
2. **Apple Developer Program** (99 $/an) : https://developer.apple.com/programs/enroll/ — avec le D-U-N-S ; identifiant d'app proposé `fr.bevidcrm.app`. Puis créer une **clé APNs** (Certificates → Keys → Apple Push Notifications service) et nous transmettre `Key ID`, `Team ID` et le fichier `.p8`.
3. **Google Play Console** (25 $ une fois) : https://play.google.com/console/signup — compte organisation ; valider l'identité (pièce d'identité + justificatif d'entreprise, 2–5 jours). Nous transmettre l'accès « Administrateur » ou créer le compte de service pour la publication.
4. **Projet Firebase** (gratuit) : https://console.firebase.google.com — ajouter une app Android `fr.bevidcrm.app` et une app iOS ; nous transmettre `google-services.json` (Android) et `GoogleService-Info.plist` (iOS) ; dans Cloud Messaging, téléverser la clé APNs de l'étape 2.
5. **Service de compilation iOS** (pas de Mac chez nous) : soit un Mac avec Xcode 16 chez le client, soit un compte **Codemagic** (gratuit 500 min/mois) ou **Ionic Appflow** ; nous transmettre l'accès. Android se compile ici (APK debug) ; la **clé de signature release** (`keystore`) est à générer par le client ou par nous puis à lui remettre — décision qui engage le client.
6. **Fiches store** : nom, description, captures 6,7"/6,5"/5,5" (iOS) et téléphone/tablette (Android), politique de confidentialité publique (`/legal/politique-confidentialite` existe), formulaire « Sécurité des données » Play, « App Privacy » Apple, URL de **suppression de compte** (obligatoire Apple 5.1.1(v) et Play) → à exposer côté web (`/profile` → supprimer mon compte).
Rien de tout cela n'empêche N1–N4 (code) d'avancer.

## 6. Capacitor 7 (Node 20) — note de version
L'environnement est en Node 20.20 ; Capacitor 8 exige Node ≥ 22. Le projet natif est monté en **Capacitor 7** (plugins @7). La montée en Capacitor 8 se fera lors du passage de l'image de build en Node 22 (aucune incidence fonctionnelle d'ici là).

## 7. Identifiant d'application à réserver (définitif une fois publié)
**`com.bevidcrm.app`** (domaine bevid-crm.com) — posé dans `capacitor.config.json`, `android/app/build.gradle` (`applicationId` + `namespace`) et le projet Xcode (`PRODUCT_BUNDLE_IDENTIFIER`). À réserver tel quel : App ID dans Apple Developer (étape 2 § 5) et nom de package dans Play Console (étape 3 § 5). L'ancien `fr.bevidcrm.app` n'a jamais été publié : aucun impact.

## 8. Compilation APK dans cet environnement — bloquée par l'architecture (ARM64)
Chaîne installée et validée : Temurin **JDK 21** (`/root/jdk21`), Android SDK 35 + build-tools 35 (`/root/android-sdk`), Gradle 8.11 (dépendances résolues, plugins Capacitor compilés). Échec à l'étape `processDebugResources` : **AAPT2 fourni par Google est x86_64 uniquement** (« AAPT2 Daemon startup failed ») ; le conteneur est **aarch64**. Contournements possibles : (a) compiler sur une machine x86_64 ou un service CI (Codemagic / GitHub Actions `ubuntu-latest`) avec `scripts/native/build-android-debug.sh` — c'est la voie recommandée et déjà nécessaire pour iOS ; (b) fournir un binaire `aapt2` aarch64 via `android.aapt2FromMavenOverride` (sources communautaires, non retenu sans validation du client). Rien à corriger dans le code : le projet `frontend/android/` est prêt.
Note : `/root/jdk21` et `/root/android-sdk` sont hors `/app` et disparaissent au redémarrage du pod (réinstallation documentée dans le script).

## 9. Comptes de démonstration pour la revue Apple / Google (données fictives uniquement)
- Commercial : `commercial.demo@bevidcrm.fr` / `Commercial!2026Demo`
- Manager : `manager.demo@bevidcrm.fr` / `Manager!2026Demo`
Ces comptes existent sur le preview ; à recréer sur la production (org dédiée « BEVID Démo Revue ») après Republish. Ne jamais y mettre de vraie donnée.

## 10. Variables à renseigner quand les comptes existent
`APPLE_TEAM_ID` (AASA), `ANDROID_CERT_SHA256` (assetlinks, empreinte du keystore release), `APP_STORE_URL`, `PLAY_STORE_URL`, `APP_MIN_VERSION`, `APP_LATEST_VERSION`, `SENTRY_DSN` (optionnel, sans PII), secrets GitHub `ANDROID_KEYSTORE_B64/PASSWORD/KEY_ALIAS/KEY_PASSWORD`, `IOS_P12_B64/IOS_P12_PASSWORD`, `APPLE_TEAM_ID`. Fichiers : `google-services.json` → `frontend/android/app/`, `GoogleService-Info.plist` → `frontend/ios/App/App/`.

## 11. Liens universels — `Content-Type` de `apple-app-site-association` en production
Les fichiers `/.well-known/assetlinks.json` et `/.well-known/apple-app-site-association` sont servis en statique par le frontend (l'ingress n'envoie que `/api` au backend). Sans extension, Nginx sert `apple-app-site-association` en `application/octet-stream` : Apple l'accepte mais recommande `application/json`. À ajouter au ticket Emergent § 1 : `location = /.well-known/apple-app-site-association { default_type application/json; }`. Empreinte SHA-256 et Team ID à remplacer dans `frontend/public/.well-known/*` dès les comptes créés (§ 10).
