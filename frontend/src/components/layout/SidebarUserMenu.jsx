import React from "react";
import { LogOut, Sun, Moon, Sunrise, Monitor, MoreHorizontal, Languages } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

// Menu déroulant Thème + Langue + Déconnexion (pied de sidebar).
export function SidebarUserMenu({ theme, setTheme, resolvedTheme, lang, setLanguage, languages, onLogout, t, collapsed = false }) {
  const themeItems = [
    { v: "light", l: t("theme_light") || "Clair", Icon: Sun },
    { v: "dark", l: t("theme_dark") || "Sombre", Icon: Moon },
    { v: "sun", l: t("theme_sun") || "Soleil", Icon: Sunrise },
    { v: "system", l: t("theme_system") || "Système", Icon: Monitor },
  ];
  const currentTheme = themeItems.find(x => x.v === theme) || themeItems[3];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="sidebar-user-menu-trigger"
          aria-label={t("user_menu") || "Menu utilisateur"}
          className={`shrink-0 flex items-center justify-center rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${collapsed ? "w-10 h-10" : "w-9 h-9"}`}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56" data-testid="sidebar-user-menu-content">
        <DropdownMenuLabel className="flex items-center gap-2 text-xs uppercase tracking-wider text-stone-500">
          <currentTheme.Icon size={12} aria-hidden="true" />
          {t("theme") || "Thème"} · <span className="normal-case tracking-normal text-stone-700 dark:text-stone-300">{currentTheme.l}</span>
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {themeItems.map(({ v, l, Icon }) => (
            <DropdownMenuRadioItem key={v} value={v} data-testid={`sidebar-theme-${v}`} className="cursor-pointer">
              <Icon size={14} className="mr-2 opacity-70" aria-hidden="true" />
              <span className="flex-1">{l}</span>
              {theme === "system" && v === "system" && (
                <span className="text-xs text-stone-400 ml-2">{resolvedTheme}</span>
              )}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="flex items-center gap-2 text-xs uppercase tracking-wider text-stone-500">
          <Languages size={12} aria-hidden="true" />
          {t("language") || "Langue"}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={lang} onValueChange={setLanguage}>
          {languages.map(l => (
            <DropdownMenuRadioItem key={l.code} value={l.code} data-testid={`sidebar-lang-${l.code}`} className="cursor-pointer">
              <span className="mr-2" aria-hidden="true">{l.flag}</span>
              <span className="flex-1">{l.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={onLogout}
          data-testid="sidebar-menu-logout"
          className="cursor-pointer text-red-700 dark:text-red-400 focus:text-red-700 dark:focus:text-red-400"
        >
          <LogOut size={14} className="mr-2" aria-hidden="true" />
          {t("logout") || "Se déconnecter"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
