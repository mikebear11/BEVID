import Dexie from "dexie";

/**
 * Base locale BEVID pour mode déconnecté.
 * Deux usages :
 *  1. Cache lecture (établissements, produits) — rechargé au login via /api/sync/bootstrap
 *  2. File d'attente de mutations (`sync_queue`) rejouée automatiquement quand la connexion revient
 */
export const db = new Dexie("bevid_offline");
db.version(1).stores({
  establishments: "id, name, credit_status, assigned_to",
  products: "id, name, category, sku",
  sync_queue: "++id, at, url, method, status, tries",
  meta: "key",
});

export async function saveSnapshot(snapshot) {
  await db.transaction("rw", db.establishments, db.products, db.meta, async () => {
    await db.establishments.clear();
    await db.products.clear();
    if (snapshot.establishments) await db.establishments.bulkPut(snapshot.establishments);
    if (snapshot.products) await db.products.bulkPut(snapshot.products);
    await db.meta.put({ key: "snapshot_at", value: snapshot.snapshot_at });
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

export async function pendingCount() {
  return db.sync_queue.where("status").equals("pending").count();
}
