import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, X, Sparkles, Loader2 } from "lucide-react";
import { t } from "@/lib/i18n";

const STAGES = [
  { key: "qualification", label: "Qualification", color: "#5C5C5C" },
  { key: "proposition", label: "Proposition", color: "#C78B3A" },
  { key: "negociation", label: "Négociation", color: "#4A154B" },
  { key: "gagne", label: "Gagné", color: "#2D5A4C" },
  { key: "perdu", label: "Perdu", color: "#8C2A2A" },
];

export default function Deals() {
  const [deals, setDeals] = useState([]);
  const [clients, setClients] = useState([]);
  const [dragId, setDragId] = useState(null);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ title: "", client_id: "", amount: 1000, probability: 50, stage: "qualification", expected_close: "", notes: "" });
  const [coaches, setCoaches] = useState({});
  const [coachLoading, setCoachLoading] = useState(null);

  const coach = async (id) => {
    setCoachLoading(id);
    try {
      const { data } = await api.post(`/deals/${id}/ai-coach`);
      setCoaches(prev => ({ ...prev, [id]: data.answer }));
    } catch { toast.error(t("toast.coach_error")); }
    finally { setCoachLoading(null); }
  };

  const load = async () => {
    const [{ data: d }, { data: c }] = await Promise.all([api.get("/deals"), api.get("/clients")]);
    setDeals(d); setClients(c);
  };
  useEffect(() => { load(); }, []);

  const onDrop = async (stage) => {
    if (!dragId) return;
    const d = deals.find(x => x.id === dragId);
    if (!d || d.stage === stage) { setDragId(null); return; }
    setDeals(deals.map(x => x.id === dragId ? { ...x, stage } : x));
    setDragId(null);
    try {
      await api.put(`/deals/${dragId}`, { stage, probability: stage === "gagne" ? 100 : stage === "perdu" ? 0 : d.probability });
      toast.success(t("toast.v1_v2", { v1: d.title, v2: stage }));
    } catch { toast.error(t("toast.erreur")); load(); }
  };

  const submit = async (e) => {
    e.preventDefault();
    await api.post("/deals", { ...form, amount: parseFloat(form.amount), probability: parseInt(form.probability) });
    toast.success(t("toast.deal_created"));
    setShow(false); setForm({ title: "", client_id: "", amount: 1000, probability: 50, stage: "qualification", expected_close: "", notes: "" });
    load();
  };

  const del = async (id) => { await api.delete(`/deals/${id}`); load(); };

  const totalPipeline = deals.filter(d => d.stage !== "perdu" && d.stage !== "gagne").reduce((s, d) => s + d.amount * d.probability / 100, 0);
  const won = deals.filter(d => d.stage === "gagne").reduce((s, d) => s + d.amount, 0);

  return (
    <div className="space-y-6" data-testid="deals-page">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div><p className="overline">Opportunités</p><h1 className="font-display text-4xl">Deals</h1></div>
        <button onClick={() => setShow(true)} className="btn-primary flex items-center gap-2" data-testid="add-deal-btn"><Plus size={16} /> Nouveau deal</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="card-crm p-4"><p className="overline">Deal pondérée</p><div className="font-display text-2xl text-[#4A154B]">{totalPipeline.toLocaleString('fr-FR', {maximumFractionDigits: 0})} €</div></div>
        <div className="card-crm p-4"><p className="overline">Gagné (total)</p><div className="font-display text-2xl text-[#2D5A4C]">{won.toLocaleString('fr-FR', {maximumFractionDigits: 0})} €</div></div>
        <div className="card-crm p-4"><p className="overline">Deals actifs</p><div className="font-display text-2xl">{deals.filter(d => d.stage !== "perdu" && d.stage !== "gagne").length}</div></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 overflow-x-auto">
        {STAGES.map(s => {
          const items = deals.filter(d => d.stage === s.key);
          const total = items.reduce((sum, d) => sum + d.amount, 0);
          return (
            <div key={s.key}
              onDragOver={e => e.preventDefault()}
              onDrop={() => onDrop(s.key)}
              className="bg-white/60 rounded-xl border border-stone-200 p-3 min-h-[400px]"
              data-testid={`stage-${s.key}`}>
              <div className="flex items-center justify-between mb-3 pb-2 border-b" style={{ borderColor: s.color + "40" }}>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: s.color }} /><span className="overline">{s.label}</span></div>
                <span className="text-xs text-stone-500">{items.length} · {total.toLocaleString('fr-FR', {maximumFractionDigits: 0})}€</span>
              </div>
              <div className="space-y-2">
                {items.map(d => (
                  <div key={d.id} draggable onDragStart={() => setDragId(d.id)} onDragEnd={() => setDragId(null)}
                    className={`bg-white border border-stone-200 rounded-lg p-3 cursor-move ${dragId === d.id ? 'opacity-50' : ''}`} data-testid={`deal-${d.id}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{d.title}</div>
                        <div className="text-xs text-stone-500">{d.client_name}</div>
                      </div>
                      <button onClick={() => del(d.id)} className="text-stone-400 hover:text-[#8C2A2A]"><Trash2 size={12} /></button>
                    </div>
                    <div className="flex justify-between items-end mt-2">
                      <span className="font-display text-lg" style={{color: s.color}}>{d.amount.toLocaleString('fr-FR', {maximumFractionDigits: 0})} €</span>
                      <span className="text-xs text-stone-500">{d.probability}%</span>
                    </div>
                    <button onClick={() => coach(d.id)} disabled={coachLoading === d.id} className="w-full mt-2 text-xs text-[#4A154B] flex items-center justify-center gap-1 py-1 border-t border-stone-100 pt-1.5 hover:bg-stone-50 rounded" data-testid={`coach-${d.id}`}>
                      {coachLoading === d.id ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                      Coach IA
                    </button>
                    {coaches[d.id] && (
                      <div className="mt-2 p-2 bg-stone-50 rounded text-xs text-stone-700 border-l-2 border-[#4A154B]" data-testid={`coach-content-${d.id}`}>
                        {coaches[d.id]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {show && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShow(false)}>
          <form onSubmit={submit} onClick={e=>e.stopPropagation()} className="bg-white rounded-2xl border border-stone-200 max-w-md w-full p-6 space-y-3" data-testid="deal-modal">
            <h3 className="font-display text-2xl">Nouvelle opportunité</h3>
            <div><label className="text-xs">Titre *</label><input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="input-crm mt-1" data-testid="deal-title" /></div>
            <div><label className="text-xs">Client *</label><select required value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} className="input-crm mt-1"><option value="">—</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs">Montant €</label><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="input-crm mt-1" data-testid="deal-amount" /></div>
              <div><label className="text-xs">Probabilité %</label><input type="number" min={0} max={100} value={form.probability} onChange={e => setForm({ ...form, probability: e.target.value })} className="input-crm mt-1" /></div>
            </div>
            <div><label className="text-xs">Date estimée de closing</label><input type="date" value={form.expected_close} onChange={e => setForm({ ...form, expected_close: e.target.value })} className="input-crm mt-1" /></div>
            <div><label className="text-xs">Notes</label><textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-crm mt-1" /></div>
            <div className="flex gap-2 justify-end pt-2"><button type="button" onClick={() => setShow(false)} className="btn-ghost">Annuler</button><button className="btn-primary" data-testid="deal-submit">Créer</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
