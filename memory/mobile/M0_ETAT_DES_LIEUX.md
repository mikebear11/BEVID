# M0 — État des lieux mobile (16 septembre 2026)

Compte `commercial.demo@bevidcrm.fr`, viewport 390×844 (iPhone 12/13/14), preview.
Captures : `memory/mobile/m0_*.png`.

## Constats bloquants transverses
1. **La page « Clients » est VIDE pour un commercial** : elle appelle l'API legacy `/api/clients` (0 enregistrement) alors que les établissements réels vivent dans `/api/establishments` (4 pour ce compte). Le seul chemin vers une fiche est « Ma tournée ». Idem `/orders` (vide) et le sélecteur client de « Nouvelle visite » (1 seule option).
2. **Barre d'actions de la fiche (Visite · Commande · Appeler) recouverte par la barre de navigation du bas** : les deux sont `fixed bottom-0` (CTA `top 771 → 844`, nav sur la même zone). Le commercial ne voit jamais ces 3 boutons sur téléphone.
3. Le bouton « Visite » de la fiche pointe vers `/etab/:id/visite`, **route inexistante** dans `App.js` → page 404 si on arrive à le toucher.
4. Aucun « Refaire la dernière commande » atteignable sur mobile : le bouton n'existe que sur la fiche legacy `/clients/:id` (jamais ouverte). Le parcours passe par le catalogue complet, produit par produit.
5. Overlays au premier lancement (tour d'onboarding 3 étapes + bannière statistiques) interceptent les touchers sur les CTA.

## Écran par écran

| # | Écran | Capture | Ce qui gêne debout, d'une main, au soleil |
|---|---|---|---|
| 1 | Accueil après connexion (`/` Tableau de bord) | m0_1 | Bouton « Charger des données démo » en premier ; alerte stock de 18 produits ; KPI CA/commandes en bas. Aucune recherche client, aucun « près de moi ». Rien d'actionnable pour aller vendre. |
| 2 | Liste clients (`/clients`) | m0_2 | **Vide** (API legacy). 4 boutons d'import/CSV/Excel avant le champ de recherche ; tableau à colonnes. |
| 3 | Recherche client | m0_3 | Champ standard sous 4 boutons, aucun résultat, pas de « Créer “bar” ». |
| 4 | Fiche client (`/etab/:id`) | m0_4 | 4 609 px de haut (5,5 écrans). Premier écran : nom, encours, 3 tuiles (volumes, dernière visite, prochaine action) puis « 4 questions » très verbeuses. Actions Visite/Commande/Appeler cachées sous la nav. Texte 12 px gris clair. |
| 5 | Création client (`/etab/new`) | m0_5 | Formulaire vertical : recherche SIREN, nom, SIREN, type (select natif), ville, adresse… Pas de boutons type, pas de GPS, pas de photo, pas de doublon. Titre sur 2 lignes qui mange 30 % de l'écran. |
| 6 | Nouvelle visite (`/visit`) | m0_6 | Select client natif (1 option) ; micro 44 px discret à droite ; ambiance/intérêt/prochaine action en pastilles, bouton Enregistrer hors écran (1 103 px). Pas de check-in GPS, pas d'objections, pas de photo, pas de puces de date. |
| 7 | Historique visites (dans la fiche, y ≈ 2 050 px) | m0_9 | Enfoui à 2 écrans de défilement, mélangé aux objections/engagements. Cartes étroites (texte coupé « Dernière commande : 1194 € le 2026-08-14 » sur 6 lignes). |
| 8 | Prise de commande (`/etab/:id/commande`) | m0_7 | Catalogue complet, 5 348 px, ordre non pertinent (produits de test). Bouton « − » grisé 44 px, « + » 44 px ; total non visible ; « Suite » en bas de page ; pas d'habituels, pas de refaire. |
| 8b | Commandes (`/orders`) | m0_8 | Vide, tableau à colonnes. |
| 9 | Barre du bas | m0_10, m0_11 | 5 onglets 48 px : Ma tournée · Visite · Scanner · Clients · Tableau. Scanner et Tableau occupent 2 des 5 places ; pas de bouton central « + » ; pas de « Plus ». |

## Mesures de référence (à battre)

| Parcours | Aujourd'hui | Détail |
|---|---|---|
| Ouvrir la fiche d'un client connu | **3 touchers** (+ défilement) via Tournée ; **impossible** via Clients | Accueil → « Ma tournée » (1) → « Réduire » la revue hebdo (2) → toucher la carte (3). Sans « Réduire » : défilement d'un écran. |
| Enregistrer une note de visite | **6 touchers** + dictée/saisie + 1 défilement | Nav « Visite » (1) → select client (2) → option (3) → micro (4) → parler → prochaine action (5) → défiler → « Enregistrer » (6). Aucun pré-remplissage depuis la fiche (route 404). |
| Refaire la dernière commande | **Non réalisable en 1 toucher** ; ≈ 3 + N touchers | Fiche (3) → CTA « Commande » masqué → catalogue : retrouver chaque produit dans 5 348 px, « + » par unité, « Suite », signature. Estimation ≥ 12 touchers pour une commande de 3 lignes. |

Cibles fin de lot : fiche en ≤ 3 touchers sans défilement · note < 30 s · refaire commande < 20 s · tout en mode avion.
