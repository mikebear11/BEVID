import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { AlertCircle, Clock, ChevronRight } from "lucide-react";
import PuceEtat from "@/components/system/PuceEtat";

const PRIO_COLOR = { high: "#8C2A2A", medium: "#C78B3A", low: "#5C5C5C" };
const PRIO_LABEL = { high: "Urgent", medium: "À suivre", low: "Info" };

export default function FollowUpsWidget() {
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    api.get("/alerts/follow-ups").then(r => { setItems(r.data.items); setCount(r.data.count); }).catch(() => {});
  }, []);

  return (
    <div className="card-crm p-6" data-testid="followups-widget">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertCircle size={18} className="text-[#4A154B]" />
          <h2 className="font-display text-xl">À relancer</h2>
        </div>
        <span className="ml-auto"><PuceEtat etat="info" variante="douce" libelle={String(count)} /></span>
      </div>
      {items.length === 0 && <p className="text-sm text-stone-500">Aucune relance nécessaire. Excellent travail !</p>}
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {items.slice(0, 8).map(a => (
          <Link key={a.client_id} to={`/clients/${a.client_id}`}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-50 border-l-2"
            style={{ borderColor: PRIO_COLOR[a.priority] }}
            data-testid={`followup-${a.client_id}`}>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-stone-800 truncate">{a.client_name}</div>
              <div className="text-xs text-stone-500 flex items-center gap-2">
                <Clock size={10} />
                <span>{a.reason}</span>
              </div>
            </div>
            <span className="text-xs uppercase tracking-wider font-medium" style={{ color: PRIO_COLOR[a.priority] }}>{PRIO_LABEL[a.priority]}</span>
            <ChevronRight size={14} className="text-stone-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}
