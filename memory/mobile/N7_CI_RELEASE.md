# N7 — Compilation cloud et procédure de sortie de version (16 septembre 2026)

## Workflow GitHub Actions : `.github/workflows/native-builds.yml`
- **Android** sur `ubuntu-latest` (x86_64 → débloque AAPT2) : Node 22, Temurin 21, SDK Android ; `yarn build` → `cap sync android` → **APK debug** toujours ; **AAB release signé** si les secrets `ANDROID_KEYSTORE_B64 / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD` existent (`signingConfigs.release` lit `gradle.properties`, le debug reste inchangé).
- **iOS** sur `macos-15` : `cap sync ios`, `pod install`, `xcodebuild` **sans signature** si secrets absents (vérifie que le projet compile), **archive + export App Store Connect** (`.github/exportOptions.plist`) si `IOS_P12_B64 / IOS_P12_PASSWORD / APPLE_TEAM_ID` existent.
- Déclenchement : `workflow_dispatch` (version saisie) ou tag `v*`. Artefacts : `bevid-android` (apk/aab), `bevid-ios` (ipa).
- Prérequis : connecter le dépôt à GitHub (« Save to GitHub » côté Emergent) et renseigner les secrets — BLOCAGES § 5 et § 10.

## Procédure de sortie de version
1. `REACT_APP_VERSION` = `X.Y.Z` ; mettre à jour `versionName`/`versionCode` (`frontend/android/app/build.gradle`) et `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` (Xcode) ; `APP_LATEST_VERSION` côté backend (et `APP_MIN_VERSION` seulement pour une mise à jour obligatoire — écran `NativeBoot`).
2. Porte QA web verte (`python3 scripts/qa/run.py`), Republish backend/frontend web **avant** les binaires (l'app native consomme la même API).
3. Tag `vX.Y.Z` → workflow → artefacts. Android : Play Console → Tests internes → Production progressive (10 % → 100 %). iOS : App Store Connect → TestFlight (testeurs internes) → soumission avec les notes de revue (N8).
4. Vérifier après publication : `/.well-known/*` (empreinte/Team ID), push reçu sur un appareil, lien d'activation ouvre l'app, `/app/version` cohérent.
5. Rollback : Play → arrêter le déploiement progressif ; iOS → retirer de la vente / soumettre un correctif ; côté serveur, relever `APP_MIN_VERSION` uniquement en dernier recours.

## N6 — livré
- `GET /api/app/version` (min/latest/URLs stores/message par variables d'environnement) + écran « Mise à jour requise / disponible » (`NativeBoot`).
- Sentry serveur prêt : `SENTRY_DSN` → `sentry_sdk.init(send_default_pii=False)` ; absent → désactivé. Côté app : pas de SDK embarqué (budget bundle de la porte QA) ; les erreurs natives passent par `POST /api/telemetry/errors` existant.
- Démarrage à froid : `performance.now()` au premier rendu natif envoyé à `/api/telemetry/errors` (`kind: cold_start_ms`, sans donnée client).
