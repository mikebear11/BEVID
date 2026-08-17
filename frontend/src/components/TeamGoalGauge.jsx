import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Target, Users } from "lucide-react";

export default function TeamGoalGauge() {
  const [t, setT] = useState(null);
  useEffect(() => { api.get("/goals/team-progress").then(r => setT(r.data)).catch(() => {}); }, []);
  if (!t || !t.total_target) return null;

  const pct = Math.min(t.pct, 100);
  const color = t.pct >= 100 ? "#2D5A4C" : t.pct >= 70 ? "#C78B3A" : "#4A154B";
  const remaining = Math.max(t.total_target - t.total_current, 0);

  // arc SVG gauge
  const R = 90;
  const circ = Math.PI * R;
  const dash = (pct / 100) * circ;

  return (
    <div className="card-crm p-6 lg:col-span-3 relative overflow-hidden" data-testid="team-goal-gauge">
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-5" style={{ background: color, transform: "translate(30%, -30%)" }} />
      <div className="flex items-center gap-2 mb-4">
        <Users size={18} className="text-[#4A154B]" />
        <h3 className="font-display text-xl">Objectif collectif</h3>
        <span className="overline ml-auto">{t.team_size} commerciaux</span>
      </div>
      <div className="flex flex-col md:flex-row items-center gap-8">
        <div className="relative">
          <svg width={220} height={130} viewBox="0 0 220 130">
            <path d={`M 20 110 A ${R} ${R} 0 0 1 200 110`} fill="none" stroke="#E7E4DF" strokeWidth={14} strokeLinecap="round" />
            <path d={`M 20 110 A ${R} ${R} 0 0 1 200 110`} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`} style={{ transition: "stroke-dasharray 1.2s ease" }} />
            <text x={110} y={100} textAnchor="middle" fontFamily="Playfair Display" fontSize={38} fill={color}>{t.pct}%</text>
          </svg>
        </div>
        <div className="flex-1 space-y-2">
          <div><p className="overline">Réalisé</p><p className="font-display text-3xl text-[#2D5A4C]">{t.total_current.toLocaleString('fr-FR')} €</p></div>
          <div><p className="overline">Objectif</p><p className="font-display text-2xl text-stone-700">{t.total_target.toLocaleString('fr-FR')} €</p></div>
          {remaining > 0 && <div><p className="overline">Reste à faire</p><p className="font-display text-xl" style={{color}}>{remaining.toLocaleString('fr-FR')} €</p></div>}
        </div>
      </div>
    </div>
  );
}
