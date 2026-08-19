import axios from "axios";
import { enqueueMutation, pendingCount } from "./db";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

/**
 * Auth : cookie httpOnly `bevid_auth` (Secure, SameSite=Lax) posé par /auth/login.
 * Le token n'est plus stocké côté client. `withCredentials: true` garantit l'envoi
 * automatique du cookie sur toutes les requêtes.
 *
 * Indicateur non sensible `bevid_session` dans localStorage : uniquement pour
 * savoir s'il faut tenter /auth/me au boot et pour le mode hors-ligne.
 */
export const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("bevid_session");
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
