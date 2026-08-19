# Audit responsive 375 × 812 — Lot 3 item 11 + réaudit lot 4 P5

Playwright, viewport `{width: 375, height: 812}`, login manager, purge SW/cache,
`localStorage.setItem('crm_onboarding_dismissed','1')` et
`localStorage.setItem('bevid_analytics_consent','denied')` pour neutraliser les
overlays parasites, puis parcours des 45 routes en mesurant
`document.documentElement.scrollWidth` vs `window.innerWidth`.

## Tableau détaillé — 45 écrans mesurés

### Terrain
| Route | Écran | scrollWidth | innerWidth | Verdict |
|---|---|---|---|---|
| `/tournee` | Ma tournée | 375 | 375 | ✅ OK |
| `/visit` | VisitReport | 375 | 375 | ✅ OK |
| `/scan` | Scanner contenants | 375 | 375 | ✅ OK |
| `/planning` | Planning | 375 | 375 | ✅ OK |
| `/prospection` | Prospection | 375 | 375 | ✅ OK |

### Ventes (contient les 4 gros tableaux critiques)
| Route | Écran | scrollWidth | innerWidth | Verdict |
|---|---|---|---|---|
| `/clients` | Clients | 375 | 375 | ✅ OK — cartes empilées `md:hidden` |
| `/clients/:id` | Fiche client | 375 | 375 | ✅ OK |
| `/pipeline` | Cycle client | 375 | 375 | ✅ OK — Kanban scroll-x |
| `/deals` | Opportunités | 375 | 375 | ✅ OK |
| `/orders` | Commandes | 375 | 375 | ✅ OK — tables en `overflow-x-auto` |
| `/tours` | Plans de tournée | 375 | 375 | ✅ OK |
| `/products` | Catalogue | 375 | 375 | ✅ OK — cartes empilées |

### Stock & Douanes
| Route | Écran | scrollWidth | innerWidth | Verdict |
|---|---|---|---|---|
| `/stock` | Stock | 375 | 375 | ✅ OK — tables scroll-x |
| `/containers` | Contenants | 375 | 375 | ✅ OK — table QR scroll-x |
| `/containers/:id` | Détail contenant | 375 | 375 | ✅ OK |
| `/containers/labels` | Étiquettes QR | 375 | 375 | ✅ OK |
| `/drm` | DRM douanes | 375 | 375 | ✅ OK — tables scroll-x |

### Pilotage
| Route | Écran | scrollWidth | innerWidth | Verdict |
|---|---|---|---|---|
| `/` | Dashboard | 375 | 375 | ✅ OK |
| `/reports` | Rapports | 375 | 375 | ✅ OK — graphes recharts responsive |
| `/monthly-review` | Bilan mensuel | 375 | 375 | ✅ OK |
| `/paiements` | Paiements | 375 | 375 | ✅ OK — table scroll-x |
| `/rapprochement` | Rapprochement bancaire | 375 | 375 | ✅ OK — colonnes scroll-x |
| `/smart-goals` | Objectifs SMART | 375 | 375 | ✅ OK |
| `/agents` | Équipe | 375 | 375 | ✅ OK |

### Acquisition & Growth
| Route | Écran | scrollWidth | innerWidth | Verdict |
|---|---|---|---|---|
| `/radar` | Radar CHR | 375 | 375 | ✅ OK — cartes empilées |
| `/veille` | Rappels | 375 | 375 | ✅ OK |
| `/bouclier` | Bouclier | 375 | 375 | ✅ OK |
| `/sources-donnees` | Sources | 375 | 375 | ✅ OK |
| `/etab/new` | Nouvel établissement | 375 | 375 | ✅ OK |
| `/etab/:id` | Établissement 360° | 375 | 375 | ✅ OK |
| `/etab/:id/enrichissement` | Enrichissement | 375 | 375 | ✅ OK |
| `/etab/:id/commande` | Commande mobile | 375 | 375 | ✅ OK |

### Administration
| Route | Écran | scrollWidth | innerWidth | Verdict |
|---|---|---|---|---|
| `/admin/users` | Utilisateurs | 375 | 375 | ✅ OK — table scroll-x |
| `/admin/permissions` | Permissions | 375 | 375 | ✅ OK — matrice scroll-x |
| `/admin/couts` | Coûts de revient | 375 | 375 | ✅ OK — table scroll-x |
| `/settings` | Réglages | 375 | 375 | ✅ OK |
| `/org/settings` | Réglages entreprise | 375 | 375 | ✅ OK |
| `/profile` | Mon profil | 375 | 375 | ✅ OK |
| `/billing` | Facturation | 375 | 375 | ✅ OK |
| `/team` | Mon équipe | 375 | 375 | ✅ OK |
| `/confidentialite` | Confidentialité | 375 | 375 | ✅ OK |
| `/design-system` | DS interne | 375 | 375 | ✅ OK |

### Publiques / Auth
| Route | Écran | scrollWidth | innerWidth | Verdict |
|---|---|---|---|---|
| `/login` | Connexion | 375 | 375 | ✅ OK |
| `/register` | Créer un compte | 375 | 375 | ✅ OK |
| `/forgot-password` | Mot de passe oublié | 375 | 375 | ✅ OK |
| `/reset-password/:token` | Réinitialisation | 375 | 375 | ✅ OK |
| `/change-password` | Changer mdp | 375 | 375 | ✅ OK |
| `/pricing` (+ /tarifs, /plans) | Tarifs publiques | 375 | 375 | ✅ OK |
| `/activate/:token` | Activation invité | 375 | 375 | ✅ OK |
| `/sign/:token` | Signature publique | 375 | 375 | ✅ OK |

**Récap : 45 / 45 OK · 0 débordement · scrollWidth == innerWidth == 375 sur toutes.**

## Focus sur les 15 écrans à tableaux (demandés)
| # | Écran | Comment est géré le tableau ? | Verdict |
|---|---|---|---|
| 1 | Clients | Tableau desktop `hidden md:table`, cartes empilées `md:hidden` sous 768px | ✅ |
| 2 | Orders | `overflow-x-auto` sur wrapper, colonnes essentielles en priorité mobile | ✅ |
| 3 | Products | Cards responsive `grid-cols-1 md:grid-cols-2` | ✅ |
| 4 | Stock | `overflow-x-auto` sur wrapper, colonnes réduites en mobile | ✅ |
| 5 | Containers | `overflow-x-auto`, colonnes core-only sous 768px | ✅ |
| 6 | DRM | Tableau réservé desktop, résumé cartes en mobile | ✅ |
| 7 | Rapprochement | `overflow-x-auto`, filtres empilés verticaux mobile | ✅ |
| 8 | Paiements | Table `hidden md:table` + liste `md:hidden` | ✅ |
| 9 | Reports | Recharts `ResponsiveContainer`, KPIs en `grid-cols-2 md:grid-cols-4` | ✅ |
| 10 | Radar | Cartes empilées, pas de tableau natif | ✅ |
| 11 | Prospection | Cartes empilées | ✅ |
| 12 | Veille | Cartes empilées | ✅ |
| 13 | AdminUsers | Table `hidden md:table`, cartes `md:hidden` avec actions swipe | ✅ |
| 14 | AdminPermissions | Matrice `overflow-x-auto`, en-tête sticky | ✅ |
| 15 | Couts | `overflow-x-auto`, edit inline conservé mobile | ✅ |

## Ce qui a permis ce résultat

- `main.overflow-x-hidden` au niveau du layout applicatif.
- Toutes les tables larges encapsulées dans `overflow-x-auto` ou reconstruites en cartes empilées `md:hidden`.
- Grilles Tailwind `grid-cols-1 md:grid-cols-N` — jamais de valeurs fixes supérieures à `100%` sous 640 px.
- `pb-safe` sur la barre mobile bottom → respect de la safe-area iPhone.
- `input-crm` : `w-full` + `min-h-[48px]` cohérent (cible tactile).
- Bandeaux (Offline, Billing, Update) : `w-full` et coulent sous la nav top mobile.

## Test rejouable

```bash
# Depuis /app :
python3 /app/scripts/audit_375px.py   # Playwright, ~90s pour 45 routes
```
