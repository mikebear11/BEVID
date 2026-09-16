import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Search, MapPin, ChevronRight, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { db } from "@/lib/db";
import { usePageMeta } from "@/lib/pageMeta";
import { normalize, daysAgo, fuzzyMatch } from "@/lib/mobile";

const DOT = { vert: "#2D5A4C", orange: "#C78B3A", rouge: "#8C2A2A" };

/** Liste clients mobile : source unique = établissements, index local hors ligne (M1 → enrichi en M2). */
export default function MobileClients() {
  usePageMeta({ title: "Clients · BEVID" });
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  const [items, setItems] = useState(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    (async () => {
      let list = [];
      try { const { data } = await api.get("/establishments"); list = data; db.establishments.bulkPut(data).catch(() => {}); }
      catch { list = await db.establishments.toArray().catch(() => []); }
      setOffline(!navigator.onLine);
      // Prospects créés hors ligne, pas encore synchronisés → visibles immédiatement
      const pending = await db.establishments.filter((e) => e._pending === true).toArray().catch(() => []);
      const ids = new Set(list.map((e) => e.id));
      setItems([...pending.filter((p) => !ids.has(p.id)), ...list]);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    const nq = normalize(q);
    if (nq.length < 2) return items;
    return items.filter((e) => fuzzyMatch(q, `${e.name} ${e.city || ""} ${e.contact_name || ""} ${e.phone || ""}`));
  }, [q, items]);

  return (
    <div className="space-y-3" data-testid="mobile-clients-page">
      <h1 className="font-display text-3xl">Clients {items && <span className="text-stone-500 text-xl">({items.length})</span>}</h1>
      <div className="relative">
        <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" aria-hidden="true" />
        <label htmlFor="mclients-search" className="sr-only">Rechercher un client</label>
        <input id="mclients-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Client, ville, contact, téléphone…"
          enterKeyHint="search" autoComplete="off" className="input-crm w-full pl-11 min-h-[56px] text-base" data-testid="mclients-search" />
      </div>
      {offline && <p className="text-sm text-[#C78B3A]" data-testid="mclients-offline">Hors ligne — liste locale</p>}
      {items === null && <p className="text-base text-stone-600">Chargement…</p>}
      <div className="space-y-2">
        {filtered.map((e) => (
          <Link key={e.id} to={`/etab/${e.id}`} data-testid={`mclient-${e.id}`}
            className="flex items-center gap-3 min-h-[64px] px-3 py-2 rounded-xl border border-stone-200 bg-white active:bg-stone-100">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: e._pending ? "#C78B3A" : (DOT[e.credit_status] || "#8A8A8A") }} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold truncate">{e.name}{e._pending && <span className="ml-2 text-xs font-medium text-[#C78B3A]" data-testid={`pending-${e.id}`}>À synchroniser</span>}</p>
              <p className="text-sm text-stone-700 truncate flex items-center gap-1"><MapPin size={14} aria-hidden="true" /> {e.city || "—"} · {e.type}{daysAgo(e.last_visit_at) != null ? ` · visite il y a ${daysAgo(e.last_visit_at)} j` : ""}</p>
            </div>
            <ChevronRight size={20} className="text-stone-400 shrink-0" aria-hidden="true" />
          </Link>
        ))}
      </div>
      {items && filtered.length === 0 && (
        <button type="button" onClick={() => nav(`/etab/new?name=${encodeURIComponent(q.trim())}`)} className="btn-primary w-full min-h-[56px] text-base flex items-center justify-center gap-2" data-testid="mclients-create">
          <UserPlus size={20} aria-hidden="true" /> {q.trim().length >= 2 ? `Créer « ${q.trim()} »` : "Nouveau prospect"}
        </button>
      )}
    </div>
  );
}
