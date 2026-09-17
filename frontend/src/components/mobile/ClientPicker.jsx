import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { db } from "@/lib/db";
import { MapPin, Clock } from "lucide-react";
import { getRecents, getPosition, normalize, formatDistance, fuzzyMatch } from "@/lib/mobile";

/** Choix du client : proches + récents en premier, recherche dès la 2e lettre, index local si hors ligne. */
export function ClientPicker({ onPick, autoFocus = true }) {
  const [items, setItems] = useState([]);
  const [nearby, setNearby] = useState([]);
  const [q, setQ] = useState("");
  const recents = getRecents();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/establishments");
        setItems(data);
        db.establishments.bulkPut(data).catch(() => {}); import("@/lib/nativeStore").then((m) => m.mirrorEstablishments(data)).catch(() => {});
      } catch {
        setItems(await db.establishments.toArray().catch(() => []));
      }
      try {
        const pos = await getPosition();
        const { data } = await api.get(`/terrain/summary?lat=${pos.lat}&lng=${pos.lng}&limit=5`);
        setNearby(data.nearby || []);
      } catch { /* pas de position ou hors ligne */ }
    })();
  }, []);

  const results = useMemo(() => {
    const nq = normalize(q);
    if (nq.length < 2) return null;
    return items.filter((e) => fuzzyMatch(q, `${e.name} ${e.city || ""} ${e.contact_name || ""} ${e.phone || ""}`)).slice(0, 12);
  }, [q, items]);

  const Row = ({ e, hint, testId }) => (
    <button type="button" onClick={() => onPick(e)} data-testid={testId}
      className="w-full text-left min-h-[56px] px-3 py-2 rounded-xl border border-stone-200 bg-white flex items-center gap-3 active:bg-stone-100">
      <div className="flex-1 min-w-0">
        <p className="text-base font-medium truncate">{e.name}</p>
        <p className="text-sm text-stone-600 flex items-center gap-1 truncate"><MapPin size={14} aria-hidden="true" /> {e.city || "—"}{hint ? ` · ${hint}` : ""}</p>
      </div>
    </button>
  );

  return (
    <div className="space-y-3" data-testid="client-picker">
      <input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, ville, contact, téléphone…"
        enterKeyHint="search" autoComplete="off" aria-label="Rechercher un client"
        className="input-crm w-full min-h-[52px] text-base" data-testid="picker-search" />
      {results ? (
        <div className="space-y-2">
          {results.length === 0 && <p className="text-base text-stone-600 py-2">Aucun client ne correspond.</p>}
          {results.map((e) => <Row key={e.id} e={e} testId={`pick-${e.id}`} />)}
        </div>
      ) : (
        <>
          {nearby.length > 0 && (
            <section>
              <p className="overline mb-1 flex items-center gap-1"><MapPin size={12} aria-hidden="true" /> Près de moi</p>
              <div className="space-y-2">{nearby.map((e) => <Row key={e.id} e={e} hint={formatDistance(e.distance_m)} testId={`pick-near-${e.id}`} />)}</div>
            </section>
          )}
          {recents.length > 0 && (
            <section>
              <p className="overline mb-1 flex items-center gap-1"><Clock size={12} aria-hidden="true" /> Récents</p>
              <div className="space-y-2">{recents.map((e) => <Row key={e.id} e={e} testId={`pick-recent-${e.id}`} />)}</div>
            </section>
          )}
          {nearby.length === 0 && recents.length === 0 && (
            <div className="space-y-2">{items.slice(0, 8).map((e) => <Row key={e.id} e={e} testId={`pick-${e.id}`} />)}</div>
          )}
        </>
      )}
    </div>
  );
}
