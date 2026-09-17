import { useEffect } from "react";

/**
 * Applique le titre de page et la balise <link rel="canonical"> côté document.
 * Sans dépendance — pas de react-helmet. Idempotent : réutilise la même balise
 * canonical si présente, la crée sinon.
 *
 * Usage :
 *   usePageMeta({ title: "Tarifs · BEVID", canonical: "/pricing" });
 */
export function usePageMeta({ title, canonical, description, noindex } = {}) {
  useEffect(() => {
    if (title && typeof document !== "undefined") {
      const prev = document.title;
      document.title = title;
      // Rétablit le titre par défaut au démontage — utile pour les pages publiques
      // qui alternent avec des pages authentifiées.
      return () => { document.title = prev; };
    }
  }, [title]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (canonical) {
      let el = document.querySelector('link[rel="canonical"]');
      if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", "canonical");
        document.head.appendChild(el);
      }
      const origin = window.location.origin;
      const href = canonical.startsWith("http") ? canonical : `${origin}${canonical}`;
      el.setAttribute("href", href);
    }
    if (description) {
      let m = document.querySelector('meta[name="description"]');
      if (!m) {
        m = document.createElement("meta");
        m.setAttribute("name", "description");
        document.head.appendChild(m);
      }
      const prev = m.getAttribute("content");
      m.setAttribute("content", description);
      return () => { if (prev) m.setAttribute("content", prev); };
    }
  }, [canonical, description]);

  // Meta robots dynamique — pour les routes portant un jeton d'usage unique
  // (`/activate/:token`, `/sign/:token`, `/reset-password/:token`, `/change-password`).
  // Le CDN preview peut intercepter /robots.txt (limite plateforme, non contournable
  // côté code) : les meta robots sont donc la protection réelle qu'aucun proxy
  // ne peut écraser.
  useEffect(() => {
    if (typeof document === "undefined" || !noindex) return;
    let m = document.querySelector('meta[name="robots"][data-page-meta]');
    if (!m) {
      m = document.createElement("meta");
      m.setAttribute("name", "robots");
      m.setAttribute("data-page-meta", "true");
      document.head.appendChild(m);
    }
    m.setAttribute("content", "noindex, nofollow, noarchive, nosnippet");
    return () => { try { m.remove(); } catch { /* best-effort : ignoré volontairement */ } };
  }, [noindex]);
}
