import React, { useEffect, useMemo, useState, useCallback } from "react";
import { api, API } from "@/lib/api";
import { toast } from "sonner";
import {
  Upload, FileSpreadsheet, Landmark, CheckCircle2, RotateCcw,
  Loader2, TrendingUp, AlertCircle, X, Search,
} from "lucide-react";
import { t } from "@/lib/i18n";
import { usePageMeta } from "@/lib/pageMeta";

const CONF_BADGE = {
  certain: { label: "Certaine", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  high:    { label: "Élevée",  cls: "bg-teal-100 text-teal-800 border-teal-300" },
  medium:  { label: "Moyenne", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  low:     { label: "Faible",  cls: "bg-red-100 text-red-800 border-red-300" },
};

export default function Rapprochement() {
  usePageMeta({ title: `${t("reconciliation")} · BEVID` });
  const [summary, setSummary] = useState(null);
  const [txs, setTxs] = useState([]);
  const [filter, setFilter] = useState("open");
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [proposals, setProposals] = useState({}); // txId -> {propositions, tx}
  const [propOpen, setPropOpen] = useState(null);

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([
      api.get("/banque/summary"),
      api.get(`/banque/transactions?status=${filter}&limit=300`),
    ]);
    setSummary(s.data);
    setTxs(t.data);
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => txs.filter(t => {
    const q = query.toLowerCase();
    if (!q) return true;
    return (t.label || "").toLowerCase().includes(q)
        || (t.counterparty_name || "").toLowerCase().includes(q)
        || String(t.amount).includes(q);
  }), [txs, query]);

  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const res = await fetch(`${API}/banque/imports`, {
        method: "POST", body: fd, credentials: "include",
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.detail || "Erreur import");
      toast.success(t("toast.import_v1_v2_nouvelles_v3_doublons_", { v1: b.format.toUpperCase(), v2: b.new, v3: b.duplicates, v4: b.auto_lettrages }));
      load();
    } catch (err) { toast.error(err.message); }
    finally { setUploading(false); e.target.value = ""; }
  };

  const openPropose = async (tid) => {
    setPropOpen(tid);
    if (proposals[tid]) return;
    try {
      const { data } = await api.get(`/banque/transactions/${tid}/propose`);
      setProposals(p => ({ ...p, [tid]: data }));
    } catch { toast.error(t("toast.impossible_de_charger_les_propositi")); }
  };

  const applyProposal = async (tid, p) => {
    try {
      await api.post(`/banque/transactions/${tid}/lettrer`, {
        order_ids: p.order_ids,
        amount_applied: p.amount_applied,
        confidence: p.confidence,
        reason: p.reason,
      });
      toast.success(t("toast.lettrage_applique_v1", { v1: p.confidence }));
      setPropOpen(null);
      setProposals(prev => { const { [tid]: _, ...rest } = prev; return rest; });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || t("toast.erreur")); }
  };

  return (
    <div className="space-y-6" data-testid="rapprochement-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="overline flex items-center gap-2"><Landmark size={12} aria-hidden="true" /> {t("settlement")}</p>
          <h1 className="font-display text-4xl">{t("reconciliation")}</h1>
          <p className="text-xs text-stone-500 mt-1">{t("reconciliation_help")}</p>
        </div>
        <label className="btn-primary cursor-pointer flex items-center gap-2 min-h-[44px]" data-testid="import-btn">
          {uploading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
          {uploading ? t("importing") : t("action.import_statement")}
          <input type="file" accept=".csv,.xml,.txt" onChange={upload} className="hidden" disabled={uploading} data-testid="import-file" aria-label={t("action.import_statement")} />
        </label>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label={t("kpi_reconciliation_entries")} value={summary.total_tx} />
          <Kpi label={t("kpi_to_letter")} value={summary.open_tx} accent="#8C2A2A" />
          <Kpi label={t("kpi_lettered")} value={summary.matched_tx} accent="#2D5A4C" suffix={` · ${summary.matched_pct}%`} />
          <Kpi label={t("kpi_auto_rate")} value={`${summary.auto_rate_pct}%`} icon={<TrendingUp size={14} aria-hidden="true" />} accent="#4A154B" />
        </div>
      )}

      <div className="flex gap-2 items-center flex-wrap">
        {["open", "matched", "partial", "all"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-full min-h-[36px] ${filter === f ? "bg-[#4A154B] text-white" : "bg-stone-100 text-stone-700"}`}
            data-testid={`filter-${f}`}>
            {t(`filter.${f}`)}
          </button>
        ))}
        <div className="relative ml-auto min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden="true" />
          <label htmlFor="rapp-search-input" className="sr-only">{t("search")}</label>
          <input id="rapp-search-input" name="q" placeholder={t("search_reconciliation_placeholder")} value={query}
            onChange={e => setQuery(e.target.value)}
            className="input-crm pl-9 h-9 text-sm" data-testid="rapp-search" autoComplete="off" />
        </div>
      </div>

      <div className="card-crm overflow-x-auto scroll-shadow">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-stone-50 border-b border-stone-200 text-left overline">
            <tr>
              <th className="p-3 sticky left-0 bg-stone-50 z-10">{t("column.date")}</th>
              <th className="p-3">{t("column.counterparty")}</th>
              <th className="p-3">{t("column.label")}</th>
              <th className="p-3 text-right">{t("column.amount")}</th>
              <th className="p-3">{t("column.status")}</th>
              <th className="p-3 text-right">{t("column.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-stone-500">
                <FileSpreadsheet size={28} className="mx-auto text-stone-300 mb-2" aria-hidden="true" />
                {t("empty.no_reconciliation")}
              </td></tr>
            )}
            {filtered.map(tx => (
              <tr key={tx.id} className="border-b border-stone-100 hover:bg-stone-50" data-testid={`tx-${tx.id}`}>
                <td className="p-3 whitespace-nowrap text-stone-600 sticky left-0 bg-white z-10">{(tx.value_date || "").slice(0, 10)}</td>
                <td className="p-3 text-stone-800 font-medium">{tx.counterparty_name || "—"}</td>
                <td className="p-3 text-stone-500 max-w-xs truncate" title={tx.label}>{tx.label}</td>
                <td className={`p-3 text-right font-mono font-medium ${tx.amount >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {tx.amount >= 0 ? "+" : ""}{Number(tx.amount).toFixed(2)} €
                </td>
                <td className="p-3">
                  {tx.status === "matched" && <span className="badge bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs">{t("filter.matched")}</span>}
                  {tx.status === "open" && <span className="badge bg-red-100 text-red-800 border border-red-300 text-xs">{t("filter.open")}</span>}
                  {tx.status === "partial" && <span className="badge bg-amber-100 text-amber-800 border border-amber-300 text-xs">{t("filter.partial")}</span>}
                </td>
                <td className="p-3 text-right">
                  {tx.status !== "matched" && tx.amount > 0 && (
                    <button onClick={() => openPropose(tx.id)}
                      className="text-xs bg-[#4A154B] text-white px-3 py-1.5 rounded-full min-h-[36px]"
                      data-testid={`propose-${tx.id}`}>
                      {t("action.propositions")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {propOpen && (
        <ProposalsModal
          tid={propOpen}
          data={proposals[propOpen]}
          onClose={() => setPropOpen(null)}
          onApply={applyProposal}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, accent = "#0f172a", suffix = "", icon }) {
  return (
    <div className="card-crm p-4">
      <p className="overline flex items-center gap-1">{icon}{label}</p>
      <p className="font-display text-3xl mt-1" style={{ color: accent }}>{value}<span className="text-sm text-stone-400 font-body">{suffix}</span></p>
    </div>
  );
}

function ProposalsModal({ tid, data, onClose, onApply }) {
  if (!data) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-6"><Loader2 className="animate-spin text-stone-500" /></div>
      </div>
    );
  }
  const { tx, propositions } = data;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
         onClick={onClose} data-testid="proposals-modal">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-stone-100 flex items-start justify-between">
          <div>
            <p className="overline">Propositions de lettrage</p>
            <h2 className="font-display text-xl">{Number(tx.amount).toFixed(2)} € · {tx.counterparty_name || "—"}</h2>
            <p className="text-xs text-stone-500 mt-1">{tx.label}</p>
          </div>
          <button onClick={onClose} className="min-w-[40px] min-h-[40px] flex items-center justify-center text-stone-400 hover:text-stone-800" data-testid="proposals-close"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          {propositions.length === 0 && (
            <div className="text-center py-8 text-stone-500">
              <AlertCircle size={32} className="mx-auto text-stone-300 mb-2" />
              Aucune proposition. Vérifiez qu'il existe une facture ouverte correspondante.
            </div>
          )}
          {propositions.map((p, i) => {
            const conf = CONF_BADGE[p.level] || CONF_BADGE.low;
            return (
              <div key={i} className={`border rounded-xl p-4 ${p.confidence >= 85 ? "bg-emerald-50/40" : "bg-white"}`} data-testid={`proposal-${i}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs uppercase tracking-widest border rounded-full px-2 py-0.5 ${conf.cls}`}>{conf.label}</span>
                    <span className="text-xs text-stone-500">Score {p.confidence}</span>
                  </div>
                  <span className="font-mono font-medium text-stone-800">{Number(p.amount_applied).toFixed(2)} €</span>
                </div>
                <p className="text-xs text-stone-600 mb-3">{p.reason}</p>
                <div className="space-y-1 mb-3">
                  {p.orders.map(o => (
                    <div key={o.id} className="flex items-center justify-between text-xs bg-stone-50 rounded px-3 py-2">
                      <span>{o.client_name} · #{o.id.slice(0,8)}</span>
                      <span className="text-stone-500">reste {Number(o.remaining_amount).toFixed(2)} €</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => onApply(tid, p)}
                  className="w-full bg-[#4A154B] text-white text-sm py-2 rounded-lg flex items-center justify-center gap-2 min-h-[40px]"
                  data-testid={`apply-${i}`}>
                  <CheckCircle2 size={14} /> Appliquer ce lettrage
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
