# M5 — Vendre et informations de vente (16 septembre 2026)

Captures : `memory/mobile/m5_*.jpg` (390×844, ADT 64, compte commercial démo).

## Prise de commande (`/etab/:id/commande`, `MobileOrder.jsx` retravaillé)
- **« Refaire la dernière commande »** en tête (64 px) : reprend les lignes de la dernière commande aux **prix client actuels**, modifiable ensuite ; date de livraison pré-remplie à demain.
- **Catalogue trié** (`GET /establishments/{id}/catalog`) : **Habituels du client** → **Meilleures ventes** (12 mois org) → **Catalogue** ; **produits de test exclus** (`is_test_product` : `TEST_`, `biere_xxxxxx`, `prod_…`, `p_…`) — 48 fixtures retirées, 13 vrais produits restants.
- Quantités : **− / + de 48 px** + **saisie directe au clavier numérique** (`inputMode=numeric`).
- **Unité** affichée (fût, carton, bout.) ; **stock disponible** et **« Rupture » / « rupture probable »** en rouge si stock ≤ 0, < quantité demandée ou sous le seuil.
- **Remise client appliquée automatiquement** (`default_discount_pct`) + paliers hecto existants ; tarif client (liste de prix) conservé.
- **Barre fixe** avec **HT et TTC** toujours visibles (étapes 1, 2 et 3) ; boutons 56 px.
- Signature au doigt + envoi automatique du bon par e-mail (existant) ; **hors ligne** : commande + signature en file, confirmée au retour du réseau.

## Informations de vente — onglet Ventes (livré en M3, complété par le filtre E)
CA par mois sur 12 mois (barres pleines), produits achetés (dernière date, dernier prix), opportunités (jamais / plus depuis 90 j) **sans produits de test**, fréquence de commande et prochaine commande probable. Sur Terrain : CA du jour et du mois face à l'objectif en une ligne (M1).

## Corrections glissées
1. **Recherche floue** : Damerau-Levenshtein bornée à 1 (insertion, suppression, substitution, **transposition**). Preuve : `bekats` → BEKAST **true**, `xyz` → **false**, `calanqes` → Calanques true, `prot` → Port true.
2. **Onglets fiche mobile** : 16 px (`text-base`) conservés, libellé « Cmdes » avec `aria-label="Commandes"`. Mesuré : `font-size 16px`.
3. **Itinéraire** : feuille de choix — Plans + Waze sur iPhone, Google Maps + Waze ailleurs — bouton « Toujours » mémorise le choix (`bevid_nav_app`) ; « Changer d'application d'itinéraire » dans l'onglet Infos.
4. **Filtre produits de test** appliqué aux alertes de rupture (fiche + Terrain), aux prévisions, aux opportunités, aux produits achetés et aux alertes de stock bas du tableau de bord (fin de « Rupture probable : biere_83098b » / « : ? »).

## Preuves
| Test | M0 | M5 |
|---|---|---|
| Refaire la dernière commande | non réalisable en 1 toucher, ≥ 12 touchers | **5 touchers, 5,1 s** (Refaire → Suite → Signature → signer → Valider), commande créée (13 commandes sur la fiche) |
| Catalogue | 61 produits dont 48 de test, ordre aléatoire | 13 produits en 3 sections : Habituels (1) · Meilleures ventes (4) · Catalogue (8) |
| Total | invisible avant « Suite » | HT 534,00 € · TTC 640,80 € en barre fixe dès le premier écran |
| Mode avion | — | commande + signature en file (`pending 1`), retour fiche ; retour réseau → `pending 0` |

## Objectifs de fin de lot (vs M0)
| Objectif | Cible | Résultat |
|---|---|---|
| Ouvrir la fiche d'un client connu | ≤ 3 touchers sans défilement | **1 toucher** (M1) |
| Note de visite | < 30 s | **2,7 s** de saisie (M4) |
| Refaire la dernière commande | < 20 s | **5,1 s** (M5) |
| Parcours terrain en mode avion | complet | recherche, création prospect, note de visite, commande signée : **OK**, synchro au retour du réseau |

## Mieux qu'un CRM généraliste
La commande part **des habitudes réelles du client** et de **ce qui manque en cave** (rupture annoncée), la **remise négociée** et le **tarif hecto** s'appliquent sans y penser, et le fût/carton/bouteille est l'unité de saisie — pas une « quantité » abstraite.

## Complément de preuve — commande complète en mode avion (17 h 25)
Captures `m5_4_avion_signature.jpg`, `m5_5_avion_en_file.jpg`, `m5_6_synchro_ok.jpg` (« La gaté »).
1. Réseau coupé (`set_offline`) sur l'écran commande → 2 lignes (3 unités), total **115,20 € TTC** en barre fixe → Suite → Signature au doigt → Valider.
2. Hors ligne : **aucun `POST /orders` tenté**, toast « en file de synchro », `pending 1`, retour fiche.
3. Retour réseau : **un seul `POST /orders` → 200**, `pending 0` ; commandes de la fiche **1 → 2** (une seule commande créée, idempotence `client_uuid`).
4. Bon de commande : l'envoi e-mail est désormais déclenché **au moment de la synchronisation** (`syncQueue.js` → `POST /orders/{id}/send-pdf-email` après le POST rejoué), comme en ligne.
