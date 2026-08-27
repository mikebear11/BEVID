import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { TrendingDown, TrendingUp, AlertTriangle, RefreshCw, Bell } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import PuceEtat from "@/components/system/PuceEtat";
import { t } from "@/lib/i18n";
import { usePageMeta } from "@/lib/pageMeta";

export default function Paiements() {
  usePageMeta({ title: `${t("payments")} · BEVID` });
  const { user } = useAuth();
  const [dso, setDso] = useState(null);
  const [bad, setBad] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [d, b, s, al] = await Promise.all([
        api.get("/payments/dso?months=12"),
        api.get("/payments/bad-payers?limit=20"),
        api.get("/org/settings"),
        api.get("/alerts/bad-payers"),
      ]);
      setDso(d.data); setBad(b.data); setSettings(s.data); setAlerts(al.data);
    } catch (err) { toast.error(err.response?.data?.detail || t("toast.erreur")); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const runAction = async (fn, msg) => {
    setBusy(true);
    try { const r = await fn(); toast.success(msg(r.data)); load(); }
    catch (err) { toast.error(err.response?.data?.detail || t("toast.erreur")); }
    finally { setBusy(false); }
  };
  const recompute = () => runAction(() => api.post("/establishments/recompute-status"), d => `${d.updated} statuts recalculés`);
  const scan = () => runAction(() => api.post("/alerts/bad-payers/scan"), d => `${d.new_alerts} nouvelle(s) alerte(s)`);

  const saveThresholds = async () => {
    try {
      await api.put("/org/settings", {
        bad_payer_alert_score_threshold: settings.bad_payer_alert_score_threshold,
        bad_payer_alert_overdue_amount: settings.bad_payer_alert_overdue_amount,
      });
      toast.success(t("toast.seuils_sauvegardes"));
    } catch (err) { toast.error(err.response?.data?.detail || t("toast.erreur")); }
  };
  const dismiss = async (aid) => { await api.post(`/alerts/bad-payers/${aid}/dismiss`); load(); };

  if (user?.role !== "manager") return <div className="p-8 text-stone-500">{t("manager_only")}</div>;
  if (loading || !settings) return <div className="p-8 text-stone-500">{t("loading")}</div>;
  const trendUp = dso && dso.trend > 0;

  return (
    <div className="space-y-6" data-testid="paiements-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="overline">{t("dashboard_overview")}</p>
          <h1 className="font-display text-3xl mt-1">{t("payments")}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={scan} disabled={busy} className="btn-ghost flex items-center gap-2 min-h-[44px]" data-testid="scan-badpayers-btn"><Bell size={16} className={busy ? "animate-pulse" : ""} /> Scanner alertes</button>
          <button onClick={recompute} disabled={busy} className="btn-ghost flex items-center gap-2 min-h-[44px]" data-testid="recompute-btn"><RefreshCw size={16} className={busy ? "animate-spin" : ""} /> Recalculer statuts</button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4" data-testid="active-alerts-block">
          <h2 className="font-medium text-red-900 flex items-center gap-2 mb-3"><Bell size={16} /> Alertes actives ({alerts.length})</h2>
          <div className="space-y-2">
            {alerts.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-white rounded-lg p-3" data-testid={`bp-alert-${a.id}`}>
                <div>
                  <p className="font-medium text-sm">{a.client_name}</p>
                  <p className="text-xs text-stone-500">Score {a.score} · Retard {a.snapshot?.overdue_amount?.toFixed(2)} € · Ancienneté {a.snapshot?.overdue_oldest_days}j</p>
                </div>
                <button onClick={() => dismiss(a.id)} className="text-xs text-stone-500 hover:text-stone-900 min-h-[44px] px-3" data-testid={`dismiss-${a.id}`}>Écarter</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl p-5 border border-stone-200" data-testid="thresholds-block">
        <h2 className="font-medium mb-3">Seuils d'alerte mauvais payeurs</h2>
        <p className="text-xs text-stone-500 mb-4">Un client déclenche une alerte dès qu'il dépasse l'un des seuils. Scan quotidien automatique via cron.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="threshold-score-input" className="text-xs text-stone-600">Score composite</label>
            <input id="threshold-score-input" type="number" min={0} value={settings.bad_payer_alert_score_threshold} onChange={e => setSettings({ ...settings, bad_payer_alert_score_threshold: parseInt(e.target.value) || 0 })} className="input-crm mt-1 min-h-[48px]" data-testid="threshold-score" />
            <p className="text-xs text-stone-500 mt-1">Retard moyen + ancienneté + montant/100 (max 50).</p>
          </div>
          <div>
            <label htmlFor="threshold-amount-input" className="text-xs text-stone-600">Montant en retard (€)</label>
            <input id="threshold-amount-input" type="number" min={0} value={settings.bad_payer_alert_overdue_amount} onChange={e => setSettings({ ...settings, bad_payer_alert_overdue_amount: parseFloat(e.target.value) || 0 })} className="input-crm mt-1 min-h-[48px]" data-testid="threshold-amount" />
            <p className="text-xs text-stone-500 mt-1">Cumul en retard déclenchant l'alerte.</p>
          </div>
        </div>
        <div className="mt-3 flex justify-end"><button onClick={saveThresholds} className="btn-primary min-h-[44px]" data-testid="save-thresholds">Enregistrer</button></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-stone-200" data-testid="kpi-dso">
          <p className="overline">{t("dso")}</p>
          <p className="font-display text-4xl mt-1">{dso?.current_dso ?? 0} <span className="text-lg text-stone-500">{t("days")}</span></p>
          <p className={`text-sm mt-2 flex items-center gap-1 ${trendUp ? "text-red-600" : "text-emerald-600"}`}>{trendUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{dso?.trend > 0 ? "+" : ""}{dso?.trend} vs mois précédent</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-stone-200"><p className="overline">Retards actifs</p><p className="font-display text-4xl mt-1">{bad.length}</p><p className="text-sm text-stone-500 mt-2">Clients avec retard</p></div>
        <div className="bg-white rounded-2xl p-5 border border-stone-200"><p className="overline">Total en retard</p><p className="font-display text-4xl mt-1">{bad.reduce((s, x) => s + (x.overdue_amount || 0), 0).toFixed(0)} €</p></div>
      </div>

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

      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
        <div className="p-5 border-b border-stone-100">
          <h2 className="font-medium flex items-center gap-2"><AlertTriangle size={18} className="text-amber-600" aria-hidden="true" />{t("bad_payers")} ({bad.length})</h2>
          <p className="text-xs text-stone-500 mt-1">{t("bad_payers_help") || "Score composite : retard moyen + ancienneté + montant."}</p>
        </div>
        <div className="overflow-x-auto scroll-shadow">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-stone-50">
              <tr className="text-left text-stone-500 text-xs">
                <th className="p-3 sticky left-0 bg-stone-50 z-10">{t("column.client")}</th><th className="p-3">{t("payment_terms")}</th><th className="p-3">{t("actual_delay")}</th><th className="p-3">{t("overdue_amount")}</th><th className="p-3">{t("overdue_age")}</th><th className="p-3">Score</th>
              </tr>
            </thead>
            <tbody>
              {bad.map(b => {
                const gap = b.avg_paid_delay_vs_due;
                const gc = gap == null ? "text-stone-400" : gap > 15 ? "text-red-600 font-bold" : gap > 0 ? "text-amber-600" : "text-emerald-600";
                return (
                  <tr key={b.client_id} className="border-t border-stone-100" data-testid={`bad-payer-${b.client_id}`}>
                    <td className="p-3 font-medium sticky left-0 bg-white z-10">{b.name}</td>
                    <td className="p-3 text-stone-600">{b.payment_terms_days}j</td>
                    <td className={`p-3 ${gc}`}>{gap == null ? "—" : `${gap > 0 ? "+" : ""}${gap}j`}</td>
                    <td className="p-3 font-medium">{b.overdue_amount.toFixed(2)} €</td>
                    <td className="p-3">{b.overdue_oldest_days}j</td>
                    <td className="p-3"><PuceEtat etat="info" variante="douce" libelle={b.score} /></td>
                  </tr>
                );
              })}
              {bad.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-stone-400">{t("empty.no_late")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
