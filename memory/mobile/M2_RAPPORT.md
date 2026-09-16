# M2 — Trouver ou créer un client (16 septembre 2026)

Captures : `memory/mobile/m2_*.jpg` (390×844, compte commercial démo, GPS simulé Sausset-les-Pins).

## Recherche (Terrain, Clients, sélecteur du « + »)
- Instantanée dès la 2e lettre, **insensible aux accents et à la casse** (`gate` → « La gaté »), **fautes légères** tolérées par mot ≥ 4 lettres (distance d'édition 1 : `calanqes` → « Cave des Calanques », `marus` → « Chez Marius »), sur nom + ville + contact + téléphone.
- **Hors ligne** : index local Dexie (`establishments`) + prospects créés hors ligne (`_pending`) affichés avec le badge « À synchroniser » ; bandeau « Hors ligne — liste locale ».
- Chaque résultat : nom, ville, distance (quand la position est connue), « visite il y a N j », badge d'état.
- Aucun résultat → bouton **« Créer “texte tapé” »** → création avec le nom pré-rempli.

## Création rapide d'un prospect (`/etab/new` sur mobile → `MobileProspectNew`)
- Nom pré-rempli, **type en 6 boutons** (Bar · Restaurant · Cave · Hôtel · Épicerie · Autre), **GPS capté automatiquement** et **adresse proposée depuis la position** (`GET /api/geo/reverse`, Nominatim côté serveur → « Avenue Jean Moulin, 13960 Sausset-les-Pins »), modifiable.
- Téléphone (clavier tel) et contact facultatifs ; **photo de devanture** facultative (capture caméra, compressée à 640 px / JPEG 0,6 ≈ 50 Ko, refusée au-delà de 150 Ko côté serveur).
- **Doublon avant enregistrement** (`GET /api/establishments/check-duplicate`) : même téléphone, ou nom proche (ratio ≥ 0,8) **à moins de 200 m** → carte « Fiche existante probable » avec bouton **Ouvrir**. Testé : « la gate » à 14 m de « La gaté » → 1 doublon ; « Zzz » + 06 12 34 56 78 → 1 doublon par téléphone.
- **Hors ligne** : enregistrement en file (`sync_queue`) avec `id = client_uuid` (idempotence serveur : rejeu → même fiche, aucun doublon), fiche visible immédiatement « À synchroniser », synchronisée au retour du réseau, version serveur remplaçant la locale.
- Aucun champ administratif (SIRET, TVA, IBAN, Kbis) demandé sur mobile.
- Enregistrer = barre fixe en bas (56 px), nav masquée sur cet écran.

## Preuves
| Test | Résultat |
|---|---|
| Recherche « Chez Marius » sans résultat → Créer | nom pré-rempli, GPS OK, adresse déduite |
| Création chronométrée (type + téléphone + Enregistrer) | **5,1 s** de l'ouverture à la fiche créée (objectif < 30 s) |
| Doublon nom proche / téléphone | 1 / 1 détecté, bouton Ouvrir |
| Mode avion : liste Clients | rendue, badge hors ligne, 10 fiches (= en ligne) |
| Mode avion : recherche « calanq » | 1 résultat |
| Mode avion : création « Bistrot Hors Ligne 2 » | bouton « Enregistrer (hors ligne) », fiche « À synchroniser », `pending 1` |
| Retour réseau | `pending 0`, fiche présente côté serveur, marqueur retiré |
| Idempotence serveur (`client_uuid` rejoué 2×) | 1 seule fiche |

## Mieux qu'un CRM généraliste
Le commercial crée le prospect **debout devant la devanture, sans taper d'adresse** : la position fait l'adresse, la photo garde la mémoire du lieu, et le doublon est repéré **par distance** (200 m) et non seulement par nom — deux « Bar du Port » dans deux ports différents restent deux clients.
