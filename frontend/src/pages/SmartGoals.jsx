import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Sparkles, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

const KPI_LABEL = { ca: "CA (€)", orders: "Commandes", new_clients: "Nouveaux clients", visits: "Visites" };

export default function SmartGoals() {
  const { user } = useAuth();
  const [agents, setAgents] = useState([]);
  const [agentId, setAgentId] = useState("");
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!agentId) return;
    const { data } = await api.get(`/goals/smart?agent_id=${agentId}`);
    setGoals(data);
  };
  useEffect(() => { api.get("/agents").then(r => { setAgents(r.data); if (r.data[0]) setAgentId(r.data[0].id); }); }, []);
  useEffect(() => { load(); }, [agentId]);

  const suggest = async () => {
    setLoading(true);
    try { await api.post(`/goals/smart/suggest/${agentId}`); await load(); toast.success(t("toast.3_objectifs_proposes_par_l_ia")); }
    catch { toast.error(t("toast.erreur_ia")); }
    finally { setLoading(false); }
  };

  const review = async (gid, status) => {
    try { await api.put(`/goals/smart/${gid}`, { status }); await load(); toast.success(status === "approved" ? "Validé" : "Rejeté"); }
    catch(e) { toast.error(e.response?.data?.detail || t("toast.erreur")); }
  };

  const editTarget = async (gid, val) => {
    if (!val) return;
    await api.put(`/goals/smart/${gid}`, { target_value: parseFloat(val) });
    load();
  };

  const isMgr = user?.role === "manager";

  return (
    <div className="space-y-6" data-testid="smart-goals-page">
      <div>
        <p className="overline">Objectifs SMART · IA</p>
        <h1 className="font-display text-4xl">Objectifs propositions</h1>
        <p className="text-sm text-stone-500 mt-1">L'IA propose, {isMgr ? "vous validez" : "le manager valide"}.</p>
      </div>

      <div className="card-crm p-4 flex gap-3 items-end flex-wrap">
        <div><label className="overline">Commercial</label><select value={agentId} onChange={e => setAgentId(e.target.value)} className="input-crm mt-1" data-testid="sg-agent">{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <button onClick={suggest} disabled={loading} className="btn-primary flex items-center gap-2" data-testid="sg-suggest">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Générer 3 objectifs IA
        </button>
      </div>

      {goals.length === 0 && <p className="text-stone-500 text-sm">Aucune proposition. Cliquez sur "Générer".</p>}
      <div className="space-y-3">
        {goals.map(g => {
          const color = g.status === "approved" ? "#2D5A4C" : g.status === "rejected" ? "#8C2A2A" : "#C78B3A";
          return (
            <div key={g.id} className="card-crm p-5 border-l-4" style={{ borderColor: color }} data-testid={`goal-${g.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="overline">{g.month.toString().padStart(2,'0')}/{g.year} · {KPI_LABEL[g.kpi_type] || g.kpi_type}</p>
                    <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color }}>{g.status}</span>
                  </div>
                  <h3 className="font-display text-lg mt-1">{g.title}</h3>
                  <p className="text-xs text-stone-500 mt-1">💡 {g.rationale}</p>
                </div>
                <div className="text-right">
                  <p className="overline">Cible</p>
                  {isMgr && g.status === "pending" ? (
                    <input type="number" defaultValue={g.target_value} onBlur={e => editTarget(g.id, e.target.value)} className="input-crm mt-1 w-24 text-right text-sm" data-testid={`target-${g.id}`} />
                  ) : (
                    <p className="font-display text-2xl" style={{ color }}>{g.target_value.toLocaleString('fr-FR')}</p>
                  )}
                </div>
              </div>
              {isMgr && g.status === "pending" && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-stone-100">
                  <button onClick={() => review(g.id, "approved")} className="flex-1 py-2 rounded-lg bg-[#2D5A4C] text-white text-sm flex items-center justify-center gap-1" data-testid={`approve-${g.id}`}><Check size={14} /> Valider</button>
                  <button onClick={() => review(g.id, "rejected")} className="flex-1 py-2 rounded-lg bg-stone-200 text-stone-700 text-sm flex items-center justify-center gap-1" data-testid={`reject-${g.id}`}><X size={14} /> Rejeter</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
