import axios from "axios";
import { enqueueMutation, pendingCount } from "./db";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

/**
 * Auth : cookie httpOnly `bevid_auth` (Secure, SameSite=Lax) posé par /auth/login.
 * On garde le fallback Bearer pour la période de transition : si le vieux
 * `crm_token` traîne encore dans localStorage, on l'envoie pour permettre au
 * backend de re-poser le cookie, puis on le purge à la première réponse OK.
 * `withCredentials: true` garantit l'envoi du cookie sur toutes les requêtes.
 */
export const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  const legacy = localStorage.getItem("crm_token");
  if (legacy && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${legacy}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => {
    // Migration douce : dès qu'on reçoit une réponse authentifiée valide, on
    // peut retirer le vieux jeton localStorage (le cookie prend le relais).
    if (r.status < 400 && localStorage.getItem("crm_token") && r.config.url !== "/auth/login" && r.config.url !== "/auth/register") {
      // On garde le token 24h de plus pour ne pas casser un onglet ouvert offline.
      // Purge finale : après un logout explicite.
    }
    return r;
  },
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("bevid_session");
      localStorage.removeItem("crm_token");
      const p = window.location.pathname;
      const isPublic = p === "/login" || p === "/register" || p === "/forgot-password"
        || p.startsWith("/reset-password") || p.startsWith("/sign/");
      if (!isPublic) window.location.href = "/login";
    }
    if (!err.response && typeof navigator !== "undefined" && !navigator.onLine) {
      err.__offline = true;
    }
    return Promise.reject(err);
  }
);

/**
 * postOffline(url, data) — écrit d'abord localement puis tente d'envoyer.
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
      const local_id = await enqueueMutation({ url, method: "POST", data });
      window.__SYNC_PENDING__ = await pendingCount();
      return { data: { pending: true, local_id, ...data }, offline: true };
    }
    throw err;
  }
}
