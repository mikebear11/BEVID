import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { saveSnapshot } from "@/lib/db";
import { startSyncListener, flushQueue } from "@/lib/syncQueue";

const AuthContext = createContext(null);

async function bootstrapOffline() {
  try {
    const { data } = await api.get("/sync/bootstrap");
    await saveSnapshot(data);
  } catch (e) { /* silencieux — juste pas de cache */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("crm_token");
    const stop = startSyncListener();
    if (!token) { setLoading(false); return () => stop(); }
    api.get("/auth/me")
       .then(r => { setUser(r.data); bootstrapOffline(); flushQueue().catch(() => {}); })
       .catch(() => localStorage.removeItem("crm_token"))
       .finally(() => setLoading(false));
    return () => stop();
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("crm_token", data.token);
    setUser(data.user);
    bootstrapOffline();
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    localStorage.setItem("crm_token", data.token);
    setUser(data.user);
    bootstrapOffline();
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("crm_token");
    setUser(null);
    window.location.href = "/login";
  };

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
