# N5 — Conformité boutiques (16 septembre 2026)

## Livré en code
- **Suppression de compte** (`DELETE /api/me/account`, carte « Supprimer mon compte » dans Mon profil) : confirmation par mot de passe, anonymisation (e-mail/nom/téléphone), compte désactivé, **jetons refresh et appareils push révoqués**, journal d'audit. **Propriétaire** : refusé s'il reste d'autres membres sans `transfer_to` (transfert du rôle Manager), sinon option « supprimer aussi l'organisation » (marquée `deleted_at`, export préalable via Réglages → Export). Les commandes/visites restent (historique commercial de l'organisation, base légale : intérêt légitime / obligations comptables).
- **iOS natif sans abonnement** : entrée « Abonnement » retirée de la nav, `BillingBanner` masqué, routes `/billing` `/plans` `/pricing` `/tarifs` remplacées par « La gestion de l'abonnement se fait depuis le site web BEVID. Contactez votre administrateur. ». Le **lien de paiement des factures client** (`/pay/:token`) reste : bien physique livré (boissons), hors achat in-app (Apple 3.1.3(e)).
- **Pas d'inscription dans l'app native** : lien « Créer un compte » masqué, `/register` → `/login` ; activation par invitation (`/activate/:token`) via lien universel.
- **PrivacyInfo.xcprivacy** : pas de tracking ; données collectées liées à l'utilisateur (e-mail, nom, position précise, photos, audio) pour le fonctionnement ; API à justification : UserDefaults CA92.1, horodatage fichiers C617.1, boot time 35F9.1, espace disque E174.1.
- **Textes d'autorisation FR/EN** : `Info.plist` + `fr.lproj/en.lproj/InfoPlist.strings` ; Android `values/values-fr/strings_permissions.xml`.
- **Liens profonds** : `/.well-known/assetlinks.json` (variable `ANDROID_CERT_SHA256`) et `/.well-known/apple-app-site-association` (variable `APPLE_TEAM_ID`), `Content-Type: application/json` ; `App.entitlements` (applinks + webcredentials + aps), `intent-filter autoVerify` Android ; routage `appUrlOpen` → React Router (activation, invitation, réinitialisation, signature, paiement, suivi, fiche).

## Brouillon — étiquettes de confidentialité App Store (d'après les données réellement collectées)
| Donnée | Collectée | Liée à l'identité | Suivi | Finalité |
|---|---|---|---|---|
| Coordonnées (nom, e-mail, téléphone pro) | Oui | Oui | Non | Fonctionnalités de l'app, gestion du compte |
| Position précise | Oui (au premier plan seulement) | Oui | Non | Fonctionnalités (clients proches, horodatage des visites) |
| Photos / vidéos | Oui (photos prises volontairement) | Oui | Non | Fonctionnalités (devanture, linéaire) |
| Données audio | Oui (dictée, transcription) | Oui | Non | Fonctionnalités |
| Contenu utilisateur (notes, commandes) | Oui | Oui | Non | Fonctionnalités |
| Identifiants (jeton appareil push) | Oui | Oui | Non | Fonctionnalités |
| Données de plantage / performance | Oui (si Sentry activé, sans PII) | Non | Non | Analyse |
| Données d'achat, historique de navigation, publicité, contacts, santé, finances perso | Non | — | — | — |

## Brouillon — formulaire « Sécurité des données » Google Play
- Collecte : Nom, E-mail, Numéro de téléphone (pro, facultatif), Position précise (premier plan), Photos, Enregistrements vocaux, Autre contenu utilisateur (notes, commandes), Identifiants d'appareil (jeton push), Journaux de plantage. Toutes **chiffrées en transit (TLS)**, **suppression possible par l'utilisateur** (Mon profil → Supprimer mon compte). Aucun partage avec des tiers à des fins publicitaires ; sous-traitants : hébergement (Emergent), e-mail transactionnel (Resend), paiement (Stripe, web uniquement), Firebase Cloud Messaging (push).
- Finalités : Fonctionnalités de l'application, Gestion du compte, Communications (notifications professionnelles).
- Pratiques : pas de collecte de données d'enfants, pas de suivi publicitaire, politique de confidentialité : `https://www.bevid-crm.com/legal/politique-confidentialite`.

## Organisation de démonstration pour la revue (aucune vraie donnée)
Organisation « BEVID Démo » du preview (données fictives : ADT 64, Tour Eiffel Test, La gaté…). Identifiants dans BLOCAGES.md § 9. Pour la production, créer une org démo dédiée après Republish (bouton « Charger des données démo » désactivé en production → seed à faire par script).
