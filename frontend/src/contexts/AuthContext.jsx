import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { saveSnapshot, db } from "@/lib/db";
import { startSyncListener, flushQueue } from "@/lib/syncQueue";

const AuthContext = createContext(null);

// ---- Migration transitoire : purge du legacy crm_token au tout premier montage
// L'authentification est désormais entièrement portée par le cookie httpOnly.
// L'indicateur non sensible `bevid_session` reste dans localStorage pour piloter
// le démarrage hors-ligne.
try { localStorage.removeItem("crm_token"); } catch { /* noop */ }

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

const SESSION_FLAG = "bevid_session";
function markSession()    { try { localStorage.setItem(SESSION_FLAG, "1"); } catch {} }
function clearSession()   { try { localStorage.removeItem(SESSION_FLAG); } catch {} }
function hasSessionFlag() { try { return !!localStorage.getItem(SESSION_FLAG); } catch { return false; } }

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
      if (hasSessionFlag()) {
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

    if (!hasSessionFlag()) {
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
           clearSession();
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
    markSession();
    setUser(data.user);
    await cacheUser(data.user);
    setOfflineMode(false);
    bootstrapOffline();
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
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
    db.meta.delete("cached_user").catch(() => {});
    setUser(null);
    window.location.href = "/login";
  };

  return <AuthContext.Provider value={{ user, loading, login, register, logout, offlineMode, snapshotAt }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
