/**
 * Lot Fiabilité PWA — helpers stockage persistant, quota, install prompt.
 * Aucune permission demandée sans raison. La règle d'or : ne JAMAIS sacrifier
 * la file d'envoi (sync_queue + message_outbox) pour faire de la place.
 */
import { db } from "./db";
// Import statique de push.js — force la présence de pushManager dans le main bundle,
// pas dans un chunk lazy. Sur iOS, la chaîne notif → push → persist doit être atomique
// à l'intérieur du même geste utilisateur pour que le storage devienne persistant.
import { subscribePush, pushSupported } from "./push";

const INSTALL_DISMISSED_KEY = "bevid_install_dismissed";
const PERSIST_ASKED_KEY = "bevid_persist_asked";
const OFFLINE_READY_DISMISSED_KEY = "bevid_offline_ready_dismissed";
const OFFLINE_READY_ASKED_KEY = "bevid_offline_ready_asked";
const PWA_LAST_CHECK = "bevid_pwa_last_check";

let _deferredInstall = null;

// Capture l'event `beforeinstallprompt` pour proposer plus tard.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    _deferredInstall = e;
    try { window.dispatchEvent(new CustomEvent("bevid:install-available")); } catch {}
  });
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia && window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator && window.navigator.standalone === true); // iOS Safari
}

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

export function installAvailable() {
  return !!_deferredInstall || (isIOS() && !isStandalone());
}

export function installDismissed() {
  try { return localStorage.getItem(INSTALL_DISMISSED_KEY) === "1"; } catch { return false; }
}
export function dismissInstall() {
  try { localStorage.setItem(INSTALL_DISMISSED_KEY, "1"); } catch {}
}

/** Ouvre le prompt d'installation (Android/Chrome/Edge). iOS = pas de prompt natif. */
export async function triggerInstall() {
  if (!_deferredInstall) return { ok: false, reason: "no_prompt" };
  _deferredInstall.prompt();
  const choice = await _deferredInstall.userChoice.catch(() => ({ outcome: "dismissed" }));
  _deferredInstall = null;
  return { ok: choice.outcome === "accepted", outcome: choice.outcome };
}

/**
 * Demande le stockage persistant. Sur iOS : n'aboutit QUE si les notifications
 * sont accordées. La bonne UX est d'expliquer d'abord (1 phrase), puis d'enchaîner :
 *   1. Notification.requestPermission()
 *   2. navigator.storage.persist()
 * L'appelant décide de l'orchestration UI ; ici on fournit juste les briques.
 */
export async function isPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persisted) {
      return await navigator.storage.persisted();
    }
  } catch { /* noop */ }
  return false;
}

export async function requestPersistentStorage() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return { ok: false, reason: "unsupported" };
    // Idempotent : si déjà accordé, ne redemande pas.
    if (await navigator.storage.persisted()) return { ok: true, already: true };
    try { localStorage.setItem(PERSIST_ASKED_KEY, new Date().toISOString()); } catch {}
    const granted = await navigator.storage.persist();
    return { ok: granted };
  } catch (e) {
    return { ok: false, reason: e?.message || "error" };
  }
}

export async function estimateQuota() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const est = await navigator.storage.estimate();
    return {
      usage: est.usage || 0,
      quota: est.quota || 0,
      percent: est.quota ? Math.round((est.usage || 0) / est.quota * 1000) / 10 : 0,
    };
  } catch { return null; }
}

/**
 * Purge défensive : si l'utilisation dépasse 80 % du quota, purge les
 * snapshots les plus anciens (tour_briefs, cached voice_recordings synced).
 * La file d'envoi (sync_queue pending, message_outbox pending) est INTOUCHABLE.
 */
export async function purgeIfQuotaHigh() {
  const est = await estimateQuota();
  if (!est || est.percent < 80) return { purged: 0, est };
  let purged = 0;
  try {
    // 1. Enregistrements vocaux DÉJÀ synchronisés (peuvent être re-obtenus au besoin)
    const syncedVoice = await db.voice_recordings.where("status").equals("synced").toArray().catch(() => []);
    for (const v of syncedVoice) {
      await db.voice_recordings.delete(v.id);
      purged++;
    }
    // 2. Briefs pré-calculés obsolètes (>7 jours)
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const oldBriefs = await db.tour_briefs
      .filter(b => (b.computed_at || "") < cutoff).toArray().catch(() => []);
    for (const b of oldBriefs) {
      await db.tour_briefs.delete(b.establishment_id);
      purged++;
    }
  } catch { /* silencieux */ }
  return { purged, est };
}

/**
 * Enchaîne — dans un même geste utilisateur — les 3 étapes nécessaires pour que
 * le mode hors-ligne soit robuste sur iOS Safari :
 *   1. Notification.requestPermission()
 *   2. pushManager.subscribe() (via subscribePush)
 *   3. navigator.storage.persist()
 *
 * Sur iOS, storage.persist() ne renvoie true que si l'app est installée en
 * standalone OU si les notifications sont accordées. Cette fonction doit être
 * appelée depuis un handler onClick, jamais silencieusement au boot.
 *
 * Idempotent : rejeu OK, ne redemande rien si déjà accordé.
 * Retour : { notification, push, persist, ready } — chaque champ un booléen.
 */
export async function enableFullOfflineMode() {
  const result = { notification: false, push: false, persist: false, ready: false, reasons: {} };
  // 1. Notification
  if (typeof Notification === "undefined") {
    result.reasons.notification = "unsupported";
  } else if (Notification.permission === "granted") {
    result.notification = true;
  } else if (Notification.permission === "denied") {
    result.reasons.notification = "denied";
  } else {
    try {
      const perm = await Notification.requestPermission();
      result.notification = perm === "granted";
      if (!result.notification) result.reasons.notification = perm;
    } catch (e) {
      result.reasons.notification = e?.message || "error";
    }
  }
  // 2. Push subscription (best-effort, dépend de notif)
  if (result.notification && pushSupported()) {
    try {
      const r = await subscribePush();
      result.push = !!(r && r.ok);
      if (!result.push) result.reasons.push = r?.reason || "error";
    } catch (e) {
      result.reasons.push = e?.message || "error";
    }
  } else if (!pushSupported()) {
    result.reasons.push = "unsupported";
  }
  // 3. Storage persist — après notif (chaîne iOS obligatoire)
  try {
    const p = await requestPersistentStorage();
    result.persist = !!p.ok;
    if (!p.ok) result.reasons.persist = p.reason || "denied";
  } catch (e) {
    result.reasons.persist = e?.message || "error";
  }
  result.ready = result.persist; // Le vrai critère de succès = base non purgeable
  try { localStorage.setItem(OFFLINE_READY_ASKED_KEY, new Date().toISOString()); } catch {}
  return result;
}

/** L'utilisateur a-t-il déjà refusé le bandeau ? */
export function offlineReadyDismissed() {
  try { return localStorage.getItem(OFFLINE_READY_DISMISSED_KEY) === "1"; } catch { return false; }
}
export function dismissOfflineReady() {
  try { localStorage.setItem(OFFLINE_READY_DISMISSED_KEY, "1"); } catch {}
}

/**
 * Faut-il proposer le bandeau « Activer le mode hors-ligne » ?
 * Règle : iOS Safari non-standalone, storage non persistant, non-dismissé.
 * Sur les autres navigateurs, `storage.persist()` fonctionne sans notif,
 * donc pas besoin de bandeau proactif.
 */
export async function shouldPromptOfflineReady() {
  if (offlineReadyDismissed()) return false;
  if (!isIOS()) return false;
  if (isStandalone()) {
    // Déjà installé : persist devrait fonctionner. Vérifions.
    return !(await isPersistentStorage());
  }
  // iOS Safari non-standalone : persist n'aboutit que si notif accordée.
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") {
    return !(await isPersistentStorage());
  }
  return Notification.permission === "default";
}

export async function pwaDiagnostics() {
  const [persisted, quotaEst] = await Promise.all([isPersistentStorage(), estimateQuota()]);
  let notifPerm = "default";
  try { notifPerm = (typeof Notification !== "undefined") ? Notification.permission : "unsupported"; } catch {}
  let pendingCount = 0;
  let messageOutboxCount = 0;
  let snapshotAt = null;
  try {
    const [muts, voice, mout, snap] = await Promise.all([
      db.sync_queue.where("status").equals("pending").count(),
      db.voice_recordings.where("status").equals("pending").count().catch(() => 0),
      db.message_outbox.where("status").equals("pending").count().catch(() => 0),
      db.meta.get("snapshot_at").catch(() => null),
    ]);
    pendingCount = muts + voice + mout;
    messageOutboxCount = mout;
    snapshotAt = snap?.value || null;
  } catch { /* noop */ }
  try { localStorage.setItem(PWA_LAST_CHECK, new Date().toISOString()); } catch {}
  const pushSup = typeof window !== "undefined" && "PushManager" in window && "serviceWorker" in navigator;
  return {
    installed: isStandalone(),
    persistent_storage: persisted,
    notification_permission: notifPerm,
    quota: quotaEst,
    snapshot_at: snapshotAt,
    pending_sync_count: pendingCount,
    message_outbox_count: messageOutboxCount,
    is_ios: isIOS(),
    install_available: installAvailable(),
    push_supported: pushSup,
    // Vraie condition « offline-ready » : storage persistant + push abonné (si supporté).
    // Sur iOS, sans notif accordée, persistent_storage=false → offline_mode_ready=false.
    offline_mode_ready: !!persisted && (!pushSup || notifPerm === "granted"),
  };
}
