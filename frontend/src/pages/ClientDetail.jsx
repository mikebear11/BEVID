import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ArrowLeft, Sparkles, Plus, Loader2, Trash2, Repeat, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export default function ClientDetail() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  const [orders, setOrders] = useState([]);
  const [activities, setActivities] = useState([]);
  const [stats, setStats] = useState(null);
  const [insight, setInsight] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [note, setNote] = useState("");

  const [health, setHealth] = useState(null);
  const load = async () => {
    const [{ data: client }, { data: ords }, { data: acts }, { data: st }, { data: h }] = await Promise.all([
      api.get(`/clients/${id}`),
      api.get(`/orders`),
      api.get(`/activities?client_id=${id}`),
      api.get(`/clients/${id}/stats`),
      api.get(`/clients/${id}/health-score`),
    ]);
    setC(client);
    setOrders(ords.filter(o => o.client_id === id));
    setActivities(acts);
    setStats(st);
    setHealth(h);
  };
  useEffect(() => { load(); }, [id]);

  const genInsight = async () => {
    setLoadingAI(true); setInsight("");
    try {
      const { data } = await api.post("/ai/account-insight", { client_id: id });
      setInsight(data.answer);
    } catch(e) { toast.error("Erreur IA"); }
    finally { setLoadingAI(false); }
  };

  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    await api.post("/activities", { client_id: id, type: "note", content: note });
    setNote(""); load();
    toast.success("Note ajoutée");
  };

  const del = async () => {
    if (!confirm("Supprimer ce client ?")) return;
    await api.delete(`/clients/${id}`);
    window.location.href = "/clients";
  };

  const reorder = async (oid) => {
    try {
      await api.post(`/orders/reorder/${oid}`);
      toast.success("Recommande créée");
      load();
    } catch { toast.error("Erreur"); }
  };

  if (!c) return <div className="text-stone-500">Chargement…</div>;

  const totalCa = orders.reduce((s, o) => s + (o.total || 0), 0);

  return (
    <div className="space-y-6" data-testid="client-detail-page">
      <Link to="/clients" className="text-sm text-stone-500 flex items-center gap-1 hover:text-[#4A154B]"><ArrowLeft size={14} /> Retour</Link>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="overline capitalize">{c.type}</p>
          <h1 className="font-display text-4xl md:text-5xl mt-1">{c.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-sm text-stone-600 items-center">
            <span className={`badge badge-${c.status}`}>{c.status}</span>
            {c.city && <span>· {c.city}</span>}
            {c.contact_name && <span>· {c.contact_name}</span>}
            {c.phone && <a href={`tel:${c.phone.replace(/\s/g,'')}`} data-testid="phone-link" className="text-[#4A154B] font-medium underline decoration-dotted underline-offset-4 hover:text-[#6B2D5C]">📞 {c.phone}</a>}
            {c.email && <a href={`mailto:${c.email}?subject=${encodeURIComponent('BEVID · ' + c.name)}`} data-testid="email-link" className="text-[#4A154B] font-medium underline decoration-dotted underline-offset-4 hover:text-[#6B2D5C]">✉ {c.email}</a>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={genInsight} disabled={loadingAI} className="btn-primary flex items-center gap-2" data-testid="ai-insight-btn">
            {loadingAI ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Analyse IA
          </button>
          <button onClick={del} className="btn-ghost text-[#8C2A2A]" data-testid="delete-client-btn"><Trash2 size={16} /></button>
        </div>
      </div>

      {health && (
        <div className="card-crm p-5 flex items-center gap-4 border-l-4" style={{ borderColor: health.score >= 80 ? "#2D5A4C" : health.score >= 60 ? "#5C8A6A" : health.score >= 40 ? "#C78B3A" : "#8C2A2A" }} data-testid="health-card">
          <div className="flex-shrink-0"><p className="overline">Score santé</p><div className="font-display text-5xl" style={{ color: health.score >= 60 ? "#2D5A4C" : health.score >= 40 ? "#C78B3A" : "#8C2A2A" }}>{health.score}<span className="text-2xl text-stone-400">/100</span></div><span className="badge badge-vip mt-1 inline-block">Grade {health.grade}</span></div>
          <div className="flex-1 space-y-1 text-sm">
            {health.reasons.map((r, i) => <div key={i} className="text-stone-700">• {r}</div>)}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-crm p-5"><p className="overline">CA total</p><div className="font-display text-2xl md:text-3xl text-[#2D5A4C] mt-1">{(stats?.total_ca ?? totalCa).toLocaleString('fr-FR')} €</div></div>
        <div className="card-crm p-5"><p className="overline">Panier moyen</p><div className="font-display text-2xl md:text-3xl text-[#4A154B] mt-1 flex items-center gap-1"><TrendingUp size={16} />{(stats?.avg_basket ?? 0).toLocaleString('fr-FR')} €</div></div>
        <div className="card-crm p-5"><p className="overline">Commandes</p><div className="font-display text-2xl md:text-3xl mt-1">{orders.length}</div><p className="text-[10px] text-stone-500 mt-1">{stats?.frequency_days ? `~ tous les ${stats.frequency_days}j` : ""}</p></div>
        <div className="card-crm p-5"><p className="overline">Activités</p><div className="font-display text-2xl md:text-3xl mt-1">{activities.length}</div></div>
      </div>

      {insight && (
        <div className="card-crm p-6 border-l-4 border-l-[#4A154B]" data-testid="ai-insight-content">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-[#4A154B]" />
            <p className="overline">Analyse IA (Claude Sonnet 5)</p>
          </div>
          <div className="text-sm whitespace-pre-wrap text-stone-800 leading-relaxed">{insight}</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card-crm p-6">
          <h3 className="font-display text-xl mb-4">Historique commandes</h3>
          <div className="space-y-2">
            {orders.length === 0 && <p className="text-sm text-stone-500">Aucune commande</p>}
            {orders.map(o => (
              <div key={o.id} className="flex justify-between items-center text-sm border-b border-stone-100 pb-2">
                <div>
                  <div className="font-medium">#{o.id.slice(0,8)}</div>
                  <div className="text-xs text-stone-500">{o.created_at.slice(0,10)} · {o.lines.length} lignes</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="font-display text-[#2D5A4C]">{o.total.toLocaleString('fr-FR')} €</div>
                  <button onClick={() => reorder(o.id)} className="text-stone-400 hover:text-[#4A154B] p-1" title="Recommander en 1 clic" data-testid={`reorder-${o.id}`}>
                    <Repeat size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-crm p-6">
          <h3 className="font-display text-xl mb-4">Activités & notes</h3>
          <form onSubmit={addNote} className="flex gap-2 mb-4">
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ajouter une note rapide…" className="input-crm" data-testid="note-input" />
            <button className="btn-primary" data-testid="add-note-btn"><Plus size={16} /></button>
          </form>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {activities.length === 0 && <p className="text-sm text-stone-500">Aucune activité</p>}
            {activities.map(a => (
              <div key={a.id} className="text-sm border-l-2 border-stone-200 pl-3 py-1">
                <div className="text-xs text-stone-500 flex gap-2">
                  <span className="capitalize font-medium text-[#4A154B]">{a.type}</span>
                  <span>{a.created_at.slice(0,10)}</span>
                </div>
                <div className="text-stone-800">{a.content}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
