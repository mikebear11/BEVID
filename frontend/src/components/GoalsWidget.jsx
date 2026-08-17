import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Target, Plus } from "lucide-react";
import { toast } from "sonner";

export default function GoalsWidget() {
  const [progress, setProgress] = useState([]);
  const [agents, setAgents] = useState([]);
  const [show, setShow] = useState(false);
  const now = new Date();
  const [form, setForm] = useState({ agent_id: "", target_ca: 5000, year: now.getFullYear(), month: now.getMonth() + 1 });

  const load = async () => {
    const [{ data: p }, { data: a }] = await Promise.all([api.get("/goals/progress"), api.get("/agents")]);
    setProgress(p); setAgents(a);
    if (a[0]) setForm(f => ({ ...f, agent_id: f.agent_id || a[0].id }));
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    await api.post("/goals", { ...form, target_ca: parseFloat(form.target_ca) });
    toast.success("Objectif fixé");
    setShow(false); load();
  };

  return (
    <div className="card-crm p-6" data-testid="goals-widget">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Target size={18} className="text-[#4A154B]" /><h3 className="font-display text-xl">Objectifs du mois</h3></div>
        <button onClick={() => setShow(true)} className="text-xs text-[#4A154B] flex items-center gap-1" data-testid="add-goal-btn"><Plus size={12} /> Fixer</button>
      </div>
      <div className="space-y-3">
        {progress.length === 0 && <p className="text-sm text-stone-500">Aucun objectif fixé ce mois-ci</p>}
        {progress.map(p => {
          const pct = Math.min(p.pct, 100);
          const color = p.pct >= 100 ? "#2D5A4C" : p.pct >= 60 ? "#C78B3A" : "#8C2A2A";
          return (
            <div key={p.agent_id} data-testid={`goal-${p.agent_id}`}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium">{p.agent_name}</span>
                <span style={{ color }}>{p.current_ca.toLocaleString('fr-FR')} / {p.target_ca.toLocaleString('fr-FR')} € · {p.pct}%</span>
              </div>
              <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                <div style={{ width: `${pct}%`, background: color, transition: "width 0.6s ease" }} className="h-full" />
              </div>
            </div>
          );
        })}
      </div>

      {show && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShow(false)}>
          <form onSubmit={submit} onClick={e=>e.stopPropagation()} className="bg-white rounded-2xl border border-stone-200 max-w-md w-full p-6 space-y-3" data-testid="goal-modal">
            <h3 className="font-display text-2xl">Objectif mensuel</h3>
            <div><label className="text-xs">Commercial</label><select value={form.agent_id} onChange={e => setForm({ ...form, agent_id: e.target.value })} className="input-crm mt-1" data-testid="goal-agent">{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs">Mois</label><select value={form.month} onChange={e => setForm({ ...form, month: parseInt(e.target.value) })} className="input-crm mt-1">{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{new Date(2000,i,1).toLocaleDateString('fr-FR',{month:'long'})}</option>)}</select></div>
              <div><label className="text-xs">Année</label><input type="number" value={form.year} onChange={e => setForm({ ...form, year: parseInt(e.target.value) })} className="input-crm mt-1" /></div>
            </div>
            <div><label className="text-xs">Objectif CA (€)</label><input type="number" required value={form.target_ca} onChange={e => setForm({ ...form, target_ca: e.target.value })} className="input-crm mt-1" data-testid="goal-target" /></div>
            <div className="flex gap-2 justify-end pt-2"><button type="button" onClick={() => setShow(false)} className="btn-ghost">Annuler</button><button className="btn-primary" data-testid="goal-submit">Enregistrer</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
