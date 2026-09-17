/**
 * N4 — Stockage natif SQLite (Capacitor) en miroir durable de Dexie.
 * iOS peut purger IndexedDB après 7 jours sans usage : la file de synchro et l'index clients
 * sont recopiés dans SQLite sur l'appareil, et restaurés dans Dexie au démarrage si celui-ci est vide.
 * Sur le web : no-op (Dexie seul).
 */
import { db } from "@/lib/db";

const isNative = () => window.Capacitor?.isNativePlatform?.() === true;
let conn = null;

async function open() {
  if (conn) return conn;
  const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const exists = (await sqlite.isConnection("bevid", false)).result;
  conn = exists ? await sqlite.retrieveConnection("bevid", false) : await sqlite.createConnection("bevid", false, "no-encryption", 1, false);
  await conn.open();
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS sync_queue (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT);
    CREATE TABLE IF NOT EXISTS establishments (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT);
  `);
  return conn;
}

export async function mirrorQueueItem(item) {
  if (!isNative()) return;
  try {
    const c = await open();
    await c.run("INSERT OR REPLACE INTO sync_queue (id, payload, status, created_at) VALUES (?, ?, ?, ?)",
      [item.id, JSON.stringify(item), item.status || "pending", item.created_at || new Date().toISOString()]);
  } catch { /* SQLite indisponible : Dexie reste la source */ }
}

export async function mirrorQueueStatus(id, status) {
  if (!isNative()) return;
  try { const c = await open(); await c.run("UPDATE sync_queue SET status = ? WHERE id = ?", [status, id]); } catch { /* idem */ }
}

export async function mirrorEstablishments(list) {
  if (!isNative() || !list?.length) return;
  try {
    const c = await open();
    const now = new Date().toISOString();
    await c.executeSet(list.map((e) => ({ statement: "INSERT OR REPLACE INTO establishments (id, payload, updated_at) VALUES (?, ?, ?)", values: [e.id, JSON.stringify(e), now] })));
  } catch { /* idem */ }
}

/** Au démarrage natif : si IndexedDB a été purgé, on restaure depuis SQLite. */
export async function restoreFromSQLite() {
  if (!isNative()) return { restored: false };
  try {
    const c = await open();
    const out = { restored: false, queue: 0, establishments: 0 };
    if ((await db.sync_queue.count()) === 0) {
      const q = await c.query("SELECT payload FROM sync_queue WHERE status = 'pending'");
      const items = (q.values || []).map((r) => JSON.parse(r.payload));
      if (items.length) { await db.sync_queue.bulkPut(items); out.queue = items.length; out.restored = true; }
    }
    if ((await db.establishments.count()) === 0) {
      const q = await c.query("SELECT payload FROM establishments");
      const items = (q.values || []).map((r) => JSON.parse(r.payload));
      if (items.length) { await db.establishments.bulkPut(items); out.establishments = items.length; out.restored = true; }
    }
    return out;
  } catch { return { restored: false }; }
}
