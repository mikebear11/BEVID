import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Trophy, TrendingUp, TrendingDown } from "lucide-react";

/**
 * Onglet Bilan mensuel dans /reports.
 * S'appuie sur /reports/monthly qui existe déjà côté backend.
 */
export default function MonthlyTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get("/reports/monthly")
      .then(r => setData(r.data))
      .catch(() => setData({ error: true }));
  }, []);

  if (!data) return <p className="text-stone-500 text-sm">Chargement…</p>;
  if (data.error) return (
    <div className="card-crm p-6 text-center" data-testid="monthly-tab-empty">
      <Trophy size={24} className="mx-auto text-stone-300 mb-2" aria-hidden="true" />
      <p className="text-sm text-stone-500">Aucun bilan disponible ce mois-ci.</p>
    </div>
  );

  const currentCa = data.current_month?.ca || 0;
  const prevCa = data.prev_month?.ca || 0;
  const delta = currentCa - prevCa;
  const deltaPct = prevCa > 0 ? ((delta / prevCa) * 100).toFixed(1) : null;

  return (
    <div className="space-y-4" data-testid="monthly-tab">
      <div className="card-crm p-6">
        <div className="flex items-center gap-2 mb-3"><Trophy size={16} className="text-[#4A154B]" aria-hidden="true" /><h3 className="font-display text-lg">Bilan du mois</h3></div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="overline">CA du mois</p>
            <p className="font-display text-3xl mt-1">{currentCa.toLocaleString("fr-FR")} €</p>
          </div>
          <div>
            <p className="overline">Vs mois précédent</p>
            <p className={`font-display text-3xl mt-1 flex items-center gap-2 ${delta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {delta >= 0 ? <TrendingUp size={22} aria-hidden="true" /> : <TrendingDown size={22} aria-hidden="true" />}
              {deltaPct !== null ? `${deltaPct}%` : "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
