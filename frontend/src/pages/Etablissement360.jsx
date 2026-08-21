import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Phone, ArrowLeft, ClipboardCheck, ShoppingCart, MessageSquare, AlertOctagon, TrendingUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import RunoutList from "@/components/RunoutList";
import ObjectionsList from "@/components/ObjectionsList";
import ClientMemory from "@/components/ClientMemory";
import BriefButton from "@/components/BriefButton";
import CommentsThread from "@/components/CommentsThread";

const CREDIT_COLOR = { vert: "#2D5A4C", orange: "#C78B3A", rouge: "#8C2A2A" };
const CREDIT_LABEL = { vert: "En règle", orange: "Retard — à relancer", rouge: "COMPTE BLOQUÉ" };

export default function Etablissement360() {
  const { id } = useParams();
  const nav = useNavigate();
  const [e, setE] = useState(null);
  const [showDerog, setShowDerog] = useState(false);
  const [derogReason, setDerogReason] = useState("");
  const [amt, setAmt] = useState("");
  const [memoryVer, setMemoryVer] = useState(0);  // Fix iter21 — recompute événementiel après pin comment

  const load = async () => {
    try { const { data } = await api.get(`/establishments/${id}`); setE(data); }
    catch { toast.error(t("toast.erreur_chargement")); }
  };
  useEffect(() => { load(); }, [id]);

  const askDerog = async () => {
    if (!derogReason.trim()) { toast.error(t("toast.motif_requis")); return; }
    await api.post("/derogations", { establishment_id: id, reason: derogReason, requested_amount: parseFloat(amt) || 0 });
    toast.success(t("toast.demande_envoyee_au_gerant"));
    setShowDerog(false); setDerogReason(""); setAmt("");
  };

  if (!e) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="animate-spin" /></div>;

  const status = e.credit_status;
  const color = CREDIT_COLOR[status];
  const blocked = status === "rouge";

  return (
    <div className="pb-32" data-testid="etab360-page">
      <Link to="/tournee" className="text-sm text-stone-500 flex items-center gap-1 mb-3"><ArrowLeft size={14} /> Ma tournée</Link>

      {/* Bandeau vital sans scroll */}
      <div className="card-crm p-4 border-l-4" style={{ borderColor: color }} data-testid="credit-banner">
        <div className="flex items-start justify-between">
          <div>
            <p className="overline capitalize">{e.type}</p>
            <h1 className="font-display text-3xl md:text-4xl">{e.name}</h1>
            {e.city && <p className="text-sm text-stone-500 mt-1">{e.city}</p>}
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <div>
              <p className="overline">Encours</p>
              <p className="font-display text-2xl" style={{color}}>{(e.current_credit || 0).toLocaleString('fr-FR')} €</p>
              <span className="text-[10px] uppercase tracking-widest font-bold" style={{color}}>{CREDIT_LABEL[status]}</span>
            </div>
            <BriefButton establishmentId={id} testId="brief-btn-etab" />
          </div>
        </div>
        {status !== "vert" && (
          <div className="mt-3 p-2 rounded text-xs" style={{background: color+"15", color}}>
            {status === "orange" && `⚠️ Retard ${e.overdue_days}j sur ${(e.overdue_amount||0).toLocaleString('fr-FR')}€. Pense à relancer.`}
            {status === "rouge" && (
              <div className="flex items-center justify-between gap-2">
                <span>🚫 Compte bloqué. Commande refusée. </span>
                <button onClick={() => setShowDerog(true)} className="px-3 py-1 rounded bg-white border font-medium" style={{color, borderColor: color}} data-testid="ask-derog-btn">Demander dérogation</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="card-crm p-3"><p className="overline">Volumes 12m</p><p className="font-display text-lg">{(e.volumes_12m?.reduce((s,x)=>s+x.ca,0) || 0).toLocaleString('fr-FR', {maximumFractionDigits:0})} €</p></div>
        <div className="card-crm p-3"><p className="overline">Dernière visite</p><p className="font-display text-lg">{e.last_visit ? new Date(e.last_visit.created_at).toLocaleDateString('fr-FR', {day:'numeric',month:'short'}) : "—"}</p></div>
        <div className="card-crm p-3"><p className="overline">Prochaine action</p><p className="text-xs">{e.last_visit?.next_action || "—"}</p></div>
      </div>

      {/* Lot 7 étape 2 — Mémoire client "Ce qu'il faut savoir" */}
      <div className="card-crm p-4 mt-3" data-testid="etab-memory">
        <ClientMemory establishmentId={id} refreshTrigger={memoryVer} />
      </div>

      {e.top_products?.length > 0 && (
        <div className="card-crm p-4 mt-3">
          <p className="overline mb-2 flex items-center gap-1"><TrendingUp size={11}/> Top 3 références</p>
          {e.top_products.map(p => (
            <div key={p.product_id} className="text-sm flex justify-between py-1"><span>{p.name}</span><span className="text-stone-500">{p.qty} u.</span></div>
          ))}
        </div>
      )}

      <div className="card-crm p-4 mt-3" data-testid="etab-runouts">
        <p className="overline mb-2">Prochaines ruptures probables</p>
        <RunoutList clientId={e.client_id || id} />
      </div>

      <div className="card-crm p-4 mt-3" data-testid="etab-objections">
        <ObjectionsList establishmentId={id} />
      </div>

      <div className="card-crm p-4 mt-3" data-testid="etab-comments">
        <CommentsThread establishmentId={id} onMemoryChange={() => setMemoryVer(v => v + 1)} />
      </div>

      {e.last_visit && (
        <div className="card-crm p-4 mt-3">
          <p className="overline mb-2">Dernier CR de visite</p>
          <p className="text-sm text-stone-700 whitespace-pre-wrap">{e.last_visit.summary || "(aucun résumé)"}</p>
        </div>
      )}

      {/* CTA permanents bas d'écran */}
      <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-white border-t border-stone-200 p-3 grid grid-cols-3 gap-2 z-40" data-testid="cta-bar">
        <button onClick={() => nav(`/etab/${id}/visite`)} className="min-h-[48px] bg-[#4A154B] text-white rounded-lg font-medium flex items-center justify-center gap-1 text-sm" data-testid="cta-visite"><ClipboardCheck size={16}/> Visite</button>
        <button onClick={() => !blocked && nav(`/etab/${id}/commande`)} disabled={blocked} className={`min-h-[48px] rounded-lg font-medium flex items-center justify-center gap-1 text-sm ${blocked ? 'bg-stone-200 text-stone-400' : 'bg-[#2D5A4C] text-white'}`} data-testid="cta-commande">
          <ShoppingCart size={16}/> {blocked ? "Bloqué" : "Commande"}
        </button>
        <a href={`tel:${(e.phone||'').replace(/\s/g,'')}`} className="min-h-[48px] bg-black text-white rounded-lg font-medium flex items-center justify-center gap-1 text-sm" data-testid="cta-call"><Phone size={16}/> Appel</a>
      </div>

      {showDerog && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={()=>setShowDerog(false)}>
          <div className="bg-white rounded-2xl border p-6 max-w-md w-full space-y-3" onClick={ev=>ev.stopPropagation()} data-testid="derog-modal">
            <div className="flex items-center gap-2"><AlertOctagon size={18} className="text-[#8C2A2A]"/><h3 className="font-display text-2xl">Demande de dérogation</h3></div>
            <p className="text-sm text-stone-600">Le compte est bloqué. Justifie ta demande — le gérant reçoit une alerte temps réel.</p>
            <div><label className="text-xs">Motif *</label><textarea rows={3} required value={derogReason} onChange={ev=>setDerogReason(ev.target.value)} className="input-crm mt-1" data-testid="derog-reason"/></div>
            <div><label className="text-xs">Montant commande (€)</label><input type="number" value={amt} onChange={ev=>setAmt(ev.target.value)} className="input-crm mt-1"/></div>
            <div className="flex gap-2 justify-end"><button onClick={()=>setShowDerog(false)} className="btn-ghost">Annuler</button><button onClick={askDerog} className="btn-primary" data-testid="derog-submit">Envoyer</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
