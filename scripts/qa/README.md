# BEVID — Porte de qualité automatique

Vérification systématique des écrans à chaque livraison. **Bloque si
la qualité régresse.** Une livraison sans rapport vert n'est plus
une livraison.

## Lancement

```bash
python3 /app/scripts/qa/run.py            # audit complet (public + auth, 3 viewports)
python3 /app/scripts/qa/run.py --quick    # publiques uniquement (plus rapide)
python3 /app/scripts/qa/run.py --no-auth  # skip auth pages
```

## Sorties

- `/app/qa-reports/latest.json` — données brutes, comparable machine
- `/app/qa-reports/latest.md`   — rapport humain
- Rapports horodatés archivés à chaque nouvelle exécution

Code de retour :
- `0` — tous les budgets **durs** respectés
- `1` — au moins une métrique dure dépasse son budget

## Métriques mesurées

| Métrique                          | Budget | Sévérité |
|-----------------------------------|-------:|----------|
| overflow_horizontal               | 0      | hard     |
| tables_overflowing_container      | 0      | hard     |
| touch_targets_below_44px_mobile   | 0      | hard     |
| missing_labels                    | 0      | hard     |
| images_without_alt                | 0      | hard     |
| h1_count_not_one                  | 0      | hard     |
| heading_level_skips               | 0      | hard     |
| title_missing_or_generic          | 0      | hard     |
| text_below_12px                   | 0      | hard     |
| console_errors                    | 0      | hard     |
| csp_violations                    | 0      | hard     |
| transient_load_failures           | 3      | soft     |
| bundle_size_kb                    | 5000   | soft     |
| lcp_ms (p75)                      | 3500   | soft     |

## Stratégie de résilience — réessai plutôt que filtrage

**Règle absolue** : la porte ne détourne jamais le regard sur un défaut
qui affecterait l'utilisateur en production.

Quand une page échoue à charger au premier essai (React non monté, bundle
retourné avec un MIME inattendu, aucun contenu visible), le runner
**réessaie une fois** après 1,5 s :

- **Le second essai réussit** → l'incident est compté dans
  `transient_load_failures` (métrique dédiée, budget 3 par exécution).
  Le rapport ne rouge pas, mais l'information est tracée.
- **Le second essai échoue aussi** → c'est un vrai défaut. L'erreur
  reste dans `console_errors` et fait échouer la porte.

Un compteur `transient_load_failures` qui grimpe est le signal que
l'hébergement se dégrade. C'est une information, pas du bruit.

## Exceptions actives — liste avec justifications

Une exception filtrée n'est légitime que si elle remplit **les trois
critères suivants** :

1. La cause est **extérieure à notre code** — un tiers, le proxy, l'outil de mesure.
2. Elle **n'affecte pas l'utilisateur** dans l'usage réel.
3. Elle est **constante et explicable**, jamais intermittente.

Toute exception ajoutée doit être documentée ici avec sa date.

### Liste courante (27 février 2026)

| Motif                                   | Cause extérieure | Sans impact utilisateur | Constante | Date |
|-----------------------------------------|:----------------:|:-----------------------:|:---------:|------|
| `cloudflareinsights` / `beacon.min.js`  | ✅ proxy CF injecte le beacon, bloqué par notre propre CSP | ✅ l'app fonctionne | ✅ toujours présent | 2026-02-27 |
| `posthog` / `ap.emergent.sh` / `font-size:0;color:transparent` | ✅ tiers analytics, non chargé sans opt-in | ✅ comportement voulu | ✅ constant | 2026-02-27 |
| `manifest.json` warnings                | ✅ preview CDN, jamais en prod | ✅ n'affecte pas l'UX | ✅ constant en preview | 2026-02-27 |

### Ce qui n'est **pas** une exception valable

- **Rate-limits 429** déclenchés par la vitesse d'audit → traités par
  login unique via `storage_state`, pas par filtrage. Si un 429 réel
  arrivait sur une page utilisateur, la porte doit rouge.
- **Erreurs MIME `text/html` sur bundle.js** → refusé comme exception :
  quand c'est réel, l'app est cassée. Traité par la stratégie de
  réessai (`transient_load_failures`).
- **WebSocket wss:// échec** → refusé comme exception : les WS ne
  sont pas nécessaires en dev preview mais le pattern est vérifié par
  la stratégie de réessai. À réactiver comme échec dur quand la
  fonctionnalité WS temps réel arrive.

## Où éditer

- **Ajouter une route** → `/app/scripts/qa/config.json` → `routes.public` / `routes.auth`
- **Ajuster un budget** → `/app/scripts/qa/config.json` → `budgets.<metric>.max`
- **Modifier un check** → `/app/scripts/qa/checks.js` (JS injecté dans la page)
- **Ajouter/retirer une exception** → `run.py` → `_on_console`, **et documenter ici**

## Intégration au flux de livraison

À exécuter **avant chaque livraison** :

```bash
python3 /app/scripts/qa/run.py
```

Si le code de retour est différent de 0, la livraison ne part pas —
soit le code est corrigé, soit un budget est justifié en écrit et modifié
avec l'accord explicite du PO.
