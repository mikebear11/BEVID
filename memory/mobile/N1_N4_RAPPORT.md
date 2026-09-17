# N1 → N4 — Intégration Capacitor, adaptations WebView, auth native, hors ligne SQLite (16 septembre 2026)

## N1 — Intégration Capacitor 7
- `frontend/capacitor.config.json` : `appId fr.bevidcrm.app`, `appName BEVID`, `webDir build`, `androidScheme https`, splash violet BEVID, barre d'état claire, SQLite configuré.
- Projets natifs générés et versionnés : `frontend/android/` (Gradle, `AndroidManifest.xml` complété) et `frontend/ios/App/` (Xcode, `Info.plist` complété).
- Plugins @7 : `core, cli, android, ios, app, geolocation, camera, network, preferences, splash-screen, status-bar, browser, @capacitor-community/sqlite`.
- Script `scripts/native/build-android-debug.sh` : build web → `cap sync` → `assembleDebug`.
- Capacitor 8 exigerait Node ≥ 22 (BLOCAGES § 6).

## N2 — Adaptations WebView
- Service worker **non enregistré** dans l'app native (`index.html`) : le bundle est embarqué, pas de cache double.
- URL API absolue via `REACT_APP_BACKEND_URL` (inchangé) ; `androidScheme: https` évite le mixed-content.
- Bouton retour matériel Android → `history.back()` ou sortie de l'app ; barre d'état ; splash masqué au premier rendu ; événements réseau natifs relayés en `online/offline` (la file de synchro existante les écoute déjà) ; classes `native`, `native-ios/android` sur `<html>` pour les safe-areas.
- Liens externes (Stripe, itinéraires) : `openExternal()` → navigateur système (`@capacitor/browser`).
- Permissions déclarées **au premier plan uniquement** : Android `ACCESS_COARSE/FINE_LOCATION`, `CAMERA`, `RECORD_AUDIO`, `ACCESS_NETWORK_STATE` — **aucune permission de localisation en arrière-plan** ; iOS `NSLocationWhenInUseUsageDescription` (texte explicite « aucun suivi en arrière-plan »), caméra, micro, reconnaissance vocale, photos. Pas de `NSLocationAlwaysUsageDescription`.
- Géolocalisation : `getPosition()` (lib/mobile.js) bascule sur le plugin natif quand l'app tourne en natif, permission « pendant l'utilisation » seulement.

## N3 — Authentification native
- Constat : le cookie de session HttpOnly `SameSite=lax` n'est pas envoyé depuis `capacitor://localhost` / `https://localhost`.
- Solution sans toucher au backend (qui accepte déjà `Authorization: Bearer`) : à la connexion / inscription, le `token` renvoyé est stocké dans `@capacitor/preferences` (stockage privé de l'app), injecté par un intercepteur axios (`setNativeToken`), rechargé avant `/auth/me` au démarrage, effacé à la déconnexion. Sur le web : strictement rien ne change (cookie seul, jeton jamais stocké).

## N4 — Hors ligne SQLite
- `lib/nativeStore.js` : miroir SQLite durable de la **file de synchro** et de l'**index clients** (Dexie reste la source de vérité et le chemin web). Écriture miroir à chaque `enqueueMutation`, à chaque statut « synced » et à chaque rafraîchissement de la liste établissements ; **restauration automatique au démarrage** si IndexedDB a été purgé par iOS (7 jours sans usage).
- Repli : si SQLite est indisponible, tout continue sur Dexie.

## Compilation
- Web : `yarn build` OK (bundle embarqué par `cap sync`).
- Android : JDK 17 + SDK (platform 35, build-tools 35) installés dans l'environnement ; APK debug → voir résultat en fin de fichier.
- iOS : projet prêt ; compilation impossible ici (Xcode). Voir BLOCAGES § 5.

## Non couvert (N5–N8)
Push natif (APNs/FCM), dictée native, liens universels, icônes/splash définitifs, fiches store, signature release, TestFlight/Play — dépendent des comptes du client (BLOCAGES § 5).

## Correctifs post-relecture (17 h 45) — N2 authentification native complète
### Stockage des jetons : Trousseau iOS / Keystore Android
- `@capacitor/preferences` **n'est plus utilisé pour les jetons** (il ne sert qu'au drapeau non secret « verrou biométrique activé »).
- `@aparajita/capacitor-secure-storage` (Capacitor 7) : Keychain (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, exclu des sauvegardes) / Android Keystore (AES-GCM). Code d'écriture (`frontend/src/lib/native.js`) :
```js
export async function saveTokens({ token, refresh_token }) {
  if (!isNative()) return;
  const s = await secure();                       // @aparajita/capacitor-secure-storage
  if (token) await s.set(ACCESS_KEY, token, true);          // true = sync iCloud désactivé, this-device-only
  if (refresh_token) await s.set(REFRESH_KEY, refresh_token, true);
}
```
### Jetons courts + rafraîchissement rotatif + révocation serveur (backend, sans casser le web)
- Le client natif s'annonce par l'en-tête `X-BEVID-Client: native`. **Login natif** → `token` (accès **30 min**) + `refresh_token` (**30 j**, stocké haché SHA-256 dans `refresh_tokens`, avec famille, UA, IP) ; **aucun cookie**. **Login web** → inchangé (cookie HttpOnly 90 j, pas de refresh).
- `POST /auth/refresh` : **rotation** (l'ancien est révoqué, un nouveau est émis dans la même famille) ; **réutilisation d'un refresh révoqué → toute la famille est révoquée** (vol de jeton).
- **Révocation** : `POST /auth/logout` (refresh fourni ou compte du Bearer), **changement de mot de passe** (4 chemins : change-password, reset par lien, reset par code, reset admin), **désactivation du compte** (`PUT /admin/users/{uid}` `active: false`), compte désactivé détecté au refresh.
- Frontend : intercepteur axios — 401 en natif → **un seul** rafraîchissement partagé puis rejeu ; échec → événement `bevid:session-revoked` → retour à l'écran de connexion. **Session conservée hors ligne** : `/auth/me` en échec réseau → utilisateur mis en cache (existant), jetons toujours en Keychain, refresh au retour du réseau.
- **Déverrouillage biométrique optionnel** : `@aparajita/capacitor-biometric-auth` (Face ID / Touch ID / empreinte, repli code appareil) demandé au démarrage si le drapeau est activé ; `NSFaceIDUsageDescription` et `USE_BIOMETRIC` déclarés.
- CORS : `capacitor://localhost` et `https://localhost` ajoutés aux origines (preuve : `access-control-allow-origin: capacitor://localhost`).

### Test de révocation (curl, preview, 17 h 43)
| Étape | Résultat |
|---|---|
| Login natif | `expires_in 1800`, JWT exp = +30 min, `refresh_token` présent, **pas de cookie BEVID** |
| `/auth/me` avec l'accès court | 200 |
| `/auth/refresh` | nouveau couple, refresh **différent** (rotation) |
| Rejeu de l'ancien refresh | `401 Session révoquée` + **famille entière révoquée** |
| Nouveau refresh (après réutilisation détectée) | `401 Session révoquée` |
| Nouvelle session → `/auth/logout` → refresh | `401 Session révoquée` |
| Login web (sans en-tête natif) | cookie posé, `refresh_token` absent → web inchangé |

### Identifiant d'application
`com.bevidcrm.app` partout (`capacitor.config.json`, `applicationId`/`namespace` Gradle, `PRODUCT_BUNDLE_IDENTIFIER` Xcode ×2, package Java `com/bevidcrm/app/MainActivity.java`). Réservation : BLOCAGES § 7.

## Compilation — résultat (18 h 05)
- Web : `yarn build` ✅ (sans `CI=true`, avertissements ESLint historiques) → `npx cap sync` ✅ (bundle embarqué dans `android/app/src/main/assets/public` et `ios/App/App/public`).
- Android : Capacitor 7 exige **JDK 21** (`JavaVersion.VERSION_21` dans les plugins) — Debian 12 n'en fournit pas → Temurin 21 installé ; SDK 35 OK ; Gradle résout et compile les plugins ✅ ; **échec à `processDebugResources` : AAPT2 x86_64 uniquement, hôte aarch64** → APK non produit ici. Voir BLOCAGES § 8 (CI x86_64 recommandé : le script `scripts/native/build-android-debug.sh` est prêt à l'emploi).
- iOS : projet Xcode généré (`com.bevidcrm.app`), compilation hors environnement (BLOCAGES § 5).
- Porte QA web après N1–N4 : ✅ verte (bundle 4051 Ko, 0 violation).
