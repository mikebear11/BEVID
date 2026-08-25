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
  User as UserIcon, RotateCcw, GripVertical, PanelLeftClose, PanelLeftOpen, Lock,
  Smartphone, Wallet, Rocket, Building2,
} from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import PushHistoryBell from "@/components/PushHistoryBell";
import InboxDropdown from "@/components/InboxDropdown";
import ThemeToggle from "@/components/ThemeToggle"; // conservé pour la topbar mobile
import PuceEtat from "@/components/system/PuceEtat";
import OfflineBanner from "@/components/OfflineBanner";
import CommandPalette from "@/components/CommandPalette";
import BillingBanner from "@/components/BillingBanner";
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Sun, Moon, Sunrise, Monitor, MoreHorizontal, Languages } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * Sidebar intelligente (Lot 8 + suite) :
 *   - Zone Aujourd'hui : 3 fixes + jusqu'à 3 épingles utilisateur (clic droit).
 *   - 6 sections repliables réordonnables par drag & drop dans chaque section.
 *   - Compteurs métier discrets sur Paiements / Contenants / Commandes.
 *   - Grisage forfait : entrées verrouillées par plan → grisées + pastille Pro/Entreprise
 *     pour les managers ; cachées pour les commerciaux.
 *   - Mode rail réduit (icônes seules + tooltips), préférence mémorisée.
 *   - Personnalisation par utilisateur sauvegardée via /api/me/sidebar-prefs.
 */

// ---------- Configuration statique ----------
const PINNED_FIXED = [
  { to: "/tournee", key: "tournee", feature: "page:tours", icon: RouteIcon, badgeKey: "stops_today" },
  { to: "/visit",   key: "new_visit", feature: "page:visits", icon: ClipboardCheck },
  { to: "/scan",    key: "scan",  feature: null, icon: QrCode },  // outil terrain universel
];

const HOME_ENTRY = { to: "/", key: "dashboard", feature: "page:dashboard", icon: LayoutDashboard };

const CORE_KEYS = new Set([
  // Fixed pins (always visible)
  "tournee", "new_visit", "scan",
  // Home
  "dashboard",
  // Core operations (visible for a new manager account)
  "clients", "orders", "products", "stock",
]);

// Entrées considérées « avancées » — masquées par défaut sur un nouveau compte.
// Débloquées :
//   1) automatiquement sur usage (facture encaissée, mouvement stock, concurrent) — voir `_unlock_org_feature` backend
//   2) via la palette ⌘K (qui trouve toujours tout)
//   3) via le toggle « Afficher les fonctions avancées » dans Réglages
const isAdvancedEntry = (k) => !CORE_KEYS.has(k);

const SECTIONS = [
  { key: "section_sales", icon: Wallet, entries: [
    { to: "/clients",  key: "clients",  feature: "page:clients", icon: Users },
    { to: "/orders",   key: "orders",   feature: "page:orders",  icon: ShoppingCart },
    { to: "/products", key: "products", feature: "page:products", icon: Wine },
    { to: "/pipeline", key: "pipeline", feature: "manager_only", icon: Columns },
    { to: "/deals",    key: "deals",    feature: "manager_only", icon: Target },
  ]},
  { key: "section_logistics", icon: Truck, entries: [
    { to: "/tours",              key: "tours",      feature: "page:tours", icon: RouteIcon },
    { to: "/livreur",            key: "livreur",    feature: null,          icon: Truck },
    { to: "/stock",              key: "stock",      feature: "page:stock", icon: Warehouse },
    { to: "/containers",         key: "containers", feature: "page:stock", icon: QrCode },
    { to: "/containers/labels",  key: "qr_labels",  feature: "page:stock", icon: QrCode },
    { to: "/drm",                key: "drm",        feature: "page:drm",   icon: FileText },
  ]},
  { key: "section_finance", icon: Banknote, entries: [
    { to: "/paiements",     key: "payments",       feature: "page:paiements",     icon: Banknote },
    { to: "/rapprochement", key: "reconciliation", feature: "page:rapprochement", icon: Landmark },
    { to: "/admin/couts",   key: "costs",          feature: "product:view_cost",  icon: Coins },
  ]},
  { key: "section_documents", icon: FileText, entries: [
    { to: "/documents",  key: "documents",  feature: null, icon: FileText },
    { to: "/pack-legal", key: "pack_legal", feature: "manager_only", icon: ShieldCheck },
  ]},
  { key: "section_pilotage", icon: BarChart3, entries: [
    { to: "/reports",        key: "reports", feature: "page:reports",    icon: BarChart3 },
    { to: "/monthly-review", key: "monthly", feature: "page:reports",    icon: Trophy },
    { to: "/smart-goals",    key: "smart",   feature: "page:dashboard",  icon: Sparkles },
    { to: "/agents",         key: "agents",  feature: "page:users",      icon: UserCog },
  ]},
  { key: "section_growth", icon: Rocket, entries: [
    { to: "/prospection",     key: "prospecting", feature: "page:prospection",     icon: Compass },
    { to: "/radar",           key: "radar",       feature: "page:radar",           icon: Radio },
    { to: "/bouclier",        key: "bouclier",    feature: "page:bouclier",        icon: Shield },
    { to: "/veille",          key: "veille",      feature: "page:veille",          icon: AlertOctagon },
    { to: "/sources-donnees", key: "sources",     feature: "page:sources-donnees", icon: Database },
  ]},
  { key: "section_admin", icon: Building2, entries: [
    { to: "/admin/users",       key: "users",        feature: "page:users",         icon: Users },
    { to: "/portefeuilles",     key: "portfolios",   feature: "manager_only",       icon: Users },
    { to: "/approvals",         key: "approvals",    feature: null,                 icon: ClipboardCheck },
    { to: "/pwa-status",        key: "pwa_status",   feature: null,                 icon: Smartphone },
    { to: "/admin/permissions", key: "permissions",  feature: "page:users",         icon: ShieldCheck },
    { to: "/connectors",        key: "connectors",   feature: "page:integrations",  icon: Plug },
    { to: "/org/settings",      key: "org_settings", feature: "manager_only",       icon: SettingsIcon },
    { to: "/settings",          key: "settings",     feature: "page:settings",      icon: SettingsIcon },
    { to: "/confidentialite",   key: "privacy",      feature: "page:privacy",       icon: ShieldCheck },
    { to: "/billing",           key: "billing",      feature: "manager_only",       icon: Coins },
  ]},
];

// Mapping feature → plan minimum requis. Aligné sur /app/backend/billing_config.py.
// Le frontend le duplique pour permettre le grisage sans round-trip serveur.
const FEATURE_MIN_PLAN = {
  "page:dashboard": "terrain", "page:clients": "terrain", "page:orders": "terrain",
  "page:products": "terrain", "page:tours": "terrain", "page:visits": "terrain",
  "page:stock": "pro", "page:drm": "pro", "page:reports": "pro",
  "page:paiements": "pro", "page:rapprochement": "pro",
  "page:prospection": "entreprise", "page:radar": "entreprise", "page:veille": "entreprise",
  "page:bouclier": "entreprise", "page:sources-donnees": "entreprise",
  "page:users": "entreprise", "page:integrations": "entreprise",
  "product:view_cost": "entreprise",
};
const PLAN_LABEL_KEY = { pro: "plan_pro", entreprise: "plan_entreprise" };

// Compteurs métier — mapping clé sidebar → clé API counters.
const COUNTER_MAP = {
  payments:   "payments_overdue",
  containers: "containers_out",
  orders:     "orders_pending_signature",
};
const COUNTER_ARIA = {
  payments:   "counter_overdue",
  containers: "counter_containers_out",
  orders:     "counter_pending_signature",
};

// Catalogue plat clé → entrée. Sert à retrouver une entrée depuis une clé user.
const FLAT_ENTRIES = {};
for (const s of SECTIONS) for (const e of s.entries) FLAT_ENTRIES[e.key] = { ...e, sectionKey: s.key };
FLAT_ENTRIES[HOME_ENTRY.key] = { ...HOME_ENTRY, sectionKey: null };

const FIXED_PIN_KEYS = new Set(PINNED_FIXED.map(p => p.key));

const MOBILE_NAV = [
  { to: "/tournee", key: "tournee", label: "Ma tournée", icon: RouteIcon },
  { to: "/visit", key: "visit", label: "Visite", icon: ClipboardCheck },
  { to: "/scan", key: "scan", label: "Scanner", icon: QrCode },
  { to: "/clients", key: "clients", label: "Clients", icon: Users },
  { to: "/", key: "dashboard", label: "Tableau", icon: LayoutDashboard },
];

const OPEN_KEY = "bevid_nav_open_sections_v2";
const PREFS_CACHE_KEY = "bevid_sidebar_prefs_v1";
const COLLAPSED_KEY = "bevid_sidebar_collapsed_v1";

// Menu déroulant regroupant Thème + Langue + Déconnexion pour libérer 3 lignes
// dans le pied de sidebar et rallonger la zone de navigation.
function SidebarUserMenu({ theme, setTheme, resolvedTheme, lang, setLanguage, languages, onLogout, t, collapsed = false }) {
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
        <DropdownMenuLabel className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-stone-500">
          <currentTheme.Icon size={12} aria-hidden="true" />
          {t("theme") || "Thème"} · <span className="normal-case tracking-normal text-stone-700 dark:text-stone-300">{currentTheme.l}</span>
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {themeItems.map(({ v, l, Icon }) => (
            <DropdownMenuRadioItem
              key={v}
              value={v}
              data-testid={`sidebar-theme-${v}`}
              className="cursor-pointer"
            >
              <Icon size={14} className="mr-2 opacity-70" aria-hidden="true" />
              <span className="flex-1">{l}</span>
              {theme === "system" && v === "system" && (
                <span className="text-[10px] text-stone-400 ml-2">{resolvedTheme}</span>
              )}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-stone-500">
          <Languages size={12} aria-hidden="true" />
          {t("language") || "Langue"}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={lang} onValueChange={setLanguage}>
          {languages.map(l => (
            <DropdownMenuRadioItem
              key={l.code}
              value={l.code}
              data-testid={`sidebar-lang-${l.code}`}
              className="cursor-pointer"
            >
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

function defaultOpenByRole(role) {  if (role === "manager" || role === "gerant" || role === "owner") return ["section_pilotage"];
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
    if (!raw) return { pinned_user: [], section_order: {}, theme: "sobre", show_advanced: false, visited_features: [] };
    const p = JSON.parse(raw);
    return {
      pinned_user: Array.isArray(p.pinned_user) ? p.pinned_user : [],
      section_order: (p.section_order && typeof p.section_order === "object") ? p.section_order : {},
      theme: typeof p.theme === "string" ? p.theme : "sobre",
      show_advanced: !!p.show_advanced,
      visited_features: Array.isArray(p.visited_features) ? p.visited_features : [],
    };
  } catch { return { pinned_user: [], section_order: {}, theme: "sobre", show_advanced: false, visited_features: [] }; }
}

function loadCollapsed() {
  try { return localStorage.getItem(COLLAPSED_KEY) === "1"; } catch { return false; }
}

// 3 looks visuels de la sidebar. `sobre` = défaut, palette actuelle.
// `vibrant` = accent aubergine plein sur sections actives + gradient discret.
// `contrast` = fond quasi-noir + texte blanc, cible malvoyance / plein soleil.
const SIDEBAR_THEME_CLASSES = {
  sobre:    "bg-stone-100/95 dark:bg-stone-950/80 backdrop-blur-md",
  vibrant:  "bg-gradient-to-b from-[#F0EAF0] via-white to-[#F0EAF0] dark:from-[#2A0F2C] dark:via-stone-950 dark:to-[#2A0F2C]",
  contrast: "bg-stone-950 text-stone-50 dark:bg-black",
};
const VALID_SIDEBAR_THEMES = new Set(Object.keys(SIDEBAR_THEME_CLASSES));

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

// Retourne null si la feature est incluse dans le plan courant, sinon le plan
// minimum requis ("pro" ou "entreprise"). Utilisé pour le grisage forfait.
function computePlanLock(feature, planFeatures) {
  if (!feature || feature === "manager_only") return null;
  if (!planFeatures || !Array.isArray(planFeatures)) return null; // pas d'info → ne pas verrouiller
  if (planFeatures.includes(feature)) return null;
  return FEATURE_MIN_PLAN[feature] || null; // feature inconnue au mapping → laisse passer
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { t, lang, setLanguage, languages } = useI18n();
  const { has, loading: permsLoading } = usePerms();
  const { theme, resolved: resolvedTheme, setTheme } = useTheme();
  const loc = useLocation();
  const nav_ = useNavigate();
  const role = user?.role || "commercial";
  const planFeatures = Array.isArray(user?.org_plan_features) ? user.org_plan_features : null;

  const [openSections, setOpenSections] = useState(() => loadOpenSections(role));
  const [stopsToday, setStopsToday] = useState(null);
  const [prefs, setPrefs] = useState(loadCachedPrefs);
  const sidebarTheme = VALID_SIDEBAR_THEMES.has(prefs.theme) ? prefs.theme : "sobre";
  const showAdvanced = !!prefs.show_advanced;
  const visitedFeatures = useMemo(() => new Set(prefs.visited_features || []), [prefs.visited_features]);
  // Une entrée avancée est visible si : mode avancé activé, feature déjà visitée,
  // ou pin utilisateur explicite.
  const isEntryVisible = (entryKey) => {
    if (!isAdvancedEntry(entryKey)) return true;
    if (showAdvanced) return true;
    if (visitedFeatures.has(entryKey)) return true;
    if ((prefs.pinned_user || []).includes(entryKey)) return true;
    return false;
  };
  const [dragCtx, setDragCtx] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [counters, setCounters] = useState(null);  // {payments_overdue, containers_out, orders_pending_signature}
  const saveTimer = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(openSections)); } catch {}
  }, [openSections]);

  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0"); } catch {}
  }, [collapsed]);

  // Compteur d'arrêts du jour — via tournées du jour non terminées.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/tours");
        if (cancelled || !Array.isArray(data)) return;
        const today = new Date().toISOString().slice(0, 10);
        const stops = data
          .filter(t => t.date === today && t.status !== "terminee")
          .reduce((acc, t) => acc + ((t.client_ids || []).length), 0);
        setStopsToday(stops > 0 ? stops : null);
      } catch { /* silencieux */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Compteurs métier — refresh au boot + à chaque changement de route (léger).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/sidebar/counters");
        if (!cancelled) setCounters(data);
      } catch { /* silencieux */ }
    })();
    return () => { cancelled = true; };
  }, [loc.pathname]);

  // Prefs personnalisation — backend au boot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/me/sidebar-prefs");
        if (cancelled) return;
        const next = {
          pinned_user: Array.isArray(data?.pinned_user) ? data.pinned_user : [],
          section_order: (data?.section_order && typeof data.section_order === "object") ? data.section_order : {},
          theme: typeof data?.theme === "string" ? data.theme : "sobre",
          show_advanced: !!data?.show_advanced,
          visited_features: Array.isArray(data?.visited_features) ? data.visited_features : [],
        };
        setPrefs(next);
        try { localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(next)); } catch {}
      } catch { /* offline ou 401 : garde le cache */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const savePrefs = useCallback((next) => {
    try { localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(next)); } catch {}
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.put("/me/sidebar-prefs", next).catch(() => {});
    }, 400);
  }, []);

  const toggleSection = (key) => {
    setOpenSections((prev) => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const toggleCollapsed = () => setCollapsed(v => !v);

  const isPrivileged = role === "manager" || role === "gerant" || role === "owner";

  // Retourne { visible, lockedPlan }. visible=true → on affiche l'entrée.
  // lockedPlan ≠ null → grisée + pastille Pro/Entreprise (managers only).
  const evalEntry = (entry) => {
    if (!entry || entry.feature === undefined) return { visible: false, lockedPlan: null };
    if (entry.feature === null) return { visible: true, lockedPlan: null };
    if (entry.feature === "manager_only") {
      return { visible: isPrivileged, lockedPlan: null };
    }
    const lockedPlan = computePlanLock(entry.feature, planFeatures);
    if (lockedPlan) {
      // Grisage forfait : commercial → cache ; manager → grisé + pastille.
      return { visible: isPrivileged, lockedPlan };
    }
    // Non verrouillée par plan → suit le RBAC role/perms.
    if (isPrivileged) return { visible: true, lockedPlan: null };
    if (permsLoading) return { visible: false, lockedPlan: null };
    return { visible: has(entry.feature), lockedPlan: null };
  };

  const visiblePinned = useMemo(() => {
    const list = [];
    for (const p of PINNED_FIXED) {
      const e = evalEntry(p);
      if (e.visible) list.push({ ...p, _fixed: true, _locked: e.lockedPlan });
    }
    for (const k of (prefs.pinned_user || [])) {
      if (FIXED_PIN_KEYS.has(k)) continue;
      const meta = FLAT_ENTRIES[k];
      if (!meta) continue;
      const e = evalEntry(meta);
      if (e.visible) list.push({ ...meta, _fixed: false, _locked: e.lockedPlan });
      if (list.length - PINNED_FIXED.length >= 3) break;
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.pinned_user, has, permsLoading, role, planFeatures]);

  const visibleSections = useMemo(() => {
    return SECTIONS.map(s => {
      const userOrder = prefs.section_order?.[s.key];
      const ordered = applySectionOrder(s.entries, userOrder);
      const withEval = ordered.map(e => {
        const ev = evalEntry(e);
        return { ...e, _visible: ev.visible, _locked: ev.lockedPlan };
      })
      .filter(e => e._visible)
      // Filtre « mode débutant » : masque les entrées avancées non débloquées.
      .filter(e => isEntryVisible(e.key));
      return { ...s, entries: withEval };
    }).filter(s => s.entries.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.section_order, prefs.show_advanced, prefs.visited_features, prefs.pinned_user, has, permsLoading, role, planFeatures]);

  const homeEval = evalEntry(HOME_ENTRY);
  const homeVisible = homeEval.visible;

  useEffect(() => {
    for (const section of visibleSections) {
      if (section.entries.some(e => loc.pathname === e.to || (e.to !== "/" && loc.pathname.startsWith(e.to)))) {
        setOpenSections(prev => prev.includes(section.key) ? prev : [...prev, section.key]);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname]);

  // Tracker de visite : quand un user ouvre une page avancée via ⌘K ou une URL
  // directe, on la débloque pour la sidebar. Débounce serveur : 1 appel/route.
  useEffect(() => {
    const path = loc.pathname;
    if (!path || path === "/") return;
    // Cherche l'entrée qui matche l'URL
    let matched = null;
    for (const s of SECTIONS) {
      for (const e of s.entries) {
        if (path === e.to || (e.to !== "/" && path.startsWith(e.to))) {
          matched = e; break;
        }
      }
      if (matched) break;
    }
    if (!matched || !isAdvancedEntry(matched.key)) return;
    if (visitedFeatures.has(matched.key)) return;
    // Optimistic update + PUT en fond
    const nextVisited = Array.from(new Set([...(prefs.visited_features || []), matched.key]));
    const next = { ...prefs, visited_features: nextVisited };
    setPrefs(next); savePrefs(next);
    api.post("/me/visit-feature", { key: matched.key }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname]);

  const paletteItems = useMemo(() => {
    // La palette ⌘K liste TOUTES les pages accessibles (même les avancées masquées).
    const items = [];
    if (homeVisible) items.push({ to: HOME_ENTRY.to, key: HOME_ENTRY.key, label: t(HOME_ENTRY.key), section: t("dashboard") });
    for (const e of visiblePinned) items.push({ to: e.to, key: e.key, label: t(e.key), section: t("section_today") });
    for (const s of SECTIONS) {
      const userOrder = prefs.section_order?.[s.key];
      const ordered = applySectionOrder(s.entries, userOrder);
      for (const e of ordered) {
        const ev = evalEntry(e);
        if (!ev.visible) continue;
        const advanced = isAdvancedEntry(e.key) && !visitedFeatures.has(e.key) && !showAdvanced;
        items.push({
          to: e.to, key: e.key,
          label: advanced ? `${t(e.key)} · avancé` : t(e.key),
          section: t(s.key),
        });
      }
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeVisible, visiblePinned, prefs.section_order, prefs.visited_features, prefs.show_advanced, t]);

  const isActive = (to) => loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));

  const isPinned = (k) => (prefs.pinned_user || []).includes(k);
  const userPinCount = (prefs.pinned_user || []).length;

  const pinToToday = (k) => {
    if (FIXED_PIN_KEYS.has(k) || isPinned(k) || userPinCount >= 3) return;
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

  const applyDrop = (sectionKey, fromKey, overKey) => {
    const section = SECTIONS.find(s => s.key === sectionKey);
    if (!section) return;
    const currentUser = prefs.section_order?.[sectionKey];
    const baseKeys = applySectionOrder(section.entries, currentUser).map(e => e.key);
    if (!baseKeys.includes(fromKey)) return;
    const withoutFrom = baseKeys.filter(k => k !== fromKey);
    let insertAt = withoutFrom.length;
    if (overKey && withoutFrom.includes(overKey)) insertAt = withoutFrom.indexOf(overKey);
    withoutFrom.splice(insertAt, 0, fromKey);
    const next = { ...prefs, section_order: { ...(prefs.section_order || {}), [sectionKey]: withoutFrom } };
    setPrefs(next); savePrefs(next);
  };

  // ---------- NavEntry ----------
  const NavEntry = ({ to, k, Icon, badge, sectionKey = null, inTodayFixed = false, inTodayUser = false, locked = null }) => {
    const active = isActive(to);
    const pinned = isPinned(k);
    const draggable = !!sectionKey && !locked && !collapsed;  // pas de DnD si verrouillé ou collapsed
    const dragging = dragCtx?.fromKey === k && dragCtx?.sectionKey === sectionKey;
    const isDragOver = dragOver?.sectionKey === sectionKey && dragOver?.overKey === k;
    const counterVal = counters?.[COUNTER_MAP[k]];
    const showCounter = !locked && counterVal && counterVal > 0;
    const label = t(k);

    // Verrouillé : clic → /billing (page abonnement), pas la route réelle.
    const target = locked ? "/billing" : to;

    const link = (
      <Link
        to={target}
        data-testid={`nav-${k}`}
        aria-current={active ? "page" : undefined}
        aria-disabled={locked ? "true" : undefined}
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
          <GripVertical
            size={12}
            aria-hidden="true"
            className={`shrink-0 opacity-0 group-hover:opacity-40 transition-opacity cursor-grab ${active ? "text-white/70" : "text-stone-400"}`}
          />
        )}
        <Icon size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
        {!collapsed && <span className="flex-1 truncate">{label}</span>}
        {!collapsed && inTodayUser && !active && (
          <Pin size={11} aria-hidden="true" className="text-stone-400 shrink-0" />
        )}
        {!collapsed && locked && (
          <span
            data-testid={`nav-lock-${k}`}
            className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shrink-0"
            aria-label={`Verrouillé — forfait ${t(PLAN_LABEL_KEY[locked] || "plan_pro")}`}
          >
            {t(PLAN_LABEL_KEY[locked] || "plan_pro")}
          </span>
        )}
        {!collapsed && showCounter && (
          <span
            data-testid={`nav-counter-${k}`}
            className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded-full shrink-0 ${active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"}`}
            aria-label={`${counterVal} ${t(COUNTER_ARIA[k])}`}
          >
            {counterVal > 99 ? "99+" : counterVal}
          </span>
        )}
        {!collapsed && badge != null && badge > 0 && (
          <span
            className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded-full shrink-0 ${active ? "bg-white/20 text-white" : "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200"}`}
            aria-label={`${badge} arrêts aujourd'hui`}
            data-testid={`nav-badge-${k}`}
          >
            {badge}
          </span>
        )}
        {collapsed && (showCounter || (badge != null && badge > 0)) && (
          <span
            className="absolute -mt-4 ml-4 w-2 h-2 rounded-full bg-amber-500"
            aria-hidden="true"
          />
        )}
      </Link>
    );

    // Wrap dans Tooltip quand collapsed pour afficher le label au survol.
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
            <ContextMenuItem onSelect={() => unpinFromToday(k)} data-testid={`nav-ctx-unpin-${k}`}>
              <PinOff size={14} className="mr-2" /> {t("unpin_from_today")}
            </ContextMenuItem>
          ) : (
            <ContextMenuItem
              disabled={pinned || userPinCount >= 3 || !!locked}
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
              <ContextMenuItem onSelect={() => resetSection(sectionKey)} data-testid={`nav-ctx-reset-${sectionKey}`}>
                <RotateCcw size={14} className="mr-2" /> {t("reset_section")}
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-screen items-stretch">
        {/* Sidebar desktop — sticky + hauteur d'écran + scroll indépendant du contenu */}
        <aside
          className={`hidden md:flex md:flex-col shrink-0 sticky top-0 h-screen border-r border-stone-300 dark:border-stone-700 ${SIDEBAR_THEME_CLASSES[sidebarTheme]} shadow-[inset_-1px_0_0_rgba(74,21,75,0.08)] transition-[width] duration-200 z-30 ${collapsed ? "w-16" : "w-64"}`}
          data-testid="sidebar"
          data-collapsed={collapsed ? "1" : "0"}
          data-sidebar-theme={sidebarTheme}
        >
          {/* Header : logo + toggle collapse + sync */}
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
                  <button
                    type="button"
                    onClick={toggleCollapsed}
                    data-testid="sidebar-collapse-toggle"
                    aria-label={collapsed ? t("expand_sidebar") : t("collapse_sidebar")}
                    aria-pressed={collapsed ? "true" : "false"}
                    className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 dark:text-stone-400"
                  >
                    {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {collapsed ? t("expand_sidebar") : t("collapse_sidebar")}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Palette Cmd+K */}
          {!collapsed ? (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("bevid:open-palette"))}
              data-testid="palette-trigger"
              className="mx-3 mt-3 flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors min-h-[40px]"
              aria-label={t("open_command_palette")}
            >
              <Search size={14} aria-hidden="true" />
              <span className="flex-1 text-left">{t("search_verb")}…</span>
              <kbd className="text-[10px] px-1.5 py-0.5 border border-stone-300 dark:border-stone-600 rounded font-mono">⌘K</kbd>
            </button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent("bevid:open-palette"))}
                  data-testid="palette-trigger"
                  aria-label={t("open_command_palette")}
                  className="mx-auto mt-3 flex items-center justify-center w-10 h-10 rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  <Search size={16} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">{t("search_verb")} · ⌘K</TooltipContent>
            </Tooltip>
          )}

          <nav className="flex-1 p-3 space-y-2 overflow-y-auto mt-2" aria-label={t("navigation") || "Navigation"}>
            {/* Entrée fixe : Tableau de bord */}
            {homeVisible && (
              <div className="pb-2 mb-2 border-b border-stone-200/60 dark:border-stone-700/50" data-testid="nav-home-fixed">
                <NavEntry to={HOME_ENTRY.to} k={HOME_ENTRY.key} Icon={HOME_ENTRY.icon} locked={homeEval.lockedPlan} />
              </div>
            )}

            {/* Zone épinglée */}
            {visiblePinned.length > 0 && (
              <div data-testid="nav-pinned" className="pb-2 mb-2 border-b border-stone-200/60 dark:border-stone-700/50">
                {!collapsed && (
                  <div className="flex items-center gap-1 px-2 py-1.5 text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    <Pin size={10} aria-hidden="true" />
                    <span>{t("section_today")}</span>
                    {userPinCount > 0 && (
                      <span className="ml-auto tabular-nums normal-case text-[10px] text-stone-400">{userPinCount}/3</span>
                    )}
                  </div>
                )}
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
                      locked={e._locked}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Sections repliables (accordéon) */}
            {visibleSections.map(section => {
              const isOpen = collapsed || openSections.includes(section.key);
              const SectionIcon = section.icon || FileText;
              return (
                <div key={section.key} data-testid={`nav-section-${section.key}`}
                  className={!collapsed ? "rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-white/50 dark:bg-stone-900/40 overflow-hidden" : ""}>
                  {!collapsed && (
                    <button
                      type="button"
                      onClick={() => toggleSection(section.key)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium uppercase tracking-wider transition-colors ${
                        isOpen
                          ? "text-[#4A154B] dark:text-[#B076B4] bg-stone-100/70 dark:bg-stone-800/40"
                          : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-800/30"
                      }`}
                      aria-expanded={isOpen}
                      aria-controls={`section-body-${section.key}`}
                      data-testid={`nav-section-toggle-${section.key}`}
                    >
                      <SectionIcon size={13} strokeWidth={2} aria-hidden="true" className="shrink-0 opacity-80" />
                      <span className="truncate flex-1 text-left">{t(section.key)}</span>
                      <ChevronDown size={13} aria-hidden="true" className="shrink-0 opacity-70"
                        style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s ease" }} />
                    </button>
                  )}
                  {collapsed && (
                    <div className="my-1 flex items-center justify-center py-1" aria-hidden="true">
                      <SectionIcon size={14} className="opacity-40" />
                    </div>
                  )}
                  {isOpen && (
                    <div
                      id={`section-body-${section.key}`}
                      className={collapsed ? "space-y-0.5" : "p-1.5 space-y-0.5 border-t border-stone-200/50 dark:border-stone-700/40"}
                      onDragOver={(e) => {
                        if (dragCtx?.sectionKey === section.key) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
                      }}
                      onDrop={(e) => {
                        if (dragCtx?.sectionKey === section.key) {
                          e.preventDefault();
                          applyDrop(section.key, dragCtx.fromKey, null);
                          setDragCtx(null); setDragOver(null);
                        }
                      }}
                    >
                      {section.entries.map(({ to, key, icon, _locked }) => (
                        <NavEntry key={to} to={to} k={key} Icon={icon} sectionKey={section.key} locked={_locked} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {!collapsed && userPinCount === 0 && Object.keys(prefs.section_order || {}).length === 0 && (
              <div className="mt-3 px-2 text-[10px] text-stone-400 dark:text-stone-500 leading-snug" data-testid="nav-customize-hint">
                {t("customize_hint")}
              </div>
            )}
          </nav>

          {/* Zone d'identité en bas — 2 rangs aérés : identité, puis notifs + menu */}
          <div className={`border-t border-stone-200 dark:border-stone-700 ${collapsed ? "p-2 space-y-2" : "p-3 space-y-2"}`}>
            {!collapsed ? (
              <>
                <Link
                  to="/profile"
                  data-testid="nav-profile-identity"
                  className={`flex items-center gap-3 min-w-0 px-2 py-2 min-h-[52px] rounded-lg text-sm transition-colors ${isActive("/profile") ? "bg-[#4A154B]/10 dark:bg-[#B076B4]/20" : "hover:bg-stone-100 dark:hover:bg-stone-800"}`}
                >
                  <div className="w-9 h-9 rounded-full bg-[#4A154B] dark:bg-[#B076B4] text-white dark:text-stone-900 flex items-center justify-center font-medium text-sm shrink-0" aria-hidden="true">
                    {(user?.name || user?.email || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-stone-800 dark:text-stone-100 truncate text-[13px] leading-tight">{user?.name || user?.email}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {user?.org_name && <span className="text-[10px] text-stone-500 truncate">{user.org_name}</span>}
                      <PuceEtat etat="info" variante="douce" libelle={role} />
                    </div>
                  </div>
                </Link>
                <div
                  className="flex items-center justify-between gap-1 px-1 pt-1 border-t border-stone-100 dark:border-stone-800/50"
                  data-testid="sidebar-quick-actions"
                >
                  <div className="flex items-center gap-1">
                    <div className="flex items-center justify-center w-9 h-9" data-testid="qa-inbox"><InboxDropdown /></div>
                    <div className="flex items-center justify-center w-9 h-9" data-testid="qa-push"><PushHistoryBell /></div>
                    <div className="flex items-center justify-center w-9 h-9" data-testid="qa-notifs"><NotificationBell /></div>
                  </div>
                  <div className="flex items-center justify-center" data-testid="qa-menu">
                    <SidebarUserMenu
                      theme={theme}
                      setTheme={setTheme}
                      resolvedTheme={resolvedTheme}
                      lang={lang}
                      setLanguage={setLanguage}
                      languages={languages}
                      onLogout={logout}
                      t={t}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/profile"
                      data-testid="nav-profile-identity"
                      className="flex items-center justify-center w-10 h-10 rounded-full bg-[#4A154B] dark:bg-[#B076B4] text-white dark:text-stone-900 font-medium text-sm"
                    >
                      {(user?.name || user?.email || "?")[0].toUpperCase()}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">{user?.name || user?.email}</TooltipContent>
                </Tooltip>
                <SidebarUserMenu
                  theme={theme}
                  setTheme={setTheme}
                  resolvedTheme={resolvedTheme}
                  lang={lang}
                  setLanguage={setLanguage}
                  languages={languages}
                  onLogout={logout}
                  t={t}
                  collapsed
                />
              </div>
            )}
          </div>
        </aside>

        {/* Mobile top bar — inchangée */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-40 glass border-b border-stone-200 dark:border-stone-700 flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 text-[#4A154B] dark:text-[#B076B4]">
            <BevidLogo size={22} />
            <span className="font-display text-xl" aria-hidden="true">BEVID</span>
            <SyncIndicator />
          </div>
          <div className="flex gap-1 items-center">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("bevid:open-palette"))}
              data-testid="palette-trigger-mobile"
              aria-label={t("search_verb")}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-700 dark:text-stone-300"
            >
              <Search size={18} aria-hidden="true" />
            </button>
            <ThemeToggle variant="icon" />
            <InboxDropdown />
            <PushHistoryBell />
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
    </TooltipProvider>
  );
}
