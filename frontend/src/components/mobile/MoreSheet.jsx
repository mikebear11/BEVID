import React from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, QrCode, ShoppingCart, Wine, BarChart3, User as UserIcon, LogOut, Users, Package, Languages } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { Sheet } from "./Sheet";

const ENTRIES = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/scan", label: "Scanner un fût", icon: QrCode },
  { to: "/orders", label: "Commandes", icon: ShoppingCart },
  { to: "/products", label: "Catalogue", icon: Wine },
  { to: "/stock", label: "Stock", icon: Package },
  { to: "/reports", label: "Rapports", icon: BarChart3, managerOnly: true },
  { to: "/team", label: "Mon équipe", icon: Users, managerOnly: true },
  { to: "/profile", label: "Mon profil", icon: UserIcon },
];

export function MoreSheet({ open, onClose }) {
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const { lang, setLanguage, languages, t } = useI18n();
  const isMgr = user?.role === "manager" || user?.role === "gerant";
  const go = (to) => { onClose(); nav(to); };
  return (
    <Sheet open={open} onClose={onClose} title="Plus" testId="more-sheet">
      <div className="grid grid-cols-2 gap-3">
        {ENTRIES.filter((e) => !e.managerOnly || isMgr).map(({ to, label, icon: Icon }) => (
          <button key={to} type="button" onClick={() => go(to)} data-testid={`more-${to.replace(/\//g, "") || "home"}`}
            className="min-h-[72px] rounded-2xl border border-stone-200 bg-white text-base font-medium flex flex-col items-center justify-center gap-1 active:bg-stone-100">
            <Icon size={24} aria-hidden="true" className="text-[#4A154B]" /> {label}
          </button>
        ))}
        <label className="min-h-[72px] rounded-2xl border border-stone-200 bg-white text-base font-medium flex flex-col items-center justify-center gap-1">
          <span className="flex items-center gap-1"><Languages size={20} aria-hidden="true" className="text-[#4A154B]" /> {t("language")}</span>
          <select value={lang} onChange={(e) => setLanguage(e.target.value)} data-testid="more-lang-select" aria-label={t("language")}
            className="min-h-[44px] text-base rounded-lg border border-stone-300 px-2 bg-white">
            {languages.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.label || l.code.toUpperCase()}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => { onClose(); logout(); }} data-testid="more-logout"
          className="min-h-[72px] rounded-2xl border border-stone-200 text-base font-medium text-[#8C2A2A] flex flex-col items-center justify-center gap-1">
          <LogOut size={24} aria-hidden="true" /> Déconnexion
        </button>
      </div>
    </Sheet>
  );
}
