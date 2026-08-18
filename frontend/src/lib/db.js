import Dexie from "dexie";

/**
 * Base locale BEVID pour mode déconnecté.
 *   1. Cache lecture (établissements, produits)
 *   2. File d'attente de mutations (`sync_queue`)
 *   3. File d'attente d'enregistrements vocaux (`voice_recordings`) — transcription au retour du réseau
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

export async function saveSnapshot(snapshot) {
  await db.transaction("rw", db.establishments, db.products, db.meta, async () => {
    await db.establishments.clear();
    await db.products.clear();
    if (snapshot.establishments) await db.establishments.bulkPut(snapshot.establishments);
    if (snapshot.products) await db.products.bulkPut(snapshot.products);
    await db.meta.put({ key: "snapshot_at", value: snapshot.snapshot_at || new Date().toISOString() });
  });
}

export async function enqueueMutation({ url, method = "POST", data }) {
  return db.sync_queue.add({
    at: new Date().toISOString(),
    url, method, data,
    status: "pending",
    tries: 0,
    last_error: null,
  });
}

export async function enqueueVoiceRecording({ blob, mime, lang = "fr-FR" }) {
  return db.voice_recordings.add({
    at: new Date().toISOString(),
    blob, mime, lang,
    status: "pending", tries: 0, last_error: null, transcript: null,
  });
}

export async function pendingCount() {
  const [muts, voice] = await Promise.all([
    db.sync_queue.where("status").equals("pending").count(),
    db.voice_recordings.where("status").equals("pending").count().catch(() => 0),
  ]);
  return muts + voice;
}
