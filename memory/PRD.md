# Cellier — CRM Distribution de Boissons

## Architecture
FastAPI + MongoDB + React 19 + Tailwind + Shadcn + Leaflet + reportlab + emergentintegrations (Claude Sonnet 5).

## Implemented (Feb 2026)
### v1 MVP
- Auth JWT bcrypt, CRUD clients/produits/commandes/tournées/activités
- Dashboard KPIs, rapports 1-clic + export CSV + synthèse IA
- Assistant IA (FAB flottant) + saisie vocale Web Speech
- Design "Organic Precision" (Bordeaux/Sage/Playfair)

### v2 Terrain + Signature
- Carte Leaflet des tournées + géocodage Nominatim
- Signature client (canvas) + PDF bon de commande (reportlab)
- Alerte stock bas (banner dashboard)
- Import CSV clients

### v3 Automatisation + Terrain rapide (17/02/2026)
- Widget "À relancer" (relances auto par IA de règles: prospect sans commande, VIP silencieux 21j, actif silencieux 45j, attrition 90j)
- Panier moyen + fréquence de commande sur fiche client
- 1-clic recommande (bouton Repeat sur commandes)
- Compte-rendu de visite : mode vocal + questionnaire tactile (ambiance/intérêt/next action) en 30 secondes
- IA remplit le formulaire depuis dictée vocale
- PWA installable (manifest.json + iOS meta)

## Backlog inspiré Twenty + NocoBase
- P1: Vue Kanban des opportunités (deals) — pattern Twenty
- P1: Workspaces multi-équipes + rôles fins
- P1: Filtres/vues sauvegardées par utilisateur
- P2: Automations no-code (triggers → actions) — pattern NocoBase
- P2: Custom fields dynamiques par organisation
- P2: Email Resend + notif push (relances programmées)
