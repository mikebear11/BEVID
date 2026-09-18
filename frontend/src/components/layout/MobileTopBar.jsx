import React from "react";
import { Search } from "lucide-react";
import BevidLogo from "@/components/BevidLogo";
import SyncIndicator from "@/components/SyncIndicator";
import ThemeToggle from "@/components/ThemeToggle";
import InboxDropdown from "@/components/InboxDropdown";
import NotificationBell from "@/components/NotificationBell";

/** Barre supérieure mobile (< md). Langue et déconnexion vivent dans « Plus » / Mon profil (M1). */
export function MobileTopBar({ t }) {
  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-40 glass border-b border-stone-200 dark:border-stone-700 flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3 text-[#4A154B] dark:text-[#B076B4]">
        <BevidLogo size={22} />
        <span className="font-display text-xl" aria-hidden="true">BEVID</span>
        <SyncIndicator />
      </div>
      <div className="flex gap-1 items-center">
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("bevid:open-palette"))}
          data-testid="palette-trigger-mobile" aria-label={t("search_verb")}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-700 dark:text-stone-300">
          <Search size={18} aria-hidden="true" />
        </button>
        <ThemeToggle variant="icon" />
        <InboxDropdown />
        <NotificationBell />
      </div>
    </div>
  );
}
