import { useMemo, useCallback } from "react";
import {
  SECTIONS, PINNED_FIXED, HOME_ENTRY, FLAT_ENTRIES, FIXED_PIN_KEYS,
  isAdvancedEntry, isPrivilegedRole, applySectionOrder, computePlanLock,
} from "./navConfig";

const isIosNative = () => typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() && window.Capacitor.getPlatform() === "ios";

/**
 * Calcule ce que l'utilisateur courant peut voir : RBAC (rôle + perms),
 * verrou forfait, filtre « mode débutant » (fonctions avancées), épingles.
 */
export function useNavVisibility({ role, planFeatures, has, permsLoading, prefs, t }) {
  const isPrivileged = isPrivilegedRole(role);
  const showAdvanced = !!prefs.show_advanced;
  const visitedFeatures = useMemo(() => new Set(prefs.visited_features || []), [prefs.visited_features]);
  const pinnedUser = useMemo(() => prefs.pinned_user || [], [prefs.pinned_user]);

  // { visible, lockedPlan } — lockedPlan ≠ null → grisée + pastille (managers only).
  const evalEntry = useCallback((entry) => {
    if (!entry || entry.feature === undefined) return { visible: false, lockedPlan: null };
    if (entry.feature === null) return { visible: true, lockedPlan: null };
    if (entry.feature === "manager_only") return { visible: isPrivileged, lockedPlan: null };
    const lockedPlan = computePlanLock(entry.feature, planFeatures);
    if (lockedPlan) return { visible: isPrivileged, lockedPlan };
    if (isPrivileged) return { visible: true, lockedPlan: null };
    if (permsLoading) return { visible: false, lockedPlan: null };
    return { visible: has(entry.feature), lockedPlan: null };
  }, [isPrivileged, planFeatures, permsLoading, has]);

  const isEntryVisible = useCallback((key) =>
    !isAdvancedEntry(key) || showAdvanced || visitedFeatures.has(key) || pinnedUser.includes(key),
  [showAdvanced, visitedFeatures, pinnedUser]);

  const homeEval = useMemo(() => evalEntry(HOME_ENTRY), [evalEntry]);

  const visiblePinned = useMemo(() => {
    const list = [];
    for (const p of PINNED_FIXED) {
      const e = evalEntry(p);
      if (e.visible) list.push({ ...p, _fixed: true, _locked: e.lockedPlan });
    }
    for (const k of pinnedUser) {
      if (FIXED_PIN_KEYS.has(k)) continue;
      const meta = FLAT_ENTRIES[k];
      if (!meta) continue;
      const e = evalEntry(meta);
      if (e.visible) list.push({ ...meta, _fixed: false, _locked: e.lockedPlan });
      if (list.length - PINNED_FIXED.length >= 3) break;
    }
    return list;
  }, [pinnedUser, evalEntry]);

  const visibleSections = useMemo(() => {
    const ios = isIosNative(); // N5 : pas de facturation dans l'app iOS
    return SECTIONS.map(s => {
      const ordered = applySectionOrder(s.entries.filter(e => !(ios && e.key === "billing")), prefs.section_order?.[s.key]);
      const entries = ordered
        .map(e => { const ev = evalEntry(e); return { ...e, _visible: ev.visible, _locked: ev.lockedPlan }; })
        .filter(e => e._visible && isEntryVisible(e.key));
      return { ...s, entries };
    }).filter(s => s.entries.length > 0);
  }, [prefs.section_order, evalEntry, isEntryVisible]);

  // La palette ⌘K liste TOUTES les pages accessibles (même les avancées masquées).
  const paletteItems = useMemo(() => {
    const items = [];
    if (homeEval.visible) items.push({ to: HOME_ENTRY.to, key: HOME_ENTRY.key, label: t(HOME_ENTRY.key), section: t("dashboard") });
    for (const e of visiblePinned) items.push({ to: e.to, key: e.key, label: t(e.key), section: t("section_today") });
    for (const s of SECTIONS) {
      for (const e of applySectionOrder(s.entries, prefs.section_order?.[s.key])) {
        if (!evalEntry(e).visible) continue;
        const advanced = isAdvancedEntry(e.key) && !visitedFeatures.has(e.key) && !showAdvanced;
        items.push({ to: e.to, key: e.key, label: advanced ? `${t(e.key)} · avancé` : t(e.key), section: t(s.key) });
      }
    }
    return items;
  }, [homeEval.visible, visiblePinned, prefs.section_order, evalEntry, visitedFeatures, showAdvanced, t]);

  return { homeEval, visiblePinned, visibleSections, paletteItems, visitedFeatures };
}
