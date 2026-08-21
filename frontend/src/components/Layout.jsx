import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { usePerms } from "@/contexts/PermContext";
import VoiceFAB from "@/components/VoiceFAB";
import SyncIndicator from "@/components/SyncIndicator";
import BevidLogo from "@/components/BevidLogo";
import OnboardingTour from "@/components/OnboardingTour";
import { api } from "@/lib/api";
import {
  LayoutDashboard, Users, Wine, ShoppingCart, Route as RouteIcon, BarChart3, UserCog,
  LogOut, ClipboardCheck, Calendar, Trophy, Columns, Target, Plug, Settings as SettingsIcon,
  Sparkles, Banknote, ShieldCheck, Coins, Warehouse, QrCode, FileText, Landmark, Compass,
  Radio, AlertOctagon, Shield, Database, Search, ChevronDown, Truck, Pin, PinOff,
  User as UserIcon, RotateCcw, GripVertical,
} from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import PuceEtat from "@/components/system/PuceEtat";
import OfflineBanner from "@/components/OfflineBanner";
import CommandPalette from "@/components/CommandPalette";
import BillingBanner from "@/components/BillingBanner";
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator,
} from "@/components/ui/context-menu";

/**
 * Navigation refondue selon le cahier des charges "sidebar intelligente" :
 *
 *   1) UNE seule entrée fixe au-dessus des sections : /tableau de bord.
 *   2) Zone épinglée non repliable "Aujourd'hui" :
 *        - 3 entrées FIXES (Ma tournée / Visite / Scanner) — immuables.
 *        - Jusqu'à 3 épingles UTILISATEUR (personnalisation via clic droit).
 *   3) Six sections repliables, ordre figé (jamais de réorganisation auto) :
 *      Clients et ventes · Logistique · Argent · Pilotage · Acquisition · Admin.
 *   4) À l'intérieur d'une section, l'utilisateur peut REORDONNER par
 *      glisser-déposer. Le nouvel ordre est mémorisé par utilisateur (backend).
 *   5) Aucune entrée présente dans deux groupes. Aucun libellé quasi-dupliqué.
 *   6) `scan` porte sa propre permission `page:scan`.
 *   7) Ouverture initiale selon rôle : commercial → section_sales,
 *      manager → section_pilotage. Ensuite, choix utilisateur mémorisé.
 *   8) Sections sans entrée accessible : masquées entièrement.
 *   9) Réinitialisation par section : entrée "Réinitialiser cette section"
 *      dans le menu contextuel.
 */

// Zone épinglée FIXE — trois entrées quotidiennes intouchables.
const PINNED_FIXED = [
  { to: "/tournee", key: "tournee", feature: "page:tours", icon: RouteIcon, badgeKey: "stops_today" },
  { to: "/visit",   key: "new_visit", feature: "page:visits", icon: ClipboardCheck },
  { to: "/scan",    key: "scan",  feature: "page:scan", icon: QrCode },
];

// Entrée fixe hors pli, sous le logo/palette et au-dessus des sections.
const HOME_ENTRY = { to: "/", key: "dashboard", feature: "page:dashboard", icon: LayoutDashboard };

const SECTIONS = [
  { key: "section_sales", entries: [
    { to: "/clients",  key: "clients",  feature: "page:clients", icon: Users },
    { to: "/orders",   key: "orders",   feature: "page:orders",  icon: ShoppingCart },
    { to: "/products", key: "products", feature: "page:products", icon: Wine },
    { to: "/pipeline", key: "pipeline", feature: "page:clients", icon: Columns },
    { to: "/deals",    key: "deals",    feature: "page:clients", icon: Target },
  ]},
  { key: "section_logistics", entries: [
    { to: "/tours",              key: "tours",      feature: "page:tours", icon: RouteIcon },
    { to: "/livreur",            key: "livreur",    feature: null,          icon: Truck },
    { to: "/stock",              key: "stock",      feature: "page:stock", icon: Warehouse },
    { to: "/containers",         key: "containers", feature: "page:stock", icon: QrCode },
    { to: "/containers/labels",  key: "qr_labels",  feature: "page:stock", icon: QrCode },
    { to: "/drm",                key: "drm",        feature: "page:drm",   icon: FileText },
  ]},
  { key: "section_finance", entries: [
    { to: "/paiements",     key: "payments",       feature: "page:paiements",     icon: Banknote },
    { to: "/rapprochement", key: "reconciliation", feature: "page:rapprochement", icon: Landmark },
    { to: "/admin/couts",   key: "costs",          feature: "product:view_cost",  icon: Coins },
  ]},
  { key: "section_pilotage", entries: [
    { to: "/reports",        key: "reports", feature: "page:reports",    icon: BarChart3 },
    { to: "/monthly-review", key: "monthly", feature: "page:reports",    icon: Trophy },
    { to: "/smart-goals",    key: "smart",   feature: "page:dashboard",  icon: Sparkles },
    { to: "/agents",         key: "agents",  feature: "page:users",      icon: UserCog },
  ]},
  { key: "section_growth", entries: [
    { to: "/prospection",     key: "prospecting", feature: "page:prospection",     icon: Compass },
    { to: "/radar",           key: "radar",       feature: "page:radar",           icon: Radio },
    { to: "/bouclier",        key: "bouclier",    feature: "page:bouclier",        icon: Shield },
    { to: "/veille",          key: "veille",      feature: "page:veille",          icon: AlertOctagon },
    { to: "/sources-donnees", key: "sources",     feature: "page:sources-donnees", icon: Database },
  ]},
  { key: "section_admin", entries: [
    { to: "/admin/users",       key: "users",        feature: "page:users",         icon: Users },
    { to: "/admin/permissions", key: "permissions",  feature: "page:users",         icon: ShieldCheck },
    { to: "/connectors",        key: "connectors",   feature: "page:integrations",  icon: Plug },
    { to: "/org/settings",      key: "org_settings", feature: "manager_only",       icon: SettingsIcon },
    { to: "/settings",          key: "settings",     feature: "page:settings",      icon: SettingsIcon },
    { to: "/confidentialite",   key: "privacy",      feature: "page:privacy",       icon: ShieldCheck },
    { to: "/billing",           key: "billing",      feature: "manager_only",       icon: Coins },
  ]},
];

// Catalogue plat clé → entrée. Sert à retrouver une entrée depuis une clé user.
// N'inclut PAS les 3 fixes de la zone Aujourd'hui : elles ne sont pas épingables
// par l'utilisateur (déjà présentes en permanence).
const FLAT_ENTRIES = {};
for (const s of SECTIONS) for (const e of s.entries) FLAT_ENTRIES[e.key] = { ...e, sectionKey: s.key };
// Home est référençable pour épinglage aussi
FLAT_ENTRIES[HOME_ENTRY.key] = { ...HOME_ENTRY, sectionKey: null };

// Clés fixes de la zone Aujourd'hui — jamais épingables (déjà là).
const FIXED_PIN_KEYS = new Set(PINNED_FIXED.map(p => p.key));

// Barre de tabs mobile — INDÉPENDANTE de la sidebar desktop, 5 entrées littérales.
const MOBILE_NAV = [
  { to: "/tournee", key: "tournee", label: "Ma tournée", icon: RouteIcon },
  { to: "/visit", key: "visit", label: "Visite", icon: ClipboardCheck },
  { to: "/scan", key: "scan", label: "Scanner", icon: QrCode },
  { to: "/clients", key: "clients", label: "Clients", icon: Users },
  { to: "/", key: "dashboard", label: "Tableau", icon: LayoutDashboard },
];

const OPEN_KEY = "bevid_nav_open_sections_v2";
const PREFS_CACHE_KEY = "bevid_sidebar_prefs_v1";  // cache local des prefs backend

function defaultOpenByRole(role) {
  if (role === "manager" || role === "gerant" || role === "owner") return ["section_pilotage"];
  return ["section_sales"];
}

function loadOpenSections(role) {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (!raw) return defaultOpenByRole(role);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : defaultOpenByRole(role);
  } catch { return defaultOpenByRole(role); }
}

function loadCachedPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_CACHE_KEY);
    if (!raw) return { pinned_user: [], section_order: {} };
    const p = JSON.parse(raw);
    return {
      pinned_user: Array.isArray(p.pinned_user) ? p.pinned_user : [],
      section_order: (p.section_order && typeof p.section_order === "object") ? p.section_order : {},
    };
  } catch { return { pinned_user: [], section_order: {} }; }
}

// Applique l'ordre utilisateur à une section : les clés listées d'abord dans leur
// ordre, puis les nouvelles entrées non listées en queue (nouvelles routes ajoutées
// après que l'utilisateur a personnalisé — on ne les perd jamais).
function applySectionOrder(entries, userOrder) {
  if (!Array.isArray(userOrder) || userOrder.length === 0) return entries;
  const byKey = new Map(entries.map(e => [e.key, e]));
  const orderedKeys = [];
  const seen = new Set();
  for (const k of userOrder) {
    if (byKey.has(k) && !seen.has(k)) { orderedKeys.push(k); seen.add(k); }
  }
  for (const e of entries) {
    if (!seen.has(e.key)) { orderedKeys.push(e.key); seen.add(e.key); }
  }
  return orderedKeys.map(k => byKey.get(k));
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { t, lang, setLanguage, languages } = useI18n();
  const { has, loading: permsLoading } = usePerms();
  const loc = useLocation();
  const nav_ = useNavigate();
  const role = user?.role || "commercial";

  const [openSections, setOpenSections] = useState(() => loadOpenSections(role));
  const [stopsToday, setStopsToday] = useState(null);
  const [prefs, setPrefs] = useState(loadCachedPrefs);  // {pinned_user, section_order}
  const [dragCtx, setDragCtx] = useState(null);  // {sectionKey, fromKey}
  const [dragOver, setDragOver] = useState(null); // {sectionKey, overKey}
  const saveTimer = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(openSections)); } catch {}
  }, [openSections]);

  // Compteur d'arrêts du jour — approximation initiale = taille du portefeuille.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/establishments");
        if (!cancelled) setStopsToday(Array.isArray(data) ? data.length : null);
      } catch { /* silencieux */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Charge les prefs backend au boot (silencieux si erreur → on garde le cache).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/me/sidebar-prefs");
        if (cancelled) return;
        const next = {
          pinned_user: Array.isArray(data?.pinned_user) ? data.pinned_user : [],
          section_order: (data?.section_order && typeof data.section_order === "object") ? data.section_order : {},
        };
        setPrefs(next);
        try { localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(next)); } catch {}
      } catch { /* offline ou 401 : on garde le cache */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Sauvegarde débouncée (400ms) — backend + cache local.
  const savePrefs = useCallback((next) => {
    try { localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(next)); } catch {}
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.put("/me/sidebar-prefs", next).catch(() => { /* offline : cache déjà à jour */ });
    }, 400);
  }, []);

  const toggleSection = (key) => {
    setOpenSections((prev) => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  // Règle métier PO : un manager/gérant/owner voit toujours l'ensemble du menu.
  const isEntryVisible = (entry) => {
    if (!entry || entry.feature === undefined) return false;
    if (entry.feature === null) return true;
    const isPrivileged = role === "manager" || role === "gerant" || role === "owner";
    if (entry.feature === "manager_only") return isPrivileged;
    if (isPrivileged) return true;
    if (permsLoading) return false;
    return has(entry.feature);
  };

  // Zone Aujourd'hui = 3 fixes + jusqu'à 3 épingles user, dans l'ordre où elles ont été épinglées.
  const visiblePinned = useMemo(() => {
    const list = [];
    for (const p of PINNED_FIXED) if (isEntryVisible(p)) list.push({ ...p, _fixed: true });
    for (const k of (prefs.pinned_user || [])) {
      if (FIXED_PIN_KEYS.has(k)) continue; // sécurité : jamais dupliquer une fixe
      const e = FLAT_ENTRIES[k];
      if (e && isEntryVisible(e)) list.push({ ...e, _fixed: false });
      if (list.length - PINNED_FIXED.length >= 3) break;
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.pinned_user, has, permsLoading, role]);

  const visibleSections = useMemo(() => {
    return SECTIONS.map(s => {
      const userOrder = prefs.section_order?.[s.key];
      const ordered = applySectionOrder(s.entries, userOrder);
      return { ...s, entries: ordered.filter(isEntryVisible) };
    }).filter(s => s.entries.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.section_order, has, permsLoading, role]);

  const homeVisible = isEntryVisible(HOME_ENTRY);

  // Ouvre auto la section contenant la route active.
  useEffect(() => {
    for (const section of visibleSections) {
      if (section.entries.some(e => loc.pathname === e.to || (e.to !== "/" && loc.pathname.startsWith(e.to)))) {
        setOpenSections(prev => prev.includes(section.key) ? prev : [...prev, section.key]);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname]);

  const paletteItems = useMemo(() => {
    const items = [];
    if (homeVisible) items.push({ to: HOME_ENTRY.to, key: HOME_ENTRY.key, label: t(HOME_ENTRY.key), section: t("dashboard") });
    for (const e of visiblePinned) items.push({ to: e.to, key: e.key, label: t(e.key), section: t("section_today") });
    for (const s of visibleSections) for (const e of s.entries) {
      items.push({ to: e.to, key: e.key, label: t(e.key), section: t(s.key) });
    }
    return items;
  }, [visibleSections, visiblePinned, homeVisible, t]);

  const isActive = (to) => loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));

  // ---------- Actions de personnalisation ----------
  const isPinned = (k) => (prefs.pinned_user || []).includes(k);
  const userPinCount = (prefs.pinned_user || []).length;

  const pinToToday = (k) => {
    if (FIXED_PIN_KEYS.has(k)) return;   // les 3 fixes sont déjà là
    if (isPinned(k)) return;
    if (userPinCount >= 3) return;       // toast informatif géré par le menu (item disabled)
    const next = { ...prefs, pinned_user: [...(prefs.pinned_user || []), k] };
    setPrefs(next); savePrefs(next);
  };

  const unpinFromToday = (k) => {
    const next = { ...prefs, pinned_user: (prefs.pinned_user || []).filter(x => x !== k) };
    setPrefs(next); savePrefs(next);
  };

  const resetSection = (sectionKey) => {
    const nextOrder = { ...(prefs.section_order || {}) };
    delete nextOrder[sectionKey];
    const next = { ...prefs, section_order: nextOrder };
    setPrefs(next); savePrefs(next);
  };

  // Drop d'une entrée déplacée vers `overKey` (ou en fin si overKey === null).
  const applyDrop = (sectionKey, fromKey, overKey) => {
    const section = SECTIONS.find(s => s.key === sectionKey);
    if (!section) return;
    // On récupère l'ordre actuel visible pour cette section (RBAC-filtré),
    // mais on persiste l'ordre COMPLET (y compris entrées non visibles) pour
    // garder la position stable si les perms changent plus tard.
    const currentUser = prefs.section_order?.[sectionKey];
    const baseKeys = applySectionOrder(section.entries, currentUser).map(e => e.key);
    if (!baseKeys.includes(fromKey)) return;
    const withoutFrom = baseKeys.filter(k => k !== fromKey);
    let insertAt = withoutFrom.length;
    if (overKey && withoutFrom.includes(overKey)) {
      insertAt = withoutFrom.indexOf(overKey);
    }
    withoutFrom.splice(insertAt, 0, fromKey);
    const next = {
      ...prefs,
      section_order: { ...(prefs.section_order || {}), [sectionKey]: withoutFrom },
    };
    setPrefs(next); savePrefs(next);
  };

  // ---------- NavEntry (avec ContextMenu et Drag&Drop dans les sections) ----------
  const NavEntry = ({ to, k, Icon, badge, sectionKey = null, inTodayFixed = false, inTodayUser = false }) => {
    const active = isActive(to);
    const pinned = isPinned(k);
    const draggable = !!sectionKey;   // uniquement dans les sections repliables
    const dragging = dragCtx?.fromKey === k && dragCtx?.sectionKey === sectionKey;
    const isDragOver = dragOver?.sectionKey === sectionKey && dragOver?.overKey === k;

    const link = (
      <Link
        to={to}
        data-testid={`nav-${k}`}
        aria-current={active ? "page" : undefined}
        draggable={draggable}
        onDragStart={draggable ? (e) => {
          setDragCtx({ sectionKey, fromKey: k });
          try { e.dataTransfer.setData("text/plain", `${sectionKey}::${k}`); } catch {}
          e.dataTransfer.effectAllowed = "move";
        } : undefined}
        onDragEnd={draggable ? () => { setDragCtx(null); setDragOver(null); } : undefined}
        onDragOver={draggable ? (e) => {
          if (!dragCtx || dragCtx.sectionKey !== sectionKey) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dragOver?.overKey !== k) setDragOver({ sectionKey, overKey: k });
        } : undefined}
        onDrop={draggable ? (e) => {
          if (!dragCtx || dragCtx.sectionKey !== sectionKey) return;
          e.preventDefault();
          applyDrop(sectionKey, dragCtx.fromKey, k);
          setDragCtx(null); setDragOver(null);
        } : undefined}
        className={[
          "group flex items-center gap-2 px-3 py-2 min-h-[40px] rounded-lg text-sm transition-colors duration-200",
          active ? "bg-[#4A154B] dark:bg-[#B076B4] text-white dark:text-stone-900"
                 : "text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800",
          dragging ? "opacity-50" : "",
          isDragOver ? "ring-2 ring-[#B076B4] ring-inset" : "",
        ].join(" ")}
      >
        {draggable && (
          <GripVertical
            size={12}
            aria-hidden="true"
            className={`shrink-0 opacity-0 group-hover:opacity-40 transition-opacity cursor-grab ${active ? "text-white/70" : "text-stone-400"}`}
          />
        )}
        <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
        <span className="flex-1 truncate">{t(k)}</span>
        {inTodayUser && !active && (
          <Pin size={11} aria-hidden="true" className="text-stone-400 shrink-0" />
        )}
        {badge != null && badge > 0 && (
          <span
            className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded-full ${active ? "bg-white/20 text-white" : "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200"}`}
            aria-label={`${badge} arrêts aujourd'hui`}
            data-testid={`nav-badge-${k}`}
          >
            {badge}
          </span>
        )}
      </Link>
    );

    // Les 3 fixes de "Aujourd'hui" (Ma tournée / Visite / Scanner) n'ont pas de
    // menu contextuel : elles sont immuables.
    if (inTodayFixed) return link;

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{link}</ContextMenuTrigger>
        <ContextMenuContent className="min-w-[220px]" data-testid={`nav-ctxmenu-${k}`}>
          {inTodayUser ? (
            <ContextMenuItem
              onSelect={() => unpinFromToday(k)}
              data-testid={`nav-ctx-unpin-${k}`}
            >
              <PinOff size={14} className="mr-2" /> {t("unpin_from_today")}
            </ContextMenuItem>
          ) : (
            <ContextMenuItem
              disabled={pinned || userPinCount >= 3}
              onSelect={() => pinToToday(k)}
              data-testid={`nav-ctx-pin-${k}`}
            >
              <Pin size={14} className="mr-2" />
              {t("pin_to_today")}
              {userPinCount >= 3 && !pinned && (
                <span className="ml-auto text-[10px] text-stone-400">{t("max_pins_reached")}</span>
              )}
            </ContextMenuItem>
          )}
          {sectionKey && prefs.section_order?.[sectionKey]?.length > 0 && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => resetSection(sectionKey)}
                data-testid={`nav-ctx-reset-${sectionKey}`}
              >
                <RotateCcw size={14} className="mr-2" /> {t("reset_section")}
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside
        className="hidden md:flex md:flex-col w-64 border-r border-stone-200 dark:border-stone-700 bg-white/60 dark:bg-stone-900/60 backdrop-blur-md"
        data-testid="sidebar"
      >
        {/* Header : logo + statut synchro */}
        <div className="p-6 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#4A154B] dark:text-[#B076B4]">
            <BevidLogo size={28} />
            <div>
              <h1 className="font-display text-2xl leading-none">BEVID</h1>
              <p className="overline mt-1">CRM Boisson · Pro</p>
            </div>
          </div>
          <SyncIndicator />
        </div>

        {/* Palette Cmd+K */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("bevid:open-palette"))}
          data-testid="palette-trigger"
          className="mx-3 mt-3 flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          aria-label="Ouvrir la palette de commandes"
        >
          <Search size={14} aria-hidden="true" />
          <span className="flex-1 text-left">Rechercher…</span>
          <kbd className="text-[10px] px-1.5 py-0.5 border border-stone-300 dark:border-stone-600 rounded font-mono">⌘K</kbd>
        </button>

        <nav className="flex-1 p-3 space-y-2 overflow-y-auto mt-2" aria-label={t("navigation") || "Navigation"}>
          {/* Entrée fixe : Tableau de bord */}
          {homeVisible && (
            <div className="pb-2 mb-2 border-b border-stone-200/60 dark:border-stone-700/50" data-testid="nav-home-fixed">
              <NavEntry to={HOME_ENTRY.to} k={HOME_ENTRY.key} Icon={HOME_ENTRY.icon} />
            </div>
          )}

          {/* Zone épinglée — 3 fixes + jusqu'à 3 user */}
          {visiblePinned.length > 0 && (
            <div data-testid="nav-pinned" className="pb-2 mb-2 border-b border-stone-200/60 dark:border-stone-700/50">
              <div className="flex items-center gap-1 px-2 py-1.5 text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
                <Pin size={10} aria-hidden="true" />
                <span>{t("section_today")}</span>
                {userPinCount > 0 && (
                  <span className="ml-auto tabular-nums normal-case text-[10px] text-stone-400" aria-label="épingles utilisateur">
                    {userPinCount}/3
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {visiblePinned.map((e) => (
                  <NavEntry
                    key={e.to}
                    to={e.to}
                    k={e.key}
                    Icon={e.icon}
                    badge={e.badgeKey === "stops_today" ? stopsToday : undefined}
                    inTodayFixed={e._fixed}
                    inTodayUser={!e._fixed}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sections repliables */}
          {visibleSections.map(section => {
            const isOpen = openSections.includes(section.key);
            return (
              <div key={section.key} data-testid={`nav-section-${section.key}`}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
                  aria-expanded={isOpen}
                  aria-controls={`section-body-${section.key}`}
                  data-testid={`nav-section-toggle-${section.key}`}
                >
                  <span>{t(section.key)}</span>
                  <ChevronDown size={12} aria-hidden="true" style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
                </button>
                {isOpen && (
                  <div
                    id={`section-body-${section.key}`}
                    className="mt-1 space-y-0.5"
                    // Permet de dropper à la fin d'une section vide de cible.
                    onDragOver={(e) => {
                      if (dragCtx?.sectionKey === section.key) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }
                    }}
                    onDrop={(e) => {
                      if (dragCtx?.sectionKey === section.key) {
                        e.preventDefault();
                        // drop hors d'une entrée précise → en queue
                        applyDrop(section.key, dragCtx.fromKey, null);
                        setDragCtx(null); setDragOver(null);
                      }
                    }}
                  >
                    {section.entries.map(({ to, key, icon }) => (
                      <NavEntry key={to} to={to} k={key} Icon={icon} sectionKey={section.key} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Astuce discrète — visible seulement si l'utilisateur n'a rien personnalisé */}
          {userPinCount === 0 && Object.keys(prefs.section_order || {}).length === 0 && (
            <div className="mt-3 px-2 text-[10px] text-stone-400 dark:text-stone-500 leading-snug" data-testid="nav-customize-hint">
              {t("customize_hint")}
            </div>
          )}
        </nav>

        {/* Zone d'identité en bas */}
        <div className="p-3 border-t border-stone-200 dark:border-stone-700 space-y-2">
          <Link
            to="/profile"
            data-testid="nav-profile-identity"
            className={`flex items-center gap-3 px-2 py-2 min-h-[52px] rounded-lg text-sm transition-colors ${isActive("/profile") ? "bg-[#4A154B]/10 dark:bg-[#B076B4]/20" : "hover:bg-stone-100 dark:hover:bg-stone-800"}`}
          >
            <div className="w-9 h-9 rounded-full bg-[#4A154B] dark:bg-[#B076B4] text-white dark:text-stone-900 flex items-center justify-center font-medium text-sm shrink-0" aria-hidden="true">
              {(user?.name || user?.email || "?")[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-stone-800 dark:text-stone-100 truncate">{user?.name || user?.email}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {user?.org_name && <span className="text-[11px] text-stone-500 truncate">{user.org_name}</span>}
                <PuceEtat etat="info" variante="douce" libelle={role} />
              </div>
            </div>
            <NotificationBell />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle variant="sidebar" />
          </div>
          <select
            value={lang}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full text-sm border border-stone-300 dark:border-stone-600 rounded-lg px-2 py-1.5 min-h-[36px] bg-white dark:bg-stone-800 dark:text-stone-200"
            data-testid="lang-select"
            aria-label={t("language")}
          >
            {languages.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
          </select>
          <button
            onClick={logout}
            data-testid="logout-btn"
            className="btn-ghost w-full flex items-center gap-2 text-sm justify-center min-h-[40px]"
          >
            <LogOut size={16} aria-hidden="true" /> {t("logout")}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 glass border-b border-stone-200 dark:border-stone-700 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 text-[#4A154B] dark:text-[#B076B4]">
          <BevidLogo size={22} />
          <h1 className="font-display text-xl">BEVID</h1>
          <SyncIndicator />
        </div>
        <div className="flex gap-1 items-center">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("bevid:open-palette"))}
            data-testid="palette-trigger-mobile"
            aria-label="Rechercher"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-700 dark:text-stone-300"
          >
            <Search size={18} aria-hidden="true" />
          </button>
          <ThemeToggle variant="icon" />
          <NotificationBell />
          <select
            value={lang}
            onChange={(e) => setLanguage(e.target.value)}
            className="text-xs font-medium px-2 py-1 border rounded min-h-[36px] bg-white dark:bg-stone-800 dark:text-stone-200 dark:border-stone-600"
            data-testid="lang-select-mobile"
            aria-label={t("language")}
          >
            {languages.map(l => <option key={l.code} value={l.code}>{l.flag}</option>)}
          </select>
          <button onClick={logout} data-testid="logout-mobile" aria-label={t("logout")} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-700 dark:text-stone-300"><LogOut size={18} /></button>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 md:ml-0 pt-16 md:pt-0 pb-20 md:pb-0 overflow-x-hidden">
        <BillingBanner />
        <OfflineBanner />
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-700 flex justify-around py-2 pb-safe"
        data-testid="mobile-bottom-nav"
        aria-label="Navigation rapide"
      >
        {MOBILE_NAV.map(({ to, key, label, icon: Icon }) => {
          const active = isActive(to);
          return (
            <button
              key={to} onClick={() => nav_(to)} data-testid={`nav-mobile-${key}`}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 min-w-[48px] min-h-[48px] ${active ? "text-[#4A154B] dark:text-[#B076B4]" : "text-stone-500 dark:text-stone-400"}`}
            >
              <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}
      </nav>

      <CommandPalette items={paletteItems} />
      <VoiceFAB />
      <OnboardingTour />
    </div>
  );
}
