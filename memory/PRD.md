# Cellier — CRM Distribution de Boissons

## Problem Statement (verbatim)
Outil CRM digne des derniers CRM du marché, spécialisé dans la distribution de boissons, avec agents IA de suivi qualité/performance, saisie de données ultra-rapide (vocale), rapports 1-clic.

## Architecture
- **Backend**: FastAPI + MongoDB (motor), JWT bcrypt auth, emergentintegrations (Claude Sonnet 5 / GPT-5.4 / Gemini 3.1 Pro).
- **Frontend**: React 19 + Tailwind + Shadcn UI + Recharts, i18n FR/EN, Web Speech API pour saisie vocale, framer-motion.
- **Design**: "Organic Precision" — Bordeaux #4A154B + Sage #2D5A4C + Stone #F7F5F2, Playfair Display + Outfit.

## User Personas
- **Manager**: vue globale équipe, tous clients/commandes, rapports agrégés, synthèses IA managériales.
- **Commercial**: son portefeuille, ses commandes/tournées, assistant IA par compte, saisie vocale sur le terrain.

## Core Requirements
- Auth JWT (register/login/me)
- CRUD Clients/Products/Orders/Tours/Activities
- Dashboard KPIs (CA, commandes, clients actifs/VIP, top produits, chart 6 mois)
- Rapports 1-clic (performance agents, export CSV, synthèse IA)
- Assistant IA multi-modèle (Claude/GPT/Gemini) via Emergent LLM Key
- Analyse IA par compte (diagnostic + 3 actions + opportunités)
- Saisie vocale (Web Speech) + extraction JSON structuré via IA
- i18n FR/EN
- Seed démo 1-clic

## Implemented (Feb 2026)
- Full auth flow (JWT + bcrypt)
- CRUD complet: Clients, Products, Orders (avec décrément stocks), Tours, Activities
- Dashboard avec 4 KPIs + chart évolution CA + top 5 produits
- Rapports: performance agents (table + bar chart + pie), export CSV, synthèse IA
- FAB flottant "Assistant IA" (voice-to-text + envoi à Claude Sonnet 5)
- Voice parse pour créer un client depuis dictée vocale
- Detail client avec analyse IA + timeline activités + historique commandes
- Layout mobile-first: sidebar desktop + bottom tab bar mobile
- Toggle langue FR/EN
- Seed démo (6 produits, 5 clients, ~8 commandes)

## Backlog (P1)
- Géolocalisation clients (lat/lng auto via geocoding) + carte Leaflet des tournées
- Upload photo lieu / logo (object storage)
- Notifications temps réel (WebSocket) pour manager
- Email récap hebdo (Resend)
- Prévisions IA (forecast CA basé sur historique)

## Backlog (P2)
- Multi-tenant / gestion organisations
- OAuth Google (Emergent Auth)
- Signature commande PDF
- Import CSV clients/produits
- Dark mode (déjà prévu par design)
