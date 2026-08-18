/**
 * Hook centralisé : cache les permissions effectives du user courant.
 * Utilisé partout côté UI pour montrer/masquer.
 * Note : c'est du confort UI. Le vrai enforcement est côté serveur.
 */
import { useEffect, useState, createContext, useContext } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const PermContext = createContext({ perms: {}, has: () => false, loading: true, reload: () => {} });

export function PermProvider({ children }) {
  const [perms, setPerms] = useState({});
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const reload = async () => {
    try {
      const { data } = await api.get("/me/permissions");
      setPerms(data.permissions || {});
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  // Recharge à chaque fois qu'un user apparaît/change (login, refresh, reconnexion).
  // Reste inactif tant qu'il n'y a personne d'authentifié.
  useEffect(() => {
    if (user) { setLoading(true); reload(); }
    else { setPerms({}); setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const has = (key) => !!perms[key];
  return <PermContext.Provider value={{ perms, has, loading, reload }}>{children}</PermContext.Provider>;
}

export function usePerms() { return useContext(PermContext); }
