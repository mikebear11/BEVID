import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  FileText, Plus, Edit3, Trash2, Star, Upload, Download, Loader2, ShieldCheck,
} from "lucide-react";
import { usePageMeta } from "@/lib/pageMeta";

/**
 * /pack-legal — Gestion des variantes de documents légaux entreprise.
 * Manager only. Alimente les PDF émis aux clients.
 *
 * Types : CGV, RIB, Logo, Kbis, Assurance, Conditions de livraison,
 * Mentions légales, Signature dirigeant, Autre.
 */

const MAX_FILE_MB = 2;

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(file);
  });
}

export default function LegalPack() {
  usePageMeta({ title: "Pack légal · BEVID" });
  const { user } = useAuth();
  const [kinds, setKinds] = useState([]);
  const [docs, setDocs] = useState([]);
  const [activeKind, setActiveKind] = useState("cgv");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);      // {kind, doc?}
  const isManager = user?.role === "manager";

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: k }, { data: d }] = await Promise.all([
        api.get("/legal-documents/kinds"),
        api.get("/legal-documents"),
      ]);
      setKinds(k.kinds || []);
      setDocs(d || []);
    } catch { toast.error("Chargement impossible"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const byKind = useMemo(() => {
    const m = {};
    for (const d of docs) { (m[d.kind] = m[d.kind] || []).push(d); }
    return m;
  }, [docs]);

  const kindMeta = useMemo(() => Object.fromEntries(kinds.map(k => [k.key, k])), [kinds]);

  const remove = async (d) => {
    if (!window.confirm(`Supprimer « ${d.variant_name} » ?`)) return;
    try {
      await api.delete(`/legal-documents/${d.id}`);
      toast.success("Supprimé");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Suppression impossible"); }
  };

  const setDefault = async (d) => {
    try {
      await api.post(`/legal-documents/${d.id}/set-default`);
      toast.success(`« ${d.variant_name} » appliqué par défaut`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Impossible"); }
  };

  if (!isManager) {
    return <div className="card-crm p-6" data-testid="legal-pack-forbidden">Réservé aux managers.</div>;
  }

  const currentDocs = byKind[activeKind] || [];
  const meta = kindMeta[activeKind] || { label: "", content: false, file: false };

  return (
    <div className="space-y-6" data-testid="legal-pack-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="overline flex items-center gap-1"><ShieldCheck size={12} aria-hidden="true" /> Documents entreprise</p>
          <h1 className="font-display text-4xl">Pack légal</h1>
          <p className="text-xs text-stone-500 mt-1">CGV, RIB, Logo, Kbis, Assurance… variantes applicables au cas par cas sur les PDF envoyés aux clients.</p>
        </div>
        <button onClick={() => setEditing({ kind: activeKind })} className="btn-primary flex items-center gap-2 min-h-[44px]" data-testid="legal-new-btn">
          <Plus size={16} aria-hidden="true" /> Nouvelle variante
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {kinds.map(k => (
          <button key={k.key} onClick={() => setActiveKind(k.key)}
            data-testid={`legal-kind-${k.key}`}
            className={`text-xs px-3 py-1.5 rounded-full min-h-[36px] transition-colors ${activeKind === k.key ? "bg-[#4A154B] text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300"}`}>
            {k.label} {byKind[k.key]?.length ? <span className="ml-1 text-xs opacity-70">({byKind[k.key].length})</span> : null}
          </button>
        ))}
      </div>

      <section className="card-crm p-4" data-testid={`legal-list-${activeKind}`}>
        <div className="flex items-center gap-2 mb-3">
          <FileText size={16} className="text-[#4A154B]" aria-hidden="true" />
          <h2 className="font-display text-xl">{meta.label} — {currentDocs.length} variante(s)</h2>
        </div>
        {loading && <p className="text-stone-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Chargement…</p>}
        {!loading && currentDocs.length === 0 && (
          <div className="text-center text-stone-500 py-8">
            <FileText size={28} className="mx-auto text-stone-300 mb-2" aria-hidden="true" />
            Aucune variante — cliquez sur « Nouvelle variante » pour en créer une.
          </div>
        )}
        {!loading && currentDocs.length > 0 && (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {currentDocs.map(d => (
              <li key={d.id} className="py-3 flex items-start gap-3" data-testid={`legal-item-${d.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{d.variant_name}</span>
                    {d.is_default && (
                      <span className="text-xs uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800" data-testid={`legal-default-${d.id}`}>Défaut</span>
                    )}
                    {d.file_name && (
                      <span className="text-xs text-stone-500 truncate max-w-[200px]">📎 {d.file_name}</span>
                    )}
                  </div>
                  {d.content && (
                    <p className="text-xs text-stone-500 mt-1 line-clamp-2 whitespace-pre-wrap">{d.content}</p>
                  )}
                  {d.notes && <p className="text-xs text-stone-400 mt-1 italic">{d.notes}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!d.is_default && (
                    <button onClick={() => setDefault(d)} title="Utiliser par défaut"
                      className="min-w-[36px] min-h-[36px] rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-center text-stone-500 hover:text-[#4A154B]"
                      data-testid={`legal-setdefault-${d.id}`}>
                      <Star size={14} aria-hidden="true" />
                    </button>
                  )}
                  {d.file_data_url && (
                    <a href={d.file_data_url} download={d.file_name || `${d.kind}.pdf`}
                      className="min-w-[36px] min-h-[36px] rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-center text-stone-500"
                      data-testid={`legal-download-${d.id}`}>
                      <Download size={14} aria-hidden="true" />
                    </a>
                  )}
                  <button onClick={() => setEditing({ kind: d.kind, doc: d })} title="Modifier"
                    className="min-w-[36px] min-h-[36px] rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-center text-stone-500 hover:text-[#4A154B]"
                    data-testid={`legal-edit-${d.id}`}>
                    <Edit3 size={14} aria-hidden="true" />
                  </button>
                  <button onClick={() => remove(d)} title="Supprimer"
                    className="min-w-[36px] min-h-[36px] rounded-lg hover:bg-red-50 dark:hover:bg-red-950 flex items-center justify-center text-stone-500 hover:text-red-700"
                    data-testid={`legal-delete-${d.id}`}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <VariantModal
          meta={kindMeta[editing.kind]}
          kind={editing.kind}
          doc={editing.doc}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function VariantModal({ meta, kind, doc, onClose, onSaved }) {
  const [name, setName] = useState(doc?.variant_name || "Standard");
  const [content, setContent] = useState(doc?.content || "");
  const [fileDataUrl, setFileDataUrl] = useState(doc?.file_data_url || "");
  const [fileName, setFileName] = useState(doc?.file_name || "");
  const [notes, setNotes] = useState(doc?.notes || "");
  const [isDefault, setIsDefault] = useState(doc?.is_default || false);
  const [busy, setBusy] = useState(false);
  const isEdit = !!doc;

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`Fichier trop lourd (max ${MAX_FILE_MB} Mo)`);
      return;
    }
    try {
      const url = await readFileAsDataURL(f);
      setFileDataUrl(url);
      setFileName(f.name);
    } catch { toast.error("Lecture du fichier impossible"); }
  };

  const save = async () => {
    if (!name.trim()) { toast.error("Nom de variante requis"); return; }
    if (meta?.content && !content.trim() && !fileDataUrl) {
      toast.error("Ajoutez du contenu texte ou un fichier");
      return;
    }
    if (meta && !meta.content && !meta.file) { /* rare */ }
    setBusy(true);
    try {
      const payload = {
        kind, variant_name: name.trim(),
        content: meta?.content ? content : "",
        file_data_url: fileDataUrl || "",
        file_name: fileName || "",
        notes, is_default: isDefault,
      };
      if (isEdit) {
        await api.patch(`/legal-documents/${doc.id}`, payload);
        toast.success("Modifié");
      } else {
        await api.post(`/legal-documents`, payload);
        toast.success("Créé");
      }
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Enregistrement impossible");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose} data-testid="legal-variant-modal">
      <div className="bg-white dark:bg-stone-900 rounded-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="overline">{meta?.label || kind}</p>
            <h2 className="font-display text-2xl">{isEdit ? "Modifier la variante" : "Nouvelle variante"}</h2>
          </div>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px]" aria-label="Fermer">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="variant-name" className="text-xs text-stone-500 block">Nom (ex : CGV Pro, RIB Crédit Agricole…)</label>
            <input id="variant-name" value={name} onChange={e => setName(e.target.value)}
              className="input-crm min-h-[44px]" data-testid="variant-name-input" />
          </div>

          {meta?.content && (
            <div>
              <label htmlFor="variant-content" className="text-xs text-stone-500 block">Contenu texte</label>
              <textarea id="variant-content" value={content} onChange={e => setContent(e.target.value)}
                rows={8} className="input-crm font-mono text-xs" placeholder="Corps du document…"
                data-testid="variant-content-input" />
            </div>
          )}

          {meta?.file && (
            <div>
              <label className="text-xs text-stone-500 block">Fichier (PDF ou image, ≤ {MAX_FILE_MB} Mo)</label>
              <div className="flex items-center gap-3 mt-1">
                <label className="btn-ghost cursor-pointer flex items-center gap-2 min-h-[44px] px-3">
                  <Upload size={14} aria-hidden="true" />
                  <span>Choisir un fichier</span>
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} data-testid="variant-file-input" />
                </label>
                {fileName && <span className="text-xs text-stone-600 truncate flex-1">{fileName}</span>}
                {fileDataUrl && (
                  <button onClick={() => { setFileDataUrl(""); setFileName(""); }} className="text-xs text-red-700" data-testid="variant-file-clear">Retirer</button>
                )}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="variant-notes" className="text-xs text-stone-500 block">Notes internes (non affichées au client)</label>
            <input id="variant-notes" value={notes} onChange={e => setNotes(e.target.value)}
              className="input-crm min-h-[44px]" data-testid="variant-notes-input" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-stone-50 dark:hover:bg-stone-800" data-testid="variant-default-toggle">
            <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="w-5 h-5 accent-[#4A154B]" />
            <span className="text-sm">Appliquer par défaut à tous les nouveaux PDF de ce type</span>
          </label>

          <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
            <button onClick={onClose} className="btn-ghost min-h-[44px] px-4">Annuler</button>
            <button onClick={save} disabled={busy} className="btn-primary min-h-[44px] px-4 flex items-center gap-2" data-testid="variant-save-btn">
              {busy && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
