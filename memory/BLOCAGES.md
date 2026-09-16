# BLOCAGES — éléments hors de portée du code

## 1. Clickjacking en production (X-Frame-Options / CSP frame-ancestors) — TICKET EMERGENT À ENVOYER

**Contexte** : une CSP en balise `<meta>` ne protège pas du clickjacking (`frame-ancestors` est ignorée en meta, elle n'agit qu'en en-tête HTTP). Le Nginx du conteneur de production est un template Emergent scellé, non versionné dans `/app`.

**Contournement de transition livré (M1-F)** : script anti-cadre exécuté avant tout rendu dans `frontend/public/index.html` (page masquée + sortie du cadre) ; formulaires Connexion / Inscription / Mot de passe oublié / Réinitialisation remplacés par un écran « Ouvrez BEVID directement » quand la page est encadrée (`lib/frameGuard.js`, `components/FramedBlock.jsx`).

**Texte du ticket, prêt à copier (support Emergent)** :

> Objet : Ajout d'en-têtes de sécurité HTTP sur l'app publiée www.bevid-crm.com
>
> Bonjour,
> Notre application publiée (www.bevid-crm.com, projet « drink-sales-hub-8 ») sert le frontend statique via le Nginx du conteneur de production, que nous ne pouvons pas configurer depuis le dépôt. Nous avons besoin que les en-têtes suivants soient ajoutés à **toutes les réponses HTML et statiques** du frontend (pas aux routes `/api/*`, déjà gérées par notre backend FastAPI) :
>
> ```
> X-Frame-Options: DENY
> Content-Security-Policy: frame-ancestors 'none'
> X-Content-Type-Options: nosniff
> Referrer-Policy: strict-origin-when-cross-origin
> Permissions-Policy: camera=(self), microphone=(self), geolocation=(self)
> ```
>
> Motif : la protection anti-clickjacking (`frame-ancestors`) n'est effective qu'en en-tête HTTP ; notre balise `<meta http-equiv>` ne suffit pas. Application concernée : formulaires de connexion et de paiement.
> Pouvez-vous soit appliquer ces en-têtes côté plateforme, soit nous indiquer le fichier de configuration Nginx à versionner dans le dépôt pour qu'il soit embarqué au Republish ?
> Merci.

**Statut** : en attente d'action du client (envoi du ticket).

## 2. Republication production
Le bundle `main.505b4ed4.js` est toujours servi sur www.bevid-crm.com. Rien de la refonte mobile n'est visible avant Republish (Secrets à vérifier : `BEVID_ENV=production`, `REACT_APP_BACKEND_URL`, `CORS_ORIGINS`, `OWNER_EMAILS`). La migration clients legacy → établissements s'exécute automatiquement au premier démarrage du nouveau conteneur et se journalise dans `migration_journal` (`GET /api/admin/legacy/migration-journal`).

## 3. Plan applications iPhone / Android (N0–N8) — non commencé (16/09, 17 h)
La nuit a été consacrée à M1→M4 (+ onglet Ventes de M5). La prise de commande mobile (M5) reste à livrer avant d'attaquer Capacitor. Rien ne bloque côté environnement pour N0–N8 hors comptes du client (Apple Developer, Google Play Console, Firebase/APNs) — à lister dès N0.

## 4. Photos en base (transition)
Photos de devanture (`facade_photo`) et de visite (`photo`) stockées en miniature JPEG ≤ 100 Ko (data URL) dans MongoDB pour tenir le hors-ligne sans dépendance. À basculer vers le stockage objet Emergent (playbook `integration_expert`) dès qu'un lot le prévoit — le champ reste une URL, la bascule est transparente pour l'UI.
