import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { Search, MapPin, Clock, ArrowUpDown } from "lucide-react";
import EngagementsWidget from "@/components/EngagementsWidget";
import WeeklyReviewCard from "@/components/WeeklyReviewCard";

const CREDIT_DOT = { vert: "#2D5A4C", orange: "#C78B3A", rouge: "#8C2A2A" };

export default function Tournee() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [byEtab, setByEtab] = useState({});  // etab_id → { predictions, min_days_until_out }
  const [sortByRunout, setSortByRunout] = useState(false);

  useEffect(() => { api.get("/establishments").then(r => setItems(r.data)); }, []);

  // Charge les prédictions par lot en arrière-plan — chaque échec est silencieux
  // pour ne jamais bloquer l'affichage de la tournée.
  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = {};
      // Sérialisation légère (5 par 5) pour ne pas saturer la connexion terrain.
      for (let i = 0; i < items.length && !cancelled; i += 5) {
        const chunk = items.slice(i, i + 5);
        await Promise.all(chunk.map(async (e) => {
          const cid = e.client_id || e.id;  // establishment peut porter client_id
          if (!cid) return;
          try {
            const { data } = await api.get(`/clients/${cid}/predicted-runouts`);
            const preds = data?.predictions || [];
            if (preds.length > 0) {
              results[e.id] = {
                predictions: preds,
                min_days_until_out: Math.min(...preds.map(p => p.days_until_out)),
              };
            }
          } catch { /* silencieux */ }
        }));
        if (!cancelled) setByEtab(prev => ({ ...prev, ...results }));
      }
    })();
    return () => { cancelled = true; };
  }, [items]);

  const filtered = items.filter(e => (e.name + " " + (e.city||"")).toLowerCase().includes(q.toLowerCase()));

  // Tri optionnel : quand activé, remonte les établissements bientôt en rupture,
  // sans jamais réorganiser d'autorité. Le commercial garde la main.
  const sorted = sortByRunout
    ? [...filtered].sort((a, b) => {
        const ma = byEtab[a.id]?.min_days_until_out;
        const mb = byEtab[b.id]?.min_days_until_out;
        if (ma == null && mb == null) return 0;
        if (ma == null) return 1;
        if (mb == null) return -1;
        return ma - mb;
      })
    : filtered;

  return (
    <div className="space-y-4" data-testid="tournee-page">
      <div><p className="overline">Mon portefeuille</p><h1 className="font-display text-4xl">Ma tournée</h1></div>
      <WeeklyReviewCard />
      <EngagementsWidget />
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"/>
        <input value={q} onChange={ev=>setQ(ev.target.value)} placeholder="Nom, ville, enseigne…" className="input-crm pl-9 min-h-[48px]" data-testid="tournee-search" autoFocus/>
      </div>
      {Object.keys(byEtab).length > 0 && (
        <button
          type="button"
          onClick={() => setSortByRunout(s => !s)}
          className={`text-xs flex items-center gap-1 ${sortByRunout ? "text-[#4A154B] font-medium" : "text-stone-500"}`}
          data-testid="tournee-sort-runout"
        >
          <ArrowUpDown size={12} />
          {sortByRunout ? "Ordre naturel" : "Trier : bientôt en rupture"}
        </button>
      )}
      <div className="space-y-2">
        {sorted.length === 0 && <p className="text-stone-500 text-sm">Aucun établissement</p>}
        {sorted.map(e => {
          const info = byEtab[e.id];
          const firstPred = info?.predictions?.[0];
          return (
            <Link key={e.id} to={`/etab/${e.id}`} className="card-crm p-4 flex items-start gap-3 min-h-[48px]" data-testid={`etab-${e.id}`}>
              <span className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5" style={{background: CREDIT_DOT[e.credit_status]}}/>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium text-sm truncate">{e.name}</div>
                  {e.current_credit > 0 && <div className="text-xs font-medium shrink-0" style={{color: CREDIT_DOT[e.credit_status]}}>{e.current_credit.toLocaleString('fr-FR')}€</div>}
                </div>
                <div className="text-xs text-stone-500 flex items-center gap-1 mt-0.5"><MapPin size={10}/> {e.city || "—"} · {e.type}</div>
                {firstPred && (
                  <div className="text-[12px] text-stone-700 mt-1.5 flex items-start gap-1.5 leading-snug" data-testid={`runout-hint-${e.id}`}>
                    <Clock size={11} className="text-stone-400 shrink-0 mt-0.5" />
                    <span>{firstPred.explanation}</span>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
