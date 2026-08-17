import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import VoiceFAB from "@/components/VoiceFAB";
import { LayoutDashboard, Users, Wine, ShoppingCart, Route as RouteIcon, BarChart3, UserCog, LogOut, Languages, ClipboardCheck, Calendar, Trophy, Columns } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";

const nav = [
  { to: "/", key: "dashboard", icon: LayoutDashboard },
  { to: "/visit", key: "visit", icon: ClipboardCheck },
  { to: "/planning", key: "planning", icon: Calendar },
  { to: "/pipeline", key: "pipeline", icon: Columns },
  { to: "/clients", key: "clients", icon: Users },
  { to: "/products", key: "products", icon: Wine },
  { to: "/orders", key: "orders", icon: ShoppingCart },
  { to: "/tours", key: "tours", icon: RouteIcon },
  { to: "/reports", key: "reports", icon: BarChart3 },
  { to: "/monthly-review", key: "monthly", icon: Trophy },
  { to: "/agents", key: "agents", icon: UserCog },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { t, lang, setLanguage } = useI18n();
  const loc = useLocation();
  const nav_ = useNavigate();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex md:flex-col w-64 border-r border-stone-200 bg-white/60 backdrop-blur-md" data-testid="sidebar">
        <div className="p-6 border-b border-stone-200">
          <h1 className="font-display text-2xl text-[#4A154B] leading-none">Cellier</h1>
          <p className="overline mt-1">CRM Boisson · Pro</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ to, key, icon: Icon }) => {
            const active = loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));
            return (
              <Link key={to} to={to} data-testid={`nav-${key}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-200 ${active ? "bg-[#4A154B] text-white" : "text-stone-700 hover:bg-stone-100"}`}>
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
          <button onClick={() => setLanguage(lang === "fr" ? "en" : "fr")} data-testid="lang-toggle" className="btn-ghost w-full flex items-center gap-2 text-sm justify-center">
            <Languages size={16} /> {lang.toUpperCase()}
          </button>
          <button onClick={logout} data-testid="logout-btn" className="btn-ghost w-full flex items-center gap-2 text-sm justify-center">
            <LogOut size={16} /> {t("logout")}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 glass border-b border-stone-200 flex items-center justify-between px-4 py-3">
        <h1 className="font-display text-xl text-[#4A154B]">Cellier</h1>
        <div className="flex gap-2 items-center">
          <NotificationBell />
          <button onClick={() => setLanguage(lang === "fr" ? "en" : "fr")} className="text-xs font-medium px-2 py-1 border rounded" data-testid="lang-toggle-mobile">{lang.toUpperCase()}</button>
          <button onClick={logout} data-testid="logout-mobile"><LogOut size={18} /></button>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 md:ml-0 pt-16 md:pt-0 pb-20 md:pb-0 overflow-x-hidden">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-200 flex justify-around py-2">
        {nav.slice(0, 5).map(({ to, key, icon: Icon }) => {
          const active = loc.pathname === to;
          return (
            <button key={to} onClick={() => nav_(to)} data-testid={`nav-mobile-${key}`}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 min-w-[44px] ${active ? "text-[#4A154B]" : "text-stone-500"}`}>
              <Icon size={20} strokeWidth={1.5} />
              <span className="text-[10px]">{t(key)}</span>
            </button>
          );
        })}
      </nav>

      <VoiceFAB />
    </div>
  );
}
