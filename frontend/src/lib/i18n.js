/**
 * i18n : dictionnaires + helpers.
 *
 * Séparé du contexte React pour être importable depuis n'importe où
 * (intercepteurs axios, service worker, ErrorBoundary, etc.).
 *
 * Sync du _lang courant : appelé par I18nProvider dans son useEffect.
 */

export const dict = {
  fr: {
    // nav (labels de sections + entrées)
    dashboard: "Tableau de bord", clients: "Clients", products: "Catalogue", orders: "Commandes",
    tours: "Plans de tournée", tournee: "Ma tournée",
    reports: "Rapports", agents: "Équipe", visit: "Visite", planning: "Planning",
    monthly: "Bilan mensuel", pipeline: "Cycle client", deals: "Opportunités",
    connectors: "Connecteurs", settings: "Réglages", smart: "Objectifs SMART",
    users: "Utilisateurs", payments: "Paiements", privacy: "Confidentialité",
    costs: "Coûts de revient", reconciliation: "Rapprochement",
    prospecting: "Prospection", radar: "Radar CHR", veille: "Rappels",
    bouclier: "Bouclier", sources: "Sources", permissions: "Permissions",
    stock: "Stock", containers: "Contenants", scan: "Scanner", drm: "DRM",
    // sections navigation desktop
    section_field: "Terrain", section_sales: "Ventes",
    section_stock: "Stock & Douanes", section_pilotage: "Pilotage",
    section_growth: "Acquisition", section_admin: "Administration",
    // auth
    welcome: "Bienvenue", login: "Connexion", register: "Créer un compte", logout: "Déconnexion",
    email: "Email", password: "Mot de passe", name: "Nom", role: "Rôle", language: "Langue",
    forgot_password: "Mot de passe oublié ?", back_to_login: "Retour à la connexion",
    request_reset: "Demander une réinitialisation", change_password: "Changer mon mot de passe",
    old_password: "Mot de passe actuel", new_password: "Nouveau mot de passe",
    // common
    add: "Ajouter", save: "Enregistrer", cancel: "Annuler", delete: "Supprimer", edit: "Modifier",
    search: "Rechercher", loading: "Chargement…", confirm: "Confirmer", close: "Fermer",
    // sync
    online: "En ligne", offline: "Hors ligne", syncing: "Synchronisation…", synced: "À jour",
    // KPIs
    revenue: "Chiffre d'affaires", active_clients: "Clients actifs", quick_report: "Rapport 1-clic",
    voice_input: "Saisie vocale", ai_assistant: "Assistant IA", performance: "Performance",
    account_analysis: "Analyse du compte",
    // Paiements
    payment_terms: "Délai contractuel", actual_delay: "Délai réel moyen", gap: "Écart",
    overdue_amount: "Montant en retard", overdue_age: "Ancienneté", bad_payers: "Mauvais payeurs",
    dso: "DSO", dso_evolution: "Évolution mensuelle du DSO", days: "jours", unpaid: "Impayé",
    // RGPD
    export_data: "Exporter les données", delete_data: "Supprimer les données",
    geolocation: "Géolocalisation", audio_retention: "Rétention audio",
    // Coûts
    costs_locked: "Marges désactivées — coûts de revient à valider",
    validate_costs: "Valider les coûts saisis",
    invalidate_costs: "Réinvalider (recalculer)",
    // Toasts communs (extraction Lot 3B)
    "toast.login_success": "Connexion réussie",
    "toast.login_invalid": "Identifiants invalides",
    "toast.login_ratelimit": "Trop de tentatives. Réessaie plus tard.",
    "toast.login_network": "Connexion impossible. Vérifie ton réseau et réessaie.",
    "toast.account_created": "Compte créé",
    "toast.register_failed": "Échec de la création du compte",
    "toast.saved": "Enregistré",
    "toast.deleted": "Supprimé",
    "toast.error_generic": "Une erreur est survenue",
    "toast.tour_created": "Tournée créée",
    "toast.tour_add_client": "Ajoutez au moins un client",
    "toast.geocode_ok": "{n} clients géolocalisés",
    "toast.geocode_error": "Erreur géocodage",
    "toast.deal_created": "Opportunité créée",
    "toast.coach_error": "Erreur coach IA",
  },
  en: {
    dashboard: "Dashboard", clients: "Clients", products: "Catalog", orders: "Orders",
    tours: "Route plans", tournee: "My route",
    reports: "Reports", agents: "Team", visit: "Visit", planning: "Planning",
    monthly: "Monthly review", pipeline: "Client cycle", deals: "Opportunities",
    connectors: "Connectors", settings: "Settings", smart: "SMART goals",
    users: "Users", payments: "Payments", privacy: "Privacy",
    costs: "Cost prices", reconciliation: "Reconciliation",
    prospecting: "Prospecting", radar: "HoReCa radar", veille: "Alerts",
    bouclier: "Shield", sources: "Sources", permissions: "Permissions",
    stock: "Stock", containers: "Containers", scan: "Scan", drm: "DRM",
    section_field: "Field", section_sales: "Sales",
    section_stock: "Stock & Duty", section_pilotage: "Steering",
    section_growth: "Growth", section_admin: "Admin",
    welcome: "Welcome", login: "Sign in", register: "Create account", logout: "Log out",
    email: "Email", password: "Password", name: "Name", role: "Role", language: "Language",
    forgot_password: "Forgot password?", back_to_login: "Back to sign in",
    request_reset: "Request reset", change_password: "Change my password",
    old_password: "Current password", new_password: "New password",
    add: "Add", save: "Save", cancel: "Cancel", delete: "Delete", edit: "Edit",
    search: "Search", loading: "Loading…", confirm: "Confirm", close: "Close",
    online: "Online", offline: "Offline", syncing: "Syncing…", synced: "Up to date",
    revenue: "Revenue", active_clients: "Active clients", quick_report: "1-click report",
    voice_input: "Voice input", ai_assistant: "AI assistant", performance: "Performance",
    account_analysis: "Account analysis",
    payment_terms: "Contractual terms", actual_delay: "Actual avg. delay", gap: "Gap",
    overdue_amount: "Overdue amount", overdue_age: "Age", bad_payers: "Bad payers",
    dso: "DSO", dso_evolution: "Monthly DSO trend", days: "days", unpaid: "Unpaid",
    export_data: "Export data", delete_data: "Delete data",
    geolocation: "Geolocation", audio_retention: "Audio retention",
    costs_locked: "Margins disabled — cost prices to validate",
    validate_costs: "Validate entered costs",
    invalidate_costs: "Invalidate (recompute)",
    "toast.login_success": "Signed in",
    "toast.login_invalid": "Invalid credentials",
    "toast.login_ratelimit": "Too many attempts. Try again later.",
    "toast.login_network": "Connection failed. Check your network and retry.",
    "toast.account_created": "Account created",
    "toast.register_failed": "Sign-up failed",
    "toast.saved": "Saved",
    "toast.deleted": "Deleted",
    "toast.error_generic": "Something went wrong",
    "toast.tour_created": "Route created",
    "toast.tour_add_client": "Add at least one client",
    "toast.geocode_ok": "{n} clients geolocated",
    "toast.geocode_error": "Geocoding error",
    "toast.deal_created": "Opportunity created",
    "toast.coach_error": "AI coach error",
  },
};

export const LANGS = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
];

let _lang = "fr";
export function _setModuleLang(l) { if (dict[l]) _lang = l; }
export function getModuleLang() { return _lang; }

/**
 * t(key, params?) — traduction avec fallback FR puis clé.
 * params : dict remplaçant {name} par sa valeur.
 */
export function t(key, params) {
  const v = (dict[_lang] && dict[_lang][key]) || (dict.fr && dict.fr[key]) || key;
  if (!params) return v;
  return v.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}
