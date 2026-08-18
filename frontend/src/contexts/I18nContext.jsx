import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

// Dictionnaires (fr / en / es / de). Ajouter une clé ici propage à toute l'app.
const dict = {
  fr: {
    // nav
    dashboard: "Tableau de bord", clients: "Clients", products: "Catalogue", orders: "Commandes",
    tours: "Tournées", reports: "Rapports", agents: "Équipe", visit: "Visite", planning: "Planning",
    monthly: "Revue mensuelle", pipeline: "Pipeline", deals: "Deals", connectors: "Connecteurs",
    settings: "Réglages", smart: "Obj. SMART", users: "Utilisateurs", payments: "Paiements",
    privacy: "Confidentialité", costs: "Coûts de revient", reconciliation: "Rapprochement",
    prospecting: "Prospection", radar: "Radar CHR", veille: "Rappels", bouclier: "Bouclier", sources: "Sources",
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
    // Stock / DRM / containers
    stock: "Stock", containers: "Contenants", scan: "Scanner", drm: "DRM",
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
  },
  en: {
    dashboard: "Dashboard", clients: "Clients", products: "Catalog", orders: "Orders",
    tours: "Routes", reports: "Reports", agents: "Team", visit: "Visit", planning: "Planning",
    monthly: "Monthly review", pipeline: "Pipeline", deals: "Deals", connectors: "Connectors",
    settings: "Settings", smart: "SMART goals", users: "Users", payments: "Payments",
    privacy: "Privacy", costs: "COGS", reconciliation: "Reconciliation",
    privacy: "Privacy", costs: "Cost prices",
    welcome: "Welcome", login: "Sign in", register: "Create account", logout: "Log out",
    email: "Email", password: "Password", name: "Name", role: "Role", language: "Language",
    forgot_password: "Forgot password?", back_to_login: "Back to sign in",
    request_reset: "Request reset", change_password: "Change my password",
    old_password: "Current password", new_password: "New password",
    add: "Add", save: "Save", cancel: "Cancel", delete: "Delete", edit: "Edit",
    search: "Search", loading: "Loading…", confirm: "Confirm", close: "Close",
    online: "Online", offline: "Offline", syncing: "Syncing…", synced: "Up to date",
    revenue: "Revenue", active_clients: "Active clients", quick_report: "1-click report",
    voice_input: "Voice input", ai_assistant: "AI Assistant", performance: "Performance",
    account_analysis: "Account analysis",
    payment_terms: "Contractual terms", actual_delay: "Actual avg. delay", gap: "Gap",
    overdue_amount: "Overdue amount", overdue_age: "Age", bad_payers: "Bad payers",
    dso: "DSO", dso_evolution: "Monthly DSO trend", days: "days", unpaid: "Unpaid",
    export_data: "Export data", delete_data: "Delete data",
    geolocation: "Geolocation", audio_retention: "Audio retention",
    costs_locked: "Margins disabled — cost prices to validate",
    validate_costs: "Validate entered costs",
    invalidate_costs: "Invalidate (recompute)",
  },
  es: {
    dashboard: "Panel", clients: "Clientes", products: "Catálogo", orders: "Pedidos",
    tours: "Rutas", reports: "Informes", agents: "Equipo", visit: "Visita", planning: "Agenda",
    monthly: "Revisión mensual", pipeline: "Pipeline", deals: "Oportunidades", connectors: "Conectores",
    settings: "Ajustes", smart: "Objetivos SMART", users: "Usuarios", payments: "Pagos",
    reconciliation: "Conciliación",
    privacy: "Privacidad", costs: "Costes",
    welcome: "Bienvenido", login: "Iniciar sesión", register: "Crear cuenta", logout: "Cerrar sesión",
    email: "Email", password: "Contraseña", name: "Nombre", role: "Rol", language: "Idioma",
    forgot_password: "¿Olvidó su contraseña?", back_to_login: "Volver al login",
    request_reset: "Solicitar restablecimiento", change_password: "Cambiar contraseña",
    old_password: "Contraseña actual", new_password: "Nueva contraseña",
    add: "Añadir", save: "Guardar", cancel: "Cancelar", delete: "Eliminar", edit: "Editar",
    search: "Buscar", loading: "Cargando…", confirm: "Confirmar", close: "Cerrar",
    online: "En línea", offline: "Sin conexión", syncing: "Sincronizando…", synced: "Actualizado",
    revenue: "Facturación", active_clients: "Clientes activos", quick_report: "Informe 1-clic",
    voice_input: "Entrada de voz", ai_assistant: "Asistente IA", performance: "Rendimiento",
    account_analysis: "Análisis de cuenta",
    payment_terms: "Plazo contractual", actual_delay: "Retraso medio real", gap: "Diferencia",
    overdue_amount: "Importe vencido", overdue_age: "Antigüedad", bad_payers: "Malos pagadores",
    dso: "DSO", dso_evolution: "Evolución mensual del DSO", days: "días", unpaid: "Impagado",
    export_data: "Exportar datos", delete_data: "Eliminar datos",
    geolocation: "Geolocalización", audio_retention: "Retención audio",
    costs_locked: "Márgenes desactivados — costes por validar",
    validate_costs: "Validar costes introducidos",
    invalidate_costs: "Invalidar (recalcular)",
  },
  de: {
    dashboard: "Übersicht", clients: "Kunden", products: "Katalog", orders: "Bestellungen",
    tours: "Touren", reports: "Berichte", agents: "Team", visit: "Besuch", planning: "Planung",
    monthly: "Monatsbericht", pipeline: "Pipeline", deals: "Deals", connectors: "Konnektoren",
    settings: "Einstellungen", smart: "SMART-Ziele", users: "Benutzer", payments: "Zahlungen",
    reconciliation: "Abgleich",
    privacy: "Datenschutz", costs: "Einstandspreise",
    welcome: "Willkommen", login: "Anmelden", register: "Konto erstellen", logout: "Abmelden",
    email: "E-Mail", password: "Passwort", name: "Name", role: "Rolle", language: "Sprache",
    forgot_password: "Passwort vergessen?", back_to_login: "Zurück zur Anmeldung",
    request_reset: "Zurücksetzen anfordern", change_password: "Passwort ändern",
    old_password: "Aktuelles Passwort", new_password: "Neues Passwort",
    add: "Hinzufügen", save: "Speichern", cancel: "Abbrechen", delete: "Löschen", edit: "Bearbeiten",
    search: "Suchen", loading: "Laden…", confirm: "Bestätigen", close: "Schließen",
    online: "Online", offline: "Offline", syncing: "Synchronisiere…", synced: "Aktuell",
    revenue: "Umsatz", active_clients: "Aktive Kunden", quick_report: "1-Klick-Bericht",
    voice_input: "Spracheingabe", ai_assistant: "KI-Assistent", performance: "Leistung",
    account_analysis: "Kontoanalyse",
    payment_terms: "Vertragliche Frist", actual_delay: "Tatsächlicher Ø-Verzug", gap: "Abweichung",
    overdue_amount: "Überfälliger Betrag", overdue_age: "Alter", bad_payers: "Zahlungssäumige",
    dso: "DSO", dso_evolution: "Monatliche DSO-Entwicklung", days: "Tage", unpaid: "Unbezahlt",
    export_data: "Daten exportieren", delete_data: "Daten löschen",
    geolocation: "Geolokalisierung", audio_retention: "Audio-Aufbewahrung",
    costs_locked: "Margen deaktiviert — Einstandspreise zu bestätigen",
    validate_costs: "Erfasste Kosten bestätigen",
    invalidate_costs: "Zurücksetzen (neu berechnen)",
  },
};

const LANGS = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
];

const I18nContext = createContext();

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem("crm_lang");
    if (saved && dict[saved]) return saved;
    const browser = (navigator.language || "fr").slice(0, 2);
    return dict[browser] ? browser : "fr";
  });

  // Sync côté serveur si connecté
  useEffect(() => {
    localStorage.setItem("crm_lang", lang);
    if (localStorage.getItem("crm_token")) {
      api.put("/auth/language", { language: lang }).catch(() => {});
    }
  }, [lang]);

  const t = (k) => (dict[lang] && dict[lang][k]) || (dict.fr[k]) || k;
  const setLanguage = (l) => { if (dict[l]) setLang(l); };

  return (
    <I18nContext.Provider value={{ lang, t, setLanguage, languages: LANGS }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
