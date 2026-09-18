import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Pin, PinOff, RotateCcw, GripVertical } from "lucide-react";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { COUNTER_MAP, COUNTER_ARIA, PLAN_LABEL_KEY } from "./navConfig";
import { useSidebar } from "./SidebarContext";

function NavBadges({ k, active, locked, showCounter, counterVal, badge, t }) {
  return (
    <>
      {locked && (
        <span data-testid={`nav-lock-${k}`}
          className="text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shrink-0"
          aria-label={`Verrouillé — forfait ${t(PLAN_LABEL_KEY[locked] || "plan_pro")}`}>
          {t(PLAN_LABEL_KEY[locked] || "plan_pro")}
        </span>
      )}
      {showCounter && (
        <span data-testid={`nav-counter-${k}`}
          className={`text-xs tabular-nums px-1.5 py-0.5 rounded-full shrink-0 ${active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"}`}
          aria-label={`${counterVal} ${t(COUNTER_ARIA[k])}`}>
          {counterVal > 99 ? "99+" : counterVal}
        </span>
      )}
      {badge != null && badge > 0 && (
        <span data-testid={`nav-badge-${k}`}
          className={`text-xs tabular-nums px-1.5 py-0.5 rounded-full shrink-0 ${active ? "bg-white/20 text-white" : "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200"}`}
          aria-label={`${badge} arrêts aujourd'hui`}>
          {badge}
        </span>
      )}
    </>
  );
}

/** Une entrée de navigation : lien + DnD + compteur + verrou forfait + menu contextuel d'épinglage. */
export function NavEntry({ to, k, Icon, badge, sectionKey = null, inTodayFixed = false, inTodayUser = false, locked = null }) {
  const s = useSidebar();
  const { t, collapsed, counters, dragCtx, setDragCtx, dragOver, setDragOver } = s;
  const active = s.isActive(to);
  const pinned = s.isPinned(k);
  const draggable = !!sectionKey && !locked && !collapsed;
  const dragging = dragCtx?.fromKey === k && dragCtx?.sectionKey === sectionKey;
  const isDragOver = dragOver?.sectionKey === sectionKey && dragOver?.overKey === k;
  const counterVal = counters?.[COUNTER_MAP[k]];
  const showCounter = !locked && counterVal && counterVal > 0;
  const label = t(k);
  const target = locked ? "/billing" : to;

  const dragProps = draggable ? {
    onDragStart: (e) => {
      setDragCtx({ sectionKey, fromKey: k });
      try { e.dataTransfer.setData("text/plain", `${sectionKey}::${k}`); } catch { /* best-effort */ }
      e.dataTransfer.effectAllowed = "move";
    },
    onDragEnd: () => { setDragCtx(null); setDragOver(null); },
    onDragOver: (e) => {
      if (!dragCtx || dragCtx.sectionKey !== sectionKey) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragOver?.overKey !== k) setDragOver({ sectionKey, overKey: k });
    },
    onDrop: (e) => {
      if (!dragCtx || dragCtx.sectionKey !== sectionKey) return;
      e.preventDefault();
      s.applyDrop(sectionKey, dragCtx.fromKey, k);
      setDragCtx(null); setDragOver(null);
    },
  } : {};

  const link = (
    <Link
      to={target}
      data-testid={`nav-${k}`}
      aria-current={active ? "page" : undefined}
      aria-disabled={locked ? "true" : undefined}
      draggable={draggable}
      {...dragProps}
      title={collapsed ? label : undefined}
      className={[
        "group flex items-center rounded-lg text-sm transition-colors duration-200",
        collapsed ? "justify-center gap-0 px-2 py-2 min-h-[40px] w-10 mx-auto" : "gap-2 px-3 py-2 min-h-[40px]",
        active ? "bg-[#4A154B] dark:bg-[#B076B4] text-white dark:text-stone-900"
               : locked ? "text-stone-400 dark:text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50"
                        : "text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800",
        dragging ? "opacity-50" : "",
        isDragOver ? "ring-2 ring-[#B076B4] ring-inset" : "",
      ].join(" ")}
    >
      {draggable && !collapsed && (
        <GripVertical size={12} aria-hidden="true"
          className={`shrink-0 opacity-0 group-hover:opacity-40 transition-opacity cursor-grab ${active ? "text-white/70" : "text-stone-400"}`} />
      )}
      <Icon size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && inTodayUser && !active && <Pin size={11} aria-hidden="true" className="text-stone-400 shrink-0" />}
      {!collapsed && <NavBadges k={k} active={active} locked={locked} showCounter={showCounter} counterVal={counterVal} badge={badge} t={t} />}
      {collapsed && (showCounter || (badge != null && badge > 0)) && (
        <span className="absolute -mt-4 ml-4 w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
      )}
    </Link>
  );

  const linkWithTooltip = collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        {label}
        {locked && <span className="ml-2 text-amber-300">· {t(PLAN_LABEL_KEY[locked] || "plan_pro")}</span>}
      </TooltipContent>
    </Tooltip>
  ) : link;

  if (inTodayFixed) return linkWithTooltip;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{linkWithTooltip}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-[220px]" data-testid={`nav-ctxmenu-${k}`}>
        {inTodayUser ? (
          <ContextMenuItem onSelect={() => s.unpinFromToday(k)} data-testid={`nav-ctx-unpin-${k}`}>
            <PinOff size={14} className="mr-2" /> {t("unpin_from_today")}
          </ContextMenuItem>
        ) : (
          <ContextMenuItem disabled={pinned || s.userPinCount >= 3 || !!locked} onSelect={() => s.pinToToday(k)} data-testid={`nav-ctx-pin-${k}`}>
            <Pin size={14} className="mr-2" />
            {t("pin_to_today")}
            {s.userPinCount >= 3 && !pinned && <span className="ml-auto text-xs text-stone-400">{t("max_pins_reached")}</span>}
          </ContextMenuItem>
        )}
        {sectionKey && s.prefs.section_order?.[sectionKey]?.length > 0 && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => s.resetSection(sectionKey)} data-testid={`nav-ctx-reset-${sectionKey}`}>
              <RotateCcw size={14} className="mr-2" /> {t("reset_section")}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Hook d'état DnD partagé par toutes les entrées d'une sidebar. */
export function useDragState() {
  const [dragCtx, setDragCtx] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  return { dragCtx, setDragCtx, dragOver, setDragOver };
}
