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

// --- Lectures : déduplication des GET identiques en vol + file à concurrence bornée (max 6) ---
// Cause des 429 relevés par la porte QA : ~25 GET simultanés au montage du tableau de bord
// (bandeau + widgets), certains en double (/alerts/follow-ups, /inbox…). Le proxy limite les rafales.
const MAX_INFLIGHT = 6;
const inflight = new Map();
let active = 0;
const waiting = [];
const acquire = () => new Promise((res) => { if (active < MAX_INFLIGHT) { active++; res(); } else waiting.push(res); });
const release = () => { const next = waiting.shift(); if (next) next(); else active--; };
const defaultAdapter = axios.getAdapter(axios.defaults.adapter);
api.defaults.adapter = async (config) => {
  if ((config.method || "get").toLowerCase() !== "get") return defaultAdapter(config);
  const key = `${config.baseURL || ""}${config.url}${config.params ? JSON.stringify(config.params) : ""}`;
  if (inflight.has(key)) return inflight.get(key).then((r) => ({ ...r, config }));
  const p = (async () => {
    await acquire();
    try { return await defaultAdapter(config); } finally { release(); }
  })();
  inflight.set(key, p);
  try { return await p; } finally { inflight.delete(key); }
};

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
