import React from "react";
import { Link } from "react-router-dom";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import PuceEtat from "@/components/system/PuceEtat";
import NotificationBell from "@/components/NotificationBell";
import PushHistoryBell from "@/components/PushHistoryBell";
import InboxDropdown from "@/components/InboxDropdown";
import { SidebarUserMenu } from "./SidebarUserMenu";
import { useSidebar } from "./SidebarContext";

/** Pied de sidebar : identité (→ /profile), notifications, menu thème/langue/déconnexion. */
export function SidebarIdentity({ user, role, menuProps }) {
  const { collapsed, isActive } = useSidebar();
  const initial = (user?.name || user?.email || "?")[0].toUpperCase();
  return (
    <div className={`border-t border-stone-200 dark:border-stone-700 ${collapsed ? "p-2 space-y-2" : "p-3 space-y-2"}`}>
      {!collapsed ? (
        <>
          <Link to="/profile" data-testid="nav-profile-identity"
            className={`flex items-center gap-3 min-w-0 px-2 py-2 min-h-[52px] rounded-lg text-sm transition-colors ${isActive("/profile") ? "bg-[#4A154B]/10 dark:bg-[#B076B4]/20" : "hover:bg-stone-100 dark:hover:bg-stone-800"}`}>
            <div className="w-9 h-9 rounded-full bg-[#4A154B] dark:bg-[#B076B4] text-white dark:text-stone-900 flex items-center justify-center font-medium text-sm shrink-0" aria-hidden="true">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-stone-800 dark:text-stone-100 truncate text-[13px] leading-tight">{user?.name || user?.email}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {user?.org_name && <span className="text-xs text-stone-500 truncate">{user.org_name}</span>}
                <PuceEtat etat="info" variante="douce" libelle={role} />
              </div>
            </div>
          </Link>
          <div className="flex items-center justify-between gap-1 px-1 pt-1 border-t border-stone-100 dark:border-stone-800/50" data-testid="sidebar-quick-actions">
            <div className="flex items-center gap-1">
              <div className="flex items-center justify-center w-9 h-9" data-testid="qa-inbox"><InboxDropdown /></div>
              <div className="flex items-center justify-center w-9 h-9" data-testid="qa-push"><PushHistoryBell /></div>
              <div className="flex items-center justify-center w-9 h-9" data-testid="qa-notifs"><NotificationBell /></div>
            </div>
            <div className="flex items-center justify-center" data-testid="qa-menu"><SidebarUserMenu {...menuProps} /></div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link to="/profile" data-testid="nav-profile-identity"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-[#4A154B] dark:bg-[#B076B4] text-white dark:text-stone-900 font-medium text-sm">
                {initial}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">{user?.name || user?.email}</TooltipContent>
          </Tooltip>
          <SidebarUserMenu {...menuProps} collapsed />
        </div>
      )}
    </div>
  );
}
