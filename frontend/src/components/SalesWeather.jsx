import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { CloudLightning } from "lucide-react";

export default function SalesWeather() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/forecast/sales?days=30").then(r => setItems(r.data)).catch(() => {}); }, []);
  if (items.length === 0) return null;

  return (
    <div className="card-crm p-6" data-testid="weather-widget">
      <div className="flex items-center gap-2 mb-4">
        <CloudLightning size={18} className="text-[#4A154B]" />
        <h3 className="font-display text-xl">Météo des ventes · 30j</h3>
        <span className="overline ml-auto">Prévisions</span>
      </div>
      <div className="space-y-4">
        {items.slice(0, 6).map(a => (
          <div key={a.agent_id} className="flex items-center gap-4" data-testid={`forecast-${a.agent_id}`}>
            <div className="w-32 flex-shrink-0">
              <div className="text-sm font-medium">{a.agent_name}</div>
              <div className="text-xs text-stone-500">{a.history_orders} cmd sur 90j</div>
            </div>
            <div className="flex-1 h-12">
              <ResponsiveContainer>
                <LineChart data={a.chart}>
                  <Tooltip contentStyle={{ fontSize: 11, border: '1px solid #E7E4DF', borderRadius: 6, padding: '4px 8px' }} formatter={(v) => `${v}€`} labelStyle={{fontSize: 10}} />
                  <Line type="monotone" dataKey="value" stroke="#4A154B" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="text-right w-32">
              <div className="font-display text-lg text-[#2D5A4C]">{a.forecast_total.toLocaleString('fr-FR', {maximumFractionDigits:0})} €</div>
              <div className="text-xs text-stone-500">~ {a.daily_avg.toLocaleString('fr-FR', {maximumFractionDigits:0})}€/jour</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
