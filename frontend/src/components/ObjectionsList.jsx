import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AlertOctagon, Check, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { OBJECTION_CATEGORIES } from "@/components/ObjectionExtractPanel";
import FeedbackThumbs from "@/components/FeedbackThumbs";

const catLabel = (k) => OBJECTION_CATEGORIES.find(c => c.key === k)?.label || k;

const STATUS_BADGE = {
  ouverte:    { label: "Ouverte",    cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  recurrente: { label: "Récurrente", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  traitee:    { label: "Traitée",    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
};

/**
 * Liste des objections ouvertes / récurrentes / traitées sur la fiche établissement.
 * Le commercial peut marquer une objection comme traitée + saisir la réponse utilisée.
 */
export default function ObjectionsList({ establishmentId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);          // objection en cours d'édition
  const [responseText, setResponseText] = useState("");
  const [outcome, setOutcome] = useState("levee");
  const [saving, setSaving] = useState(false);
  const [effective, setEffective] = useState(null);    // [{response, uses, successes, rate}]

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/establishments/${establishmentId}/objections`);
      setItems(Array.isArray(data) ? data : []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (establishmentId) load(); }, [establishmentId]);

  const openEdit = (o) => {
    setOpenId(o.id);
    setResponseText(o.response_used || "");
    setOutcome(o.outcome || "levee");
    // Lot 7 étape 6 — charge les "réponses qui marchent" pour cette catégorie.
    setEffective(null);
    api.get(`/objections/effective-responses?category=${o.category}`)
      .then(r => setEffective(r.data?.responses || []))
      .catch(() => setEffective([]));
  };

  const markTreated = async (o) => {
    setSaving(true);
    try {
      await api.patch(`/objections/${o.id}`, {
        status: "traitee",
        response_used: responseText.trim() || null,
        outcome,
      });
      toast.success("Objection marquée comme traitée");
      setOpenId(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Enregistrement impossible");
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="text-xs text-stone-500 flex items-center gap-1" data-testid="objections-loading">
        <Loader2 size={12} className="animate-spin" /> Chargement…
      </div>
    );
  }

  const open = items.filter(o => o.status !== "traitee");
  const treated = items.filter(o => o.status === "traitee");

  if (items.length === 0) {
    return (
      <p className="text-xs text-stone-500" data-testid="objections-empty">
        Aucune objection consignée pour cet établissement.
      </p>
    );
  }

  const Row = ({ o }) => {
    const editing = openId === o.id;
    const badge = STATUS_BADGE[o.status] || STATUS_BADGE.ouverte;
    return (
      <div className="border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-sm" data-testid={`objection-row-${o.id}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-xs uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${badge.cls}`}>
                {badge.label}
              </span>
              <span className="text-xs text-stone-500 uppercase tracking-wider">{catLabel(o.category)}</span>
              {o.occurrences > 1 && (
                <span className="text-xs tabular-nums text-stone-400" aria-label={`${o.occurrences} occurrences`}>
                  ×{o.occurrences}
                </span>
              )}
            </div>
            <p className="text-stone-700 dark:text-stone-200 mt-1">{o.label}</p>
            {o.response_used && (
              <p className="text-xs text-stone-500 mt-1 italic">Réponse : « {o.response_used} »</p>
            )}
            <p className="text-xs text-stone-400 mt-1">
              vue le {(o.last_seen_at || o.first_seen_at || "").slice(0, 10)}
              {o.source_visit_id && " · visite"}
            </p>
          </div>
          {o.status !== "traitee" && !editing && (
            <button
              type="button"
              onClick={() => openEdit(o)}
              data-testid={`objection-treat-${o.id}`}
              className="text-xs text-[#4A154B] dark:text-[#B076B4] font-medium shrink-0"
            >
              <Check size={12} className="inline mr-0.5" /> Traiter
            </button>
          )}
        </div>
        {editing && (
          <div className="mt-2 space-y-2 pt-2 border-t border-stone-200 dark:border-stone-700">
            {effective && effective.length > 0 && (
              <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded p-2 space-y-1" data-testid={`objection-effective-${o.id}`}>
                <p className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Ce qui a déjà fonctionné dans l'entreprise
                </p>
                {effective.slice(0, 3).map((r, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setResponseText(r.response)}
                      className="flex-1 text-left text-xs text-stone-700 dark:text-stone-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 rounded px-1.5 py-1"
                      data-testid={`objection-effective-pick-${o.id}-${i}`}
                      title="Cliquer pour réutiliser cette réponse"
                    >
                      « {r.response} » <span className="text-xs text-emerald-700 dark:text-emerald-300 tabular-nums">levée {r.successes}/{r.uses} · {Math.round(r.rate * 100)}%</span>
                    </button>
                    <FeedbackThumbs kind="response_suggestion" targetId={r.response} context={o.category} testIdPrefix={`resp-fb-${o.id}-${i}`} />
                  </div>
                ))}
              </div>
            )}
            <textarea
              rows={2}
              placeholder="Réponse utilisée (facultatif)"
              value={responseText}
              onChange={e => setResponseText(e.target.value)}
              className="input-crm text-xs w-full"
              data-testid={`objection-response-${o.id}`}
            />
            <div className="flex items-center gap-2">
              <select
                value={outcome}
                onChange={e => setOutcome(e.target.value)}
                className="text-xs border border-stone-300 dark:border-stone-600 rounded px-2 py-1 bg-white dark:bg-stone-800 dark:text-stone-200"
                data-testid={`objection-outcome-${o.id}`}
              >
                <option value="levee">Levée</option>
                <option value="contournee">Contournée</option>
                <option value="bloquante">Bloquante</option>
              </select>
              <button
                type="button"
                onClick={() => markTreated(o)}
                disabled={saving}
                className="btn-primary text-xs px-2 py-1"
                data-testid={`objection-save-${o.id}`}
              >
                {saving ? <Loader2 size={11} className="inline mr-1 animate-spin" /> : null}
                Enregistrer
              </button>
              <button type="button" onClick={() => setOpenId(null)} className="text-xs text-stone-500">Annuler</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2" data-testid="objections-list">
      <div className="flex items-center justify-between">
        <p className="overline flex items-center gap-1"><AlertOctagon size={11} /> Objections {open.length > 0 && <span className="text-xs tabular-nums text-stone-400 ml-1">{open.length} ouverte{open.length > 1 ? "s" : ""}</span>}</p>
        <button type="button" onClick={load} className="text-xs text-stone-400 hover:text-stone-600" aria-label="Rafraîchir" data-testid="objections-refresh">
          <RefreshCw size={11} />
        </button>
      </div>
      <div className="space-y-1.5">
        {open.map(o => <Row key={o.id} o={o} />)}
      </div>
      {treated.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs uppercase tracking-wider text-stone-400 cursor-pointer">
            {treated.length} traitée{treated.length > 1 ? "s" : ""}
          </summary>
          <div className="space-y-1.5 mt-2">
            {treated.map(o => <Row key={o.id} o={o} />)}
          </div>
        </details>
      )}
    </div>
  );
}
