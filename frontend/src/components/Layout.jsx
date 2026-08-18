import React, { useState, useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { usePerms } from "@/contexts/PermContext";
import VoiceFAB from "@/components/VoiceFAB";
import SyncIndicator from "@/components/SyncIndicator";
import BevidLogo from "@/components/BevidLogo";
import OnboardingTour from "@/components/OnboardingTour";
import {
  LayoutDashboard, Users, Wine, ShoppingCart, Route as RouteIcon, BarChart3, UserCog,
  LogOut, ClipboardCheck, Calendar, Trophy, Columns, Target, Plug, Settings as SettingsIcon,
  Sparkles, Banknote, ShieldCheck, Coins, Warehouse, QrCode, FileText, Landmark, Compass,
  Radio, AlertOctagon, Shield, Database, Search, ChevronDown,
} from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import PuceEtat from "@/components/system/PuceEtat";
import OfflineBanner from "@/components/OfflineBanner";
import CommandPalette from "@/components/CommandPalette";

/**
 * Navigation organisée en 6 sections repliables.
 * `sectionKey` = clé i18n de la section, `feature` = permission serveur.
 */
const SECTIONS = [
  { key: "section_field", entries: [
    { to: "/tournee", key: "tournee", feature: "page:tours", icon: RouteIcon },
    { to: "/visit", key: "visit", feature: "page:visits", icon: ClipboardCheck },
    { to: "/scan", key: "scan", feature: "page:stock", icon: QrCode },
    { to: "/planning", key: "planning", feature: "page:visits", icon: Calendar },
    { to: "/prospection", key: "prospecting", feature: "page:prospection", icon: Compass },
  ]},
  { key: "section_sales", entries: [
    { to: "/clients", key: "clients", feature: "page:clients", icon: Users },
    { to: "/pipeline", key: "pipeline", feature: "page:clients", icon: Columns },
    { to: "/deals", key: "deals", feature: "page:clients", icon: Target },
    { to: "/orders", key: "orders", feature: "page:orders", icon: ShoppingCart },
    { to: "/tours", key: "tours", feature: "page:tours", icon: RouteIcon },
    { to: "/products", key: "products", feature: "page:products", icon: Wine },
  ]},
  { key: "section_stock", entries: [
    { to: "/stock", key: "stock", feature: "page:stock", icon: Warehouse },
    { to: "/containers", key: "containers", feature: "page:stock", icon: QrCode },
    { to: "/drm", key: "drm", feature: "page:stock", icon: FileText },
  ]},
  { key: "section_pilotage", entries: [
    { to: "/", key: "dashboard", feature: "page:dashboard", icon: LayoutDashboard },
    { to: "/reports", key: "reports", feature: "page:reports", icon: BarChart3 },
    { to: "/monthly-review", key: "monthly", feature: "page:reports", icon: Trophy },
    { to: "/paiements", key: "payments", feature: "page:paiements", icon: Banknote },
    { to: "/rapprochement", key: "reconciliation", feature: "page:rapprochement", icon: Landmark },
    { to: "/smart-goals", key: "smart", feature: "page:dashboard", icon: Sparkles },
    { to: "/agents", key: "agents", feature: "page:users", icon: UserCog },
  ]},
  { key: "section_growth", entries: [
    { to: "/radar", key: "radar", feature: "page:radar", icon: Radio },
    { to: "/veille", key: "veille", feature: "page:veille", icon: AlertOctagon },
    { to: "/bouclier", key: "bouclier", feature: "page:bouclier", icon: Shield },
    { to: "/sources-donnees", key: "sources", feature: "page:sources-donnees", icon: Database },
  ]},
  { key: "section_admin", entries: [
    { to: "/admin/users", key: "users", feature: "page:users", icon: UserCog },
    { to: "/admin/permissions", key: "permissions", feature: "page:users", icon: ShieldCheck },
    { to: "/connectors", key: "connectors", feature: "page:integrations", icon: Plug },
    { to: "/settings", key: "settings", feature: "page:settings", icon: SettingsIcon },
    { to: "/confidentialite", key: "privacy", feature: "page:privacy", icon: ShieldCheck },
    { to: "/admin/couts", key: "costs", feature: "product:view_cost", icon: Coins },
  ]},
];

// Barre de tabs mobile fixe — 5 gestes métier, jamais dérivée de la nav desktop
const MOBILE_NAV = [
  { to: "/tournee", key: "tournee", label: "Ma tournée", icon: RouteIcon },
  { to: "/visit", key: "visit", label: "Visite", icon: ClipboardCheck },
  { to: "/scan", key: "scan", label: "Scanner", icon: QrCode },
  { to: "/clients", key: "clients", label: "Clients", icon: Users },
  { to: "/", key: "dashboard", label: "Tableau", icon: LayoutDashboard },
];

const OPEN_KEY = "bevid_nav_open_sections";

function loadOpenSections() {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (!raw) return ["section_field", "section_sales", "section_pilotage"];
    return JSON.parse(raw);
  } catch { return ["section_field", "section_sales", "section_pilotage"]; }
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { t, lang, setLanguage, languages } = useI18n();
  const { has, loading: permsLoading } = usePerms();
  const loc = useLocation();
  const nav_ = useNavigate();
  const role = user?.role || "commercial";
  const [openSections, setOpenSections] = useState(loadOpenSections);

  useEffect(() => {
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(openSections)); } catch {}
  }, [openSections]);

  const toggleSection = (key) => {
    setOpenSections((prev) => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  // Filtrage par permission avec fallback rôle=manager pendant loading
  const visible = useMemo(() => {
    return SECTIONS.map(section => ({
      ...section,
      entries: section.entries.filter(entry => {
        if (permsLoading) return role === "manager";
        return has(entry.feature);
      }),
    })).filter(s => s.entries.length > 0);
  }, [has, permsLoading, role]);

  // Ouvre automatiquement la section qui contient la route active
  useEffect(() => {
    for (const section of visible) {
      if (section.entries.some(e => loc.pathname === e.to || (e.to !== "/" && loc.pathname.startsWith(e.to)))) {
        setOpenSections(prev => prev.includes(section.key) ? prev : [...prev, section.key]);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname]);

  // Items aplatis pour la palette
  const paletteItems = useMemo(() => {
    const items = [];
    for (const s of visible) for (const e of s.entries) {
      items.push({ to: e.to, key: e.key, label: t(e.key), section: t(s.key) });
    }
    return items;
  }, [visible, t]);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex md:flex-col w-64 border-r border-stone-200 dark:border-stone-700 bg-white/60 dark:bg-stone-900/60 backdrop-blur-md" data-testid="sidebar">
        <div className="p-6 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#4A154B] dark:text-[#B076B4]">
            <BevidLogo size={28} />
            <div>
              <h1 className="font-display text-2xl leading-none">BEVID</h1>
              <p className="overline mt-1">CRM Boisson · Pro</p>
            </div>
          </div>
          <SyncIndicator />
        </div>

        {/* Bouton palette (Cmd+K) */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true }))}
          data-testid="palette-trigger"
          className="mx-3 mt-3 flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          aria-label="Ouvrir la palette de commandes"
        >
          <Search size={14} aria-hidden="true" />
          <span className="flex-1 text-left">Aller à…</span>
          <kbd className="text-[10px] px-1.5 py-0.5 border border-stone-300 dark:border-stone-600 rounded font-mono">⌘K</kbd>
        </button>

        <nav className="flex-1 p-3 space-y-2 overflow-y-auto mt-2">
          {visible.map(section => {
            const isOpen = openSections.includes(section.key);
            return (
              <div key={section.key} data-testid={`nav-section-${section.key}`}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
                  aria-expanded={isOpen}
                  aria-controls={`section-body-${section.key}`}
                  data-testid={`nav-section-toggle-${section.key}`}
                >
                  <span>{t(section.key)}</span>
                  <ChevronDown size={12} aria-hidden="true" style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
                </button>
                {isOpen && (
                  <div id={`section-body-${section.key}`} className="mt-1 space-y-0.5">
                    {section.entries.map(({ to, key, icon: Icon }) => {
                      const active = loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));
                      return (
                        <Link
                          key={to} to={to}
                          data-testid={`nav-${key}`}
                          className={`flex items-center gap-3 px-3 py-2 min-h-[40px] rounded-lg text-sm transition-colors duration-200 ${active ? "bg-[#4A154B] dark:bg-[#B076B4] text-white dark:text-stone-900" : "text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"}`}
                        >
                          <Icon size={16} strokeWidth={1.5} />
                          <span>{t(key)}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-stone-200 dark:border-stone-700 space-y-2">
          <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 px-2">
            <span className="truncate">{user?.name}</span>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <PuceEtat etat="info" variante="douce" libelle={user?.role || ""} />
            </div>
          </div>
          <ThemeToggle variant="sidebar" />
          <select
            value={lang}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full text-sm border border-stone-300 dark:border-stone-600 rounded-lg px-2 py-1.5 min-h-[44px] bg-white dark:bg-stone-800 dark:text-stone-200"
            data-testid="lang-select"
            aria-label={t("language")}
          >
            {languages.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
          </select>
          <button onClick={logout} data-testid="logout-btn" className="btn-ghost w-full flex items-center gap-2 text-sm justify-center min-h-[44px]">
            <LogOut size={16} /> {t("logout")}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 glass border-b border-stone-200 dark:border-stone-700 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 text-[#4A154B] dark:text-[#B076B4]">
          <BevidLogo size={22} />
          <h1 className="font-display text-xl">BEVID</h1>
          <SyncIndicator />
        </div>
        <div className="flex gap-1 items-center">
          <ThemeToggle variant="icon" />
          <NotificationBell />
          <select
            value={lang}
            onChange={(e) => setLanguage(e.target.value)}
            className="text-xs font-medium px-2 py-1 border rounded min-h-[36px] bg-white dark:bg-stone-800 dark:text-stone-200 dark:border-stone-600"
            data-testid="lang-select-mobile"
            aria-label={t("language")}
          >
            {languages.map(l => <option key={l.code} value={l.code}>{l.flag}</option>)}
          </select>
          <button onClick={logout} data-testid="logout-mobile" aria-label={t("logout")} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-700 dark:text-stone-300"><LogOut size={18} /></button>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 md:ml-0 pt-16 md:pt-0 pb-20 md:pb-0 overflow-x-hidden">
        <OfflineBanner />
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom tab bar — 5 gestes métier fixes */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-700 flex justify-around py-2 pb-safe" data-testid="mobile-bottom-nav">
        {MOBILE_NAV.map(({ to, key, label, icon: Icon }) => {
          const active = loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));
          return (
            <button key={to} onClick={() => nav_(to)} data-testid={`nav-mobile-${key}`}
              aria-label={label}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 min-w-[48px] min-h-[48px] ${active ? "text-[#4A154B] dark:text-[#B076B4]" : "text-stone-500 dark:text-stone-400"}`}>
              <Icon size={22} strokeWidth={1.75} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}
      </nav>

      <CommandPalette items={paletteItems} />
      <VoiceFAB />
      <OnboardingTour />
    </div>
  );
}
