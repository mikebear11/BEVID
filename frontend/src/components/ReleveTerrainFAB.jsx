import React, { useState } from "react";
import { api } from "@/lib/api";
import { ClipboardList, X, Plus, Trash2, Loader2, Camera } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import { uid } from "@/lib/uid";

/**
 * Formulaire relevé terrain < 20 s (PARTIE 14).
 * Ouvert par un FAB sur ClientDetail. Base de l'observatoire.
 */
export default function ReleveTerrainFAB({ clientId }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    marques_presentes: "",
    nb_lignes_totales: "",
    prix_releves: [{ _k: uid(), marque: "", format: "", prix_consommateur: "" }],
  });
  const [saving, setSaving] = useState(false);

  const addPrix = () => setForm(f => ({ ...f, prix_releves: [...f.prix_releves, { _k: uid(), marque: "", format: "", prix_consommateur: "" }] }));
  const rmPrix = (i) => setForm(f => ({ ...f, prix_releves: f.prix_releves.filter((_, j) => j !== i) }));
  const updPrix = (i, k, v) => setForm(f => ({
    ...f, prix_releves: f.prix_releves.map((p, j) => j === i ? { ...p, [k]: v } : p)
  }));

  const submit = async () => {
    setSaving(true);
    try {
      // géoloc rapide (opt-in navigateur)
      let lat = null, lng = null;
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 }));
        lat = pos.coords.latitude; lng = pos.coords.longitude;
      } catch { /* best-effort : ignoré volontairement */ }
      const marques = form.marques_presentes.split(",").map(s => s.trim()).filter(Boolean);
      const prix = form.prix_releves.filter(p => p.marque && p.prix_consommateur)
        .map(({ _k, ...p }) => ({ ...p, prix_consommateur: parseFloat(p.prix_consommateur) }));
      await api.post("/releves-terrain", {
        client_id: clientId,
        marques_presentes: marques,
        nb_lignes_totales: parseInt(form.nb_lignes_totales) || 0,
        prix_releves: prix,
        lat, lng,
      });
      toast.success(t("toast.releve_enregistre_1_pour_l_observat"));
      setOpen(false);
      setForm({ marques_presentes: "", nb_lignes_totales: "", prix_releves: [{ _k: uid(), marque: "", format: "", prix_consommateur: "" }] });
    } catch { toast.error(t("toast.erreur")); }
    finally { setSaving(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="fixed bottom-40 md:bottom-24 right-6 z-40 w-14 h-14 rounded-full bg-[#2D5A4C] text-white shadow-lg flex items-center justify-center"
        title="Relevé terrain < 20s" data-testid="releve-fab">
        <ClipboardList size={22} strokeWidth={1.5} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4" onClick={() => setOpen(false)} data-testid="releve-modal">
      <div className="bg-white rounded-t-2xl md:rounded-2xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="overline">Observatoire</p>
            <h2 className="font-display text-xl">Relevé terrain</h2>
          </div>
          <button onClick={() => setOpen(false)} className="min-w-[40px] min-h-[40px] flex items-center justify-center text-stone-400"><X size={20} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-600">Marques présentes (séparées par des virgules)</label>
            <input value={form.marques_presentes} onChange={e => setForm({ ...form, marques_presentes: e.target.value })}
              placeholder="Heineken, Kronenbourg, 1664..." className="input-crm mt-1" data-testid="releve-marques" />
          </div>
          <div>
            <label className="text-xs text-stone-600">Nb lignes de tirage</label>
            <input type="number" value={form.nb_lignes_totales} onChange={e => setForm({ ...form, nb_lignes_totales: e.target.value })}
              className="input-crm mt-1" data-testid="releve-lignes" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-stone-600">Prix consommateur constatés</label>
              <button onClick={addPrix} className="text-xs text-[#4A154B]" data-testid="add-price"><Plus size={12} className="inline" /> Ajouter</button>
            </div>
            {form.prix_releves.map((p, i) => (
              <div key={p._k} className="grid grid-cols-[1fr_60px_80px_28px] gap-1 mb-1">
                <input value={p.marque} onChange={e => updPrix(i, "marque", e.target.value)} placeholder="Marque" className="input-crm text-sm h-9" data-testid={`price-brand-${i}`} />
                <input value={p.format} onChange={e => updPrix(i, "format", e.target.value)} placeholder="25cl" className="input-crm text-sm h-9" />
                <input type="number" step="0.10" value={p.prix_consommateur} onChange={e => updPrix(i, "prix_consommateur", e.target.value)} placeholder="€" className="input-crm text-sm h-9 font-mono" data-testid={`price-value-${i}`} />
                <button onClick={() => rmPrix(i)} className="text-red-500"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>

          <button onClick={submit} disabled={saving} className="btn-primary w-full min-h-[44px] flex items-center justify-center gap-2 mt-4" data-testid="releve-submit">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Enregistrer le relevé
          </button>
          <p className="text-xs text-stone-400 text-center">Anonymisé & agrégé pour l'observatoire · seuil min 5 relevés par zone</p>
        </div>
      </div>
    </div>
  );
}
