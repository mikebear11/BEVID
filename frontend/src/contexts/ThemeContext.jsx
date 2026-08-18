import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

/**
 * Thème BEVID — 3 états : "light" | "dark" | "system"
 * - Persisté dans localStorage sous "bevid.theme"
 * - "system" suit prefers-color-scheme et écoute les changements OS
 * - Applique/retire la classe `.dark` sur <html> (Tailwind darkMode: "class")
 */
const ThemeContext = createContext({ theme: "system", resolved: "light", setTheme: () => {}, cycle: () => {} });

const STORAGE_KEY = "bevid.theme";
const VALID = ["light", "dark", "sun", "system"];

function getSystemPref() {
  if (typeof window === "undefined") return "light";
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyClass(mode) {
  const root = document.documentElement;
  // Nettoie les 3 classes possibles puis applique celle du mode résolu
  root.classList.remove("dark", "sun");
  if (mode === "dark") root.classList.add("dark");
  else if (mode === "sun") root.classList.add("sun");
  // meta color-scheme pour ajuster les contrôles natifs
  root.style.colorScheme = mode === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === "undefined") return "system";
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return VALID.includes(stored) ? stored : "system";
  });
  const [resolved, setResolved] = useState(() => (theme === "system" ? getSystemPref() : theme));

  // Applique la classe .dark selon le thème résolu
  useEffect(() => {
    const effective = theme === "system" ? getSystemPref() : theme;
    setResolved(effective);
    applyClass(effective);
  }, [theme]);

  // Écoute le changement système uniquement quand mode = "system"
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => {
      const eff = e.matches ? "dark" : "light";
      setResolved(eff);
      applyClass(eff);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (!VALID.includes(next)) return;
    window.localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  const cycle = useCallback(() => {
    // clair → sombre → soleil → système → clair
    const next = theme === "light" ? "dark"
              : theme === "dark"  ? "sun"
              : theme === "sun"   ? "system"
              : "light";
    setTheme(next);
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, cycle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
