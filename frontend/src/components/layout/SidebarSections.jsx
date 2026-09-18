import React from "react";
import { ChevronDown, FileText, Pin } from "lucide-react";
import { HOME_ENTRY } from "./navConfig";
import { NavEntry } from "./NavEntry";
import { useSidebar } from "./SidebarContext";

/** Entrée fixe Tableau de bord (hors pli). */
export function SidebarHome({ homeEval }) {
  if (!homeEval.visible) return null;
  return (
    <div className="pb-2 mb-2 border-b border-stone-200/60 dark:border-stone-700/50" data-testid="nav-home-fixed">
      <NavEntry to={HOME_ENTRY.to} k={HOME_ENTRY.key} Icon={HOME_ENTRY.icon} locked={homeEval.lockedPlan} />
    </div>
  );
}

/** Zone épinglée « Aujourd'hui » : 3 fixes + jusqu'à 3 épingles utilisateur. */
export function SidebarPinned({ visiblePinned, stopsToday }) {
  const { t, collapsed, userPinCount } = useSidebar();
  if (visiblePinned.length === 0) return null;
  return (
    <div data-testid="nav-pinned" className="pb-2 mb-2 border-b border-stone-200/60 dark:border-stone-700/50">
      {!collapsed && (
        <div className="flex items-center gap-1 px-2 py-1.5 text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">
          <Pin size={10} aria-hidden="true" />
          <span>{t("section_today")}</span>
          {userPinCount > 0 && <span className="ml-auto tabular-nums normal-case text-xs text-stone-400">{userPinCount}/3</span>}
        </div>
      )}
      <div className="space-y-0.5">
        {visiblePinned.map((e) => (
          <NavEntry key={e.to} to={e.to} k={e.key} Icon={e.icon}
            badge={e.badgeKey === "stops_today" ? stopsToday : undefined}
            inTodayFixed={e._fixed} inTodayUser={!e._fixed} locked={e._locked} />
        ))}
      </div>
    </div>
  );
}

function SectionBlock({ section }) {
  const { t, collapsed, openSections, toggleSection, dragCtx, setDragCtx, setDragOver, applyDrop } = useSidebar();
  const isOpen = collapsed || openSections.includes(section.key);
  const SectionIcon = section.icon || FileText;
  return (
    <div data-testid={`nav-section-${section.key}`}
      className={!collapsed ? "rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-white/50 dark:bg-stone-900/40 overflow-hidden" : ""}>
      {!collapsed && (
        <button type="button" onClick={() => toggleSection(section.key)}
          className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
            isOpen ? "text-[#4A154B] dark:text-[#B076B4] bg-stone-100/70 dark:bg-stone-800/40"
                   : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-800/30"}`}
          aria-expanded={isOpen} aria-controls={`section-body-${section.key}`}
          data-testid={`nav-section-toggle-${section.key}`}>
          <SectionIcon size={13} strokeWidth={2} aria-hidden="true" className="shrink-0 opacity-80" />
          <span className="truncate flex-1 text-left">{t(section.key)}</span>
          <ChevronDown size={13} aria-hidden="true" className="shrink-0 opacity-70"
            style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s ease" }} />
        </button>
      )}
      {collapsed && (
        <div className="my-1 flex items-center justify-center py-1" aria-hidden="true"><SectionIcon size={14} className="opacity-40" /></div>
      )}
      {isOpen && (
        <div id={`section-body-${section.key}`}
          className={collapsed ? "space-y-0.5" : "p-1.5 space-y-0.5 border-t border-stone-200/50 dark:border-stone-700/40"}
          onDragOver={(e) => { if (dragCtx?.sectionKey === section.key) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
          onDrop={(e) => {
            if (dragCtx?.sectionKey !== section.key) return;
            e.preventDefault();
            applyDrop(section.key, dragCtx.fromKey, null);
            setDragCtx(null); setDragOver(null);
          }}>
          {section.entries.map(({ to, key, icon, _locked }) => (
            <NavEntry key={to} to={to} k={key} Icon={icon} sectionKey={section.key} locked={_locked} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Les 6 sections repliables + astuce de personnalisation. */
export function SidebarSections({ visibleSections }) {
  const { t, collapsed, userPinCount, prefs } = useSidebar();
  const untouched = userPinCount === 0 && Object.keys(prefs.section_order || {}).length === 0;
  return (
    <>
      {visibleSections.map(section => <SectionBlock key={section.key} section={section} />)}
      {!collapsed && untouched && (
        <div className="mt-3 px-2 text-xs text-stone-400 dark:text-stone-500 leading-snug" data-testid="nav-customize-hint">
          {t("customize_hint")}
        </div>
      )}
    </>
  );
}
