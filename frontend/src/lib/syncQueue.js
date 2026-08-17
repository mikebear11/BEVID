import { db, pendingCount } from "./db";
import { api } from "./api";

/**
 * Sync queue : rejoue les mutations enfilées quand la connexion revient.
 * Conflict resolution : SERVER WINS. Si le serveur renvoie 409, l'entrée est marquée `conflict`.
 * Idempotence côté serveur assumée (les endpoints POST /visits, /orders acceptent un `client_uuid`).
 */
let flushing = false;

export async function flushQueue({ onProgress } = {}) {
  if (flushing || typeof navigator !== "undefined" && !navigator.onLine) return { flushed: 0 };
  flushing = true;
  let flushed = 0, failed = 0, conflict = 0;
  try {
    const items = await db.sync_queue.where("status").equals("pending").toArray();
    for (const it of items) {
      try {
        await api.request({ url: it.url, method: it.method || "POST", data: it.data });
        await db.sync_queue.update(it.id, { status: "synced", synced_at: new Date().toISOString() });
        flushed++;
      } catch (err) {
        const status = err?.response?.status;
        const tries = (it.tries || 0) + 1;
        if (status === 409) {
          await db.sync_queue.update(it.id, { status: "conflict", tries, last_error: err.response?.data?.detail || "conflict" });
          conflict++;
        } else if (tries >= 5) {
          await db.sync_queue.update(it.id, { status: "failed", tries, last_error: err.message });
          failed++;
        } else {
          await db.sync_queue.update(it.id, { tries, last_error: err.message });
          break; // stop et réessaiera au prochain online
        }
      }
      onProgress?.({ flushed, failed, conflict });
    }
  } finally {
    flushing = false;
    // maj compteur global
    try { window.__SYNC_PENDING__ = await pendingCount(); } catch {}
  }
  return { flushed, failed, conflict };
}

export function startSyncListener() {
  const trigger = () => { flushQueue().catch(() => {}); };
  window.addEventListener("online", trigger);
  // toutes les 60s en background
  const iv = setInterval(trigger, 60000);
  // maj pending count 2x/sec
  const cIv = setInterval(async () => {
    try { window.__SYNC_PENDING__ = await pendingCount(); } catch {}
  }, 2000);
  // premier flush si en ligne au démarrage
  if (typeof navigator !== "undefined" && navigator.onLine) trigger();
  return () => { window.removeEventListener("online", trigger); clearInterval(iv); clearInterval(cIv); };
}
