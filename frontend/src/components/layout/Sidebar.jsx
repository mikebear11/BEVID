import React from "react";
import { Search, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import BevidLogo from "@/components/BevidLogo";
import SyncIndicator from "@/components/SyncIndicator";
import { SIDEBAR_THEME_CLASSES } from "./navConfig";
import { useSidebar } from "./SidebarContext";
import { SidebarHome, SidebarPinned, SidebarSections } from "./SidebarSections";
import { SidebarIdentity } from "./SidebarIdentity";

const openPalette = () => window.dispatchEvent(new CustomEvent("bevid:open-palette"));

function SidebarHeader() {
  const { t, collapsed, toggleCollapsed } = useSidebar();
  const label = collapsed ? t("expand_sidebar") : t("collapse_sidebar");
  return (
    <div className={`border-b border-stone-200 dark:border-stone-700 flex items-center ${collapsed ? "flex-col gap-2 p-3" : "justify-between p-6"}`}>
      <div className={`flex items-center text-[#4A154B] dark:text-[#B076B4] ${collapsed ? "" : "gap-2"}`}>
        <BevidLogo size={collapsed ? 22 : 28} />
        {!collapsed && (
          <div>
            <span className="font-display text-2xl leading-none block" aria-hidden="true">BEVID</span>
            <p className="overline mt-1">CRM Boisson · Pro</p>
          </div>
        )}
      </div>
      <div className={`flex items-center ${collapsed ? "flex-col gap-2" : "gap-1"}`}>
        {!collapsed && <SyncIndicator />}
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={toggleCollapsed} data-testid="sidebar-collapse-toggle"
              aria-label={label} aria-pressed={collapsed ? "true" : "false"}
              className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 dark:text-stone-400">
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function PaletteTrigger() {
  const { t, collapsed } = useSidebar();
  if (!collapsed) {
    return (
      <button type="button" onClick={openPalette} data-testid="palette-trigger" aria-label={t("open_command_palette")}
        className="mx-3 mt-3 flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors min-h-[40px]">
        <Search size={14} aria-hidden="true" />
        <span className="flex-1 text-left">{t("search_verb")}…</span>
        <kbd className="text-xs px-1.5 py-0.5 border border-stone-300 dark:border-stone-600 rounded font-mono">⌘K</kbd>
      </button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={openPalette} data-testid="palette-trigger" aria-label={t("open_command_palette")}
          className="mx-auto mt-3 flex items-center justify-center w-10 h-10 rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800">
          <Search size={16} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">{t("search_verb")} · ⌘K</TooltipContent>
    </Tooltip>
  );
}

/** Sidebar desktop : header, palette, navigation (home / épinglé / sections), identité. */
export function Sidebar({ sidebarTheme, homeEval, visiblePinned, visibleSections, stopsToday, user, role, menuProps }) {
  const { t, collapsed } = useSidebar();
  return (
    <aside
      className={`hidden md:flex md:flex-col shrink-0 sticky top-0 h-screen border-r border-stone-300 dark:border-stone-700 ${SIDEBAR_THEME_CLASSES[sidebarTheme]} shadow-[inset_-1px_0_0_rgba(74,21,75,0.08)] transition-[width] duration-200 z-30 ${collapsed ? "w-16" : "w-64"}`}
      data-testid="sidebar" data-collapsed={collapsed ? "1" : "0"} data-sidebar-theme={sidebarTheme}>
      <SidebarHeader />
      <PaletteTrigger />
      <nav className="flex-1 p-3 space-y-2 overflow-y-auto mt-2" aria-label={t("navigation") || "Navigation"}>
        <SidebarHome homeEval={homeEval} />
        <SidebarPinned visiblePinned={visiblePinned} stopsToday={stopsToday} />
        <SidebarSections visibleSections={visibleSections} />
      </nav>
      <SidebarIdentity user={user} role={role} menuProps={menuProps} />
    </aside>
  );
}
