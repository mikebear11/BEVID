/**
 * Web Push helpers — abonnement navigateur, opt-in strict.
 * Clé publique VAPID récupérée dynamiquement depuis le backend (source unique
 * de vérité). Si le serveur n'a pas de clé, l'option est proposée en mode dégradé.
 */
import { api } from "./api";

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

async function fetchVapidPublic() {
  try {
    const { data } = await api.get("/notifications/vapid-public-key");
    return data.public_key || null;
  } catch { return null; }
}

export async function subscribePush() {
  if (!pushSupported()) throw new Error("Push non supporté sur ce navigateur");
  const reg = await navigator.serviceWorker.ready;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permission refusée");
  const publicKey = await fetchVapidPublic();
  if (!publicKey) {
    // Serveur sans VAPID → on marque l'opt-in mais pas d'envoi possible.
    await api.put("/notifications/preferences", { push_enabled: true }).catch(() => {});
    return { ok: true, simulated: true, reason: "no_vapid" };
  }
  // Réutilise l'abonnement existant si présent
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
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

/** Envoi un test au user courant. Retour {ok, simulated?}. */
export async function sendTestPush() {
  const { data } = await api.post("/notifications/test-push");
  return data;
}
