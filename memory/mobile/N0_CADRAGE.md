# N0 — Cadrage applications iPhone / Android (16 septembre 2026)

## Approche retenue : Capacitor (par défaut)
La PWA React existante devient l'app native via **Capacitor 7** (Node 20 dans l'environnement ; Capacitor 8 exige Node ≥ 22). Même code, même bundle, plugins natifs pour ce que le WebView ne fait pas ou fait mal : **géolocalisation au premier plan uniquement** (position captée à l'ouverture d'un écran ou sur action du commercial — jamais de suivi en arrière-plan : pas de permission « Toujours », pas d'`ACCESS_BACKGROUND_LOCATION`, conformément à la CNIL sur la géolocalisation des salariés et aux règles Apple/Google), caméra, réseau, stockage sécurisé, SQLite hors ligne, notifications push (APNs/FCM). Le backend FastAPI n'est pas modifié (règle inchangée) ; seule l'authentification gagne un mode « porteur » pour le WebView natif.

## Parité fonctionnelle — tirée du routage réel (`App.js`, 67 routes)
| Route(s) | Écran | Natif (Capacitor) | Point d'attention |
|---|---|---|---|
| `/terrain`, `/clients`, `/etab/:id`, `/etab/new`, `/etab/:id/visite`, `/etab/:id/commande`, `/tournee` | Parcours terrain M1–M5 | ✅ identique | GPS via `@capacitor/geolocation` (plus fiable que `navigator.geolocation` en WebView iOS) ; caméra via `@capacitor/camera` (l'`<input capture>` marche aussi) |
| `/visit`, `/scan` | Visite desktop, scanner fût (html5-qrcode) | ✅ | Scanner = caméra WebView ; sur iOS le `getUserMedia` fonctionne dans WKWebView ≥ 14.3 |
| `/`, `/dashboard`, `/reports`, `/orders`, `/products`, `/stock`, `/containers*`, `/tours`, `/deals`, `/paiements`, `/prospection`, `/livreur`, `/drm`, `/calculateur-drm`, `/documents`, `/import`, `/rapprochement`, `/portefeuilles`, `/companies*`, `/approvals` | Écrans métier (managers / bureau) | ✅ rendus tels quels | Tableaux : défilement horizontal, pas de refonte prévue (bureau) |
| `/login`, `/register`, `/forgot-password`, `/reset-password/:token`, `/activate/:token`, `/change-password` | Authentification | ⚠️ **adapter** | Cookie HttpOnly `SameSite=lax` **non envoyé** depuis `capacitor://localhost` → mode **jeton porteur** stocké dans `@capacitor/preferences` (N3). Liens e-mail `/activate`, `/reset-password` → **liens universels / App Links** à déclarer (N6) |
| `/profile`, `/settings`, `/org/settings`, `/team`, `/admin/*`, `/connectors`, `/permissions`, `/pwa-status`, `/confidentialite` | Réglages | ✅ | `/pwa-status` : diagnostics SW sans objet en natif → masquer (N4) |
| `/billing`, `/plans`, `/pricing`, `/tarifs`, `/payment/*`, `/pay/:token` | Abonnement Stripe | ⚠️ **règle store** | Abonnement d'un service B2B utilisé hors app : autorisé en lien externe (Apple 3.1.3(b)/(e)), mais **pas de bouton d'achat in-app** → ouvrir dans le navigateur système (`@capacitor/browser`) |
| `/sign/:token`, `/pay/:token`, `/legal/*`, `/pack-legal`, `/design-system` | Pages publiques | ✅ web uniquement | Restent sur www.bevid-crm.com (liens sortants) |
| PWA : service worker, `manifest.json`, install, `push.js` (Web Push VAPID) | Hors natif | ⚠️ | SW inutile dans l'app (bundle embarqué) ; **Web Push ne fonctionne pas sur iOS natif** → `@capacitor/push-notifications` + APNs/FCM (N5) |
| Dictée (`useVoice`, Web Speech API) | Note de visite | ⚠️ | Web Speech absent dans WKWebView → plugin `@capacitor-community/speech-recognition` (N5) |
| Hors ligne : Dexie/IndexedDB + `sync_queue` | Tout le terrain | ✅ puis SQLite | IndexedDB fonctionne dans les WebViews ; **iOS peut purger IndexedDB** après 7 j sans usage → SQLite natif (N4) pour la file de synchro et l'index clients |

## Faisabilité de compilation dans cet environnement
- Node 20.20, 8 vCPU, 31 Go RAM, 7,6 Go libres sur `/app` ✅
- **Java absent** ; `openjdk-17-jdk-headless` disponible via apt ✅ (installable) ; **Android SDK absent** (command-line tools ≈ 150 Mo + platform 34 + build-tools ≈ 600 Mo, Gradle téléchargé au 1er build ≈ 150 Mo) → **APK debug compilable** dans l'environnement, hors signature de release (clé du client).
- **iOS : non compilable ici** (Xcode / macOS requis). Le projet `ios/` est généré et versionné ; la compilation passe par un Mac du client ou un service cloud (Codemagic / Bitrise / Ionic Appflow) — compte client requis → BLOCAGES.

## Plan N1 → N8 (état)
| Lot | Contenu | Prérequis client | Statut |
|---|---|---|---|
| N1 | Intégration Capacitor (config, build web, `android/` + `ios/` générés, scripts) | aucun | en cours |
| N2 | Adaptations WebView (URL API absolue, désactivation SW, safe-areas, retour matériel Android, liens externes) | aucun | en cours |
| N3 | Authentification native (jeton porteur + Preferences, déconnexion, expiration) | aucun | en cours |
| N4 | Hors ligne SQLite (file de synchro + index clients) avec repli IndexedDB | aucun | en cours |
| N5 | Plugins natifs : géoloc, caméra, réseau, push (APNs/FCM), dictée | **Firebase + clé APNs** | code prêt, clés en attente |
| N6 | Liens universels / App Links, icônes, splash, conformité (permissions, politique de confidentialité, suppression de compte) | **Apple Developer + Play Console** | à faire |
| N7 | Compilation : APK debug ici ; iOS via Mac/cloud | **Mac ou compte cloud** | APK debug faisable |
| N8 | Publication TestFlight / Internal testing, fiches store | **D-U-N-S, Apple Developer, Play Console** | client |

Démarches du client, dans l'ordre : voir `memory/BLOCAGES.md` § 5.
