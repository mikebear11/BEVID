import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Compass, Users, Plus, Route as RouteIcon, MoreHorizontal } from "lucide-react";
import { QuickActionSheet } from "./QuickActionSheet";
import { MoreSheet } from "./MoreSheet";
import { hasOwnBottomBar } from "@/lib/mobile";

const TABS = [
  { to: "/terrain", key: "terrain", label: "Terrain", icon: Compass },
  { to: "/clients", key: "clients", label: "Clients", icon: Users },
  { key: "plus", label: "Nouveau", icon: Plus, center: true },
  { to: "/tournee", key: "tournee", label: "Tournée", icon: RouteIcon },
  { key: "more", label: "Plus", icon: MoreHorizontal },
];

/** Barre du bas mobile : Terrain · Clients · + · Tournée · Plus (M1). */
export function BottomNav() {
  const loc = useLocation();
  const nav = useNavigate();
  const [quick, setQuick] = useState(false);
  const [more, setMore] = useState(false);
  if (hasOwnBottomBar(loc.pathname)) return null;
  const isActive = (to) => to && (loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to + "/")));
  const onTap = (tab) => {
    if (tab.key === "plus") return setQuick(true);
    if (tab.key === "more") return setMore(true);
    nav(tab.to);
  };
  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-700 grid grid-cols-5 items-end pb-safe"
        data-testid="mobile-bottom-nav" aria-label="Navigation rapide">
        {TABS.map((tab) => {
          const active = isActive(tab.to);
          const Icon = tab.icon;
          if (tab.center) {
            return (
              <button key={tab.key} type="button" onClick={() => onTap(tab)} aria-label="Nouveau : visite, commande, prospect, note vocale" data-testid="nav-mobile-plus"
                className="flex flex-col items-center justify-end min-h-[64px] pb-1">
                <span className="w-14 h-14 -mt-6 rounded-full bg-[#4A154B] text-white flex items-center justify-center shadow-lg"><Icon size={30} strokeWidth={2.5} aria-hidden="true" /></span>
              </button>
            );
          }
          return (
            <button key={tab.key} type="button" onClick={() => onTap(tab)} data-testid={`nav-mobile-${tab.key}`} aria-label={tab.label}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[64px] ${active ? "text-[#4A154B] dark:text-[#B076B4]" : "text-stone-600 dark:text-stone-400"}`}>
              <Icon size={24} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          );
        })}
      </nav>
      <QuickActionSheet open={quick} onClose={() => setQuick(false)} />
      <MoreSheet open={more} onClose={() => setMore(false)} />
    </>
  );
}
