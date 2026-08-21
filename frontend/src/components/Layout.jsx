import React, { useState, useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { usePerms } from "@/contexts/PermContext";
import VoiceFAB from "@/components/VoiceFAB";
import SyncIndicator from "@/components/SyncIndicator";
import BevidLogo from "@/components/BevidLogo";
import OnboardingTour from "@/components/OnboardingTour";
import { api } from "@/lib/api";
import {
  LayoutDashboard, Users, Wine, ShoppingCart, Route as RouteIcon, BarChart3, UserCog,
  LogOut, ClipboardCheck, Calendar, Trophy, Columns, Target, Plug, Settings as SettingsIcon,
  Sparkles, Banknote, ShieldCheck, Coins, Warehouse, QrCode, FileText, Landmark, Compass,
  Radio, AlertOctagon, Shield, Database, Search, ChevronDown, Truck, Pin, User as UserIcon,
} from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import PuceEtat from "@/components/system/PuceEtat";
import OfflineBanner from "@/components/OfflineBanner";
import CommandPalette from "@/components/CommandPalette";
import BillingBanner from "@/components/BillingBanner";

/**
 * Navigation refondue selon le cahier des charges "sidebar intelligente" :
 *
 *   1) UNE seule entrée fixe au-dessus des sections : /tableau de bord.
 *   2) Zone épinglée non repliable "Aujourd'hui" : 3 entrées quotidiennes,
 *      toujours visibles. Compteur d'arrêts sur "Ma tournée".
 *   3) Six sections repliables, ordre figé (jamais de réorganisation auto) :
 *      Clients et ventes · Logistique · Argent · Pilotage · Acquisition · Admin.
 *   4) Aucune entrée présente dans deux groupes. Aucun libellé quasi-dupliqué.
 *   5) `scan` porte sa propre permission `page:scan` — plus jamais dépendant
 *      d'une clé qui appartient à un autre domaine (bug identifié PO).
 *   6) Ouverture initiale selon rôle : commercial → section_sales,
 *      manager → section_pilotage. Ensuite, choix utilisateur mémorisé.
 *   7) Sections sans entrée accessible : masquées entièrement.
 */

// Zone épinglée — toujours visible, non repliable. Trois entrées maximum.
const PINNED = [
  { to: "/tournee", key: "tournee", feature: "page:tours", icon: RouteIcon, badgeKey: "stops_today" },
  { to: "/visit",   key: "new_visit", feature: "page:visits", icon: ClipboardCheck },
  { to: "/scan",    key: "scan",  feature: "page:scan", icon: QrCode },
];

// Entrée fixe hors pli, sous le logo/palette et au-dessus des sections.
const HOME_ENTRY = { to: "/", key: "dashboard", feature: "page:dashboard", icon: LayoutDashboard };

const SECTIONS = [
  // Ordre = fréquence quotidienne décroissante : ouvrir un client, prendre commande,
  // chercher un produit ; le pilotage commercial (pipeline, deals) vient après.
  { key: "section_sales", entries: [
    { to: "/clients",  key: "clients",  feature: "page:clients", icon: Users },
    { to: "/orders",   key: "orders",   feature: "page:orders",  icon: ShoppingCart },
    { to: "/products", key: "products", feature: "page:products", icon: Wine },
    { to: "/pipeline", key: "pipeline", feature: "page:clients", icon: Columns },
    { to: "/deals",    key: "deals",    feature: "page:clients", icon: Target },
  ]},
  { key: "section_logistics", entries: [
    { to: "/tours",              key: "tours",      feature: "page:tours", icon: RouteIcon },
    { to: "/livreur",            key: "livreur",    feature: null,          icon: Truck },
    { to: "/stock",              key: "stock",      feature: "page:stock", icon: Warehouse },
    { to: "/containers",         key: "containers", feature: "page:stock", icon: QrCode },
    { to: "/containers/labels",  key: "qr_labels",  feature: "page:stock", icon: QrCode },
    { to: "/drm",                key: "drm",        feature: "page:drm",   icon: FileText },
  ]},
  { key: "section_finance", entries: [
    { to: "/paiements",     key: "payments",       feature: "page:paiements",     icon: Banknote },
    { to: "/rapprochement", key: "reconciliation", feature: "page:rapprochement", icon: Landmark },
    { to: "/admin/couts",   key: "costs",          feature: "product:view_cost",  icon: Coins },
  ]},
  { key: "section_pilotage", entries: [
    { to: "/reports",        key: "reports", feature: "page:reports",    icon: BarChart3 },
    { to: "/monthly-review", key: "monthly", feature: "page:reports",    icon: Trophy },
    { to: "/smart-goals",    key: "smart",   feature: "page:dashboard",  icon: Sparkles },
    { to: "/agents",         key: "agents",  feature: "page:users",      icon: UserCog },
  ]},
  // Regroupement défensif : Radar + Bouclier ensemble ; Veille et Sources en support.
  { key: "section_growth", entries: [
    { to: "/prospection",     key: "prospecting", feature: "page:prospection",     icon: Compass },
    { to: "/radar",           key: "radar",       feature: "page:radar",           icon: Radio },
    { to: "/bouclier",        key: "bouclier",    feature: "page:bouclier",        icon: Shield },
    { to: "/veille",          key: "veille",      feature: "page:veille",          icon: AlertOctagon },
    { to: "/sources-donnees", key: "sources",     feature: "page:sources-donnees", icon: Database },
  ]},
  { key: "section_admin", entries: [
    { to: "/admin/users",       key: "users",        feature: "page:users",         icon: Users },
    { to: "/admin/permissions", key: "permissions",  feature: "page:users",         icon: ShieldCheck },
    { to: "/connectors",        key: "connectors",   feature: "page:integrations",  icon: Plug },
    { to: "/org/settings",      key: "org_settings", feature: "manager_only",       icon: SettingsIcon },
    { to: "/settings",          key: "settings",     feature: "page:settings",      icon: SettingsIcon },
    { to: "/confidentialite",   key: "privacy",      feature: "page:privacy",       icon: ShieldCheck },
    { to: "/billing",           key: "billing",      feature: "manager_only",       icon: Coins },
  ]},
];

// Barre de tabs mobile — INDÉPENDANTE de la sidebar desktop, 5 entrées littérales.
const MOBILE_NAV = [
  { to: "/tournee", key: "tournee", label: "Ma tournée", icon: RouteIcon },
  { to: "/visit", key: "visit", label: "Visite", icon: ClipboardCheck },
  { to: "/scan", key: "scan", label: "Scanner", icon: QrCode },
  { to: "/clients", key: "clients", label: "Clients", icon: Users },
  { to: "/", key: "dashboard", label: "Tableau", icon: LayoutDashboard },
];

const OPEN_KEY = "bevid_nav_open_sections_v2";  // v2 → nouvelles clés section_*

function defaultOpenByRole(role) {
  // Ouverture initiale ciblée par métier — mémorisée après premier choix utilisateur.
  if (role === "manager" || role === "gerant" || role === "owner") return ["section_pilotage"];
  return ["section_sales"];  // commercial + par défaut
}

function loadOpenSections(role) {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (!raw) return defaultOpenByRole(role);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : defaultOpenByRole(role);
  } catch { return defaultOpenByRole(role); }
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { t, lang, setLanguage, languages } = useI18n();
  const { has, loading: permsLoading } = usePerms();
  const loc = useLocation();
  const nav_ = useNavigate();
  const role = user?.role || "commercial";
  const [openSections, setOpenSections] = useState(() => loadOpenSections(role));
  const [stopsToday, setStopsToday] = useState(null);

  useEffect(() => {
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(openSections)); } catch {}
  }, [openSections]);

  // Compteur d'arrêts du jour — approximation initiale = taille du portefeuille commercial.
  // Sera affiné quand la notion de "visites planifiées aujourd'hui" sera formalisée.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/establishments");
        if (!cancelled) setStopsToday(Array.isArray(data) ? data.length : null);
      } catch { /* silencieux */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleSection = (key) => {
    setOpenSections((prev) => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  // Filtre les entrées auxquelles l'utilisateur n'a pas droit.
  // Règle métier PO : un manager/gérant/owner voit toujours l'ensemble du menu.
  //   - Il est l'acheteur et le décideur des activations/forfait.
  //   - Il ne doit pas être encombré par des perms nouvellement ajoutées mais
  //     pas encore propagées à son user MongoDB (cas de `page:scan` récente).
  //   - Les entrées auxquelles il n'aurait pas droit (forfait insuffisant)
  //     seront grisées avec pastille dans une itération ultérieure.
  // Pour un commercial : deny-by-default strict via has(feature).
  const isEntryVisible = (entry) => {
    if (entry.feature === null) return true;
    const isPrivileged = role === "manager" || role === "gerant" || role === "owner";
    if (entry.feature === "manager_only") return isPrivileged;
    if (isPrivileged) return true;   // fallback rôle décideur — voit tout
    if (permsLoading) return false;  // commercial pendant chargement → deny strict
    return has(entry.feature);
  };

  const visiblePinned = useMemo(() => PINNED.filter(isEntryVisible), [has, permsLoading, role]);

  const visibleSections = useMemo(() => {
    return SECTIONS.map(s => ({ ...s, entries: s.entries.filter(isEntryVisible) }))
                   .filter(s => s.entries.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [has, permsLoading, role]);

  const homeVisible = isEntryVisible(HOME_ENTRY);

  // Ouvre automatiquement la section contenant la route active (une seule fois).
  useEffect(() => {
    for (const section of visibleSections) {
      if (section.entries.some(e => loc.pathname === e.to || (e.to !== "/" && loc.pathname.startsWith(e.to)))) {
        setOpenSections(prev => prev.includes(section.key) ? prev : [...prev, section.key]);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname]);

  // Palette de commandes — inclut TOUT (pinned + home + sections).
  const paletteItems = useMemo(() => {
    const items = [];
    if (homeVisible) items.push({ to: HOME_ENTRY.to, key: HOME_ENTRY.key, label: t(HOME_ENTRY.key), section: t("dashboard") });
    for (const e of visiblePinned) items.push({ to: e.to, key: e.key, label: t(e.key), section: t("section_today") });
    for (const s of visibleSections) for (const e of s.entries) {
      items.push({ to: e.to, key: e.key, label: t(e.key), section: t(s.key) });
    }
    return items;
  }, [visibleSections, visiblePinned, homeVisible, t]);

  const isActive = (to) => loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));

  // Composant Link réutilisé — respect a11y (aria-current, min-h target).
  const NavEntry = ({ to, k, Icon, badge }) => {
    const active = isActive(to);
    return (
      <Link
        to={to}
        data-testid={`nav-${k}`}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 px-3 py-2 min-h-[40px] rounded-lg text-sm transition-colors duration-200 ${active ? "bg-[#4A154B] dark:bg-[#B076B4] text-white dark:text-stone-900" : "text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"}`}
      >
        <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
        <span className="flex-1">{t(k)}</span>
        {badge != null && badge > 0 && (
          <span
            className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded-full ${active ? "bg-white/20 text-white" : "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200"}`}
            aria-label={`${badge} arrêts aujourd'hui`}
            data-testid={`nav-badge-${k}`}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside
        className="hidden md:flex md:flex-col w-64 border-r border-stone-200 dark:border-stone-700 bg-white/60 dark:bg-stone-900/60 backdrop-blur-md"
        data-testid="sidebar"
      >
        {/* Header : logo + statut synchro */}
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

        {/* Palette Cmd+K — chemin principal pour tout ce qui n'est pas quotidien */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("bevid:open-palette"))}
          data-testid="palette-trigger"
          className="mx-3 mt-3 flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          aria-label="Ouvrir la palette de commandes"
        >
          <Search size={14} aria-hidden="true" />
          <span className="flex-1 text-left">Rechercher…</span>
          <kbd className="text-[10px] px-1.5 py-0.5 border border-stone-300 dark:border-stone-600 rounded font-mono">⌘K</kbd>
        </button>

        <nav className="flex-1 p-3 space-y-2 overflow-y-auto mt-2" aria-label={t("navigation") || "Navigation"}>
          {/* Entrée fixe : Tableau de bord — hors pli, jamais caché */}
          {homeVisible && (
            <div className="pb-2 mb-2 border-b border-stone-200/60 dark:border-stone-700/50" data-testid="nav-home-fixed">
              <NavEntry to={HOME_ENTRY.to} k={HOME_ENTRY.key} Icon={HOME_ENTRY.icon} />
            </div>
          )}

          {/* Zone épinglée non repliable — 3 entrées quotidiennes toujours visibles */}
          {visiblePinned.length > 0 && (
            <div data-testid="nav-pinned" className="pb-2 mb-2 border-b border-stone-200/60 dark:border-stone-700/50">
              <div className="flex items-center gap-1 px-2 py-1.5 text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
                <Pin size={10} aria-hidden="true" />
                <span>{t("section_today")}</span>
              </div>
              <div className="space-y-0.5">
                {visiblePinned.map(({ to, key, icon, badgeKey }) => (
                  <NavEntry
                    key={to}
                    to={to}
                    k={key}
                    Icon={icon}
                    badge={badgeKey === "stops_today" ? stopsToday : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sections repliables — ordre figé, jamais réorganisées automatiquement */}
          {visibleSections.map(section => {
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
                    {section.entries.map(({ to, key, icon }) => (
                      <NavEntry key={to} to={to} k={key} Icon={icon} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Zone d'identité en bas — avatar, org, plan, profil, thème, langue, déconnexion */}
        <div className="p-3 border-t border-stone-200 dark:border-stone-700 space-y-2">
          <Link
            to="/profile"
            data-testid="nav-profile-identity"
            className={`flex items-center gap-3 px-2 py-2 min-h-[52px] rounded-lg text-sm transition-colors ${isActive("/profile") ? "bg-[#4A154B]/10 dark:bg-[#B076B4]/20" : "hover:bg-stone-100 dark:hover:bg-stone-800"}`}
          >
            <div className="w-9 h-9 rounded-full bg-[#4A154B] dark:bg-[#B076B4] text-white dark:text-stone-900 flex items-center justify-center font-medium text-sm shrink-0" aria-hidden="true">
              {(user?.name || user?.email || "?")[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-stone-800 dark:text-stone-100 truncate">{user?.name || user?.email}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {user?.org_name && <span className="text-[11px] text-stone-500 truncate">{user.org_name}</span>}
                <PuceEtat etat="info" variante="douce" libelle={role} />
              </div>
            </div>
            <NotificationBell />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle variant="sidebar" />
          </div>
          <select
            value={lang}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full text-sm border border-stone-300 dark:border-stone-600 rounded-lg px-2 py-1.5 min-h-[36px] bg-white dark:bg-stone-800 dark:text-stone-200"
            data-testid="lang-select"
            aria-label={t("language")}
          >
            {languages.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
          </select>
          <button
            onClick={logout}
            data-testid="logout-btn"
            className="btn-ghost w-full flex items-center gap-2 text-sm justify-center min-h-[40px]"
          >
            <LogOut size={16} aria-hidden="true" /> {t("logout")}
          </button>
        </div>
      </aside>

      {/* Mobile top bar — inchangée */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 glass border-b border-stone-200 dark:border-stone-700 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 text-[#4A154B] dark:text-[#B076B4]">
          <BevidLogo size={22} />
          <h1 className="font-display text-xl">BEVID</h1>
          <SyncIndicator />
        </div>
        <div className="flex gap-1 items-center">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("bevid:open-palette"))}
            data-testid="palette-trigger-mobile"
            aria-label="Rechercher"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-700 dark:text-stone-300"
          >
            <Search size={18} aria-hidden="true" />
          </button>
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
        <BillingBanner />
        <OfflineBanner />
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom tab bar — INDÉPENDANTE, littérale, jamais dérivée */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-700 flex justify-around py-2 pb-safe"
        data-testid="mobile-bottom-nav"
        aria-label="Navigation rapide"
      >
        {MOBILE_NAV.map(({ to, key, label, icon: Icon }) => {
          const active = isActive(to);
          return (
            <button
              key={to} onClick={() => nav_(to)} data-testid={`nav-mobile-${key}`}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 min-w-[48px] min-h-[48px] ${active ? "text-[#4A154B] dark:text-[#B076B4]" : "text-stone-500 dark:text-stone-400"}`}
            >
              <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
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
