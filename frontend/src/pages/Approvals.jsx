import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { usePageMeta } from "@/lib/pageMeta";
import { CheckCircle2, XCircle, Clock, Plus, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

const KIND_LABEL = {
  remise: "Remise exceptionnelle",
  avoir: "Avoir",
  prix_negocie: "Prix négocié",
  delai_paiement: "Délai de paiement",
  derogation: "Dérogation",
  autre: "Autre",
};

const STATUS_STYLES = {
  pending: { bg: "bg-amber-100 text-amber-900", label: "En attente", icon: Clock },
  approved: { bg: "bg-emerald-100 text-emerald-900", label: "Approuvé", icon: CheckCircle2 },
  rejected: { bg: "bg-red-100 text-red-900", label: "Refusé", icon: XCircle },
};

/**
 * Demandes et validations : remises, avoirs, prix négociés, délais…
 * - Commercial voit ses demandes + celles où il est approver.
 * - Manager voit toutes les demandes de l'org.
 * - Manager approuve/refuse → notif au demandeur.
 * - Rappel automatique 24h après demande pending (cron backend).
 */
export default function Approvals() {
  usePageMeta({ title: "Validations · BEVID" });
  const { user } = useAuth();
  const isMgr = user?.role === "manager" || user?.role === "gerant" || user?.role === "owner";
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ kind: "remise", reason: "", establishment_id: "", amount: "", pct: "", days: "" });
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [reviewText, setReviewText] = useState("");
  const [establishments, setEstablishments] = useState([]);

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (filter && filter !== "all") params.set("status", filter);
      const { data } = await api.get(`/approvals?${params.toString()}`);
      setItems(data);
    } catch (e) { toast.error("Chargement impossible"); }
  };
  useEffect(() => { load(); }, [filter]);
  useEffect(() => { api.get("/establishments").then(r => setEstablishments(r.data || [])).catch(() => {}); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const context = {};
      if (form.establishment_id) context.establishment_id = form.establishment_id;
      if (form.amount) context.amount = parseFloat(form.amount);
      if (form.pct) context.pct = parseFloat(form.pct);
      if (form.days) context.days = parseInt(form.days, 10);
      await api.post("/approvals", { kind: form.kind, reason: form.reason, context });
      toast.success("Demande envoyée au manager");
      setShowNew(false);
      setForm({ kind: "remise", reason: "", establishment_id: "", amount: "", pct: "", days: "" });
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Envoi impossible");
    } finally { setBusy(false); }
  };

  const review = async (id, status) => {
    setBusy(true);
    try {
      await api.patch(`/approvals/${id}`, { status, response: reviewText });
      toast.success(status === "approved" ? "Demande approuvée" : "Demande refusée");
      setReviewing(null); setReviewText("");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Action impossible");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6" data-testid="approvals-page">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="overline">Demandes et validations</p>
          <h1 className="font-display text-4xl">Validations</h1>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2 min-h-[44px]" data-testid="approval-new">
          <Plus size={16} /> Nouvelle demande
        </button>
      </div>

      <div className="flex gap-2" role="tablist">
        {[
          { k: "pending", label: "En attente" },
          { k: "approved", label: "Approuvés" },
          { k: "rejected", label: "Refusés" },
          { k: "all", label: "Tous" },
        ].map(f => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            role="tab"
            aria-selected={filter === f.k}
            className={`min-h-[36px] px-3 rounded-lg text-sm ${filter === f.k ? "bg-[#4A154B] text-white" : "bg-white border border-stone-200 dark:border-stone-700 dark:bg-stone-900"}`}
            data-testid={`approval-filter-${f.k}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section className="card-crm p-4" data-testid="approvals-list">
        {items.length === 0 && <p className="text-sm text-stone-500 text-center py-6">Aucune demande.</p>}
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {items.map(a => {
            const S = STATUS_STYLES[a.status] || STATUS_STYLES.pending;
            const Icon = S.icon;
            const canReview = isMgr && a.status === "pending";
            return (
              <li key={a.id} className="py-3" data-testid={`approval-${a.id}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${S.bg} inline-flex items-center gap-1`}>
                        <Icon size={11} aria-hidden="true" /> {S.label}
                      </span>
                      <span className="text-xs font-medium text-[#4A154B] dark:text-[#B076B4]">{KIND_LABEL[a.kind]}</span>
                      {a.context?.pct && <span className="text-xs text-stone-500">−{a.context.pct}%</span>}
                      {a.context?.amount && <span className="text-xs text-stone-500">{a.context.amount.toLocaleString("fr-FR")} €</span>}
                      {a.context?.days && <span className="text-xs text-stone-500">+{a.context.days} j</span>}
                    </div>
                    <p className="text-sm text-stone-700 dark:text-stone-300 mt-1">{a.reason}</p>
                    <p className="text-[11px] text-stone-500 mt-1">
                      Demandé par <b>{a.requester_name}</b> · {(a.created_at || "").slice(0, 16).replace("T", " ")}
                      {a.context?.establishment_id && (
                        <> · <Link to={`/etab/${a.context.establishment_id}`} className="text-[#4A154B] hover:underline" data-testid={`approval-link-etab-${a.id}`}>fiche client</Link></>
                      )}
                    </p>
                    {a.response && <p className="text-xs text-stone-600 mt-1 italic">Réponse : {a.response}</p>}
                  </div>
                  {canReview && reviewing !== a.id && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => { setReviewing(a.id); setReviewText(""); }} className="text-emerald-700 hover:text-emerald-900 min-h-[36px] min-w-[36px] flex items-center justify-center" aria-label="Approuver" data-testid={`approval-approve-btn-${a.id}`}>
                        <CheckCircle2 size={18} aria-hidden="true" />
                      </button>
                      <button onClick={() => { setReviewing(a.id + ":reject"); setReviewText(""); }} className="text-red-700 hover:text-red-900 min-h-[36px] min-w-[36px] flex items-center justify-center" aria-label="Refuser" data-testid={`approval-reject-btn-${a.id}`}>
                        <XCircle size={18} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
                {(reviewing === a.id || reviewing === a.id + ":reject") && (
                  <div className="mt-2 flex flex-col sm:flex-row gap-2" data-testid={`approval-review-panel-${a.id}`}>
                    <textarea
                      value={reviewText}
                      onChange={e => setReviewText(e.target.value)}
                      placeholder="Message de réponse (optionnel)…"
                      rows={2}
                      className="input-crm text-sm flex-1"
                      aria-label="Réponse"
                      data-testid={`approval-review-text-${a.id}`}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => review(a.id, reviewing === a.id ? "approved" : "rejected")} disabled={busy}
                        className={`min-h-[36px] px-3 text-sm rounded-lg ${reviewing === a.id ? "bg-emerald-700 text-white" : "bg-red-700 text-white"}`}
                        data-testid={`approval-confirm-${a.id}`}>
                        {busy ? <Loader2 size={14} className="animate-spin" /> : reviewing === a.id ? "Confirmer approuver" : "Confirmer refuser"}
                      </button>
                      <button onClick={() => setReviewing(null)} className="btn-ghost text-sm min-h-[36px]">Annuler</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {showNew && (
        <div role="dialog" aria-modal="true" onClick={() => setShowNew(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <form onClick={e => e.stopPropagation()} onSubmit={submit}
            className="card-crm p-6 w-full max-w-md space-y-3" data-testid="approval-new-modal">
            <h3 className="font-display text-2xl">Demander une validation</h3>
            <label className="block text-xs text-stone-500">
              Type
              <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}
                className="input-crm min-h-[44px] w-full mt-1" data-testid="approval-new-kind">
                {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="block text-xs text-stone-500">
              Client concerné (optionnel)
              <select value={form.establishment_id} onChange={e => setForm({ ...form, establishment_id: e.target.value })}
                className="input-crm min-h-[44px] w-full mt-1" data-testid="approval-new-etab">
                <option value="">— Aucun —</option>
                {establishments.slice(0, 300).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="block text-xs text-stone-500">
                % remise
                <input type="number" step="0.5" min="0" max="100" value={form.pct}
                  onChange={e => setForm({ ...form, pct: e.target.value })}
                  className="input-crm min-h-[44px] w-full mt-1" data-testid="approval-new-pct" />
              </label>
              <label className="block text-xs text-stone-500">
                Montant €
                <input type="number" step="0.01" min="0" value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  className="input-crm min-h-[44px] w-full mt-1" data-testid="approval-new-amount" />
              </label>
              <label className="block text-xs text-stone-500">
                Délai (j)
                <input type="number" min="0" value={form.days}
                  onChange={e => setForm({ ...form, days: e.target.value })}
                  className="input-crm min-h-[44px] w-full mt-1" data-testid="approval-new-days" />
              </label>
            </div>
            <label className="block text-xs text-stone-500">
              Motif
              <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                required rows={3} className="input-crm w-full mt-1 text-sm"
                placeholder="Expliquez brièvement…" data-testid="approval-new-reason" />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowNew(false)} className="btn-ghost flex-1 min-h-[44px]">Annuler</button>
              <button type="submit" disabled={busy || !form.reason.trim()} className="btn-primary flex-1 min-h-[44px]" data-testid="approval-new-submit">
                {busy ? <Loader2 size={14} className="animate-spin" /> : "Envoyer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
