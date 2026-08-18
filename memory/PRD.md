# BEVID — CRM Distribution de Boissons

## Architecture
FastAPI + MongoDB + React 19 + Tailwind + Dexie + Emergent Resend/Storage + Leaflet + reportlab + cairosvg + recharts.

**Sous-packages isolés :**
- `/app/backend/bank/` — validators, storage, importers, reconciliation
- `/app/backend/integrations/` — http_client, bodacc, recherche_entreprises, rappelconso, vies, naf_chr
- `/app/backend/permissions.py` — registry features + `has_feature()` + `require_feature()` decorator
- `/app/frontend/src/design-system/` — jetons CSS uniques (source de vérité couleurs)
- `/app/frontend/src/components/system/` — composants système partagés (PuceEtat)

## Implemented — v10.0 (18/02/2026) — Système de design triple-thème

### Système de design (règle 0 : couleur ne décore pas, elle signifie)
- **Fichier unique** `/app/frontend/src/design-system/tokens.css` — TOUTES les valeurs hex de l'app
- **3 thèmes** : `clair` (défaut) · `sombre` · `soleil` (plein soleil 21:1, bordures 2 px, aplats pleins)
- **Charte utilisateur exacte** (référence `palette-crm.html`) :
  - Surfaces : `#f7f6f3` plan / `#fdfcfa` carte
  - Encre : `#121210` (18,3:1) / `#56544d` (7,4:1)
  - Accent unique : `#1f5fa8` (6,3:1) — cliquable et rien d'autre
  - Voile d'accent `#eaf1fb` · Filet `#e3e1da`
  - Tricolore d'état : `#0ca30c` À jour · `#fab219` Vigilance · `#d03b3b` Bloqué · `#b02c2c` texte d'alerte
  - Séries graphique imposées : `#2a78d6` bleu · `#eb6834` orange · `#1baf7a` vert d'eau · `#4a3aa7` violet
- **Sombre** dérivé pour usage nuit / cristallin opacifié (à valider par utilisateur, non fourni dans référence)

### Règles verrouillées dans le code
- **Un seul accent** — jamais deux couleurs cliquables concurrentes
- **Un seul bouton plein par écran** (les autres sont ghost ou lien)
- **`PuceEtat`** composant UNIQUE `/components/system/PuceEtat.jsx` — icône + mot toujours, jamais la couleur seule
  - Variante douce (fond teinté + bord) et pleine (aplat saturé)
  - Contrastes imposés : noir sur vert/ambre pleins, blanc sur rouge plein
  - Alias historiques (`avertissement`, `danger`) pour migration progressive
- **Chart** : 4 séries max sur barres/courbes/empilement, 3 max sur nuages/cartes, ordre imposé jamais recomposé
- **Chiffres tabulaires** (`.ds-tabular`) sur toute colonne alignée numérique
- **Focus visible** (`.ds-focus`) obligatoire, cible tactile 48 px mobile (`.ds-tap`)
- **Étiquette forcée** sur série vert d'eau en clair (contraste < 3:1 sur fond)

### ThemeContext
- `theme` : "light" | "dark" | "sun" | "system"
- Persistance `localStorage["bevid.theme"]`
- Applique `.dark` / `.sun` sur `<html>` (Tailwind darkMode: "class")
- Script inline FOUC-prevention dans `index.html`
- Bascule 4-états dans sidebar (`ThemeToggle` variant "sidebar" / "icon")

### Page démo
- **Route `/design-system`** — 7 sections : jetons, boutons, PuceEtat, tuiles, tableau, formulaire, graphique barres
- Bascule 3 thèmes explicite en haut de page
- Aucun hex codé en dur dans le JSX — tout via `var(--ds-…)`

### Historique v9.0 → v10.0
- v9.0 Iter 13 : RBAC + per-user overrides (9/9 tests)
- v8.0 Iter 12 : Traçabilité lot + delivery_lines + Relevés terrain + VIES (5/5)
- v7.0 Iter 11 : Phase 1 intégrations FR (16/16)
- v6.0 Iter 10a : Rapprochement bancaire CSV/CAMT/CFONB (15/15)
- v5.5 Iter 9 : Conflict Playbook + PDF email (10/10)

## Tests
- `test_iter13_permissions.py` — 9/9
- `test_iter12_phase2.py` — 5/5
- `test_iter11_public_apis.py` — 16/16
- `test_iter10a_banking.py` — 15/15
- `test_iter9_playbook_pdf_email.py` — 10/10
- Design system : validation visuelle (3 captures : clair / sombre / soleil confirmées)

## Backlog

### Amorcé cette session (à reprendre)
- **Enrichissement établissement 3-couches** : Couche A (Recherche-Entreprises + Sirene + RNE + BAN + VIES) → Couche B (`EnrichissementPort` + adaptateurs Societe.com/Pappers) → Couche C (OSM + Google place_id)
- Modèle `EnrichedField` `{valeur, source, date_maj, fiabilite, verrouille_par_utilisateur, hash}` validé
- Token Societe.com fourni : `0eb98741d8429a17979f4447e60f4afd48ad2615496b8341`
- Sirene stock : import limité SIREN portefeuille + fallback API live
- Http_client rate limits ajoutés pour toutes les nouvelles sources
- Reste à coder : le reste du module (modèles, endpoints, port, adaptateurs, page UI)

### Application du système de design au reste de l'app
- Migrer progressivement les pages existantes vers `PuceEtat` (remplacer `badge-*` legacy)
- Remplacer les hex codés en dur des composants existants par des `var(--ds-…)`
- Ajouter un lint interne interdisant les hex hors `tokens.css`

### Phase 2 restante
- Interface livreur ultra-simplifiée (3 saisies < 10s)
- Contenants consignés (QR, valeur immobilisée, alerte immobile)
- Fraîcheur stock client (DLC probabilistique)
- Marge accises 2026 (référentiel versionné + calcul à la ligne)

### Phase 3 (intelligence territoriale)
- Potentiel commune (INSEE Melodi), prévision saisonnière, agenda territoire, déclencheur météo

### Phase 4
- Observatoire mutualisé anonymisé + Assistant terrain (briefing + dictée structurée)

## Credentials
Voir `/app/memory/test_credentials.md`.
