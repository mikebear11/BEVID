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

// Distance d'édition bornée à 1 (fautes légères : lettre manquante, en trop ou permutée)
function within1(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
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
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("no-geo"));
    navigator.geolocation.getCurrentPosition(
      (p) => { posCache = { at: Date.now(), pos: { lat: p.coords.latitude, lng: p.coords.longitude } }; resolve(posCache.pos); },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout, maximumAge: maxAgeMs },
    );
  });
}
