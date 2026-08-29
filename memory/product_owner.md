# BEVID — Rôle propriétaire produit (`super_admin`)

## Deux mécanismes distincts

**L'organisation exemptée** — le propriétaire utilise BEVID comme n'importe
quel client, dans son propre espace, sans jamais payer ni être limité.
Documenté dans `billing_exemption.md`.

**Le rôle `super_admin`** — l'administration du logiciel BEVID en tant que
produit vendu à plusieurs entreprises. C'est le sujet de ce document.

## Configuration

Variable d'environnement `OWNER_EMAILS` (backend/.env) — adresses e-mail
séparées par des virgules :

```
OWNER_EMAILS=guillaume@sulauze.com,owner.bevid@bevidcrm.fr
```

Alias historique `BEVID_FOUNDER_EMAILS` conservé pour compat rétrograde.
La liste combinée est calculée au démarrage :

```python
PRODUCT_OWNER_EMAILS = FOUNDER_EMAILS | OWNER_EMAILS
```

## Amorçage automatique (idempotent, survit aux migrations)

À chaque démarrage backend, le hook `_bootstrap_owner_exemptions()` fait
pour chaque email de `PRODUCT_OWNER_EMAILS` :

1. `super_admin_role = True` + `super_admin_since` sur son user
2. Sur son organisation :
   - `billing_exempt = True`, `billing_exempt_reason = "product_owner"`
   - `plan = "entreprise"`, `status = "active"`, `trial_ends_at = None`
   - `unlimited_seats = True`, `unlimited_ai_quota = True`

**Aucun effet sur les autres organisations.** Si l'email n'existe pas comme
user en base, log info et skip (l'exemption s'appliquera au premier redémarrage
qui suit sa création).

## Ce que le rôle `super_admin` débloque

Endpoints protégés par `require_super_admin` (403 sinon) :

| Endpoint                          | Contenu                                          |
|-----------------------------------|--------------------------------------------------|
| `GET /api/admin/orgs`             | Liste des orgs — métadonnées uniquement          |
| `GET /api/admin/kpis`             | Indicateurs produit (total, essais, exemptés)    |
| `POST /api/billing/exempt/{org}`  | Accorder l'exemption à une org tierce           |
| `DELETE /api/billing/exempt/{org}`| Retirer l'exemption d'une org tierce             |

## LA LIMITE — aucun accès aux données métier

**Le rôle `super_admin` ne donne aucun accès aux clients, commandes,
contrats, contacts, produits, DRM, paiements des organisations clientes.**

C'est une position ferme, pas une précaution. Le jour où BEVID est vendu
à une brasserie concurrente d'une autre, elle demandera qui peut voir son
fichier clients. La réponse doit être : **personne, y compris l'éditeur.**

Le mécanisme technique est `scoped_db` (contextvars + wrapper Motor) qui
filtre par `org_id` toute lecture/écriture sur les 47 collections métier.
Un super_admin en session n'a pas d'accès privilégié à ce filtre. S'il
essaie de lire `/api/clients`, il ne verra que ceux de son propre org
(car son contextvar `_current_org` est le sien).

### Vérification
```python
# Cf tests/test_product_owner.py
def test_super_admin_cant_read_other_orgs_data():
    # Fait un GET /api/clients en tant que super_admin → ne voit que sa propre org
```

## Accès de support (procédure explicite)

Endpoints à disposition du **client** (manager de son org) :

| Endpoint                             | Effet                                          |
|--------------------------------------|------------------------------------------------|
| `POST /api/support-access/grant`     | Le client autorise un accès de support pour N heures (cap 72h) |
| `POST /api/support-access/{id}/revoke` | Le client révoque avant échéance             |
| `GET /api/support-access`            | Le client voit **son propre journal** — qui, quand, pourquoi, encore actif ? |

Chaque grant contient : `granted_by`, `granted_at`, `reason` (280 car max),
`expires_at`, `revoked_at`.

**Aujourd'hui, le grant est journalisé mais ne débloque encore rien.**
La fonction `_support_access_valid()` retourne toujours `False` : c'est un
verrou explicite tant que le flow réel n'est pas construit avec ses propres
gardes-fous (lecture seule, temps limité, portée limitée aux endpoints
strictement nécessaires au diagnostic).

Prochaine itération : quand le support en aura besoin, ajouter un mode
« lecture seule scopé au grant actif » sur un sous-ensemble d'endpoints de
consultation. Jamais d'écriture, jamais d'export en masse.

## Comptes actuellement propriétaires (27 février 2026)

- `guillaume@sulauze.com` — propriétaire principal
- `owner.bevid@bevidcrm.fr` — compte de démonstration owner

Pour ajouter un email :
1. Éditer `OWNER_EMAILS` dans `/app/backend/.env`
2. `sudo supervisorctl restart backend`
3. L'amorçage applique l'exemption + super_admin au premier redémarrage

Pour retirer un email :
1. Éditer `OWNER_EMAILS`
2. Restart backend
3. **Attention** : les drapeaux posés (`billing_exempt`, `super_admin_role`) restent.
   Pour révoquer, appeler `DELETE /api/billing/exempt/{org_id}` **et** mettre à jour
   `users.super_admin_role = False` manuellement.

## Tests de verrouillage

`/app/backend/tests/test_billing_exempt.py` — 8 tests, exécution :
```bash
cd /app/backend && python3 -m pytest tests/test_billing_exempt.py -v
```

`/app/backend/tests/test_product_owner.py` — 4 tests supplémentaires sur le rôle.

**Ces tests doivent rester verts.** Une PR qui les casse a probablement
retiré silencieusement l'exemption ou le rôle produit.
