import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";
import { TrendingDown, TrendingUp, AlertTriangle, RefreshCw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

export default function Paiements() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [dso, setDso] = useState(null);
  const [bad, setBad] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [d, b] = await Promise.all([
        api.get("/payments/dso?months=12"),
        api.get("/payments/bad-payers?limit=20"),
      ]);
      setDso(d.data); setBad(b.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const recompute = async () => {
    setRecomputing(true);
    try {
      const { data } = await api.post("/establishments/recompute-status");
      toast.success(`${data.updated} statuts recalculés`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    } finally { setRecomputing(false); }
  };

  if (user?.role !== "manager") {
    return <div className="p-8 text-stone-500">Réservé au manager (données de pilotage).</div>;
  }
  if (loading) return <div className="p-8 text-stone-500">{t("loading")}</div>;

  const trendUp = dso && dso.trend > 0;

  return (
    <div className="space-y-6" data-testid="paiements-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="overline">Pilotage</p>
          <h2 className="font-display text-3xl mt-1">{t("payments")}</h2>
        </div>
        <button onClick={recompute} disabled={recomputing} className="btn-ghost flex items-center gap-2 min-h-[44px]" data-testid="recompute-btn">
          <RefreshCw size={16} className={recomputing ? "animate-spin" : ""} /> Recalculer statuts
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-stone-200" data-testid="kpi-dso">
          <p className="overline">{t("dso")}</p>
          <p className="font-display text-4xl mt-1">{dso?.current_dso ?? 0} <span className="text-lg text-stone-500">{t("days")}</span></p>
          <p className={`text-sm mt-2 flex items-center gap-1 ${trendUp ? "text-red-600" : "text-emerald-600"}`}>
            {trendUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {dso?.trend > 0 ? "+" : ""}{dso?.trend} vs mois précédent
          </p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-stone-200">
          <p className="overline">Retards actifs</p>
          <p className="font-display text-4xl mt-1">{bad.length}</p>
          <p className="text-sm text-stone-500 mt-2">Clients avec au moins 1 retard ou impayé</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-stone-200">
          <p className="overline">Total montant en retard</p>
          <p className="font-display text-4xl mt-1">{bad.reduce((s, x) => s + (x.overdue_amount || 0), 0).toFixed(0)} €</p>
        </div>
      </div>

      {/* DSO Chart */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200">
        <h3 className="font-medium mb-4">{t("dso_evolution")}</h3>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={dso?.chart || []}>
              <CartesianGrid stroke="#E7E4DF" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="#888" fontSize={11} />
              <YAxis stroke="#888" fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="dso" stroke="#4A154B" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bad payers ranking */}
      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
        <div className="p-5 border-b border-stone-100">
          <h3 className="font-medium flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600" />
            {t("bad_payers")} ({bad.length})
          </h3>
          <p className="text-xs text-stone-500 mt-1">Score composite : retard moyen + ancienneté + montant en retard</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-stone-50">
            <tr className="text-left text-stone-500 text-xs">
              <th className="p-3">Client</th>
              <th className="p-3">{t("payment_terms")}</th>
              <th className="p-3">{t("actual_delay")}</th>
              <th className="p-3">{t("gap")}</th>
              <th className="p-3">{t("overdue_amount")}</th>
              <th className="p-3">{t("overdue_age")}</th>
              <th className="p-3">Score</th>
            </tr>
          </thead>
          <tbody>
            {bad.map(b => {
              const gap = b.avg_paid_delay_vs_due;
              const gapClass = gap == null ? "text-stone-400" : gap > 15 ? "text-red-600 font-bold" : gap > 0 ? "text-amber-600" : "text-emerald-600";
              return (
                <tr key={b.client_id} className="border-t border-stone-100" data-testid={`bad-payer-${b.client_id}`}>
                  <td className="p-3 font-medium">{b.name}</td>
                  <td className="p-3 text-stone-600">{b.payment_terms_days}j</td>
                  <td className="p-3 text-stone-600">{gap == null ? "—" : `${gap > 0 ? "+" : ""}${gap}j`}</td>
                  <td className={`p-3 ${gapClass}`}>{gap == null ? "—" : `${gap > 0 ? "+" : ""}${gap}j`}</td>
                  <td className="p-3 font-medium">{b.overdue_amount.toFixed(2)} €</td>
                  <td className="p-3">{b.overdue_oldest_days}j</td>
                  <td className="p-3">
                    <span className="badge badge-vip">{b.score}</span>
                  </td>
                </tr>
              );
            })}
            {bad.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-stone-400">Aucun retard — bravo 🎉</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
