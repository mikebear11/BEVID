import React, { useEffect, useMemo, useState, useCallback } from "react";
import { api, API } from "@/lib/api";
import { toast } from "sonner";
import { FileText, Plus, Send, Download, Filter, ArrowRight, Loader2 } from "lucide-react";
import { usePageMeta } from "@/lib/pageMeta";
import { t } from "@/lib/i18n";
import { uid, stripKeys } from "@/lib/uid";

const TYPE_LABELS = {
  devis: "Devis",
  bon_commande: "Bon de commande",
  bon_livraison: "Bon de livraison",
  proforma: "Proforma",
  facture: "Facture",
  avoir: "Avoir",
  feuille_depot: "Feuille de dépôt",
};

const STATUS_COLORS = {
  brouillon: "bg-stone-100 text-stone-700",
  envoye: "bg-blue-100 text-blue-800",
  accepte: "bg-emerald-100 text-emerald-800",
  refuse: "bg-red-100 text-red-800",
  emis: "bg-emerald-100 text-emerald-800",
  livre: "bg-purple-100 text-purple-800",
  solde: "bg-emerald-200 text-emerald-900",
  annule: "bg-red-100 text-red-800",
  expire: "bg-amber-100 text-amber-800",
  signe: "bg-blue-100 text-blue-800",
  facture: "bg-emerald-100 text-emerald-800",
};

export default function Documents() {
  usePageMeta({ title: "Documents · BEVID" });
  const [types, setTypes] = useState([]);
  const [filter, setFilter] = useState("all");
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [emitting, setEmitting] = useState(null);
  const [legalDocs, setLegalDocs] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter === "all" ? "/documents" : `/documents?doc_type=${filter}`;
      const { data } = await api.get(url);
      setDocs(data);
    } catch (e) {
      toast.error("Chargement impossible");
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => {
    api.get("/documents/types").then(r => setTypes(r.data.types || []));
    api.get("/legal-documents").then(r => setLegalDocs(r.data || [])).catch(() => setLegalDocs([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const emit = async (id) => {
    setEmitting(id);
    try {
      const { data } = await api.post(`/documents/${id}/emit`);
      toast.success(`Émis · ${data.number}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Émission impossible");
    } finally { setEmitting(null); }
  };

  const downloadPdf = async (id, num) => {
    try {
      const res = await fetch(`${API}/documents/${id}/pdf`, { credentials: "include" });
      if (!res.ok) throw new Error("PDF indisponible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${num || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch { toast.error("Téléchargement PDF impossible"); }
  };

  // Filtres visibles (les 4 nouveaux + tous)
  const chips = useMemo(() => [
    { v: "all", l: "Tous" },
    { v: "devis", l: "Devis" },
    { v: "bon_commande", l: "Bon de commande" },
    { v: "proforma", l: "Proforma" },
    { v: "feuille_depot", l: "Feuille de dépôt" },
    { v: "bon_livraison", l: "BL" },
    { v: "facture", l: "Facture" },
    { v: "avoir", l: "Avoir" },
  ], []);

  return (
    <div className="space-y-6" data-testid="documents-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="overline flex items-center gap-1"><FileText size={12} aria-hidden="true" /> Chaîne documentaire</p>
          <h1 className="font-display text-4xl">Documents</h1>
          <p className="text-xs text-stone-500 mt-1">Devis · BC · Proforma · Feuille de dépôt · BL · Facture · Avoir — numérotation atomique + PDF WeasyPrint.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 min-h-[44px]" data-testid="new-document-btn">
          <Plus size={16} aria-hidden="true" /> Nouveau document
        </button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <Filter size={14} className="text-stone-400" aria-hidden="true" />
        {chips.map(c => (
          <button key={c.v} onClick={() => setFilter(c.v)}
            data-testid={`doc-filter-${c.v}`}
            className={`text-xs px-3 py-1.5 rounded-full min-h-[36px] ${filter === c.v ? "bg-[#4A154B] text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}>
            {c.l}
          </button>
        ))}
      </div>

      <div className="card-crm overflow-x-auto scroll-shadow">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-stone-50 border-b border-stone-200 text-left overline">
            <tr>
              <th className="p-3 sticky left-0 bg-stone-50 z-10">N°</th>
              <th className="p-3">Type</th>
              <th className="p-3">Client</th>
              <th className="p-3">Date</th>
              <th className="p-3">Statut</th>
              <th className="p-3 text-right">Total TTC</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="p-6 text-center text-stone-500"><Loader2 size={16} className="mx-auto animate-spin" aria-hidden="true" /></td></tr>}
            {!loading && docs.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-stone-500">
                <FileText size={28} className="mx-auto text-stone-300 mb-2" aria-hidden="true" />
                Aucun document. Cliquez sur « Nouveau document » pour commencer.
              </td></tr>
            )}
            {docs.map(d => (
              <tr key={d.id} className="border-b border-stone-100 hover:bg-stone-50" data-testid={`document-row-${d.id}`}>
                <td className="p-3 font-mono text-xs sticky left-0 bg-white z-10">{d.number || "—"}</td>
                <td className="p-3">{TYPE_LABELS[d.doc_type] || d.doc_type}</td>
                <td className="p-3">{d.client_snapshot?.name || d.client_id?.slice(0, 8)}</td>
                <td className="p-3 text-stone-500">{(d.emitted_at || d.created_at || "").slice(0, 10)}</td>
                <td className="p-3">
                  <span className={`badge text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[d.status] || "bg-stone-100 text-stone-700"}`}>{d.status}</span>
                </td>
                <td className="p-3 text-right font-mono">{(d.total_ttc || 0).toFixed(2)} €</td>
                <td className="p-3 text-right space-x-1 whitespace-nowrap">
                  {d.status === "brouillon" && (
                    <button onClick={() => emit(d.id)} disabled={emitting === d.id}
                      className="text-xs bg-[#4A154B] text-white px-3 py-1.5 rounded-full min-h-[36px] inline-flex items-center gap-1"
                      data-testid={`emit-doc-${d.id}`}>
                      {emitting === d.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Émettre
                    </button>
                  )}
                  {d.number && (
                    <button onClick={() => downloadPdf(d.id, d.number)}
                      className="text-xs bg-stone-100 text-stone-700 px-3 py-1.5 rounded-full min-h-[36px] inline-flex items-center gap-1"
                      data-testid={`pdf-doc-${d.id}`}>
                      <Download size={12} aria-hidden="true" /> PDF
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateDocumentModal types={types} legalDocs={legalDocs} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function CreateDocumentModal({ types, legalDocs, onClose, onCreated }) {
  const [docType, setDocType] = useState("devis");
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState("");
  const newLine = () => ({ _k: uid(), description: "", quantity: 1, unit_price_ht: 0, vat_rate: 20 });
  const [lines, setLines] = useState(() => [newLine()]);
  const [notes, setNotes] = useState("");
  const [validityDays, setValidityDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  // Variantes légales : par défaut on prend le is_default de chaque kind
  const LEGAL_KINDS_FOR_PDF = ["logo", "cgv", "rib", "conditions_livraison"];
  const [legalVariants, setLegalVariants] = useState({});
  useEffect(() => {
    const init = {};
    for (const k of LEGAL_KINDS_FOR_PDF) {
      const def = (legalDocs || []).find(d => d.kind === k && d.is_default);
      if (def) init[k] = def.id;
    }
    setLegalVariants(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legalDocs]);

  useEffect(() => {
    api.get("/establishments").then(r => setClients(r.data || [])).catch(() => {});
  }, []);
  useEffect(() => {
    api.get(`/documents/preview-number/${docType}`).then(r => setPreview(r.data)).catch(() => setPreview(null));
  }, [docType]);

  const total = useMemo(() => lines.reduce((s, l) => s + (Number(l.quantity) * Number(l.unit_price_ht) * (1 + Number(l.vat_rate) / 100)), 0), [lines]);

  const submit = async () => {
    if (!clientId) { toast.error("Choisir un client"); return; }
    const cleanLines = lines.filter(l => l.description && l.quantity > 0 && l.unit_price_ht >= 0);
    if (cleanLines.length === 0) { toast.error("Ajouter au moins une ligne valide"); return; }
    setBusy(true);
    try {
      const payload = {
        doc_type: docType,
        client_id: clientId,
        lines: stripKeys(cleanLines),
        notes,
        validity_days: docType === "devis" ? Number(validityDays) : undefined,
        legal_variants: legalVariants,
      };
      await api.post("/documents", payload);
      toast.success("Brouillon créé");
      onCreated();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Création impossible");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose} data-testid="doc-create-modal">
      <div className="bg-white dark:bg-stone-900 rounded-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl">Nouveau document</h2>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px]" aria-label="Fermer">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="doc-type-select" className="text-xs text-stone-500 block">Type</label>
            <select id="doc-type-select" value={docType} onChange={e => setDocType(e.target.value)} className="input-crm min-h-[44px]" data-testid="doc-type-select">
              <option value="devis">Devis</option>
              <option value="bon_commande">Bon de commande</option>
              <option value="proforma">Proforma</option>
              <option value="feuille_depot">Feuille de dépôt</option>
              <option value="bon_livraison">Bon de livraison</option>
              <option value="facture">Facture</option>
            </select>
            {preview && <p className="text-xs text-stone-500 mt-1">Prochain n° : <span className="font-mono">{preview.next_number}</span> {preview.fiscal && <span className="text-red-700">· fiscal</span>}</p>}
          </div>

          <div>
            <label htmlFor="doc-client-select" className="text-xs text-stone-500 block">Client / Établissement</label>
            <select id="doc-client-select" value={clientId} onChange={e => setClientId(e.target.value)} className="input-crm min-h-[44px]" data-testid="doc-client-select">
              <option value="">— choisir —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {docType === "devis" && (
            <div>
              <label htmlFor="doc-validity" className="text-xs text-stone-500 block">Validité (jours)</label>
              <input id="doc-validity" type="number" min="1" value={validityDays} onChange={e => setValidityDays(e.target.value)} className="input-crm min-h-[44px]" data-testid="doc-validity" />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-stone-500 block">Lignes</label>
              <button onClick={() => setLines([...lines, newLine()])} className="text-xs text-[#4A154B]" data-testid="doc-add-line">+ Ajouter</button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={l._k} className="grid grid-cols-12 gap-2 items-center">
                  <input placeholder="Description" value={l.description} onChange={e => { const n = [...lines]; n[i].description = e.target.value; setLines(n); }}
                    className="input-crm col-span-6 min-h-[40px]" data-testid={`doc-line-desc-${i}`} aria-label={`Description ligne ${i + 1}`} />
                  <input type="number" min="0" step="0.01" placeholder="Qté" value={l.quantity} onChange={e => { const n = [...lines]; n[i].quantity = e.target.value; setLines(n); }}
                    className="input-crm col-span-2 min-h-[40px]" data-testid={`doc-line-qty-${i}`} aria-label={`Quantité ligne ${i + 1}`} />
                  <input type="number" min="0" step="0.01" placeholder="PU HT" value={l.unit_price_ht} onChange={e => { const n = [...lines]; n[i].unit_price_ht = e.target.value; setLines(n); }}
                    className="input-crm col-span-2 min-h-[40px]" data-testid={`doc-line-price-${i}`} aria-label={`Prix HT ligne ${i + 1}`} />
                  <input type="number" min="0" step="0.5" placeholder="TVA%" value={l.vat_rate} onChange={e => { const n = [...lines]; n[i].vat_rate = e.target.value; setLines(n); }}
                    className="input-crm col-span-2 min-h-[40px]" data-testid={`doc-line-vat-${i}`} aria-label={`TVA ligne ${i + 1}`} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="doc-notes" className="text-xs text-stone-500 block">Notes</label>
            <textarea id="doc-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="input-crm" data-testid="doc-notes" />
          </div>

          {/* Variantes légales appliquées au PDF */}
          {(legalDocs || []).length > 0 && (
            <div className="border-t border-stone-200 pt-3 space-y-2" data-testid="doc-legal-variants">
              <p className="text-xs text-stone-500 uppercase tracking-wider">Variantes appliquées au PDF</p>
              {LEGAL_KINDS_FOR_PDF.map(kind => {
                const variants = (legalDocs || []).filter(d => d.kind === kind);
                if (variants.length === 0) return null;
                const kindLabel = { logo: "Logo", cgv: "CGV", rib: "RIB", conditions_livraison: "Conditions livraison" }[kind];
                return (
                  <div key={kind} className="grid grid-cols-3 gap-2 items-center">
                    <label htmlFor={`variant-${kind}`} className="text-xs text-stone-600">{kindLabel}</label>
                    <select id={`variant-${kind}`}
                      value={legalVariants[kind] || ""}
                      onChange={e => setLegalVariants({ ...legalVariants, [kind]: e.target.value })}
                      className="input-crm min-h-[36px] col-span-2 text-xs"
                      data-testid={`variant-select-${kind}`}>
                      <option value="">— Aucune —</option>
                      {variants.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.variant_name}{v.is_default ? " (défaut)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
              <p className="text-xs text-stone-400">
                Gérer les variantes dans <a href="/pack-legal" className="underline">Pack légal</a>.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-stone-200">
            <p className="text-sm">Total TTC estimé : <strong className="text-[#4A154B]">{total.toFixed(2)} €</strong></p>
            <button onClick={submit} disabled={busy} className="btn-primary flex items-center gap-2 min-h-[44px]" data-testid="doc-create-submit">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} aria-hidden="true" />}
              Créer le brouillon
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
