import { useEffect, useState } from "react";

const MQ = "(max-width: 767px)";
export const isMobile = () => typeof window !== "undefined" && window.matchMedia(MQ).matches;

export function useIsMobile() {
  const [m, setM] = useState(isMobile);
  useEffect(() => {
    const mq = window.matchMedia(MQ);
    const h = (e) => setM(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return m;
}

// Écrans qui portent leur propre barre d'actions fixe en bas → la nav mobile s'efface (M1-B)
const OWN_BOTTOM_BAR = [/^\/etab\/[^/]+$/, /^\/etab\/[^/]+\/commande/, /^\/etab\/[^/]+\/visite/, /^\/visit$/, /^\/etab\/new$/];
export const hasOwnBottomBar = (path) => OWN_BOTTOM_BAR.some((r) => r.test(path));

const RECENT_KEY = "bevid_recent_etabs";
export function getRecents() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
export function pushRecent(e) {
  if (!e?.id) return;
  const next = [{ id: e.id, name: e.name, city: e.city || "", type: e.type || "", at: Date.now() },
    ...getRecents().filter((x) => x.id !== e.id)].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export const normalize = (s) => (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Distance de Damerau-Levenshtein bornée à 1 (lettre manquante, en trop, substituée ou deux lettres permutées)
function within1(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i]) return a.slice(i + 2) === b.slice(i + 2); // transposition
    return a.slice(i + 1) === b.slice(i + 1); // substitution
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1); // insertion / suppression
}

/** Recherche insensible aux accents/casse, sous-chaîne ou faute légère par mot (≥ 4 lettres). */
export function fuzzyMatch(query, text) {
  const nq = normalize(query), nt = normalize(text);
  if (!nq) return true;
  if (nt.includes(nq)) return true;
  const words = nt.split(/[^a-z0-9]+/).filter(Boolean);
  return nq.split(/\s+/).every((tok) => nt.includes(tok) || (tok.length >= 4 && words.some((w) => within1(tok, w) || (w.length > tok.length && within1(tok, w.slice(0, tok.length))))));
}

export function formatDistance(m) {
  if (m == null) return "";
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function daysAgo(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

let posCache = null;
export function getPosition({ maxAgeMs = 120000, timeout = 8000 } = {}) {
  if (posCache && Date.now() - posCache.at < maxAgeMs) return Promise.resolve(posCache.pos);
  // Natif : plugin Geolocation (premier plan, permission « pendant l'utilisation » uniquement)
  if (window.Capacitor?.isNativePlatform?.()) {
    return import("@/lib/native").then(({ nativePosition }) => nativePosition({ timeout, maxAgeMs }))
      .then((pos) => { posCache = { at: Date.now(), pos }; return pos; });
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("no-geo"));
    navigator.geolocation.getCurrentPosition(
      (p) => { posCache = { at: Date.now(), pos: { lat: p.coords.latitude, lng: p.coords.longitude } }; resolve(posCache.pos); },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout, maximumAge: maxAgeMs },
    );
  });
}
