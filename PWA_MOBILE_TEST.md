# BEVID · Runbook de test hors-ligne sur iPhone réel

**Objet** : valider le scénario critique du Lot Fiabilité PWA.
**Durée** : ~10 minutes.
**Prérequis** : iPhone iOS ≥ 17, Safari, compte BEVID actif (idéalement un compte commercial).

## 1. Installer l'application

1. Ouvrez `https://drink-sales-hub-8.preview.emergentagent.com/login` dans Safari.
2. Appuyez sur le bouton **Partager** (icône ↑ en bas de l'écran).
3. Faites défiler et sélectionnez **« Sur l'écran d'accueil »**.
4. Confirmez avec **Ajouter**. L'icône BEVID apparaît sur l'écran d'accueil.
5. Fermez Safari.

## 2. Première connexion & permissions

1. Ouvrez BEVID depuis l'écran d'accueil (pas depuis Safari — sinon toute la mécanique tombe).
2. Connectez-vous avec un compte commercial.
3. Ouvrez **Diagnostic mobile** (menu latéral → Administration → Diagnostic mobile, ou tapez `/pwa-status`).
4. Vérifiez les 6 lignes :
   - Application installée : **Oui** ✅
   - Stockage persistant : *sans doute Non pour l'instant* — c'est ce qu'on va corriger
   - Notifications : *Non demandées*
5. Appuyez sur **Activer les notifications** → autorisez dans la popup iOS.
6. Appuyez sur **Demander le stockage persistant** → doit passer à **Accordé** ✅.
7. Optionnel : **Envoyer une notification de test** → l'iPhone doit vibrer et afficher la notif.

## 3. Test critique — écriture hors-ligne

**C'est le seul test qui compte.**

1. Restez connecté sur l'app installée.
2. Passez en **Mode avion** (Centre de contrôle iOS).
3. Allez sur `/visit` (Nouvelle visite depuis la barre du bas ou raccourci écran d'accueil).
4. Saisissez :
   - Un client
   - Un résumé bidon (« Test hors-ligne runbook »)
5. Enregistrez la visite. Un toast doit confirmer l'ajout local.
6. **Fermez complètement l'app** (double-clic bouton accueil ou swipe up + balayage vers le haut de la carte BEVID).
7. **Attendez 30 secondes.**
8. Rouvrez BEVID **en mode avion toujours actif**.
9. Vérifiez que la visite en attente est **toujours là** (icône `⏳ En attente d'envoi` ou file de sync visible).
10. Coupez le mode avion. Attendez 5-10 s.
11. La visite doit disparaître de la file (envoyée) et apparaître dans l'historique du client.

## 4. Résultat attendu

- **Persist accordé** ET **visite retrouvée après fermeture hors réseau** ET **synchronisée à la reconnexion** → hors-ligne réel ✅
- Sinon → décrivez précisément quelle étape a échoué :
  - Persist refusé ? → notifications sans doute non accordées (iOS lie les deux)
  - Visite disparue après réouverture ? → Dexie purgée par iOS (probablement pas installée en PWA ou stockage non persistant)
  - Non envoyée à la reconnexion ? → problème `syncQueue`

## 5. Ce qui a changé côté code (rappel)

- `lib/pwa.js` : `requestPersistentStorage`, `estimateQuota`, `purgeIfQuotaHigh` (règle d'or : purge jamais la file d'envoi)
- `AuthContext.login/register` : appelle `requestPersistentStorage()` après auth
- `manifest.json` : shortcuts + screenshots pour l'installation
- `PwaInstallBanner` : rappel Sur l'écran d'accueil pour les utilisateurs qui utilisent BEVID dans un onglet
- `StorageQuotaBanner` (bandeau ambré) : affiché dans `/settings` si persist non accordé
- Backend : VAPID auto-généré, `/api/notifications/vapid-public-key`, `/api/notifications/test-push`

## 6. Diagnostic à distance

Si un commercial dit « ça marche pas », demandez-lui d'ouvrir **Diagnostic mobile** puis lisez-lui les 6 lignes. En 30 secondes vous saurez lequel des maillons est cassé.
