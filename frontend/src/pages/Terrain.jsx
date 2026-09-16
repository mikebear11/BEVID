import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, MapPin, Clock, Route as RouteIcon, Navigation, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { usePageMeta } from "@/lib/pageMeta";
import { getRecents, getPosition, normalize, formatDistance, daysAgo, fuzzyMatch } from "@/lib/mobile";

const BADGE = {
  impaye: "bg-[#8C2A2A] text-white", relance: "bg-[#C78B3A] text-white", fut: "bg-[#4A154B] text-white", rupture: "bg-[#2D5A4C] text-white",
};

function EtabRow({ e, testId }) {
  const d = daysAgo(e.last_visit_at);
  return (
    <Link to={`/etab/${e.id}`} data-testid={testId}
      className="block min-h-[64px] px-3 py-2 rounded-xl border border-stone-200 bg-white active:bg-stone-100">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold truncate">{e.name}</p>
          <p className="text-sm text-stone-700 truncate">
            {e.city || "—"}{e.distance_m != null && <> · <span className="font-medium">{formatDistance(e.distance_m)}</span></>}
            {d != null && <> · visite il y a {d} j</>}
          </p>
        </div>
        <ChevronRight size={20} className="text-stone-400 shrink-0" aria-hidden="true" />
      </div>
      {(e.badges?.length > 0) && (
        <div className="flex flex-wrap gap-1 mt-1">
          {e.badges.map((b) => <span key={b.key} className={`text-xs font-medium px-2 py-0.5 rounded-full ${BADGE[b.key] || "bg-stone-200"}`}>{b.label}</span>)}
        </div>
      )}
    </Link>
  );
}

export default function Terrain() {
  usePageMeta({ title: "Terrain · BEVID" });
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [sum, setSum] = useState(null);
  const [geo, setGeo] = useState("pending");
  const recents = getRecents();

  useEffect(() => {
    (async () => {
      try { const { data } = await api.get("/establishments"); setItems(data); db.establishments.bulkPut(data).catch(() => {}); }
      catch { setItems(await db.establishments.toArray().catch(() => [])); }
      let pos = null;
      try { pos = await getPosition(); setGeo("ok"); } catch { setGeo("denied"); }
      try {
        const qs = pos ? `?lat=${pos.lat}&lng=${pos.lng}&limit=8` : "";
        const { data } = await api.get(`/terrain/summary${qs}`);
        setSum(data);
        // Rupture probable — uniquement sur les proches, en arrière-plan
        for (const e of data.nearby || []) {
          api.get(`/clients/${e.id}/predicted-runouts`).then((r) => {
            if ((r.data?.predictions || []).length > 0) {
              setSum((s) => s && ({ ...s, nearby: s.nearby.map((x) => x.id === e.id && !x.badges.some((b) => b.key === "rupture")
                ? { ...x, badges: [...x.badges, { key: "rupture", label: "Rupture probable" }] } : x) }));
            }
          }).catch(() => {});
        }
      } catch { setSum({ nearby: [], tour_today: [], tour_total: 0, stats: null, offline: true }); }
    })();
  }, []);

  const results = useMemo(() => {
    const nq = normalize(q);
    if (nq.length < 2) return null;
    return items.filter((e) => fuzzyMatch(q, `${e.name} ${e.city || ""} ${e.contact_name || ""} ${e.phone || ""}`)).slice(0, 10);
  }, [q, items]);

  const s = sum?.stats;
  return (
    <div className="space-y-5" data-testid="terrain-page">
      <div>
        <div className="relative">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" aria-hidden="true" />
          <label htmlFor="terrain-search" className="sr-only">Rechercher un client</label>
          <input id="terrain-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Client, ville, contact, téléphone…"
            enterKeyHint="search" autoComplete="off" className="input-crm w-full pl-11 min-h-[56px] text-base shadow-sm" data-testid="terrain-search" />
        </div>
      </div>

      {results && (
        <section className="space-y-2" data-testid="terrain-results">
          {results.map((e) => <EtabRow key={e.id} e={e} testId={`result-${e.id}`} />)}
          {results.length === 0 && (
            <button type="button" onClick={() => nav(`/etab/new?name=${encodeURIComponent(q.trim())}`)} className="btn-primary w-full min-h-[56px] text-base" data-testid="create-from-search">
              Créer « {q.trim()} »
            </button>
          )}
        </section>
      )}

      {!results && (
        <>
          <h1 className="font-display text-3xl">Bonjour, {user?.name?.split(" ")[0] || ""}</h1>
          {s && (
            <p className="text-base text-stone-800" data-testid="terrain-stats">
              Aujourd'hui <strong>{s.ca_today.toLocaleString("fr-FR")} €</strong> · Mois <strong>{s.ca_month.toLocaleString("fr-FR")} €</strong>
              {s.target_month > 0 && <> / {s.target_month.toLocaleString("fr-FR")} € ({Math.round((s.ca_month / s.target_month) * 100)} %)</>}
            </p>
          )}

          <section data-testid="terrain-nearby">
            <h2 className="overline mb-2 flex items-center gap-1"><Navigation size={14} aria-hidden="true" /> Près de moi</h2>
            {geo === "pending" && <p className="text-base text-stone-600">Localisation…</p>}
            {geo === "denied" && <p className="text-base text-stone-600" data-testid="geo-denied">Position indisponible — autorisez la localisation pour voir les clients proches.</p>}
            {geo === "ok" && sum && sum.nearby.length === 0 && <p className="text-base text-stone-600">Aucun client géolocalisé à proximité.</p>}
            <div className="space-y-2">{(sum?.nearby || []).map((e) => <EtabRow key={e.id} e={e} testId={`near-${e.id}`} />)}</div>
          </section>

          <section data-testid="terrain-tour">
            <h2 className="overline mb-2 flex items-center gap-1"><RouteIcon size={14} aria-hidden="true" /> Ma tournée du jour {sum && sum.tour_total > 0 && `· ${sum.tour_today.length}/${sum.tour_total} restants`}</h2>
            {sum && sum.tour_total === 0 && (
              <div className="space-y-2">
                <p className="text-base text-stone-600">Aucune tournée planifiée aujourd'hui.</p>
                <Link to="/tournee" className="inline-flex items-center min-h-[48px] px-4 rounded-xl border border-stone-300 text-base font-medium" data-testid="terrain-see-portfolio">Voir mon portefeuille</Link>
              </div>
            )}
            <div className="space-y-2">{(sum?.tour_today || []).map((e) => <EtabRow key={e.id} e={e} testId={`tour-${e.id}`} />)}</div>
          </section>

          {recents.length > 0 && (
            <section data-testid="terrain-recents">
              <h2 className="overline mb-2 flex items-center gap-1"><Clock size={14} aria-hidden="true" /> Récents</h2>
              <div className="space-y-2">{recents.map((e) => <EtabRow key={e.id} e={e} testId={`recent-${e.id}`} />)}</div>
            </section>
          )}
          {items.length === 0 && sum && (
            <p className="text-base text-stone-600 flex items-center gap-1" data-testid="terrain-empty"><MapPin size={16} aria-hidden="true" /> Aucun client. Touchez « + » pour créer votre premier prospect.</p>
          )}
        </>
      )}
    </div>
  );
}
