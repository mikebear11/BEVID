import React, { createContext, useContext, useState } from "react";

const dict = {
  fr: {
    dashboard: "Tableau de bord", clients: "Clients", products: "Catalogue", orders: "Commandes",
    tours: "Tournées", reports: "Rapports", agents: "Équipe", logout: "Déconnexion", login: "Connexion",
    register: "Créer un compte", email: "Email", password: "Mot de passe", name: "Nom",
    add: "Ajouter", save: "Enregistrer", cancel: "Annuler", delete: "Supprimer", edit: "Modifier",
    search: "Rechercher", voice_input: "Saisie vocale", ai_assistant: "Assistant IA",
    revenue: "Chiffre d'affaires", active_clients: "Clients actifs", quick_report: "Rapport 1-clic",
    welcome: "Bienvenue", performance: "Performance", account_analysis: "Analyse du compte",
    visit: "Visite", planning: "Planning", monthly: "Revue mensuelle", pipeline: "Pipeline", deals: "Deals", connectors: "Connecteurs", settings: "Réglages",
  },
  en: {
    dashboard: "Dashboard", clients: "Clients", products: "Catalog", orders: "Orders",
    tours: "Routes", reports: "Reports", agents: "Team", logout: "Log out", login: "Sign in",
    register: "Create account", email: "Email", password: "Password", name: "Name",
    add: "Add", save: "Save", cancel: "Cancel", delete: "Delete", edit: "Edit",
    search: "Search", voice_input: "Voice input", ai_assistant: "AI Assistant",
    revenue: "Revenue", active_clients: "Active clients", quick_report: "1-click report",
    welcome: "Welcome", performance: "Performance", account_analysis: "Account analysis",
    visit: "Visit", planning: "Planning", monthly: "Monthly review", pipeline: "Pipeline", deals: "Deals", connectors: "Connectors", settings: "Settings",
  }
};

const I18nContext = createContext();

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(localStorage.getItem("crm_lang") || "fr");
  const t = (k) => (dict[lang] && dict[lang][k]) || k;
  const setLanguage = (l) => { setLang(l); localStorage.setItem("crm_lang", l); };
  return <I18nContext.Provider value={{ lang, t, setLanguage }}>{children}</I18nContext.Provider>;
}
export const useI18n = () => useContext(I18nContext);
