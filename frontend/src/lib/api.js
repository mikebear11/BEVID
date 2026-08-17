import axios from "axios";
import { enqueueMutation, pendingCount } from "./db";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("crm_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("crm_token");
      if (window.location.pathname !== "/login" && window.location.pathname !== "/register") {
        window.location.href = "/login";
      }
    }
    // Silence network errors when device is offline (dashboard GETs while hors-ligne)
    if (!err.response && typeof navigator !== "undefined" && !navigator.onLine) {
      err.__offline = true;
    }
    return Promise.reject(err);
  }
);

/**
 * postOffline(url, data)
 * — Écrit d'abord localement puis tente d'envoyer.
 * — Si offline OU erreur réseau : renvoie une réponse synthétique {pending, local_id}
 *   et enfile la mutation dans Dexie. La file est rejouée par syncQueue.startSyncListener().
 * — À utiliser pour les mutations non-critiques créées en tournée : visites, brouillons commandes.
 */
export async function postOffline(url, data) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const local_id = await enqueueMutation({ url, method: "POST", data });
    window.__SYNC_PENDING__ = await pendingCount();
    return { data: { pending: true, local_id, ...data }, offline: true };
  }
  try {
    return await api.post(url, data);
  } catch (err) {
    if (!err.response) {
      // erreur réseau uniquement (pas 4xx/5xx) → enfile
      const local_id = await enqueueMutation({ url, method: "POST", data });
      window.__SYNC_PENDING__ = await pendingCount();
      return { data: { pending: true, local_id, ...data }, offline: true };
    }
    throw err;
  }
}
