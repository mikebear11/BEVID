import { db, pendingCount } from "./db";
import { api } from "./api";

/**
 * Rejoue les mutations ET les enregistrements audio en attente quand la connexion revient.
 * Conflict resolution : SERVER WINS. 409 → status "conflict". Idempotence côté serveur assumée
 * via les client_uuid transmis par les mutations.
 */
let flushing = false;

async function flushMutations() {
  const items = await db.sync_queue.where("status").equals("pending").toArray();
  let flushed = 0, failed = 0, conflict = 0;
  for (const it of items) {
    try {
      const { data } = await api.request({ url: it.url, method: it.method || "POST", data: it.data });
      await db.sync_queue.update(it.id, { status: "synced", synced_at: new Date().toISOString() });
      // Fiche créée hors ligne : remplace la version locale « à synchroniser » par la version serveur
      if (it.url === "/establishments" && data?.id) {
        try { await db.establishments.put(data); } catch { /* cache local uniquement */ }
      }
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
        break;
      }
    }
  }
  return { flushed, failed, conflict };
}

async function flushVoice() {
  const items = await db.voice_recordings.where("status").equals("pending").toArray().catch(() => []);
  let flushed = 0, failed = 0;
  for (const v of items) {
    try {
      const fd = new FormData();
      const ext = (v.mime || "audio/webm").split("/")[1]?.split(";")[0] || "webm";
      fd.append("audio", v.blob, `recording-${v.id}.${ext}`);
      fd.append("lang", v.lang || "fr-FR");
      fd.append("recorded_at", v.at || "");
      const { data } = await api.post("/voice/transcribe", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await db.voice_recordings.update(v.id, {
        status: "synced",
        transcript: data?.transcript || "",
        synced_at: new Date().toISOString(),
      });
      flushed++;
    } catch (err) {
      const tries = (v.tries || 0) + 1;
      if (tries >= 5) {
        await db.voice_recordings.update(v.id, { status: "failed", tries, last_error: err.message });
        failed++;
      } else {
        await db.voice_recordings.update(v.id, { tries, last_error: err.message });
        break;
      }
    }
  }
  return { flushed, failed };
}

async function flushMessageOutbox() {
  const items = await db.message_outbox.where("status").equals("pending").toArray().catch(() => []);
  let flushed = 0, failed = 0;
  for (const m of items) {
    try {
      const { data } = await api.post("/messages", m.payload);
      await db.message_outbox.update(m.id, {
        status: "synced",
        server_id: data?.id || null,
        synced_at: new Date().toISOString(),
      });
      flushed++;
      // Notifie l'UI qu'un message a été délivré (le fil peut se recharger)
      try { window.dispatchEvent(new CustomEvent("bevid:message-delivered", { detail: { local_id: m.id, server_id: data?.id } })); } catch {}
    } catch (err) {
      const tries = (m.tries || 0) + 1;
      if (tries >= 5) {
        await db.message_outbox.update(m.id, { status: "failed", tries, last_error: err.message });
        failed++;
      } else {
        await db.message_outbox.update(m.id, { tries, last_error: err.message });
        break;
      }
    }
  }
  return { flushed, failed };
}

export async function flushQueue({ onProgress } = {}) {
  if (flushing || (typeof navigator !== "undefined" && !navigator.onLine)) return { flushed: 0 };
  flushing = true;
  let result = { flushed: 0, failed: 0, conflict: 0, voice_flushed: 0, voice_failed: 0, msg_flushed: 0, msg_failed: 0 };
  try {
    const m = await flushMutations();
    const v = await flushVoice();
    const mo = await flushMessageOutbox();
    result = {
      flushed: m.flushed, failed: m.failed, conflict: m.conflict,
      voice_flushed: v.flushed, voice_failed: v.failed,
      msg_flushed: mo.flushed, msg_failed: mo.failed,
    };
    onProgress?.(result);
  } finally {
    flushing = false;
    try { window.__SYNC_PENDING__ = await pendingCount(); } catch {}
  }
  return result;
}

export function startSyncListener() {
  const trigger = () => { flushQueue().catch(() => {}); };
  window.addEventListener("online", trigger);
  const iv = setInterval(trigger, 60000);
  const cIv = setInterval(async () => {
    try { window.__SYNC_PENDING__ = await pendingCount(); } catch {}
  }, 2000);
  if (typeof navigator !== "undefined" && navigator.onLine) trigger();
  return () => { window.removeEventListener("online", trigger); clearInterval(iv); clearInterval(cIv); };
}
