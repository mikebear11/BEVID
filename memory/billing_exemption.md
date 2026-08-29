# BEVID — Mécanisme d'exemption de facturation

## Ce que c'est

Une organisation marquée `billing_exempt = True` a **accès illimité et gratuit
à toutes les fonctionnalités du forfait Entreprise, sans date de fin**.
Elle n'est jamais dégradée en `read_only` ni en `suspended`, quelle que soit
la date de `trial_ends_at` ou le statut Stripe.

Usage prévu : fondateur, comptes partenaires, comptes de démonstration commerciaux.

## Où c'est stocké

Collection MongoDB : `organizations`
Champ : `billing_exempt` (booléen, valeur strictement `True`)
Métadonnées optionnelles :
- `billing_exempt_reason` — chaîne libre (ex : `"founder"`, `"partner"`, `"internal"`)
- `exempted_at` — ISO datetime
- `exempted_by` — id user qui a accordé l'exemption

**Attention** : seul `billing_exempt: True` (booléen strict) active l'exemption.
Ni `"true"` (string), ni `1`, ni `null` ne l'activent. Verrouillé par test.

## Où c'est lu

**Fichier** : `/app/backend/server.py`
**Fonction** : `_compute_effective_status(org)` — ligne ~2752

Court-circuit en tête de fonction : si `org.get("billing_exempt") is True`,
retour immédiat `"active"`. Toutes les autres branches (Stripe, trial expiré)
sont court-circuitées.

Ce statut effectif est utilisé dans :
- `/api/billing/current` — champ `effective_status`
- Middleware paywall (`assert_write_allowed`) qui bloque les mutations sur
  `read_only` / `suspended`
- Champ `user["org_status"]` chargé par `get_current_user`

## Ce que ça débloque

Une org exemptée obtient de fait :
- Forfait `entreprise` (toutes les features)
- `status = active`, `trial_ends_at = None`
- Aucune limite de sièges
- Aucun bandeau « essai bientôt terminé »
- Aucune bascule automatique après échéance
- Ignorer les webhooks Stripe `past_due` / `canceled`

Le script `/app/backend/scripts/grant_founder_exemption.py <email>` applique
tous ces réglages en une commande, idempotent.

## Le verrou (protection contre régression silencieuse)

**Fichier de test** : `/app/backend/tests/test_billing_exempt.py`
**Exécution** : `cd /app/backend && python3 -m pytest tests/test_billing_exempt.py -v`

8 assertions :
1. Trial expiré hier → `active`
2. Trial expiré il y a un an → `active`
3. Stripe `past_due` → `active`
4. Stripe `canceled` → `active`
5. `status=suspended` en base → `active` (l'exemption sur-écrase)
6. Contrôle négatif : non-exempt expiré → `read_only`/`suspended`
7. Absence de champ ≠ exemption
8. Seul `True` booléen exempte, pas les truthy équivalents

**Toute PR qui casse ce test signifie que la logique d'exemption a été
perdue.** Le mécanisme est invisible dans l'UI — sans ce test, une refonte
du moteur de facturation peut le supprimer sans que personne s'en aperçoive
avant qu'un compte exempté ne soit facturé à tort ou dégradé silencieusement.

## Organisations actuellement exemptées

| Email                          | Organisation           | Raison       | Depuis      |
|--------------------------------|------------------------|--------------|-------------|
| `owner.bevid@bevidcrm.fr`      | BEVID Owner            | `owner_admin`| session 22 |
| `guillaume@sulauze.com`        | guillaume david · CRM  | `founder`    | 2026-02-27 |

Pour lister depuis MongoDB :
```
db.organizations.find({billing_exempt: true}, {name: 1, billing_exempt_reason: 1, exempted_at: 1})
```

## Accorder / retirer l'exemption

**Via script (recommandé, idempotent)** :
```bash
python /app/backend/scripts/grant_founder_exemption.py <email>
```

**Via API (fondateur seulement, contrôlé par `BEVID_FOUNDER_EMAILS` env)** :
```
POST   /api/billing/exempt/{org_id}       # accorde
DELETE /api/billing/exempt/{org_id}       # retire
```

Ces deux endpoints sont réservés aux emails listés dans la variable
d'environnement `BEVID_FOUNDER_EMAILS` (séparés par virgules).

## Décisions produit associées

- L'exemption est un **court-circuit global**, pas une somme d'overrides
  par feature. Simple à raisonner, simple à tester.
- Le champ `plan` reste sur `"entreprise"` pour cohérence UI (le compte
  voit bien « Entreprise » et non « Trial »).
- L'exemption **n'exempte pas** des règles produit hors facturation :
  RGPD, rate limits techniques, isolation multi-tenant, quotas de stockage.
- Retirer une exemption **n'a aucun effet immédiat**. Le statut redevient
  calculé à partir de `trial_ends_at` et de Stripe. Pour dégrader un compte
  ex-exempté, il faut aussi remettre à jour ces champs.
