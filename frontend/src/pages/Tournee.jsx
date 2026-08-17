import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { Search, MapPin } from "lucide-react";

const CREDIT_DOT = { vert: "#2D5A4C", orange: "#C78B3A", rouge: "#8C2A2A" };

export default function Tournee() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  useEffect(() => { api.get("/establishments").then(r => setItems(r.data)); }, []);
  const filtered = items.filter(e => (e.name + " " + (e.city||"")).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4" data-testid="tournee-page">
      <div><p className="overline">Mon portefeuille</p><h1 className="font-display text-4xl">Ma tournée</h1></div>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"/>
        <input value={q} onChange={ev=>setQ(ev.target.value)} placeholder="Nom, ville, enseigne…" className="input-crm pl-9 min-h-[48px]" data-testid="tournee-search" autoFocus/>
      </div>
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-stone-500 text-sm">Aucun établissement</p>}
        {filtered.map(e => (
          <Link key={e.id} to={`/etab/${e.id}`} className="card-crm p-4 flex items-center gap-3 min-h-[48px]" data-testid={`etab-${e.id}`}>
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{background: CREDIT_DOT[e.credit_status]}}/>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{e.name}</div>
              <div className="text-xs text-stone-500 flex items-center gap-1 mt-0.5"><MapPin size={10}/> {e.city || "—"} · {e.type}</div>
            </div>
            {e.current_credit > 0 && <div className="text-xs font-medium" style={{color: CREDIT_DOT[e.credit_status]}}>{e.current_credit.toLocaleString('fr-FR')}€</div>}
          </Link>
        ))}
      </div>
    </div>
  );
}
