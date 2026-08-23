/**
 * Web Push helpers — abonnement navigateur, opt-in strict.
 * VAPID public key doit venir du backend, sinon utilise une clé de démo.
 * Note : sans VAPID configuré côté serveur, les envois retomberont en "simulé".
 */
import { api } from "./api";

const DEMO_VAPID_PUBLIC = process.env.REACT_APP_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported() {
  return typeof window !== "undefined" &&
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function subscribePush() {
  if (!pushSupported()) throw new Error("Push non supporté sur ce navigateur");
  const reg = await navigator.serviceWorker.ready;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permission refusée");
  if (!DEMO_VAPID_PUBLIC) {
    // Pas de VAPID → on marque l'opt-in côté serveur mais pas d'endpoint réel.
    await api.put("/notifications/preferences", { push_enabled: true });
    return { ok: true, simulated: true };
  }
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(DEMO_VAPID_PUBLIC),
  });
  const raw = sub.toJSON();
  await api.post("/notifications/push-subscribe", {
    endpoint: raw.endpoint,
    keys: raw.keys,
  });
  return { ok: true, subscription: raw };
}

export async function unsubscribePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch { /* silencieux */ }
  await api.delete("/notifications/push-subscribe").catch(() => {});
  return { ok: true };
}
