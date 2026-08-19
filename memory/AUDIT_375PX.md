# Audit responsive 375 × 812 — Lot 3 item 11

Test automatisé Playwright sur les 25 écrans à risque tables/graphes.
Connexion `manager.demo@bevidcrm.fr` (accès complet à toutes les permissions).

| Route | Écran | scrollWidth | innerWidth | Verdict |
|---|---|---|---|---|
| `/` | Dashboard | 375 | 375 | ✓ OK |
| `/clients` | Clients | 375 | 375 | ✓ OK |
| `/orders` | Orders | 375 | 375 | ✓ OK |
| `/products` | Products | 375 | 375 | ✓ OK |
| `/stock` | Stock | 375 | 375 | ✓ OK |
| `/containers` | Containers | 375 | 375 | ✓ OK |
| `/drm` | DRM | 375 | 375 | ✓ OK |
| `/rapprochement` | Rapprochement | 375 | 375 | ✓ OK |
| `/paiements` | Paiements | 375 | 375 | ✓ OK |
| `/reports` | Reports | 375 | 375 | ✓ OK |
| `/radar` | Radar | 375 | 375 | ✓ OK |
| `/prospection` | Prospection | 375 | 375 | ✓ OK |
| `/veille` | Veille | 375 | 375 | ✓ OK |
| `/admin/users` | AdminUsers | 375 | 375 | ✓ OK |
| `/admin/permissions` | AdminPermissions | 375 | 375 | ✓ OK |
| `/admin/couts` | Couts | 375 | 375 | ✓ OK |
| `/tournee` | Tournee | 375 | 375 | ✓ OK |
| `/pipeline` | Pipeline | 375 | 375 | ✓ OK |
| `/deals` | Deals | 375 | 375 | ✓ OK |
| `/tours` | Tours | 375 | 375 | ✓ OK |
| `/visit` | VisitReport | 375 | 375 | ✓ OK |
| `/planning` | Planning | 375 | 375 | ✓ OK |
| `/monthly-review` | MonthlyReview | 375 | 375 | ✓ OK |
| `/settings` | Settings | 375 | 375 | ✓ OK |
| `/confidentialite` | Confidentialite | 375 | 375 | ✓ OK |

**Récap : 25 OK · 0 débordement · 0 erreur sur 25 pages.**

## Ce qui a permis ce résultat

- `main.overflow-x-hidden` au niveau du layout applicatif.
- Toutes les tables déjà encapsulées dans `overflow-x-auto` ou reconstruites en cartes
  empilées à `md:hidden` (par ex. Clients, Orders, Paiements).
- Grilles Tailwind `grid-cols-1 md:grid-cols-N` — jamais de valeurs fixes
  supérieures à `100%` sous 640 px.
- `pb-safe` sur la barre mobile bottom → respect de la safe-area iPhone.
- `input-crm` a `w-100%` + `min-h-[48px]` cohérent (cible tactile).

## Test rejouable

Playwright, viewport `{width: 375, height: 812}`, login manager, purge SW/cache,
`localStorage.setItem('crm_onboarding_dismissed','1')` et
`localStorage.setItem('bevid_analytics_consent','denied')` pour neutraliser les
overlays parasites, puis parcourir les 25 routes en mesurant
`document.documentElement.scrollWidth` vs `window.innerWidth`.
