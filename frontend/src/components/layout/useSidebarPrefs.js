import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import {
  SECTIONS, FIXED_PIN_KEYS, OPEN_KEY, PREFS_CACHE_KEY, COLLAPSED_KEY,
  normalizePrefs, loadOpenSections, loadCachedPrefs, loadCollapsed, applySectionOrder,
} from "./navConfig";

/**
 * État persistant de la sidebar : sections ouvertes, mode rail, préférences
 * utilisateur (épingles, ordre, thème, fonctions avancées) synchronisées avec
 * /api/me/sidebar-prefs (cache localStorage, offline-first).
 */
export function useSidebarPrefs(role) {
  const [openSections, setOpenSections] = useState(() => loadOpenSections(role));
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [prefs, setPrefs] = useState(loadCachedPrefs);
  const saveTimer = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(openSections)); } catch { /* best-effort */ }
  }, [openSections]);

  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0"); } catch { /* best-effort */ }
  }, [collapsed]);

  useEffect(() => {
    let cancelled = false;
    api.get("/me/sidebar-prefs").then(({ data }) => {
      if (cancelled) return;
      const next = normalizePrefs(data);
      setPrefs(next);
      try { localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(next)); } catch { /* best-effort */ }
    }).catch(() => { /* offline ou 401 : garde le cache */ });
    return () => { cancelled = true; };
  }, []);

  const savePrefs = useCallback((next) => {
    try { localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(next)); } catch { /* best-effort */ }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { api.put("/me/sidebar-prefs", next).catch(() => {}); }, 400);
  }, []);

  const update = useCallback((patch) => {
    setPrefs((prev) => { const next = { ...prev, ...patch }; savePrefs(next); return next; });
  }, [savePrefs]);

  const toggleSection = (key) =>
    setOpenSections((prev) => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  const openSection = (key) =>
    setOpenSections((prev) => prev.includes(key) ? prev : [...prev, key]);
  const toggleCollapsed = () => setCollapsed(v => !v);

  const pinned = prefs.pinned_user || [];
  const isPinned = (k) => pinned.includes(k);
  const userPinCount = pinned.length;

  const pinToToday = (k) => {
    if (FIXED_PIN_KEYS.has(k) || isPinned(k) || userPinCount >= 3) return;
    update({ pinned_user: [...pinned, k] });
  };
  const unpinFromToday = (k) => update({ pinned_user: pinned.filter(x => x !== k) });

  const resetSection = (sectionKey) => {
    const nextOrder = { ...(prefs.section_order || {}) };
    delete nextOrder[sectionKey];
    update({ section_order: nextOrder });
  };

  const applyDrop = (sectionKey, fromKey, overKey) => {
    const section = SECTIONS.find(s => s.key === sectionKey);
    if (!section) return;
    const baseKeys = applySectionOrder(section.entries, prefs.section_order?.[sectionKey]).map(e => e.key);
    if (!baseKeys.includes(fromKey)) return;
    const withoutFrom = baseKeys.filter(k => k !== fromKey);
    let insertAt = withoutFrom.length;
    if (overKey && withoutFrom.includes(overKey)) insertAt = withoutFrom.indexOf(overKey);
    withoutFrom.splice(insertAt, 0, fromKey);
    update({ section_order: { ...(prefs.section_order || {}), [sectionKey]: withoutFrom } });
  };

  const markVisited = (key) => {
    const nextVisited = Array.from(new Set([...(prefs.visited_features || []), key]));
    update({ visited_features: nextVisited });
    api.post("/me/visit-feature", { key }).catch(() => {});
  };

  return {
    prefs, openSections, collapsed,
    toggleSection, openSection, toggleCollapsed,
    isPinned, userPinCount, pinToToday, unpinFromToday, resetSection, applyDrop, markVisited,
  };
}
