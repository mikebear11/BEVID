# M1 — Accueil Terrain et navigation (16 septembre 2026)

Captures : `memory/mobile/m1_*.jpg` (390×844, compte commercial démo, géolocalisation simulée Sausset-les-Pins).

## Livré

### A. Modèle client en double — migration legacy → établissements (en premier)
- `migrate_legacy_clients_for_org()` / `migrate_legacy_clients_all_orgs()` dans `server.py` : **idempotente** (clé `clients.migrated_to_establishment_id` + `establishments.legacy_client_id`), fusion douce si SIRET ou nom identique, **remap `client_id`** des commandes / visites / activités / opportunités, journal dans `migration_journal`.
- Exécutée **au démarrage** (toutes orgs) + commande explicite `POST /api/admin/legacy/migrate-clients-to-establishments/v2` + lecture `GET /api/admin/legacy/migration-journal`.
- La collection `clients` n'est jamais supprimée ; l'API legacy reste lisible.
- **Preuve sur le preview** (jeu reproduisant « La gaté » + 3 clients, 1 commande, 1 visite) :
  - Run 1 : `total 4, moved 4, merged 0, remapped {orders 1, visits 1, activities 2}` ;
  - Run 2 (rejeu) : `total 0` — aucun doublon ;
  - fiche établissement « La gaté » : volumes 12 m = 10,50 €, dernière visite = la visite legacy ; 4 clients legacy conservés et marqués migrés ; 1 entrée de journal.
- `predicted-runouts` accepte désormais un id d'établissement (les prédictions de rupture s'affichent enfin sur les vrais clients).

### Écran Terrain (`/terrain`, accueil mobile par défaut, manager inclus — tableau de bord déplacé sur `/dashboard`)
- Recherche client en haut (56 px, saisie dès la 2e lettre, insensible aux accents/casse, sur nom + ville + contact + téléphone, index local Dexie si hors ligne) ; aucun résultat → bouton « Créer “texte” ».
- CA du jour / du mois / objectif en une ligne (`GET /api/terrain/summary`).
- **Près de moi** : distance réelle (haversine), badges **Impayé · À relancer · N fûts non rendus · Rupture probable**.
- **Ma tournée du jour** : arrêts restants (visités aujourd'hui exclus).
- **Récents** : 5 dernières fiches ouvertes.

### Navigation du bas : Terrain · Clients · **+** · Tournée · Plus (64 px de haut, 78 px de large chacun)
- **+** → feuille « Action rapide » : Note de visite · Commande · Nouveau prospect · Note vocale → choix du client (proches puis récents, recherche) → formulaire pré-rempli (`/etab/:id/visite`, `/etab/:id/commande`, `/etab/new`).
- **Plus** → Tableau de bord, Scanner, Commandes, Catalogue, Stock, Rapports/Équipe (managers), Profil, Déconnexion.
- Bandeau haut mobile allégé (langue et déconnexion déplacées dans Plus/Profil) : plus de débordement horizontal à 390 px.

### Corrections M0 intégrées
- **B** — les écrans à barre d'actions propre (`/etab/:id`, `/etab/:id/commande`, `/etab/:id/visite`, `/visit`) **masquent la nav du bas** : les 3 CTA Visite · Commande · Appeler sont maintenant réellement touchables (mesuré : élément au point (60, 791) = la barre CTA, plus la nav).
- **C** — route `/etab/:id/visite` créée (VisitReport pré-rempli via `useParams`) ; ajoutée aussi à la liste `KNOWN_ROUTES` du serveur de dev (`craco.config.js`) avec `/terrain` et `/dashboard`. **Porte QA** : nouveau contrôle `dead_links` (budget dur 0) — tous les liens internes vus sur les écrans mobiles sont visités, un 404 fait échouer la porte (18 liens vérifiés, 0 mort).
- **D** — « Charger des données démo » : jamais si `is_production`, jamais si l'org a des établissements (`establishments_count` ajouté aux KPI). Tour d'onboarding : plus affiché sur mobile ; fermeture persistée côté serveur (`visited_features: onboarding_tour`) → ne revient plus, quel que soit l'appareil.
- **F** — anti-clickjacking de transition : script exécuté avant le rendu (`index.html`), formulaires Login / Register / Mot de passe oublié / Réinitialisation remplacés par « Ouvrez BEVID directement » si encadrés. Ticket Emergent rédigé dans `memory/BLOCAGES.md`.
- Page Clients mobile : source unique établissements (7 fiches visibles contre 0 en M0).

## Mesures

| Parcours | M0 | M1 |
|---|---|---|
| Ouvrir la fiche d'un client connu | 3 touchers + défilement (via Tournée) ; impossible via Clients | **1 toucher** (Près de moi / Récents / Tournée du jour, sans défilement) ; **2 touchers + saisie** via la recherche |
| Lancer une note de visite pré-remplie | 6 touchers (client via select) ; CTA fiche masqué et route 404 | **3 touchers** : + → Note de visite → client (M4 réduira le formulaire lui-même) |
| Lancer une commande pré-remplie | CTA masqué | **3 touchers** : + → Commande → client |

## Porte de qualité
Voir `qa-reports/latest.md` — 13 métriques dures dont le nouveau `dead_links`. Détail dans le message de livraison.

## Mieux qu'un CRM terrain généraliste
Avant d'entrer chez le client, le commercial voit sur la carte « Près de moi » **le fût non rendu, l'impayé et la rupture probable** calculée sur le rythme réel de commande — pas seulement une adresse et une date de dernière visite.

## Correctifs post-relecture (16 septembre 2026, 16 h 45)

### 1. Doublons de migration — cause et correction
- **Cause** : un miroir de démarrage préexistant (`_merge_clients_into_establishments`, Lot 7) recopie chaque client legacy dans `establishments` **avec le même id**. Ma migration v2 créait la fiche sous un **nouvel** id → une fiche « migrée » + une fiche « miroir » par client.
- **Correction** : (a) la fiche migrée reprend désormais **l'id du client legacy** (les commandes/visites pointent déjà dessus, aucun remap nécessaire, le miroir ne peut plus rien recréer) ; (b) le miroir ignore tout client déjà migré ; (c) réparation `_dedupe_mirror_establishments` au démarrage : paires (fiche migrée ≠ id legacy, miroir = id legacy) fusionnées dans le miroir, champs non vides conservés (lat/lng, assigned_to…), commandes/visites/activités/opportunités remappées, doublon supprimé, journalisé.
- **Preuves preview** : réparation exécutée au démarrage → `merged_pairs 4, remapped {orders 1, visits 1, …}` ; 0 nom en double ; « La gaté » = 1 fiche, id = id legacy, lat conservée, 1 commande et 1 visite rattachées (41 commandes / 16 visites au total avant et après).
- **Jeu à deux cas** (client legacy **avec** miroir « Cas A », client legacy **sans** miroir « Cas B », 1 visite chacun) : run 1 → `merged 1, moved 1` ; run 2 → `total 0` ; **exactement une fiche par client** après chaque run, `id == legacy_client_id` dans les deux cas, visites A = 1 et B = 1 avant/après.

### 2. Erreurs 429 — cause et correction
- **Cause** : ~25–30 GET tirés **simultanément** au montage (bandeau : sidebar-prefs, counters, tours, inbox, billing, alertes ; widgets du tableau de bord : KPI, stock, objectifs, prévisions, cashflow, anniversaires…), dont des doublons (`/alerts/follow-ups` demandé par la cloche et le widget). Le proxy limite les rafales ; nos limiteurs backend ne concernent que login / inscription / mot de passe oublié (inchangés).
- **Correction dans `lib/api.js`** : adaptateur axios pour les GET — **déduplication des requêtes identiques en vol** (une seule requête réseau, réponse partagée) + **file à concurrence bornée (6 en parallèle)**. Aucun retry, aucune exception, budget `console_errors` inchangé à 0.
- **Preuve** : tableau de bord manager → 30 appels API, **0 × 429** ; porte QA rejouée entière → `console_errors 0`, toutes métriques vertes (bundle 4012 Ko, LCP 676 ms).

### 3. Langue et déconnexion sur mobile
- `m1_8_plus_langue_deconnexion.jpg` : « Plus » (1 toucher) → sélecteur **Langue** et bouton **Déconnexion** (2e toucher). Test : bascule EN/FR effective, déconnexion → `/login`.
