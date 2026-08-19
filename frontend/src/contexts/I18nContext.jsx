import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { dict, LANGS, _setModuleLang } from "@/lib/i18n";

const I18nContext = createContext();

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem("crm_lang");
    if (saved && dict[saved]) return saved;
    const browser = (navigator.language || "fr").slice(0, 2);
    return dict[browser] ? browser : "fr";
  });

  useEffect(() => {
    localStorage.setItem("crm_lang", lang);
    _setModuleLang(lang);
    try { document.documentElement.setAttribute("lang", lang); } catch { /* noop */ }
    if (localStorage.getItem("bevid_session")) {
      api.put("/auth/language", { language: lang }).catch(() => {});
    }
  }, [lang]);

  const t = (k, params) => {
    const raw = (dict[lang] && dict[lang][k]) || (dict.fr && dict.fr[k]) || k;
    if (!params) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, key) => (params[key] !== undefined ? String(params[key]) : `{${key}}`));
  };
  const setLanguage = (l) => { if (dict[l]) setLang(l); };

  return (
    <I18nContext.Provider value={{ lang, t, setLanguage, languages: LANGS }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
