# M3 — Fiche client mobile (16 septembre 2026)

Captures : `memory/mobile/m3_*.jpg` (390×844, ADT 64, compte commercial démo).

## Livré (`/etab/:id` sur mobile → `MobileEtab360`, données `GET /api/establishments/:id/mobile-summary`)
**Premier écran, sans défilement (onglets à y = 580 px sur 844)** : nom, type · ville, badge d'état (En règle / Retard / Bloqué) ; **dernière visite** (date + résultat), **dernière commande** (date + montant), **CA 12 mois + tendance** vs 12 mois précédents ; **alertes** (Impayé N € · N fûts non rendus · Relance due · Rupture probable : produit) ; **interlocuteurs avec rôle** (gérant, comptable, acheteur…) et appel direct.

**Barre d'actions fixe, 4 boutons de 56 px** : Appeler (feuille de choix si plusieurs interlocuteurs — 5 numéros proposés sur ADT 64, lien `tel:`) · Itinéraire (Plans sur iPhone via `maps://`, Google Maps sinon, coordonnées GPS ou adresse) · Visite (`/etab/:id/visite` pré-rempli) · Commande (`/etab/:id/commande`, grisé si compte bloqué). Nav du bas masquée : les 4 boutons sont réellement touchables.

**Onglets** Notes · Commandes · Ventes · Infos — **aucun tableau, uniquement des cartes** :
- Notes : chronologie des visites, la plus récente en haut, carte = date · résultat · humeur · début de note · icônes photo/audio, toucher pour dérouler (M4 complètera).
- Commandes : date · montant · lignes résumées · statut.
- Ventes (livre l'onglet demandé en M5) : CA par mois sur 12 mois en barres pleines contrastées, **fréquence de commande et prochaine commande probable** (« tous les 14 j · prochaine le 28 août »), produits achetés avec dernière date et dernier prix, **opportunités** (jamais achetés / plus depuis 90 j) avec bouton « Proposer dans une commande ».
- Infos : adresse, téléphone, e-mail, SIRET, notes, photo de devanture, lien « Compléter la fiche ».

## Preuves
| Test | Résultat |
|---|---|
| Premier écran sans défilement | vital + alertes + 3 contacts + onglets tiennent avant 580 px ; CTA à 771 px |
| Appeler | feuille « Qui appeler ? » avec 5 interlocuteurs |
| Itinéraire | `https://www.google.com/maps/dir/?api=1&destination=43.4832,-1.5586` (Playwright = desktop UA) |
| Visite / Commande | URLs `/visite` et `/commande` atteintes en 1 toucher |
| Onglets | Notes 3 cartes · Commandes 12 cartes · Ventes : 3 produits achetés, 1 bloc opportunités |
| Débordement horizontal | 0 élément |

## Mieux qu'un CRM généraliste
Avant de pousser la porte, le commercial sait **quel produit va manquer** (rupture calculée sur le rythme réel), **combien de fûts sont encore dans la cave** et **qui décide / qui paie** — et il appelle la bonne personne en deux touchers.
