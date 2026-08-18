/**
 * Hook centralisé : cache les permissions effectives du user courant.
 * Utilisé partout côté UI pour montrer/masquer.
 * Note : c'est du confort UI. Le vrai enforcement est côté serveur.
 */
import { useEffect, useState, createContext, useContext } from "react";
import { api } from "@/lib/api";

const PermContext = createContext({ perms: {}, has: () => false, loading: true, reload: () => {} });

export function PermProvider({ children }) {
  const [perms, setPerms] = useState({});
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      const { data } = await api.get("/me/permissions");
      setPerms(data.permissions || {});
    } catch { /* silent */ }
    finally { setLoading(false); }
  };
  useEffect(() => {
    const t = localStorage.getItem("crm_token");
    if (t) reload(); else setLoading(false);
  }, []);
  const has = (key) => !!perms[key];
  return <PermContext.Provider value={{ perms, has, loading, reload }}>{children}</PermContext.Provider>;
}

export function usePerms() { return useContext(PermContext); }
