#!/usr/bin/env python3
"""BEVID — Porte de qualité automatique.

Parcourt les écrans publics et authentifiés à 3 tailles d'écran (mobile,
tablette, desktop) et mesure 10 métriques dures + 2 métriques budgétées.

Sortie :
  - /app/qa-reports/latest.json  (données brutes, comparable)
  - /app/qa-reports/latest.md    (rapport humain)
  - Code de retour non-zéro si une métrique dure dépasse son budget ou
    régresse par rapport au rapport précédent.

Usage :
  python3 /app/scripts/qa/run.py             # exécution complète
  python3 /app/scripts/qa/run.py --quick     # publiques uniquement
  python3 /app/scripts/qa/run.py --no-auth   # skip la partie authentifiée
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from playwright.async_api import async_playwright, Error as PWError

ROOT = Path(__file__).resolve().parent
REPORTS_DIR = Path("/app/qa-reports")
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

CONFIG_PATH = ROOT / "config.json"
CHECKS_JS_PATH = ROOT / "checks.js"


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text())


def load_backend_url() -> str:
    env_path = Path("/app/frontend/.env")
    for line in env_path.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL introuvable")


async def measure_lcp(page) -> float | None:
    """LCP via PerformanceObserver, timeout 2s (non bloquant)."""
    try:
        lcp = await page.evaluate(
            """
            new Promise((resolve) => {
              let lcp = null;
              try {
                new PerformanceObserver((list) => {
                  const entries = list.getEntries();
                  if (entries.length) lcp = entries[entries.length - 1].startTime;
                }).observe({ type: "largest-contentful-paint", buffered: true });
              } catch (e) { resolve(null); return; }
              setTimeout(() => resolve(lcp), 1800);
            });
            """
        )
        return round(lcp, 1) if lcp else None
    except PWError:
        return None


async def login(page, base_url: str, credentials: dict) -> bool:
    await page.goto(f"{base_url}/login", wait_until="domcontentloaded", timeout=15000)
    await page.wait_for_timeout(500)
    try:
        # Champs
        email_input = page.locator("input[type='email'], input[name='email'], input[autocomplete='username']").first
        pwd_input = page.locator("input[type='password']").first
        await email_input.fill(credentials["email"])
        await pwd_input.fill(credentials["password"])
        # Soumission
        await pwd_input.press("Enter")
        # Attente redirection hors /login
        for _ in range(30):
            await page.wait_for_timeout(300)
            url = page.url
            if "/login" not in url:
                return True
        return False
    except Exception as e:
        print(f"    login failed: {e}", file=sys.stderr)
        return False


async def audit_page(
    page,
    url: str,
    viewport_name: str,
    checks_js: str,
    generic_titles: set[str],
) -> dict:
    """Audit d'une page. Ré-essai automatique si le premier chargement échoue
    (React n'a pas monté, ou erreur console indiquant un échec de bundle).
    Un second échec devient un vrai défaut compté dans console_errors.
    Un premier échec récupéré est compté dans transient_load_failures.
    """
    for attempt in (1, 2):
        console_errors: list[dict] = []
        csp_violations: list[dict] = []
        transient = False

        def _on_console(msg):
            if msg.type == "error":
                text = msg.text
                # Exceptions filtrées — chaque entrée respecte les 3 critères :
                # 1. cause extérieure à notre code
                # 2. n'affecte pas l'utilisateur en usage réel
                # 3. constante et explicable, jamais intermittente
                # Toute addition à cette liste doit être justifiée dans README.md.
                if any(n in text for n in [
                    # Beacon Cloudflare injecté par le proxy CDN (bloqué par notre propre CSP) —
                    # tiers, aucun impact utilisateur, constant.
                    "cloudflareinsights", "beacon.min.js",
                    # PostHog non chargé quand l'opt-in n'est pas donné — comportement voulu.
                    # Inclut sa signature CSS-in-console `%c%d font-size:0;color:transparent`
                    # émise par le SDK avant tout ping.
                    "posthog", "ap.emergent.sh",
                    "font-size:0;color:transparent",
                    # Warnings PWA sur manifest — spécifiques au preview, jamais en prod.
                    "manifest.json", "manifest:",
                ]):
                    return
                console_errors.append({"text": text[:200], "location": msg.location.get("url", "")[:120] if msg.location else ""})

        def _on_page_error(err):
            console_errors.append({"text": str(err)[:200], "location": "pageerror"})

        def _on_response(resp):
            if resp.status >= 400 and "/api/csp-report" in resp.url:
                csp_violations.append({"url": resp.url, "status": resp.status})

        page.on("console", _on_console)
        page.on("pageerror", _on_page_error)

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=12000)
        except PWError as e:
            page.remove_listener("console", _on_console)
            page.remove_listener("pageerror", _on_page_error)
            if attempt == 1:
                await asyncio.sleep(1.2)
                continue
            return {"error": f"navigation_failed: {e}", "url": url}

        await page.wait_for_timeout(700)

        # Vérifier que React a monté quelque chose de visible
        has_content = await page.evaluate(
            "() => document.body && document.body.innerText && document.body.innerText.trim().length > 30"
        )
        # Indicateur d'échec de bundle : erreur MIME ou aucun contenu rendu
        bundle_failed = any(
            n in (e.get("text") or "") for e in console_errors
            for n in ("MIME type", "strict MIME type", "Refused to execute script")
        )

        if (not has_content or bundle_failed) and attempt == 1:
            # Chargement transient raté — on réessaie une fois
            transient = True
            page.remove_listener("console", _on_console)
            page.remove_listener("pageerror", _on_page_error)
            await asyncio.sleep(1.5)
            continue

        # LCP + checks
        lcp = await measure_lcp(page)
        try:
            checks_result = await page.evaluate(checks_js)
        except PWError as e:
            page.remove_listener("console", _on_console)
            page.remove_listener("pageerror", _on_page_error)
            return {"error": f"checks_failed: {e}", "url": url}

        title = (checks_result.get("title_meta") or {}).get("title", "")
        title_missing = not title or title in generic_titles
        checks_result["title_meta"]["missing_or_generic"] = title_missing

        page.remove_listener("console", _on_console)
        page.remove_listener("pageerror", _on_page_error)

        return {
            "url": url,
            "viewport": viewport_name,
            "title": title,
            "title_missing_or_generic": title_missing,
            "lcp_ms": lcp,
            "console_errors": console_errors,
            "csp_violations": csp_violations,
            # transient_load_failure = 1 uniquement si le PREMIER essai a échoué
            # et que le SECOND a réussi. Un second échec devient un vrai défaut
            # via console_errors (l'erreur bundle reste dans la liste).
            "transient_load_failure": 1 if attempt == 2 and not transient else 0,
            **checks_result,
        }
    # Si on tombe ici c'est que les deux essais ont échoué — dernier retour vide
    return {"error": "both_attempts_failed", "url": url}


def summarize_route(audit: dict, viewport_name: str) -> dict:
    """Réduit une exécution route+viewport à un dict de compteurs par métrique."""
    if "error" in audit:
        return {"error": audit["error"]}
    # touch_targets uniquement en mobile
    touch = audit.get("touch_targets_small", []) if viewport_name == "mobile" else []
    text_small = audit.get("text_small", [])
    return {
        "overflow_horizontal":            len(audit.get("overflow_horizontal", [])),
        "tables_overflowing_container":   len(audit.get("tables_overflowing", [])),
        "touch_targets_below_44px_mobile": len(touch),
        "missing_labels":                 len(audit.get("missing_labels", [])) + len(audit.get("buttons_no_name", [])),
        "images_without_alt":             len(audit.get("images_without_alt", [])),
        "h1_count_not_one":               len(audit.get("h1_count_not_one", [])),
        "heading_level_skips":            len(audit.get("heading_skips", [])),
        "title_missing_or_generic":       1 if audit.get("title_missing_or_generic") else 0,
        "text_below_12px":                len(text_small),
        "console_errors":                 len(audit.get("console_errors", [])),
        "csp_violations":                 len(audit.get("csp_violations", [])),
        "transient_load_failures":        audit.get("transient_load_failure", 0),
        "lcp_ms":                         audit.get("lcp_ms"),
    }


async def get_bundle_size_kb(base_url: str) -> int | None:
    """Poids du bundle principal. HEAD, sinon GET avec lecture du body."""
    import urllib.request
    url = f"{base_url}/static/js/bundle.js"
    headers = {"User-Agent": "Mozilla/5.0 BEVID-QA"}
    # 1. Essayer HEAD (rapide)
    try:
        req = urllib.request.Request(url, method="HEAD", headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            cl = resp.headers.get("Content-Length")
            if cl and int(cl) > 0:
                return round(int(cl) / 1024)
    except Exception:
        pass
    # 2. Fallback GET (mesure exacte)
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
            if len(data) > 0:
                return round(len(data) / 1024)
    except Exception as e:
        print(f"    bundle size GET failed: {e}", file=sys.stderr)
    return None


def compare_with_previous(current: dict, budgets: dict) -> tuple[list[str], list[str]]:
    """Retourne (violations_budget, regressions_vs_previous)."""
    prev_path = REPORTS_DIR / "latest.json"
    previous = None
    if prev_path.exists():
        try:
            previous = json.loads(prev_path.read_text())
        except Exception:
            previous = None

    violations = []
    regressions = []
    totals = current["totals"]

    for metric, budget in budgets.items():
        val = totals.get(metric)
        if val is None:
            continue
        max_v = budget["max"]
        severity = budget["severity"]
        if val > max_v:
            violations.append(
                f"[{severity.upper()}] {metric}: {val} > budget {max_v} ({budget['unit']})"
            )

    if previous:
        prev_totals = previous.get("totals", {})
        for metric in totals:
            if metric == "lcp_ms":  # LCP variable, ne pas alerter en régression stricte
                continue
            new_val = totals[metric]
            old_val = prev_totals.get(metric)
            if old_val is not None and isinstance(new_val, (int, float)) and new_val > old_val:
                regressions.append(f"{metric}: {old_val} → {new_val}")

    return violations, regressions


def build_markdown(report: dict, violations: list[str], regressions: list[str]) -> str:
    ts = report["generated_at"]
    totals = report["totals"]
    lines = [
        "# BEVID — Rapport de qualité",
        "",
        f"**Généré** : {ts}",
        f"**URL** : {report['base_url']}",
        f"**Routes auditées** : {report['routes_count']} × {len(report['viewports'])} viewports = **{report['audits_count']} audits**",
        "",
        "## Résultat global",
        "",
    ]
    if violations:
        lines.append("### ❌ Violations de budget")
        for v in violations:
            lines.append(f"- {v}")
        lines.append("")
    if regressions:
        lines.append("### ⚠️ Régressions par rapport au rapport précédent")
        for r in regressions:
            lines.append(f"- {r}")
        lines.append("")
    if not violations and not regressions:
        lines.append("✅ **Tous les budgets respectés, aucune régression détectée.**")
        lines.append("")

    lines.append("## Totaux par métrique")
    lines.append("")
    lines.append("| Métrique | Valeur | Budget |")
    lines.append("|---|---:|---:|")
    for metric, val in totals.items():
        budget = report["budgets"].get(metric, {})
        max_v = budget.get("max", "-")
        emoji = ""
        if isinstance(val, (int, float)) and isinstance(max_v, (int, float)):
            emoji = "❌ " if val > max_v else "✅ "
        val_display = "-" if val is None else val
        lines.append(f"| {metric} | {emoji}{val_display} | {max_v} |")
    lines.append("")

    # Détail par audit
    lines.append("## Détail par écran")
    lines.append("")
    for a in report["audits"]:
        summary = a["summary"]
        if "error" in summary:
            lines.append(f"- ❌ `{a['route']}` ({a['viewport']}) — {summary['error']}")
            continue
        # Compte uniquement les VIOLATIONS (métriques dures dépassant leur budget),
        # pas les valeurs > 0 en général (ex : LCP à 200ms n'est pas un problème).
        hard_metrics = {
            "overflow_horizontal", "tables_overflowing_container",
            "touch_targets_below_44px_mobile", "missing_labels",
            "images_without_alt", "h1_count_not_one", "heading_level_skips",
            "title_missing_or_generic", "text_below_12px",
            "console_errors", "csp_violations",
        }
        problems = {k: v for k, v in summary.items()
                    if k in hard_metrics and isinstance(v, int) and v > 0}
        if problems:
            probs_str = ", ".join(f"{k}={v}" for k, v in problems.items())
            lines.append(f"- ⚠️ `{a['route']}` ({a['viewport']}) — {probs_str}")
        else:
            lines.append(f"- ✅ `{a['route']}` ({a['viewport']})")
    lines.append("")
    lines.append(f"_Rapport JSON complet : `qa-reports/latest.json`_")
    return "\n".join(lines)



async def collect_internal_links(page) -> list[str]:
    """Liens internes (`a[href^='/']`) présents sur l'écran courant, sans ancre ni query."""
    try:
        return await page.evaluate("""() => [...document.querySelectorAll('a[href]')]
            .map(a => a.getAttribute('href') || '')
            .filter(h => h.startsWith('/') && !h.startsWith('//') && !h.startsWith('/api/'))
            .map(h => h.split('#')[0].split('?')[0])
            .filter(Boolean)""")
    except Exception:
        return []


async def main(args):
    config = load_config()
    base_url = load_backend_url()
    checks_js = CHECKS_JS_PATH.read_text()
    generic_titles = set(config["generic_titles"])
    budgets = config["budgets"]

    public_routes = config["routes"]["public"]
    auth_routes = [] if args.no_auth else config["routes"]["auth"]
    if args.quick:
        auth_routes = []

    audits = []
    internal_links: set = set()
    dead_links: list = []
    print(f"→ Base URL : {base_url}")
    print(f"→ Routes publiques : {len(public_routes)}")
    print(f"→ Routes auth      : {len(auth_routes)}")

    # Login unique (sauf --quick / --no-auth) — évite de déclencher le rate limit login.
    storage_state_path: str | None = None
    async with async_playwright() as pw:
        if auth_routes:
            print("\n▸ Login initial (session partagée pour tous les viewports)")
            browser = await pw.chromium.launch(headless=True)
            login_ctx = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                ignore_https_errors=True,
            )
            login_page = await login_ctx.new_page()
            logged = await login(login_page, base_url, config["credentials"])
            if logged:
                storage_state_path = "/tmp/qa_storage_state.json"
                await login_ctx.storage_state(path=storage_state_path)
                print("    ✓ session sauvée")
            else:
                print("    ⚠️ login échoué — routes auth seront skippées")
            await login_ctx.close()
            await browser.close()

        browser = await pw.chromium.launch(headless=True)
        for vp in config["viewports"]:
            print(f"\n▸ Viewport {vp['name']} ({vp['width']}×{vp['height']})")
            try:
                context_kwargs = {
                    "viewport": {"width": vp["width"], "height": vp["height"]},
                    "ignore_https_errors": True,
                }
                if storage_state_path:
                    context_kwargs["storage_state"] = storage_state_path
                context = await browser.new_context(**context_kwargs)
                page = await context.new_page()

                # Publiques (jetables — pas besoin de session)
                for r in public_routes:
                    url = f"{base_url}{r['path']}"
                    print(f"    - {r['name']:20s} {r['path']}")
                    try:
                        audit = await audit_page(page, url, vp["name"], checks_js, generic_titles)
                        summary = summarize_route(audit, vp["name"])
                    except Exception as e:
                        print(f"      ! erreur: {e}", file=sys.stderr)
                        audit = {"error": str(e)[:200], "url": url}
                        summary = {"error": str(e)[:200]}
                    audits.append({
                        "route": r["path"],
                        "route_name": r["name"],
                        "viewport": vp["name"],
                        "summary": summary,
                        "raw": audit,
                    })
                    # Espace entre les requêtes : un utilisateur normal ne visite pas
                    # 15 pages en 15 secondes. Sans ce délai, l'audit déclenche les
                    # rate-limits de l'app elle-même (429 sur /api/*) et masque
                    # les vrais défauts.
                    await asyncio.sleep(0.8)

                # Authentifiées — session déjà restaurée via storage_state
                if auth_routes and storage_state_path:
                    for r in auth_routes:
                        url = f"{base_url}{r['path']}"
                        print(f"    - {r['name']:20s} {r['path']}")
                        try:
                            audit = await audit_page(page, url, vp["name"], checks_js, generic_titles)
                            summary = summarize_route(audit, vp["name"])
                            if vp["name"] == "mobile":
                                internal_links |= set(await collect_internal_links(page))
                        except Exception as e:
                            print(f"      ! erreur: {e}", file=sys.stderr)
                            audit = {"error": str(e)[:200], "url": url}
                            summary = {"error": str(e)[:200]}
                        audits.append({
                            "route": r["path"],
                            "route_name": r["name"],
                            "viewport": vp["name"],
                            "summary": summary,
                            "raw": audit,
                        })
                        await asyncio.sleep(0.8)

                # Liens morts (M1-C) : chaque lien interne vu sur les écrans mobiles doit répondre sans 404.
                if vp["name"] == "mobile" and internal_links:
                    audited = {r["path"] for r in auth_routes + public_routes}
                    to_check = sorted(l for l in internal_links if l not in audited)
                    print(f"    ▸ Vérification des liens internes ({len(to_check)})")
                    for link in to_check:
                        try:
                            await page.goto(f"{base_url}{link}", wait_until="networkidle", timeout=20000)
                            await page.wait_for_timeout(600)
                            if await page.locator('[data-testid="not-found-page"]').count() > 0:
                                dead_links.append(link)
                                print(f"      ✗ 404 : {link}")
                        except Exception as e:
                            print(f"      ! {link} : {str(e)[:80]}", file=sys.stderr)
                        await asyncio.sleep(0.4)

                await context.close()
            except Exception as e:
                print(f"  ⚠️ viewport {vp['name']} interrompu: {e}", file=sys.stderr)
                try:
                    await browser.close()
                except Exception:
                    pass
                browser = await pw.chromium.launch(headless=True)
        try:
            await browser.close()
        except Exception:
            pass

    # Totaux
    totals: dict = {k: 0 for k in budgets}
    lcp_values: list[float] = []
    for a in audits:
        s = a["summary"]
        if "error" in s:
            totals["console_errors"] = totals.get("console_errors", 0) + 1
            continue
        for k, v in s.items():
            if k == "lcp_ms":
                if v is not None:
                    lcp_values.append(v)
                continue
            totals[k] = totals.get(k, 0) + (v or 0)

    # LCP p75 (approximation avec le max si peu de mesures)
    if lcp_values:
        lcp_values.sort()
        idx = int(len(lcp_values) * 0.75)
        totals["lcp_ms"] = lcp_values[min(idx, len(lcp_values) - 1)]
    else:
        totals["lcp_ms"] = None

    # Bundle size (une seule mesure)
    bundle_kb = await get_bundle_size_kb(base_url)
    totals["bundle_size_kb"] = bundle_kb
    totals["dead_links"] = len(dead_links)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "base_url": base_url,
        "budgets": budgets,
        "viewports": [vp["name"] for vp in config["viewports"]],
        "routes_count": len(public_routes) + len(auth_routes),
        "audits_count": len(audits),
        "internal_links_checked": sorted(internal_links),
        "dead_links": dead_links,
        "totals": totals,
        "audits": audits,
    }

    # Comparaison avec précédent + violations budget
    violations, regressions = compare_with_previous(report, budgets)

    # Écrire les fichiers
    latest_json = REPORTS_DIR / "latest.json"
    latest_md = REPORTS_DIR / "latest.md"
    # Copie horodatée du précédent (si existait)
    if latest_json.exists():
        prev_ts = latest_json.stat().st_mtime
        archive_name = f"report-{time.strftime('%Y%m%d-%H%M%S', time.gmtime(prev_ts))}.json"
        (REPORTS_DIR / archive_name).write_bytes(latest_json.read_bytes())

    latest_json.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    latest_md.write_text(build_markdown(report, violations, regressions))

    print("\n" + "=" * 60)
    print(f"Rapport écrit : {latest_md}")
    print(f"Rapport JSON  : {latest_json}")
    print("=" * 60)
    print(f"Totaux :")
    for k, v in totals.items():
        budget = budgets.get(k, {})
        max_v = budget.get("max", "-")
        marker = ""
        if isinstance(v, (int, float)) and isinstance(max_v, (int, float)):
            marker = " ❌" if v > max_v else " ✅"
        print(f"  {k:35s} {v}{marker}    (budget {max_v})")

    if violations:
        print("\n❌ VIOLATIONS DE BUDGET :")
        for v in violations:
            print(f"  - {v}")
    if regressions:
        print("\n⚠️ RÉGRESSIONS :")
        for r in regressions:
            print(f"  - {r}")

    hard_violations = [v for v in violations if v.startswith("[HARD]")]
    if hard_violations:
        print(f"\n❌ Porte de qualité ÉCHEC : {len(hard_violations)} violation(s) dure(s)")
        sys.exit(1)
    print("\n✅ Porte de qualité PASSÉE (aucune violation dure).")
    sys.exit(0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BEVID QA gate")
    parser.add_argument("--quick", action="store_true", help="Skip auth routes, publiques uniquement")
    parser.add_argument("--no-auth", action="store_true", help="Skip auth routes")
    args = parser.parse_args()
    asyncio.run(main(args))
