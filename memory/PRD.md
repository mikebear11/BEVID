# BEVID — CRM Distribution de Boissons

## Implemented — v14.0 (18/02/2026) — Lot 1 · Sécurité (P1) + P0 finition

### P0 (offline / terrain — depuis v13.1)
- **0.1 AuthContext** : ne supprime le token que sur 401/403. Sur erreur réseau : restaure user depuis `meta.cached_user`, active `offlineMode`, expose `snapshotAt`. Composant `OfflineBanner` visible en haut de main.
- **0.2 Service Worker** (`/public/sw.js`) : precache app shell, NetworkFirst sur `/api/*` GET avec cache de repli, navigation → cache index.html, autres GET même origine → CacheFirst. Push conservé. Register via `index.html`.
- **0.3 useVoice** : détection auto Speech API → MediaRecorder → unavailable. Enregistrements audio persistés dans Dexie `voice_recordings` (v2). Erreurs visibles (`no-speech`, `not-allowed`, `network`…). `lang` respecté.
- **0.4 Nav mobile** : `MOBILE_NAV` explicite (Tournée · Visite · Scanner · Clients · Tableau), plus dérivée de `nav.slice()`. `OnboardingTour` saute les cibles absentes.
- `/api/voice/transcribe` endpoint : reçoit multipart audio, stocke dans `voice_uploads` (id + audio_b64 si < 10 MB). Vide la queue Dexie même sans Whisper configuré.

### P1 (sécurité — bloquant)
- **1. Inscription publique fermée au rôle manager** :
  - `UserRegister` n'accepte plus `role` — champ retiré du modèle
  - Serveur force `role="commercial"` quoi qu'il arrive dans le payload
  - Frontend `Register.jsx` : dropdown rôle supprimé, panneau de gauche indique "Les managers sont créés par invitation"
- **2. Rate limiting** (`/app/backend/rate_limit.py` — sliding window en mémoire) :
  - `/auth/login` : 5 échecs / 15 min par IP ET par email → 429 `Retry-After` (validé : 6ᵉ tentative → 429 "Réessaie dans 899 s")
  - `/auth/register` : 5 créations / 15 min → 429
  - `/auth/forgot-password` : 3 demandes / 15 min → 429
  - Message d'erreur générique login conservé (`Identifiants invalides`)
  - Purge du compteur au succès (`_rate_limit_clear`)
- **3. Register renforcée** :
  - Champ `password_confirm` obligatoire, égalité vérifiée serveur + client
  - Longueur mot de passe ≥ 10 (serveur + client)
  - Jauge de robustesse visuelle (0→5 basée sur longueur + casse + chiffres + symboles)
  - Case CGU/RGPD obligatoire (`accept_terms`), enregistrée avec IP et horodatage
  - Tous les champs : `id`, `for`, `autocomplete`, `aria-invalid`, `aria-describedby` sur les erreurs
- **6. Gestionnaire 422 Pydantic** (partiel — dictionnaire FR complet) :
  - `RequestValidationError` capturé au niveau app
  - Réponse `{ errors: { field: "message court" } }`
  - Traduction FR pour value_error.email, missing, min_length, bool, const, etc.
- **11bis. Liens morts nav corrigés** :
  - `/integrations` → `/connectors` (routes déclarées uniquement `/connectors`)
  - `/privacy` → `/confidentialite` (route réelle)
  - Doublon `/connectors` retiré (apparaissait sous 2 clés)

### Historique récent
- v13.0 : Autocomplete SIREN à la création + 3 crons enrichissement planifiés
- v12.0 : Sombre corrigé + Onglet Enrichissement + Couche C Places
- v11.0 : Enrichissement 3-couches + Migration PuceEtat + Lint anti-hex
- v10.0 : Système de design 3-thèmes

## Backlog restant

### Lot 2 (tour suivant) — Fiabilité + Accessibilité (P2 + P3)
- 4. Page 404 chartée avec CTA contextuel (auth / non auth)
- 5. Deep-link : retour à URL demandée après login
- 7. Perte réseau pendant formulaire → message + retry sans page blanche
- 8. Viewport `initial-scale=1, viewport-fit=cover` (zoom débloqué WCAG 1.4.4)
- 9. Formulaires accessibles partout (id/for/autocomplete/aria) — Login + ForgotPassword restants
- 10. `<html lang>` dynamique + persisté fr/en/es/de
- 11. Audit 375 px : tables → cartes empilées
- 11ter. Nav desktop 29 entrées → 6 sections repliables + palette Cmd+K
- 11sexies. Remplacer `window.confirm` par Dialog charte

### Lot 3 — Cohérence + Prod (P3quinquies + P4)
- 11quater. Fusionner Tours/Tournee, Deals/Pipeline
- 11quinquies. Extraire 130 libellés en dur → i18n complet fr/en (retirer es/de si intenable)
- 12. Uniformiser Login/Register/ForgotPassword (charte identique)
- 13. Meta description + favicon + Open Graph
- 14. Build production minifié + React.lazy par route
- 15. Bascule crm_token → cookie httpOnly Secure SameSite=Lax + refresh
- 16. Consent PostHog (bandeau, désactivation par défaut sur pages authentifiées)
- 17. Sentry + ErrorBoundary React global

### Enrichissement — clés manquantes
- `GOOGLE_PLACES_KEY` = clé fournie ✅ — mais **Places API (New) doit être activée** sur le projet GCP 1021273206198 (403 API_KEY_SERVICE_BLOCKED)
- `INPI_RNE_LOGIN` + `INPI_RNE_PASSWORD` : à fournir

## Credentials
Voir `/app/memory/test_credentials.md`.
