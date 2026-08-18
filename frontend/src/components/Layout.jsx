import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { usePerms } from "@/contexts/PermContext";
import VoiceFAB from "@/components/VoiceFAB";
import SyncIndicator from "@/components/SyncIndicator";
import BevidLogo from "@/components/BevidLogo";
import OnboardingTour from "@/components/OnboardingTour";
import { LayoutDashboard, Users, Wine, ShoppingCart, Route as RouteIcon, BarChart3, UserCog, LogOut, ClipboardCheck, Calendar, Trophy, Columns, Target, Plug, Settings as SettingsIcon, Sparkles, Banknote, ShieldCheck, Coins, Warehouse, QrCode, FileText, Landmark, Compass, Radio, AlertOctagon, Shield, Database } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";

// key = clé i18n label, feature = clé permission serveur (source de vérité pour visibilité)
const navAll = [
  { to: "/", key: "dashboard", feature: "page:dashboard", icon: LayoutDashboard },
  { to: "/visit", key: "visit", feature: "page:visits", icon: ClipboardCheck },
  { to: "/planning", key: "planning", feature: "page:visits", icon: Calendar },
  { to: "/pipeline", key: "pipeline", feature: "page:clients", icon: Columns },
  { to: "/deals", key: "deals", feature: "page:clients", icon: Target },
  { to: "/clients", key: "clients", feature: "page:clients", icon: Users },
  { to: "/products", key: "products", feature: "page:products", icon: Wine },
  { to: "/orders", key: "orders", feature: "page:orders", icon: ShoppingCart },
  { to: "/tours", key: "tours", feature: "page:tours", icon: RouteIcon },
  { to: "/stock", key: "stock", feature: "page:stock", icon: Warehouse },
  { to: "/containers", key: "containers", feature: "page:stock", icon: QrCode },
  { to: "/scan", key: "scan", feature: "page:stock", icon: QrCode },
  { to: "/drm", key: "drm", feature: "page:stock", icon: FileText },
  { to: "/reports", key: "reports", feature: "page:reports", icon: BarChart3 },
  { to: "/paiements", key: "payments", feature: "page:paiements", icon: Banknote },
  { to: "/rapprochement", key: "reconciliation", feature: "page:rapprochement", icon: Landmark },
  { to: "/prospection", key: "prospecting", feature: "page:prospection", icon: Compass },
  { to: "/radar", key: "radar", feature: "page:radar", icon: Radio },
  { to: "/veille", key: "veille", feature: "page:veille", icon: AlertOctagon },
  { to: "/bouclier", key: "bouclier", feature: "page:bouclier", icon: Shield },
  { to: "/sources-donnees", key: "sources", feature: "page:sources-donnees", icon: Database },
  { to: "/admin/users", key: "users", feature: "page:users", icon: UserCog },
  { to: "/admin/permissions", key: "permissions", feature: "page:users", icon: ShieldCheck },
  { to: "/integrations", key: "integrations", feature: "page:integrations", icon: Plug },
  { to: "/settings", key: "settings", feature: "page:settings", icon: SettingsIcon },
  { to: "/privacy", key: "privacy", feature: "page:privacy", icon: ShieldCheck },
  { to: "/monthly-review", key: "monthly", feature: "page:reports", icon: Trophy },
  { to: "/smart-goals", key: "smart", feature: "page:dashboard", icon: Sparkles },
  { to: "/agents", key: "agents", feature: "page:users", icon: UserCog },
  { to: "/admin/couts", key: "costs", feature: "product:view_cost", icon: Coins },
  { to: "/connectors", key: "connectors", feature: "page:integrations", icon: Plug },
];
export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { t, lang, setLanguage, languages } = useI18n();
  const { has, loading: permsLoading } = usePerms();
  const loc = useLocation();
  const nav_ = useNavigate();
  const role = user?.role || "commercial";
  // Filtre par PERMISSION (source de vérité serveur). Pendant le loading initial,
  // fallback conservateur sur le rôle manager pour ne pas cacher la nav des managers.
  const nav = permsLoading
    ? navAll.filter(() => role === "manager")
    : navAll.filter(n => has(n.feature));

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
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map(({ to, key, icon: Icon }) => {
            const active = loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));
            return (
              <Link key={to} to={to} data-testid={`nav-${key}`}
                className={`flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-lg text-sm transition-colors duration-200 ${active ? "bg-[#4A154B] dark:bg-[#B076B4] text-white dark:text-stone-900" : "text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"}`}>
                <Icon size={18} strokeWidth={1.5} />
                <span>{t(key)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-stone-200 dark:border-stone-700 space-y-2">
          <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 px-2">
            <span className="truncate">{user?.name}</span>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <span className="badge badge-vip">{user?.role}</span>
            </div>
          </div>
          <ThemeToggle variant="sidebar" />
          <select
            value={lang}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full text-sm border border-stone-300 dark:border-stone-600 rounded-lg px-2 py-1.5 min-h-[44px] bg-white dark:bg-stone-800 dark:text-stone-200"
            data-testid="lang-select"
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
          >
            {languages.map(l => <option key={l.code} value={l.code}>{l.flag}</option>)}
          </select>
          <button onClick={logout} data-testid="logout-mobile" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-700 dark:text-stone-300"><LogOut size={18} /></button>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 md:ml-0 pt-16 md:pt-0 pb-20 md:pb-0 overflow-x-hidden">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom tab bar (5 primary actions, thumb-zone) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-700 flex justify-around py-2 pb-safe">
        {nav.slice(0, 5).map(({ to, key, icon: Icon }) => {
          const active = loc.pathname === to;
          return (
            <button key={to} onClick={() => nav_(to)} data-testid={`nav-mobile-${key}`}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 min-w-[48px] min-h-[48px] ${active ? "text-[#4A154B] dark:text-[#B076B4]" : "text-stone-500 dark:text-stone-400"}`}>
              <Icon size={22} strokeWidth={1.75} />
              <span className="text-[10px] font-medium">{t(key)}</span>
            </button>
          );
        })}
      </nav>

      <VoiceFAB />
      <OnboardingTour />
    </div>
  );
}
