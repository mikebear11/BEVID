import React, { useState, useRef } from "react";
import { api, API } from "@/lib/api";
import { toast } from "sonner";
import { Landmark, FileText, Upload, CheckCircle2, Loader2, ExternalLink } from "lucide-react";

/**
 * Panneau KYB/Banking pour ClientDetail — IBAN, BIC, SIRET, TVA + uploads Kbis/RIB.
 * Validation IBAN mod-97 + SIRET Luhn côté serveur, feedback toast.
 */
export default function ClientBankingPanel({ client, onUpdate }) {
  const [form, setForm] = useState({
    iban: client.iban || "",
    bic: client.bic || "",
    siret: client.siret || "",
    tva_intra: client.tva_intra || "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(null); // 'kbis' | 'rib' | null
  const kbisRef = useRef(null);
  const ribRef = useRef(null);

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/clients/${client.id}/banking`, form);
      toast.success("Coordonnées bancaires enregistrées");
      onUpdate?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally { setSaving(false); }
  };

  const upload = async (kind, e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(kind);
    try {
      const fd = new FormData(); fd.append("file", f);
      const token = localStorage.getItem("crm_token");
      const res = await fetch(`${API}/clients/${client.id}/documents?kind=${kind}`, {
        method: "POST", body: fd,
        headers: { Authorization: `Bearer ${token}` },
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.detail || "Upload échoué");
      toast.success(`${kind === "kbis" ? "Kbis" : "RIB"} téléversé (${(b.size / 1024).toFixed(0)} Ko)`);
      onUpdate?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(null);
      e.target.value = "";
    }
  };

  const viewFile = async (path) => {
    try {
      const token = localStorage.getItem("crm_token");
      const res = await fetch(`${API}/files/${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Fichier introuvable");
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="card-crm p-6" data-testid="client-banking-panel">
      <div className="flex items-center gap-2 mb-4">
        <Landmark size={16} className="text-[#4A154B]" />
        <h3 className="font-display text-xl">Coordonnées bancaires & KYB</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-stone-600">IBAN</label>
          <input
            value={form.iban}
            onChange={e => setForm({ ...form, iban: e.target.value.toUpperCase() })}
            placeholder="FR76 3000 6000 0112 3456 7890 189"
            className="input-crm mt-1 font-mono"
            data-testid="client-iban"
          />
          <p className="text-[10px] text-stone-400 mt-1">Validation clé mod-97 côté serveur</p>
        </div>
        <div>
          <label className="text-xs text-stone-600">BIC / SWIFT</label>
          <input value={form.bic} onChange={e => setForm({ ...form, bic: e.target.value.toUpperCase() })}
                 placeholder="AGRIFRPP" className="input-crm mt-1 font-mono" data-testid="client-bic" />
        </div>
        <div>
          <label className="text-xs text-stone-600">SIRET</label>
          <input value={form.siret} onChange={e => setForm({ ...form, siret: e.target.value.replace(/\s/g, "") })}
                 placeholder="732 829 320 00074" maxLength={14}
                 className="input-crm mt-1 font-mono" data-testid="client-siret" />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-stone-600">TVA intracommunautaire</label>
          <input value={form.tva_intra} onChange={e => setForm({ ...form, tva_intra: e.target.value.toUpperCase() })}
                 placeholder="FR12345678900" className="input-crm mt-1 font-mono" data-testid="client-tva" />
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 min-h-[40px]" data-testid="client-banking-save">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          Enregistrer
        </button>
      </div>

      <div className="border-t border-stone-100 mt-6 pt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <DocSlot label="Kbis" path={client.kbis_path} filename={client.kbis_filename}
          uploading={uploading === "kbis"} onUpload={() => kbisRef.current?.click()} onView={viewFile}
          testId="kbis" />
        <input ref={kbisRef} type="file" accept=".pdf,image/png,image/jpeg" className="hidden"
               onChange={e => upload("kbis", e)} data-testid="kbis-input" />
        <DocSlot label="RIB" path={client.rib_path} filename={client.rib_filename}
          uploading={uploading === "rib"} onUpload={() => ribRef.current?.click()} onView={viewFile}
          testId="rib" />
        <input ref={ribRef} type="file" accept=".pdf,image/png,image/jpeg" className="hidden"
               onChange={e => upload("rib", e)} data-testid="rib-input" />
      </div>
    </div>
  );
}

function DocSlot({ label, path, filename, uploading, onUpload, onView, testId }) {
  return (
    <div className="border border-stone-200 rounded-xl p-4 flex items-center gap-3" data-testid={`${testId}-slot`}>
      <FileText size={20} className={path ? "text-emerald-600" : "text-stone-300"} />
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-widest text-stone-500">{label}</p>
        <p className="text-sm text-stone-800 truncate">
          {path ? (filename || "document.pdf") : "Aucun fichier"}
        </p>
      </div>
      {path && (
        <button onClick={() => onView(path)} className="text-stone-500 hover:text-[#4A154B] min-w-[36px] min-h-[36px] flex items-center justify-center"
                title="Ouvrir" data-testid={`${testId}-view`}>
          <ExternalLink size={16} />
        </button>
      )}
      <button onClick={onUpload} disabled={uploading}
              className="text-xs bg-[#4A154B] text-white px-3 py-2 rounded-lg flex items-center gap-1 min-h-[36px] disabled:opacity-50"
              data-testid={`${testId}-upload-btn`}>
        {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
        {path ? "Remplacer" : "Ajouter"}
      </button>
    </div>
  );
}
