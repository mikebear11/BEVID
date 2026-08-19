import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Sparkles, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

export default function MonthlyReview() {
  const [agents, setAgents] = useState([]);
  const [agentId, setAgentId] = useState("");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [ai, setAi] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get("/agents").then(r => { setAgents(r.data); if (r.data[0]) setAgentId(r.data[0].id); }); }, []);
  useEffect(() => {
    if (!agentId) return;
    api.get(`/reports/monthly/${agentId}?year=${year}&month=${month}`).then(r => setData(r.data));
    setAi("");
  }, [agentId, year, month]);

  const generateAI = async () => {
    setLoading(true); setAi("");
    try {
      const { data: r } = await api.post(`/reports/monthly/${agentId}/ai-narrative`, { year, month });
      setAi(r.answer);
    } catch { toast.error(t("toast.erreur_ia")); }
    finally { setLoading(false); }
  };

  if (!data) return <div className="text-stone-500">Chargement…</div>;

  const growthColor = data.growth_pct > 0 ? "#2D5A4C" : data.growth_pct < 0 ? "#8C2A2A" : "#5C5C5C";
  const GrowthIcon = data.growth_pct >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="space-y-6" data-testid="monthly-review-page">
      <div><p className="overline">Bilan 1-à-1</p><h1 className="font-display text-4xl">Revue mensuelle</h1></div>

      <div className="card-crm p-4 flex flex-wrap gap-3 items-end">
        <div><label className="overline">Commercial</label><select value={agentId} onChange={e => setAgentId(e.target.value)} className="input-crm mt-1" data-testid="review-agent-select">{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div><label className="overline">Mois</label><select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="input-crm mt-1">{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{new Date(2000,i,1).toLocaleDateString('fr-FR',{month:'long'})}</option>)}</select></div>
        <div><label className="overline">Année</label><input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="input-crm mt-1 w-24" /></div>
        <button onClick={generateAI} disabled={loading} className="btn-primary flex items-center gap-2 ml-auto" data-testid="generate-review-btn">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Générer le brief IA
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-crm p-5"><p className="overline">CA du mois</p><div className="font-display text-3xl text-[#2D5A4C] mt-1">{data.ca.toLocaleString('fr-FR')} €</div>
          {data.growth_pct != null && <div className="text-xs flex items-center gap-1 mt-1" style={{color: growthColor}}><GrowthIcon size={12} /> {data.growth_pct}% vs mois précédent</div>}
        </div>
        <div className="card-crm p-5"><p className="overline">Commandes</p><div className="font-display text-3xl mt-1">{data.orders_count}</div><p className="text-xs text-stone-500 mt-1">Panier moy. {data.avg_basket}€</p></div>
        <div className="card-crm p-5"><p className="overline">Clients touchés</p><div className="font-display text-3xl mt-1">{data.clients_reached}</div><p className="text-xs text-stone-500 mt-1">{data.new_clients} nouveaux</p></div>
        <div className="card-crm p-5"><p className="overline">Activité terrain</p><div className="font-display text-3xl mt-1">{data.visits}</div><p className="text-xs text-stone-500 mt-1">visites · {data.activities} interactions</p></div>
      </div>

      {ai && (
        <div className="card-crm p-6 border-l-4 border-l-[#4A154B]" data-testid="review-ai-content">
          <p className="overline mb-3 flex items-center gap-1"><Sparkles size={12} /> Brief pour la réunion 1-à-1</p>
          <div className="text-sm whitespace-pre-wrap text-stone-800 leading-relaxed">{ai}</div>
        </div>
      )}
    </div>
  );
}
