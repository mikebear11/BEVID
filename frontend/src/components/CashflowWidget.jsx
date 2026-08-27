import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Wallet, TrendingUp } from "lucide-react";

export default function CashflowWidget() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/cashflow/forecast?days=60").then(r => setD(r.data)).catch(() => {}); }, []);
  if (!d || d.chart.length === 0) return null;

  return (
    <div className="card-crm p-6 lg:col-span-3" data-testid="cashflow-widget">
      <div className="flex items-center gap-2 mb-4">
        <Wallet size={18} className="text-[#4A154B]" />
        <h3 className="font-display text-xl">Trésorerie · 60 jours</h3>
        <span className="overline ml-auto">Facturé vs encaissé</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div><p className="overline">Facturé</p><p className="font-display text-xl text-stone-700">{d.total_invoiced.toLocaleString('fr-FR')} €</p></div>
        <div><p className="overline">Encaissé</p><p className="font-display text-xl text-[#2D5A4C]">{d.total_collected.toLocaleString('fr-FR')} €</p></div>
        <div><p className="overline">Impayé</p><p className="font-display text-xl text-[#8C2A2A]">{d.outstanding.toLocaleString('fr-FR')} €</p></div>
        <div><p className="overline">Prévision 60j</p><p className="font-display text-xl text-[#4A154B] flex items-center gap-1"><TrendingUp size={14} />{d.forecast_60d.toLocaleString('fr-FR')} €</p></div>
      </div>
      <div className="h-56">
        <ResponsiveContainer>
          <AreaChart data={d.chart}>
            <defs>
              <linearGradient id="fac" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4A154B" stopOpacity={0.4}/><stop offset="100%" stopColor="#4A154B" stopOpacity={0}/></linearGradient>
              <linearGradient id="enc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2D5A4C" stopOpacity={0.5}/><stop offset="100%" stopColor="#2D5A4C" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E4DF" />
            <XAxis dataKey="date" tick={{fontSize: 12}} />
            <YAxis tick={{fontSize: 12}} />
            <Tooltip contentStyle={{fontSize: 12, border: '1px solid #E7E4DF', borderRadius: 6}} />
            <Legend wrapperStyle={{fontSize: 12}} />
            <Area type="monotone" dataKey="facture" name="Facturé" stroke="#4A154B" strokeWidth={2} fill="url(#fac)" />
            <Area type="monotone" dataKey="encaisse" name="Encaissé" stroke="#2D5A4C" strokeWidth={2} fill="url(#enc)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
