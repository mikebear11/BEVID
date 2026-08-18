import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { saveSnapshot, db } from "@/lib/db";
import { startSyncListener, flushQueue } from "@/lib/syncQueue";

const AuthContext = createContext(null);

async function bootstrapOffline() {
  try {
    const { data } = await api.get("/sync/bootstrap");
    await saveSnapshot(data);
  } catch (e) { /* silencieux — le cache existe peut-être déjà */ }
}

async function getSnapshotAt() {
  try { const m = await db.meta.get("snapshot_at"); return m?.value || null; }
  catch { return null; }
}

async function loadCachedUser() {
  try { const m = await db.meta.get("cached_user"); return m?.value || null; }
  catch { return null; }
}

async function cacheUser(u) {
  try { await db.meta.put({ key: "cached_user", value: u }); } catch {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);
  const [snapshotAt, setSnapshotAt] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("crm_token");
    const stop = startSyncListener();
    const onOffline = () => setOfflineMode(true);
    const onOnline = () => {
      setOfflineMode(false);
      // Tente une revalidation silencieuse au retour du réseau
      if (localStorage.getItem("crm_token")) {
        api.get("/auth/me").then(async r => { setUser(r.data); await cacheUser(r.data); bootstrapOffline(); }).catch(() => {});
      }
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    if (!token) { setLoading(false); return () => { stop(); window.removeEventListener("offline", onOffline); window.removeEventListener("online", onOnline); }; }

    api.get("/auth/me")
       .then(async r => {
         setUser(r.data);
         await cacheUser(r.data);
         setOfflineMode(false);
         bootstrapOffline();
         flushQueue().catch(() => {});
       })
       .catch(async (err) => {
         // Distinguer une réponse d'auth serveur d'une panne réseau
         const status = err?.response?.status;
         if (status === 401 || status === 403) {
           // Le serveur a explicitement rejeté le token → nettoyage
           localStorage.removeItem("crm_token");
           await db.meta.delete("cached_user").catch(() => {});
           setUser(null);
         } else {
           // Pas de réponse serveur (zone blanche, DNS KO, timeout…) → mode hors-ligne
           const cached = await loadCachedUser();
           const snap = await getSnapshotAt();
           if (cached) {
             setUser(cached);
             setOfflineMode(true);
             setSnapshotAt(snap);
           }
         }
       })
       .finally(() => setLoading(false));

    return () => { stop(); window.removeEventListener("offline", onOffline); window.removeEventListener("online", onOnline); };
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("crm_token", data.token);
    setUser(data.user);
    await cacheUser(data.user);
    setOfflineMode(false);
    bootstrapOffline();
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    localStorage.setItem("crm_token", data.token);
    setUser(data.user);
    await cacheUser(data.user);
    setOfflineMode(false);
    bootstrapOffline();
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("crm_token");
    db.meta.delete("cached_user").catch(() => {});
    setUser(null);
    window.location.href = "/login";
  };

  return <AuthContext.Provider value={{ user, loading, login, register, logout, offlineMode, snapshotAt }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
