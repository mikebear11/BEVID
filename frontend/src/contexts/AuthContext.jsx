import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { saveSnapshot, db } from "@/lib/db";
import { startSyncListener, flushQueue } from "@/lib/syncQueue";

const AuthContext = createContext(null);

async function bootstrapOffline() {
  try {
    const { data } = await api.get("/sync/bootstrap");
    await saveSnapshot(data);
  } catch { /* silencieux — cache probable */ }
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
  try { await db.meta.put({ key: "cached_user", value: u }); } catch { /* noop */ }
}

// Flag non-sensible côté client : indique juste qu'une session pourrait exister,
// pour éviter d'appeler /auth/me à froid sans raison (et pour le mode hors-ligne).
// Le vrai auth se fait via cookie httpOnly `bevid_auth`.
const SESSION_FLAG = "bevid_session";
function markSession()   { try { localStorage.setItem(SESSION_FLAG, "1"); } catch {} }
function clearSession()  { try { localStorage.removeItem(SESSION_FLAG); } catch {} }
function hasSessionFlag(){ try { return !!localStorage.getItem(SESSION_FLAG); } catch { return false; } }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);
  const [snapshotAt, setSnapshotAt] = useState(null);

  useEffect(() => {
    const stop = startSyncListener();
    const onOffline = () => setOfflineMode(true);
    const onOnline = () => {
      setOfflineMode(false);
      if (hasSessionFlag() || localStorage.getItem("crm_token")) {
        api.get("/auth/me").then(async (r) => {
          setUser(r.data);
          await cacheUser(r.data);
          markSession();
          bootstrapOffline();
        }).catch(() => {});
      }
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    // Aucun indice de session ET pas de legacy → on n'appelle même pas /auth/me.
    if (!hasSessionFlag() && !localStorage.getItem("crm_token")) {
      setLoading(false);
      return () => { stop(); window.removeEventListener("offline", onOffline); window.removeEventListener("online", onOnline); };
    }

    api.get("/auth/me")
       .then(async (r) => {
         setUser(r.data);
         await cacheUser(r.data);
         markSession();
         setOfflineMode(false);
         bootstrapOffline();
         flushQueue().catch(() => {});
       })
       .catch(async (err) => {
         const status = err?.response?.status;
         if (status === 401 || status === 403) {
           // Rejet serveur explicite — nettoyage
           clearSession();
           localStorage.removeItem("crm_token");
           await db.meta.delete("cached_user").catch(() => {});
           setUser(null);
         } else {
           // Panne réseau → mode hors-ligne à partir du cache
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
    // Le backend a posé la cookie httpOnly. On retire le legacy token éventuel.
    localStorage.removeItem("crm_token");
    markSession();
    setUser(data.user);
    await cacheUser(data.user);
    setOfflineMode(false);
    bootstrapOffline();
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    localStorage.removeItem("crm_token");
    markSession();
    setUser(data.user);
    await cacheUser(data.user);
    setOfflineMode(false);
    bootstrapOffline();
    return data.user;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch { /* silencieux */ }
    clearSession();
    localStorage.removeItem("crm_token");
    db.meta.delete("cached_user").catch(() => {});
    setUser(null);
    window.location.href = "/login";
  };

  return <AuthContext.Provider value={{ user, loading, login, register, logout, offlineMode, snapshotAt }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
