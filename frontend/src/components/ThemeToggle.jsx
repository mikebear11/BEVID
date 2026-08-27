import React from "react";
import { Sun, Moon, Sunrise, Monitor } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * Bouton de bascule 4-états : clair → sombre → soleil → système → clair
 * - variant "sidebar" : bloc plein largeur avec libellé
 * - variant "icon"    : bouton icône seul (mobile / topbar)
 */
export default function ThemeToggle({ variant = "icon" }) {
  const { theme, resolved, cycle } = useTheme();
  const Icon =
    theme === "light" ? Sun :
    theme === "dark"  ? Moon :
    theme === "sun"   ? Sunrise :
    Monitor;
  const label =
    theme === "light" ? "Clair" :
    theme === "dark"  ? "Sombre" :
    theme === "sun"   ? "Soleil" :
    "Système";
  const title = `Thème : ${label} (auto : ${resolved}). Cliquez pour changer.`;

  if (variant === "sidebar") {
    return (
      <button
        onClick={cycle}
        title={title}
        aria-label={title}
        data-testid="theme-toggle"
        className="w-full flex items-center justify-between gap-2 px-3 py-2 min-h-[44px] rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:border-[#4A154B] dark:hover:border-[#B076B4] hover:text-[#4A154B] dark:hover:text-[#E6C9E8] transition-colors"
      >
        <span className="flex items-center gap-2 text-sm">
          <Icon size={16} strokeWidth={1.75} />
          <span>Thème · {label}</span>
        </span>
        <span className="text-xs uppercase tracking-wider text-stone-400 dark:text-stone-500">{resolved}</span>
      </button>
    );
  }

  return (
    <button
      onClick={cycle}
      title={title}
      aria-label={title}
      data-testid="theme-toggle-icon"
      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
    >
      <Icon size={18} strokeWidth={1.75} />
    </button>
  );
}
