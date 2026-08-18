import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import VoiceFAB from "@/components/VoiceFAB";
import SyncIndicator from "@/components/SyncIndicator";
import BevidLogo from "@/components/BevidLogo";
import OnboardingTour from "@/components/OnboardingTour";
import { LayoutDashboard, Users, Wine, ShoppingCart, Route as RouteIcon, BarChart3, UserCog, LogOut, ClipboardCheck, Calendar, Trophy, Columns, Target, Plug, Settings as SettingsIcon, Sparkles, Banknote, ShieldCheck, Coins, Warehouse, QrCode, FileText, Landmark } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";

const navAll = [
  { to: "/", key: "dashboard", icon: LayoutDashboard, roles: ["manager", "commercial"] },
  { to: "/visit", key: "visit", icon: ClipboardCheck, roles: ["manager", "commercial"] },
  { to: "/planning", key: "planning", icon: Calendar, roles: ["manager", "commercial"] },
  { to: "/pipeline", key: "pipeline", icon: Columns, roles: ["manager", "commercial"] },
  { to: "/deals", key: "deals", icon: Target, roles: ["manager", "commercial"] },
  { to: "/clients", key: "clients", icon: Users, roles: ["manager", "commercial"] },
  { to: "/products", key: "products", icon: Wine, roles: ["manager", "commercial"] },
  { to: "/orders", key: "orders", icon: ShoppingCart, roles: ["manager", "commercial"] },
  { to: "/tours", key: "tours", icon: RouteIcon, roles: ["manager", "commercial"] },
  { to: "/stock", key: "stock", icon: Warehouse, roles: ["manager", "commercial"] },
  { to: "/containers", key: "containers", icon: QrCode, roles: ["manager", "commercial"] },
  { to: "/scan", key: "scan", icon: QrCode, roles: ["manager", "commercial"] },
  { to: "/drm", key: "drm", icon: FileText, roles: ["manager"] },
  { to: "/reports", key: "reports", icon: BarChart3, roles: ["manager"] },
  { to: "/paiements", key: "payments", icon: Banknote, roles: ["manager"] },
  { to: "/rapprochement", key: "reconciliation", icon: Landmark, roles: ["manager"] },
  { to: "/monthly-review", key: "monthly", icon: Trophy, roles: ["manager"] },
  { to: "/smart-goals", key: "smart", icon: Sparkles, roles: ["manager", "commercial"] },
  { to: "/agents", key: "agents", icon: UserCog, roles: ["manager"] },
  { to: "/admin/users", key: "users", icon: UserCog, roles: ["manager"] },
  { to: "/admin/couts", key: "costs", icon: Coins, roles: ["manager"] },
  { to: "/connectors", key: "connectors", icon: Plug, roles: ["manager"] },
  { to: "/confidentialite", key: "privacy", icon: ShieldCheck, roles: ["manager", "commercial"] },
  { to: "/settings", key: "settings", icon: SettingsIcon, roles: ["manager"] },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { t, lang, setLanguage, languages } = useI18n();
  const loc = useLocation();
  const nav_ = useNavigate();
  const role = user?.role || "commercial";
  const nav = navAll.filter(n => n.roles.includes(role));

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex md:flex-col w-64 border-r border-stone-200 bg-white/60 backdrop-blur-md" data-testid="sidebar">
        <div className="p-6 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#4A154B]">
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
                className={`flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-lg text-sm transition-colors duration-200 ${active ? "bg-[#4A154B] text-white" : "text-stone-700 hover:bg-stone-100"}`}>
                <Icon size={18} strokeWidth={1.5} />
                <span>{t(key)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-stone-200 space-y-2">
          <div className="flex items-center justify-between text-xs text-stone-500 px-2">
            <span className="truncate">{user?.name}</span>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <span className="badge badge-vip">{user?.role}</span>
            </div>
          </div>
          <select
            value={lang}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full text-sm border border-stone-300 rounded-lg px-2 py-1.5 min-h-[44px] bg-white"
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
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 glass border-b border-stone-200 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 text-[#4A154B]">
          <BevidLogo size={22} />
          <h1 className="font-display text-xl">BEVID</h1>
          <SyncIndicator />
        </div>
        <div className="flex gap-2 items-center">
          <NotificationBell />
          <select
            value={lang}
            onChange={(e) => setLanguage(e.target.value)}
            className="text-xs font-medium px-2 py-1 border rounded min-h-[36px]"
            data-testid="lang-select-mobile"
          >
            {languages.map(l => <option key={l.code} value={l.code}>{l.flag}</option>)}
          </select>
          <button onClick={logout} data-testid="logout-mobile" className="min-w-[44px] min-h-[44px] flex items-center justify-center"><LogOut size={18} /></button>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 md:ml-0 pt-16 md:pt-0 pb-20 md:pb-0 overflow-x-hidden">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom tab bar (5 primary actions, thumb-zone) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-200 flex justify-around py-2 pb-safe">
        {nav.slice(0, 5).map(({ to, key, icon: Icon }) => {
          const active = loc.pathname === to;
          return (
            <button key={to} onClick={() => nav_(to)} data-testid={`nav-mobile-${key}`}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 min-w-[48px] min-h-[48px] ${active ? "text-[#4A154B]" : "text-stone-500"}`}>
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
