# N8 — Fiches boutiques FR / EN et notes de revue (16 septembre 2026)

## App Store / Google Play — FR
- **Nom** : BEVID — CRM boissons terrain
- **Sous-titre (30)** : Vendez plus, en tournée
- **Description courte Play (80)** : Le CRM des distributeurs de boissons : clients, visites, commandes, hors ligne.
- **Description** : BEVID est le CRM pensé pour les commerciaux de la distribution de boissons. Debout devant le bar, dans la voiture, sans réseau : retrouvez un client en deux lettres, créez un prospect depuis votre position, dictez votre note de visite, refaites la dernière commande en un toucher et faites signer le client au doigt. Avant d'entrer, BEVID vous dit ce qui compte : fût non rendu, impayé, rupture probable calculée sur le rythme réel de commande, relance due. Tout fonctionne hors ligne et se synchronise au retour du réseau. Pour les managers : tournées, objectifs, encours, rapports. Réservé aux équipes disposant d'un compte BEVID (connexion par invitation).
- **Mots-clés (100)** : crm,commercial,boissons,brasserie,distribution,tournée,visite,commande,fût,hors ligne,vente,terrain
- **Catégorie** : Économie et entreprise (iOS) / Professionnel (Play)
- **URL assistance** : https://www.bevid-crm.com/contact · **Confidentialité** : https://www.bevid-crm.com/legal/politique-confidentialite

## App Store / Google Play — EN
- **Name**: BEVID — Beverage field CRM
- **Subtitle**: Sell more on your route
- **Short description**: The CRM for beverage distributors: customers, visits, orders, offline.
- **Description**: BEVID is the CRM built for beverage distribution sales reps. Standing at the bar, in the car, with no signal: find a customer in two letters, create a prospect from your location, dictate your visit note, reorder the last order in one tap and get the customer's finger signature. Before you walk in, BEVID tells you what matters: unreturned kegs, unpaid invoices, likely stock-outs computed from the real ordering rhythm, due follow-ups. Everything works offline and syncs when the network is back. For managers: routes, targets, receivables, reports. For teams with a BEVID account (sign-in by invitation).
- **Keywords**: crm,sales,beverage,brewery,distribution,route,visit,order,keg,offline,field
- **Category**: Business

## Captures
Formats exigés : iPhone 6,7″ 1290×2796 · iPhone 6,5″ 1284×2778 · iPad 13″ 2064×2752 · Android téléphone 1080×1920 (min) · tablette 7″/10″. À générer sur l'organisation démo avec `scripts/qa`/Playwright (`page.set_viewport_size` + `device_scale_factor`) sur : Terrain, Fiche client, Note de visite, Commande, Ventes. Non générées dans cette itération (budget de session) — script à ajouter : `scripts/native/store-screenshots.py`.

## Notes pour l'équipe de revue Apple
- Application B2B : la connexion se fait **par invitation** d'une organisation cliente ; aucune inscription dans l'app (5.1.1). Compte de démonstration fourni dans App Store Connect (BLOCAGES § 9).
- **Aucun achat ni abonnement dans l'app** : la facturation du service se gère sur le site web par l'administrateur de l'organisation (3.1.3(b)/(e)). Le seul lien de paiement présent concerne des **factures de marchandises physiques livrées** (boissons), hors IAP (3.1.3(e)).
- Position utilisée **uniquement au premier plan** (clients proches, horodatage de visite) — aucune permission « Toujours ».
- Suppression de compte disponible dans Mon profil (5.1.1(v)).
- Le micro sert à la dictée de notes ; la caméra aux photos de devanture/linéaire et au scan de fûts.
