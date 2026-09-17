import Dexie from "dexie";

/**
 * Base locale BEVID pour mode déconnecté.
 *   1. Cache lecture (établissements, produits)
 *   2. File d'attente de mutations (`sync_queue`)
 *   3. File d'attente d'enregistrements vocaux (`voice_recordings`)
 *   4. File d'envoi des messages (`message_outbox`) — Lot Travail équipe item 4
 */
export const db = new Dexie("bevid_offline");

db.version(1).stores({
  establishments: "id, name, credit_status, assigned_to",
  products: "id, name, category, sku",
  sync_queue: "++id, at, url, method, status, tries",
  meta: "key",
});

// v2 — ajoute la file d'enregistrements audio pour la dictée en zone blanche
db.version(2).stores({
  establishments: "id, name, credit_status, assigned_to",
  products: "id, name, category, sku",
  sync_queue: "++id, at, url, method, status, tries",
  voice_recordings: "++id, at, lang, status, tries",
  meta: "key",
});

// v3 — Lot 7 étape 3 : briefs pré-calculés pour la tournée du jour (embarquables offline).
db.version(3).stores({
  establishments: "id, name, credit_status, assigned_to",
  products: "id, name, category, sku",
  sync_queue: "++id, at, url, method, status, tries",
  voice_recordings: "++id, at, lang, status, tries",
  tour_briefs: "establishment_id, computed_at",
  meta: "key",
});

// v4 — Lot Travail équipe item 4 : file d'envoi des messages (offline-first),
// horodatage à la rédaction, jamais perdu même app fermée.
db.version(4).stores({
  establishments: "id, name, credit_status, assigned_to",
  products: "id, name, category, sku",
  sync_queue: "++id, at, url, method, status, tries",
  voice_recordings: "++id, at, lang, status, tries",
  tour_briefs: "establishment_id, computed_at",
  message_outbox: "++id, at, object_type, object_id, status, tries",
  meta: "key",
});

export async function saveSnapshot(snapshot) {
  await db.transaction("rw", db.establishments, db.products, db.tour_briefs, db.meta, async () => {
    await db.establishments.clear();
    await db.products.clear();
    if (snapshot.establishments) await db.establishments.bulkPut(snapshot.establishments);
    if (snapshot.products) await db.products.bulkPut(snapshot.products);
    if (Array.isArray(snapshot.tour_briefs)) {
      await db.tour_briefs.clear();
      await db.tour_briefs.bulkPut(snapshot.tour_briefs);
    }
    await db.meta.put({ key: "snapshot_at", value: snapshot.snapshot_at || new Date().toISOString() });
  });
}

export async function getOfflineBrief(establishmentId) {
  try {
    return await db.tour_briefs.get(establishmentId);
  } catch { return null; }
}

export async function enqueueMutation({ url, method = "POST", data }) {
  const item = { at: new Date().toISOString(), url, method, data, status: "pending", tries: 0, last_error: null };
  const id = await db.sync_queue.add(item);
  // Natif : miroir SQLite durable (N4), no-op sur le web
  import("@/lib/nativeStore").then((m) => m.mirrorQueueItem({ ...item, id })).catch(() => {});
  return id;
}

export async function enqueueVoiceRecording({ blob, mime, lang = "fr-FR" }) {
  return db.voice_recordings.add({
    at: new Date().toISOString(),
    blob, mime, lang,
    status: "pending", tries: 0, last_error: null, transcript: null,
  });
}

/**
 * Enqueue d'un message pour envoi différé.
 * L'horodatage `at` est capturé à la RÉDACTION, jamais réécrit.
 */
export async function enqueueMessage(payload) {
  const at = new Date().toISOString();
  return db.message_outbox.add({
    at,
    object_type: payload.object_type,
    object_id: payload.object_id,
    payload: { ...payload, drafted_at: at },
    status: "pending",
    tries: 0,
    last_error: null,
    server_id: null,
  });
}

export async function listOutboxForObject(objectType, objectId) {
  try {
    return await db.message_outbox
      .where({ object_type: objectType, object_id: objectId || "" })
      .toArray();
  } catch { return []; }
}

export async function outboxPendingCount() {
  try {
    return await db.message_outbox.where("status").equals("pending").count();
  } catch { return 0; }
}

export async function pendingCount() {
  const [muts, voice, mout] = await Promise.all([
    db.sync_queue.where("status").equals("pending").count(),
    db.voice_recordings.where("status").equals("pending").count().catch(() => 0),
    db.message_outbox.where("status").equals("pending").count().catch(() => 0),
  ]);
  return muts + voice + mout;
}
