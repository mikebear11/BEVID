# M4 — Note de visite et historique (16 septembre 2026)

Captures : `memory/mobile/m4_*.jpg` (390×844, « La gaté », compte commercial démo).

## Livré (`/etab/:id/visite` sur mobile → `MobileVisit`)
- **Check-in automatique** : heure et position GPS enregistrées à l'ouverture (`checkin_at`, `gps`).
- **Résultat en 5 gros boutons (52 px)** : Commande prise · Intéressé · À relancer · Pas intéressé · Absent → mappés sur le modèle existant (`next_action`, `interest`, `mood`), donc lisibles par le desktop et les rapports sans changement.
- **Dictée d'abord** : bouton micro 64 px pleine largeur (rouge pulsé en écoute), texte en second ; `?voice=1` (« Note vocale » du bouton +) lance la dictée à l'ouverture.
- **Objections en puces** : Prix · Déjà un fournisseur · Pas de place · Contrat en cours · Autre (`objections[]`, aussi recopiées dans la note).
- **Photo** (linéaire, tireuse, carte) compressée 640 px.
- **Prochaine action en puces de date** : Demain · +7 j · +15 j · +1 mois · Date libre → `next_date` = la relance (badge « Relance due » sur Terrain/fiche à l'échéance).
- **Hors ligne garanti** via `postOffline` (`client_uuid` idempotent), compteur de synchro visible dans le bandeau.
- **« Commande prise » → enchaîne directement sur la commande** (bouton « Enregistrer et passer la commande »).
- **Historique** : onglet Notes de la fiche, la plus récente en haut, carte = date · résultat · humeur · début de note · icônes photo/audio ; toucher pour dérouler (objections détaillées).

## Preuves
| Test | Résultat |
|---|---|
| Note complète chronométrée (résultat + texte + objection + relance + Enregistrer) | **2,7 s** de saisie (objectif < 30 s) ; retour fiche, note en tête de l'historique |
| Mode avion : « Commande prise » + note + Demain | bouton « Enregistrer et passer la commande », `pending 1`, **enchaîne sur `/commande`** |
| Retour réseau | `pending 0`, 3 notes visibles dont celle hors ligne, ordre chronologique inverse |
| Check-in | « Check-in 17:02 · position enregistrée » |

## Mieux qu'un CRM généraliste
Les objections sont **celles du métier boisson** (place en cave, contrat brasseur en cours), la relance se pose **sans clavier ni calendrier**, et « Commande prise » **ouvre le bon de commande du client** dans la foulée — pas de ressaisie.

## Reste à faire (M5 — prise de commande) — NON LIVRÉ
- « Refaire la dernière commande » en un toucher, produits habituels d'abord, puis meilleures ventes, puis catalogue ; filtre des produits de test (E) ; gros − / + et clavier numérique ; unités ; stock et rupture visibles ; remise client automatique ; **total HT/TTC en barre fixe** ; signature + envoi e-mail ; hors ligne.
- Déjà livré côté M5 : onglet **Ventes** de la fiche (CA 12 mois, produits achetés, opportunités, fréquence/prochaine commande) et CA jour/mois sur Terrain.
- Endpoints disponibles : `POST /api/orders/reorder/{oid}`, `GET /api/establishments/{eid}/catalog`, `GET /api/establishments/{eid}/mobile-summary` (bought / opportunities).
