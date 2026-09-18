import React, { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { usePerms } from "@/contexts/PermContext";
import { useTheme } from "@/contexts/ThemeContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import VoiceFAB from "@/components/VoiceFAB";
import OnboardingTour from "@/components/OnboardingTour";
import OfflineBanner from "@/components/OfflineBanner";
import CommandPalette from "@/components/CommandPalette";
import BillingBanner from "@/components/BillingBanner";
import { BottomNav } from "@/components/mobile/BottomNav";
import { NativeBoot } from "@/components/NativeBoot";
import { useIsMobile } from "@/lib/mobile";
import { api } from "@/lib/api";
import { SECTIONS, VALID_SIDEBAR_THEMES, isAdvancedEntry, matchesPath } from "@/components/layout/navConfig";
import { SidebarContext } from "@/components/layout/SidebarContext";
import { useSidebarPrefs } from "@/components/layout/useSidebarPrefs";
import { useNavVisibility } from "@/components/layout/useNavVisibility";
import { useDragState } from "@/components/layout/NavEntry";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileTopBar } from "@/components/layout/MobileTopBar";

/**
 * Layout applicatif — compose la sidebar intelligente (Lot 8 + suite), la barre
 * mobile, les bandeaux globaux et la palette ⌘K. La logique vit dans
 * `components/layout/` : navConfig (données), useSidebarPrefs (persistance),
 * useNavVisibility (RBAC + forfait), Sidebar / NavEntry (rendu).
 */

// Compteur d'arrêts du jour (tournées non terminées) + compteurs métier par route.
function useSidebarCounters(pathname) {
  const [stopsToday, setStopsToday] = useState(null);
  const [counters, setCounters] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get("/tours").then(({ data }) => {
      if (cancelled || !Array.isArray(data)) return;
      const today = new Date().toISOString().slice(0, 10);
      const stops = data.filter(t => t.date === today && t.status !== "terminee")
        .reduce((acc, t) => acc + ((t.client_ids || []).length), 0);
      setStopsToday(stops > 0 ? stops : null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get("/sidebar/counters").then(({ data }) => { if (!cancelled) setCounters(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [pathname]);

  return { stopsToday, counters };
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const isMobileView = useIsMobile();
  const { t, lang, setLanguage, languages } = useI18n();
  const { has, loading: permsLoading } = usePerms();
  const { theme, resolved: resolvedTheme, setTheme } = useTheme();
  const loc = useLocation();
  const role = user?.role || "commercial";
  const planFeatures = Array.isArray(user?.org_plan_features) ? user.org_plan_features : null;

  const sb = useSidebarPrefs(role);
  const { prefs } = sb;
  const sidebarTheme = VALID_SIDEBAR_THEMES.has(prefs.theme) ? prefs.theme : "sobre";
  const drag = useDragState();
  const { stopsToday, counters } = useSidebarCounters(loc.pathname);
  const { homeEval, visiblePinned, visibleSections, paletteItems, visitedFeatures } =
    useNavVisibility({ role, planFeatures, has, permsLoading, prefs, t });

  // Ouvre automatiquement la section contenant la route courante.
  useEffect(() => {
    const section = visibleSections.find(s => s.entries.some(e => matchesPath(loc.pathname, e.to)));
    if (section) sb.openSection(section.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname]);

  // Tracker de visite : une page avancée ouverte (⌘K, URL directe) se débloque dans la sidebar.
  useEffect(() => {
    const path = loc.pathname;
    if (!path || path === "/") return;
    const matched = SECTIONS.flatMap(s => s.entries).find(e => matchesPath(path, e.to));
    if (!matched || !isAdvancedEntry(matched.key) || visitedFeatures.has(matched.key)) return;
    sb.markVisited(matched.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname]);

  const ctx = useMemo(() => ({
    t, counters, ...sb, ...drag,
    isActive: (to) => matchesPath(loc.pathname, to),
  }), [t, counters, sb, drag, loc.pathname]);

  const menuProps = { theme, setTheme, resolvedTheme, lang, setLanguage, languages, onLogout: logout, t };

  return (
    <TooltipProvider delayDuration={300}>
      <SidebarContext.Provider value={ctx}>
        <div className="flex min-h-screen items-stretch">
          <Sidebar sidebarTheme={sidebarTheme} homeEval={homeEval} visiblePinned={visiblePinned}
            visibleSections={visibleSections} stopsToday={stopsToday} user={user} role={role} menuProps={menuProps} />

          <MobileTopBar t={t} />

          <main className="flex-1 md:ml-0 pt-16 md:pt-0 pb-20 md:pb-0 overflow-x-hidden">
            <BillingBanner />
            <OfflineBanner />
            <div className="max-w-7xl mx-auto p-4 md:p-8">
              {children}
            </div>
          </main>

          <BottomNav />
          <NativeBoot />

          <CommandPalette items={paletteItems} />
          <VoiceFAB />
          {!isMobileView && <OnboardingTour />}
        </div>
      </SidebarContext.Provider>
    </TooltipProvider>
  );
}
