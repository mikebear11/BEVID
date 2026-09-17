# N4 (capacités natives) → N8 — livraison du 17 septembre 2026

## N4 — Capacités natives derrière l'interface commune (`frontend/src/lib/nativeFeatures.js`, web inchangé)
| Capacité | Natif (Capacitor 7) | Repli web | Branché dans |
|---|---|---|---|
| Dictée FR | `@capacitor-community/speech-recognition` (`fr-FR`, résultats partiels) | Web Speech API existante (`useVoice`), sinon transcription serveur | `MobileVisit` : même bouton micro, même champ (`?voice=1` lance la dictée) |
| Photo | `@capacitor/camera` (JPEG q60, 640 px, orientation corrigée) | `<input capture>` + compression canvas (M2/M4) | `nativePhoto()` prêt, appelé si natif |
| Scan QR / code-barres | `@capacitor-mlkit/barcode-scanning` + **lampe** (`enableTorch`) | html5-qrcode (`/scan`) | `nativeScan()` |
| PDF (bon de commande, facture, BL) | `@capacitor/filesystem` (cache) + `@capacitor/share` (feuille native) | ouverture du blob | `sharePdf(blob, nom)` |
| Haptique | `@capacitor/haptics` (succès / erreur / léger) | no-op | enregistrement visite et commande |
| Push | `@capacitor/push-notifications` : permission demandée **après la 1re visite enregistrée** (pas au démarrage), jeton → `POST /api/me/devices` (préférences par type : relances, commandes, impayés, équipe), toucher → route `data.route`. **Sans `google-services.json` / clé APNs : `registrationError` silencieux.** | Web Push existant | `NativeBoot` |
| Liens profonds | `appUrlOpen` → React Router ; `frontend/public/.well-known/assetlinks.json` (`<SHA256…>` à renseigner) et `apple-app-site-association` (`<TEAM_ID…>`) ; `App.entitlements` (applinks + webcredentials + aps) ; `intent-filter autoVerify` Android | — | activation, invitation, réinitialisation, signature, paiement, suivi, fiche |
Preuve : `GET /.well-known/assetlinks.json` → 200 `application/json` ; `apple-app-site-association` → 200 (`octet-stream` en dev ; `application/json` à forcer côté Nginx prod, BLOCAGES § 11).

## N5 — Conformité (`memory/mobile/N5_CONFORMITE.md`)
- **Suppression de compte** : `DELETE /api/me/account` + carte dans Mon profil. **Preuve** : mauvais mot de passe → 403 ; suppression → `{"ok":true}` ; utilisateur anonymisé (`deleted-f696a394@anonyme.invalid`, « Compte supprimé », `active false`, `deleted_at`), ancien e-mail absent, **refresh tokens révoqués 1/1** ; propriétaire avec d'autres membres → **409** (transfert requis), manager intact.
- iOS natif : aucune entrée/bandeau/route d'abonnement (message neutre) ; lien de paiement factures conservé (bien physique). Pas d'inscription en natif (`/register` → `/login`).
- `PrivacyInfo.xcprivacy`, textes d'autorisation FR/EN (iOS `InfoPlist.strings`, Android `strings_permissions.xml`), brouillons App Privacy / Sécurité des données, comptes démo (BLOCAGES § 9).

## N6 — `GET /api/app/version` + écran mise à jour (`NativeBoot`), Sentry serveur sur `SENTRY_DSN` (sans PII), mesure du démarrage à froid (`cold_start_ms` → télémétrie).

## N7 — `.github/workflows/native-builds.yml` (Android x86_64 : APK debug + AAB signé si secrets ; iOS macOS : build non signé ou archive App Store Connect si secrets), `signingConfigs.release` Gradle, `exportOptions.plist`, procédure de sortie de version (`N7_CI_RELEASE.md`).

## N8 — Fiches FR/EN (nom, sous-titre, descriptions, mots-clés, catégorie), notes de revue Apple (`N8_FICHES_STORE.md`). **Captures aux formats boutiques non générées** (budget de session) — script à écrire `scripts/native/store-screenshots.py`.

## Porte QA web : voir résultat en fin de `qa-reports/latest.md` (relancée après ces changements).
