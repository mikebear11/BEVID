import {
  LayoutDashboard, Users, Wine, ShoppingCart, Route as RouteIcon, BarChart3, UserCog,
  ClipboardCheck, Target, Plug, Settings as SettingsIcon, Banknote, ShieldCheck, Coins,
  Warehouse, QrCode, FileText, Landmark, Compass, Truck, Smartphone, Wallet, Rocket, Building2,
} from "lucide-react";

/**
 * Configuration statique de la navigation (Lot 8 + suite).
 * Aucune logique React ici : uniquement des données et des helpers purs.
 */
export const PINNED_FIXED = [
  { to: "/tournee", key: "tournee", feature: "page:tours", icon: RouteIcon, badgeKey: "stops_today" },
  { to: "/visit",   key: "new_visit", feature: "page:visits", icon: ClipboardCheck },
  { to: "/scan",    key: "scan",  feature: null, icon: QrCode },  // outil terrain universel
];

export const HOME_ENTRY = { to: "/", key: "dashboard", feature: "page:dashboard", icon: LayoutDashboard };

const CORE_KEYS = new Set([
  "tournee", "new_visit", "scan",
  "dashboard",
  "clients", "orders", "products", "stock",
  "team", "users",
]);

// Entrées « avancées » — masquées par défaut sur un nouveau compte, débloquées à l'usage,
// via la palette ⌘K ou le toggle « Afficher les fonctions avancées ».
export const isAdvancedEntry = (k) => !CORE_KEYS.has(k);

export const SECTIONS = [
  { key: "section_sales", icon: Wallet, entries: [
    { to: "/clients",  key: "clients",  feature: "page:clients", icon: Users },
    { to: "/orders",   key: "orders",   feature: "page:orders",  icon: ShoppingCart },
    { to: "/products", key: "products", feature: "page:products", icon: Wine },
    { to: "/deals",    key: "deals",    feature: "manager_only", icon: Target },
  ]},
  { key: "section_logistics", icon: Truck, entries: [
    { to: "/tours",      key: "tours",      feature: "page:tours", icon: RouteIcon },
    { to: "/livreur",    key: "livreur",    feature: null,          icon: Truck },
    { to: "/stock",      key: "stock",      feature: "page:stock", icon: Warehouse },
    { to: "/containers", key: "containers", feature: "page:stock", icon: QrCode },
    { to: "/drm",        key: "drm",        feature: "page:drm",   icon: FileText },
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
    { to: "/reports", key: "reports", feature: "page:reports", icon: BarChart3 },
  ]},
  { key: "section_growth", icon: Rocket, entries: [
    { to: "/prospection", key: "prospecting", feature: "page:prospection", icon: Compass },
  ]},
  { key: "section_admin", icon: Building2, entries: [
    { to: "/team",              key: "team",         feature: "manager_only",       icon: UserCog },
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
export const PLAN_LABEL_KEY = { pro: "plan_pro", entreprise: "plan_entreprise" };

// Compteurs métier — clé sidebar → clé API /sidebar/counters.
export const COUNTER_MAP = { payments: "payments_overdue", containers: "containers_out", orders: "orders_pending_signature" };
export const COUNTER_ARIA = { payments: "counter_overdue", containers: "counter_containers_out", orders: "counter_pending_signature" };

export const FLAT_ENTRIES = {};
for (const s of SECTIONS) for (const e of s.entries) FLAT_ENTRIES[e.key] = { ...e, sectionKey: s.key };
FLAT_ENTRIES[HOME_ENTRY.key] = { ...HOME_ENTRY, sectionKey: null };

export const FIXED_PIN_KEYS = new Set(PINNED_FIXED.map(p => p.key));

export const OPEN_KEY = "bevid_nav_open_sections_v2";
export const PREFS_CACHE_KEY = "bevid_sidebar_prefs_v1";
export const COLLAPSED_KEY = "bevid_sidebar_collapsed_v1";

export const SIDEBAR_THEME_CLASSES = {
  sobre:    "bg-stone-100/95 dark:bg-stone-950/80 backdrop-blur-md",
  vibrant:  "bg-gradient-to-b from-[#F0EAF0] via-white to-[#F0EAF0] dark:from-[#2A0F2C] dark:via-stone-950 dark:to-[#2A0F2C]",
  contrast: "bg-stone-950 text-stone-50 dark:bg-black",
};
export const VALID_SIDEBAR_THEMES = new Set(Object.keys(SIDEBAR_THEME_CLASSES));

export const EMPTY_PREFS = { pinned_user: [], section_order: {}, theme: "sobre", show_advanced: false, visited_features: [] };

export function normalizePrefs(p) {
  if (!p || typeof p !== "object") return { ...EMPTY_PREFS };
  return {
    pinned_user: Array.isArray(p.pinned_user) ? p.pinned_user : [],
    section_order: (p.section_order && typeof p.section_order === "object") ? p.section_order : {},
    theme: typeof p.theme === "string" ? p.theme : "sobre",
    show_advanced: !!p.show_advanced,
    visited_features: Array.isArray(p.visited_features) ? p.visited_features : [],
  };
}

export const isPrivilegedRole = (role) => role === "manager" || role === "gerant" || role === "owner";

export function defaultOpenByRole(role) {
  return isPrivilegedRole(role) ? ["section_pilotage"] : ["section_sales"];
}

export function loadOpenSections(role) {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (!raw) return defaultOpenByRole(role);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : defaultOpenByRole(role);
  } catch { return defaultOpenByRole(role); }
}

export function loadCachedPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_CACHE_KEY);
    return raw ? normalizePrefs(JSON.parse(raw)) : { ...EMPTY_PREFS };
  } catch { return { ...EMPTY_PREFS }; }
}

export function loadCollapsed() {
  try { return localStorage.getItem(COLLAPSED_KEY) === "1"; } catch { return false; }
}

export function applySectionOrder(entries, userOrder) {
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

// null si la feature est incluse dans le plan courant, sinon le plan minimum requis.
export function computePlanLock(feature, planFeatures) {
  if (!feature || feature === "manager_only") return null;
  if (!planFeatures || !Array.isArray(planFeatures)) return null;
  if (planFeatures.includes(feature)) return null;
  return FEATURE_MIN_PLAN[feature] || null;
}

export const matchesPath = (pathname, to) => pathname === to || (to !== "/" && pathname.startsWith(to));
