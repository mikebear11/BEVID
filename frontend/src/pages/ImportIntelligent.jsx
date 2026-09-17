import React, { useMemo, useRef, useState } from "react";
import { api, API } from "@/lib/api";
import { toast } from "sonner";
import {
  Upload, Wand2, Loader2, FileSpreadsheet, AlertCircle, CheckCircle2,
  Undo2, History, Download, Sparkles,
} from "lucide-react";
import { usePageMeta } from "@/lib/pageMeta";

const FIELD_LABELS = {
  nom: "Nom", siret: "SIRET", siren: "SIREN", adresse: "Adresse",
  code_postal: "Code postal", ville: "Ville", telephone: "Téléphone",
  email: "Email", contact: "Contact", type: "Type", notes: "Notes",
};

const CERTAINTY_BADGE = {
  header: { label: "Par intitulé", cls: "bg-emerald-100 text-emerald-800" },
  content: { label: "Par contenu", cls: "bg-blue-100 text-blue-800" },
  user: { label: "Choisi", cls: "bg-purple-100 text-purple-800" },
  none: { label: "Non reconnue", cls: "bg-stone-100 text-stone-500" },
};

export default function ImportIntelligent() {
  usePageMeta({ title: "Import intelligent · BEVID" });
  const fileRef = useRef(null);
  const [sniff, setSniff] = useState(null);
  const [columns, setColumns] = useState([]);
  const [session, setSession] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dupDecisions, setDupDecisions] = useState({});
  const [step, setStep] = useState("upload"); // upload | mapping | preview | done | history
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);

  const onFile = async (f) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error("Fichier > 10 Mo — merci de découper"); return; }
    const fd = new FormData();
    fd.append("file", f);
    setBusy(true);
    try {
      const res = await fetch(`${API}/import/analyze`, { method: "POST", credentials: "include", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSniff(data);
      // Charge le mapping mémorisé pour ce fingerprint × utilisateur
      try {
        const mem = await api.get(`/import/mapping/${data.fingerprint}`);
        if (mem.data?.mapping) {
          const remembered = mem.data.mapping;
          data.columns = data.columns.map(c => remembered[c.header] ? { ...c, field: remembered[c.header], source: "user", certainty: 1 } : c);
          toast.info("Mappage précédent restauré — corrigez si besoin");
        }
      } catch { /* best-effort : ignoré volontairement */ }
      setColumns(data.columns);
      setSession(data.session_id);
      setStep("mapping");
      toast.success(`Fichier analysé · ${data.columns.length} colonnes détectées`);
    } catch (e) { toast.error("Analyse impossible : " + (e.message || "").slice(0, 100)); }
    finally { setBusy(false); }
  };

  const setColField = (i, field) => {
    setColumns((prev) => prev.map((c, ix) => ix === i ? { ...c, field, source: "user", certainty: 1 } : c));
  };

  const runPreview = async () => {
    const mapping = {};
    for (const c of columns) if (c.field) mapping[c.header] = c.field;
    if (!Object.values(mapping).includes("nom")) { toast.error("Colonne « Nom » requise"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/import/${session}/preview`, { mapping });
      // Persiste le mapping pour la prochaine fois (même fingerprint)
      if (sniff?.fingerprint) {
        api.post(`/import/mapping/${sniff.fingerprint}`, { mapping }).catch(() => {});
      }
      // Enrichissement auto en tâche de fond
      api.post(`/import/${session}/enrich`).then((r) => {
        if (r.data.enriched_rows > 0) toast.info(`${r.data.enriched_rows} lignes enrichies via Recherche-Entreprises (SIREN)`);
      }).catch(() => {});
      setPreview(data);
      setStep("preview");
    } catch (e) { toast.error(e?.response?.data?.detail || "Preview impossible"); }
    finally { setBusy(false); }
  };

  const commit = async ({ force = false } = {}) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/import/${session}/commit`, { duplicate_decisions: dupDecisions, force });
      toast.success(`Import validé — ${data.counts.created} créés · ${data.counts.merged} complétés · ${data.counts.skipped} ignorés`);
      setStep("done");
      setSession(data.id); // batch id pour undo
    } catch (e) {
      const status = e?.response?.status;
      if (status === 409) {
        if (window.confirm(e.response.data.detail + "\n\nRéimporter malgré tout ?")) return commit({ force: true });
      } else { toast.error(e?.response?.data?.detail || "Commit impossible"); }
    } finally { setBusy(false); }
  };

  const loadHistory = async () => {
    setBusy(true);
    try { const { data } = await api.get("/import/history"); setHistory(data); setStep("history"); }
    finally { setBusy(false); }
  };

  const undoBatch = async (id) => {
    if (!window.confirm("Annuler ce lot ? Les fiches modifiées depuis seront conservées.")) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/import/${id}/undo`);
      toast.success(`${data.deleted} fiches supprimées · ${data.kept.length} conservées (modifiées depuis)`);
      loadHistory();
    } catch (e) { toast.error(e?.response?.data?.detail || "Annulation impossible"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6" data-testid="import-intelligent-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="overline flex items-center gap-1"><Wand2 size={12} aria-hidden="true" /> Reprise de l'existant</p>
          <h1 className="font-display text-4xl">Import intelligent</h1>
          <p className="text-xs text-stone-500 mt-1 max-w-xl">Déposez votre fichier — CSV, XLSX, XLS. Le séparateur, l'encodage et les colonnes sont détectés automatiquement.</p>
        </div>
        <button onClick={loadHistory} className="btn-ghost flex items-center gap-2 min-h-[44px]" data-testid="import-history-btn">
          <History size={16} aria-hidden="true" /> Historique
        </button>
      </div>

      {step === "upload" && (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-stone-300 dark:border-stone-700 rounded-2xl p-10 text-center cursor-pointer hover:border-[#4A154B] transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}
            data-testid="import-drop-zone">
            {busy ? <Loader2 size={36} className="mx-auto animate-spin text-[#4A154B]" aria-hidden="true" /> : <Upload size={36} className="mx-auto text-[#4A154B]" aria-hidden="true" />}
            <p className="mt-3 font-medium">Déposez votre fichier, quel qu'il soit</p>
            <p className="text-xs text-stone-500 mt-1">XLSX · XLS · CSV — jusqu'à 10 Mo et 5 000 lignes</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onFile(e.target.files[0])} data-testid="import-file-input" />
          </div>

          <div className="card-crm p-4 space-y-2">
            <p className="overline">Ou collez vos lignes depuis Excel / Google Sheets</p>
            <textarea
              id="import-paste-area" rows={4} placeholder="Coller ici (Ctrl+V) — un en-tête sur la 1ère ligne."
              className="input-crm text-sm font-mono" data-testid="import-paste-textarea"
              aria-label="Zone de collage direct"
              onPaste={async (e) => {
                const raw = e.clipboardData.getData("text");
                if (!raw || raw.trim().split("\n").length < 2) return;
                e.preventDefault();
                setBusy(true);
                try {
                  const { data } = await api.post("/import/paste", { text: raw });
                  setSniff(data); setColumns(data.columns); setSession(data.session_id);
                  setStep("mapping");
                  toast.success(`${data.row_count_sample} ligne(s) collée(s)`);
                } catch (err) { toast.error(err?.response?.data?.detail || "Collage impossible"); }
                finally { setBusy(false); }
              }}
            />
            <p className="text-xs text-stone-500">Pour 20 lignes c'est plus rapide qu'un téléversement.</p>
          </div>

          <p className="text-xs text-stone-500 text-center">Ou <a href="/api/xlsx/template" className="text-[#4A154B] hover:underline">téléchargez un modèle vierge</a> si vous préférez.</p>
        </div>
      )}

      {step === "mapping" && (
        <div className="space-y-4" data-testid="import-mapping-step">
          <div className="card-crm p-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span><strong>{sniff?.kind?.toUpperCase()}</strong></span>
            {sniff?.separator && <span>Séparateur <code className="bg-stone-100 dark:bg-stone-800 px-1 rounded">{sniff.separator === "\t" ? "TAB" : sniff.separator}</code></span>}
            {sniff?.encoding && <span>Encodage <code className="bg-stone-100 dark:bg-stone-800 px-1 rounded">{sniff.encoding}</code></span>}
            {sniff?.sheets?.length > 1 && <span>{sniff.sheets.length} feuilles — active : <strong>{sniff.active_sheet}</strong></span>}
            <span className="text-stone-500">Détection sur {sniff?.row_count_sample} lignes</span>
          </div>

          <div className="card-crm overflow-x-auto scroll-shadow">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="bg-stone-50 border-b border-stone-200 text-left overline">
                <tr>
                  <th className="p-3 sticky left-0 bg-stone-50 z-10">Colonne du fichier</th>
                  <th className="p-3">Correspond à</th>
                  <th className="p-3">Certitude</th>
                  <th className="p-3">3 exemples</th>
                </tr>
              </thead>
              <tbody>
                {columns.map((c, i) => {
                  const badge = CERTAINTY_BADGE[c.source] || CERTAINTY_BADGE.none;
                  return (
                    <tr key={i} className="border-b border-stone-100" data-testid={`import-col-${i}`}>
                      <td className="p-3 font-mono text-xs sticky left-0 bg-white z-10">{c.header}</td>
                      <td className="p-3">
                        <select value={c.field || ""} onChange={(e) => setColField(i, e.target.value || null)}
                          className="input-crm min-h-[36px] text-sm" data-testid={`import-col-select-${i}`}
                          aria-label={`Champ pour ${c.header}`}>
                          <option value="">— ignorer —</option>
                          {Object.entries(FIELD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </td>
                      <td className="p-3"><span className={`badge text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}{c.certainty > 0 && ` · ${Math.round(c.certainty * 100)}%`}</span></td>
                      <td className="p-3 text-xs text-stone-500">{(c.samples || []).slice(0, 3).map((s, ix) => <div key={ix} className="truncate max-w-[240px]">{s || "—"}</div>)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => { setStep("upload"); setSession(null); }} className="btn-ghost min-h-[44px]" data-testid="import-back-upload">Annuler</button>
            <button onClick={runPreview} disabled={busy} className="btn-primary flex items-center gap-2 min-h-[44px]" data-testid="import-run-preview">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} aria-hidden="true" />}
              Aperçu de l'import
            </button>
          </div>
        </div>
      )}

      {step === "preview" && preview && (
        <div className="space-y-4" data-testid="import-preview-step">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label="Lues" value={preview.counts.read} />
            <Kpi label="Importables" value={preview.counts.importable} accent="#2D5A4C" />
            <Kpi label="Sans nom" value={preview.counts.ignored_empty_name} accent="#8C2A2A" />
            <Kpi label="Doublons fichier" value={preview.counts.duplicates_file} accent="#C78B3A" />
            <Kpi label="Doublons base" value={preview.counts.duplicates_db} accent="#4A154B" />
          </div>

          {preview.dup_db.length > 0 && (
            <div className="card-crm p-4">
              <p className="overline flex items-center gap-1"><AlertCircle size={12} aria-hidden="true" /> Doublons avec la base</p>
              <p className="text-xs text-stone-500 mb-3">Un import ne peut pas écraser un travail terrain. Choisissez ligne par ligne.</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {preview.dup_db.map((d, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 p-2 border border-stone-200 rounded-lg text-sm" data-testid={`import-dup-${d.row}`}>
                    <div className="flex-1 truncate">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 mr-2">{d.level}</span>
                      <span className="text-stone-500">→ existant :</span> {d.existing_name}
                    </div>
                    <select value={dupDecisions[d.row] || "ignore"} onChange={(e) => setDupDecisions({ ...dupDecisions, [d.row]: e.target.value })} className="input-crm min-h-[36px] text-xs" data-testid={`import-dup-decision-${d.row}`}>
                      <option value="ignore">Ignorer</option>
                      <option value="merge">Compléter (champs vides seulement)</option>
                      <option value="create">Créer quand même</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card-crm overflow-x-auto scroll-shadow">
            <div className="px-4 py-3 border-b border-stone-200"><h2 className="font-display text-xl">Aperçu — 20 premières lignes</h2></div>
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-stone-50 border-b border-stone-200 text-left overline">
                <tr>
                  <th className="p-3">Nom</th><th className="p-3">SIRET</th><th className="p-3">Téléphone</th><th className="p-3">Email</th><th className="p-3">Ville</th><th className="p-3">Corrections</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((r, i) => (
                  <tr key={i} className="border-b border-stone-100" data-testid={`import-preview-row-${i}`}>
                    <td className="p-3 font-medium">{r.cleaned.nom || "—"}</td>
                    <td className="p-3 font-mono text-xs text-stone-500">{r.cleaned.siret || "—"}</td>
                    <td className="p-3 font-mono text-xs">{r.cleaned.telephone || "—"}</td>
                    <td className="p-3 text-xs">{r.cleaned.email || "—"}</td>
                    <td className="p-3 text-xs">{r.cleaned.ville || "—"}{r.cleaned.code_postal ? ` (${r.cleaned.code_postal})` : ""}</td>
                    <td className="p-3">{r.corrections.length > 0 && <span className="text-xs text-[#4A154B]" title={r.corrections.map(c => `${c.field}: ${c.original} → ${c.cleaned}`).join("\n")}>{r.corrections.length} corr.</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setStep("mapping")} className="btn-ghost min-h-[44px]" data-testid="import-back-mapping">Retour au mappage</button>
            <button onClick={() => commit()} disabled={busy || preview.counts.importable === 0} className="btn-primary flex items-center gap-2 min-h-[44px]" data-testid="import-commit-btn">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} aria-hidden="true" />}
              Valider l'import ({preview.counts.importable} lignes)
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="card-crm p-8 text-center space-y-3" data-testid="import-done">
          <CheckCircle2 size={48} className="mx-auto text-emerald-600" aria-hidden="true" />
          <p className="font-display text-2xl">Import terminé</p>
          <p className="text-sm text-stone-500">Lot #{session?.slice(0, 8)} — vous pouvez l'annuler depuis l'historique si nécessaire.</p>
          <div className="flex justify-center gap-2 pt-2">
            <button onClick={() => { setStep("upload"); setSession(null); setPreview(null); setColumns([]); setDupDecisions({}); }} className="btn-ghost min-h-[44px]" data-testid="import-new">Nouvel import</button>
            <button onClick={loadHistory} className="btn-primary min-h-[44px]">Voir l'historique</button>
          </div>
        </div>
      )}

      {step === "history" && (
        <div className="card-crm overflow-x-auto scroll-shadow" data-testid="import-history-list">
          <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between">
            <h2 className="font-display text-xl">Historique des imports</h2>
            <button onClick={() => setStep("upload")} className="btn-ghost min-h-[36px] text-xs">Nouvel import</button>
          </div>
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-stone-50 border-b border-stone-200 text-left overline">
              <tr><th className="p-3">Date</th><th className="p-3">Fichier</th><th className="p-3">Auteur</th><th className="p-3">Résultat</th><th className="p-3 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-stone-500">Aucun import à ce jour.</td></tr>}
              {history.map(b => (
                <tr key={b.id} className="border-b border-stone-100" data-testid={`import-batch-${b.id}`}>
                  <td className="p-3 text-xs text-stone-500">{(b.created_at || "").slice(0, 16).replace("T", " ")}</td>
                  <td className="p-3">{b.filename || "—"}</td>
                  <td className="p-3 text-stone-500">{b.user_name}</td>
                  <td className="p-3 text-xs">{b.counts?.created || 0} créés · {b.counts?.merged || 0} complétés · {b.counts?.skipped || 0} ignorés{b.undone_at && <span className="text-red-700"> · annulé</span>}</td>
                  <td className="p-3 text-right space-x-1 whitespace-nowrap">
                    <a href={`${API}/import/${b.id}/rejects`} target="_blank" rel="noreferrer" className="text-xs bg-stone-100 text-stone-700 px-3 py-1.5 rounded-full min-h-[36px] inline-flex items-center gap-1" data-testid={`import-rejects-${b.id}`}>
                      <Download size={12} aria-hidden="true" /> Rejets
                    </a>
                    {!b.undone_at && (
                      <button onClick={() => undoBatch(b.id)} className="text-xs bg-red-50 text-red-700 px-3 py-1.5 rounded-full min-h-[36px] inline-flex items-center gap-1" data-testid={`import-undo-${b.id}`}>
                        <Undo2 size={12} aria-hidden="true" /> Annuler
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent = "#4A154B" }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: `${accent}0d`, color: accent }}>
      <p className="text-xs">{label}</p>
      <p className="font-display text-2xl mt-1">{value}</p>
    </div>
  );
}
