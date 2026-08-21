import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Plus, Trash2, Wine, Beer, Layers } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import XlsxIO from "@/components/XlsxIO";
import { t } from "@/lib/i18n";

const CATS = ["vin", "biere", "spiritueux", "soft", "eau", "autre"];

export default function Products() {
  const { confirm } = useConfirm();
  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [hectoFor, setHectoFor] = useState(null);
  const [form, setForm] = useState({ name: "", category: "vin", price: 0, stock: 0, sku: "", volume_liters: 0, hecto_tiers: [] });

  const load = async () => { const { data } = await api.get("/products"); setItems(data); };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        price: parseFloat(form.price),
        stock: parseInt(form.stock),
        volume_liters: parseFloat(form.volume_liters) || null,
      };
      await api.post("/products", payload);
      toast.success(t("toast.produit_ajoute"));
      setShow(false);
      setForm({ name: "", category: "vin", price: 0, stock: 0, sku: "", volume_liters: 0, hecto_tiers: [] });
      load();
    } catch { toast.error(t("toast.erreur")); }
  };
  const del = async (id) => {
    const ok = await confirm({ title: "Supprimer ce produit ?", message: "Cette action ne peut pas être annulée.", confirmLabel: "Supprimer", tone: "danger" });
    if (!ok) return;
    await api.delete(`/products/${id}`); load();
  };

  return (
    <div className="space-y-6" data-testid="products-page">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <p className="overline">Catalogue</p>
          <h1 className="font-display text-4xl">Produits</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <XlsxIO kind="products" label="Excel" onImportDone={load} />
          <button onClick={() => setShow(true)} className="btn-primary flex items-center gap-2 min-h-[44px]" data-testid="add-product-btn"><Plus size={16} /> Ajouter</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.length === 0 && <div className="col-span-full text-stone-500 text-sm">Aucun produit.</div>}
        {items.map(p => {
          const isBiere = p.category === "biere";
          const hasTiers = (p.hecto_tiers || []).length > 0;
          return (
            <div key={p.id} className="card-crm p-5" data-testid={`product-${p.id}`}>
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-full bg-[#4A154B]/10 flex items-center justify-center text-[#4A154B]">
                  {isBiere ? <Beer size={18} strokeWidth={1.5} /> : <Wine size={18} strokeWidth={1.5} />}
                </div>
                <button onClick={() => del(p.id)} className="text-stone-400 hover:text-[#8C2A2A] min-w-[44px] min-h-[44px] flex items-center justify-center"><Trash2 size={14} /></button>
              </div>
              <div className="mt-3">
                <p className="overline">{p.category}{p.volume_liters ? ` · ${p.volume_liters}L` : ""}</p>
                <h3 className="font-display text-lg mt-1 leading-tight">{p.name}</h3>
                {p.sku && <p className="text-xs text-stone-500 mt-1">{p.sku}</p>}
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div><p className="overline">Prix</p><p className="font-display text-2xl text-[#4A154B]">{p.price.toFixed(2)} €</p></div>
                <div className="text-right"><p className="overline">Stock</p><p className={`font-display text-2xl ${p.stock < 20 ? 'text-[#8C2A2A]' : 'text-[#2D5A4C]'}`}>{p.stock}</p></div>
              </div>
              {(isBiere || hasTiers) && (
                <div className="mt-3 pt-3 border-t border-stone-100">
                  <button onClick={() => setHectoFor(p)} className="text-xs text-[#4A154B] font-medium flex items-center gap-1 min-h-[36px]" data-testid={`edit-hecto-${p.id}`}>
                    <Layers size={12} /> Tarif à l'hecto {hasTiers ? `(${p.hecto_tiers.length} paliers)` : "(à configurer)"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {show && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShow(false)}>
          <form onSubmit={submit} onClick={e=>e.stopPropagation()} className="bg-white rounded-2xl border border-stone-200 max-w-md w-full p-6 space-y-3" data-testid="product-modal">
            <h3 className="font-display text-2xl">Nouveau produit</h3>
            <div><label className="text-xs">Nom *</label><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-crm mt-1 min-h-[48px]" data-testid="prod-name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs">Catégorie</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="input-crm mt-1 min-h-[48px]">{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
              <div><label className="text-xs">SKU</label><input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} className="input-crm mt-1 min-h-[48px]" /></div>
              <div><label className="text-xs">Prix €</label><input type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="input-crm mt-1 min-h-[48px]" data-testid="prod-price" /></div>
              <div><label className="text-xs">Stock</label><input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className="input-crm mt-1 min-h-[48px]" data-testid="prod-stock" /></div>
              <div className="col-span-2"><label className="text-xs">Volume par unité (L) — requis pour tarif hecto</label><input type="number" step="0.01" placeholder="Ex : 30 pour un fût, 0.33 pour 33cl" value={form.volume_liters} onChange={e => setForm({ ...form, volume_liters: e.target.value })} className="input-crm mt-1 min-h-[48px]" data-testid="prod-volume" /></div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setShow(false)} className="btn-ghost min-h-[44px]">Annuler</button>
              <button className="btn-primary min-h-[44px]" data-testid="prod-submit">Enregistrer</button>
            </div>
          </form>
        </div>
      )}

      {hectoFor && (
        <HectoTiersModal product={hectoFor} onClose={() => { setHectoFor(null); load(); }} />
      )}
    </div>
  );
}

function HectoTiersModal({ product, onClose }) {
  const [tiers, setTiers] = useState(product.hecto_tiers || []);
  const [volume, setVolume] = useState(product.volume_liters || 0);
  const [saving, setSaving] = useState(false);

  const addTier = () => setTiers([...tiers, { min_hl: 5, discount_pct: 3 }]);
  const updateTier = (i, field, val) => {
    const c = [...tiers]; c[i] = { ...c[i], [field]: parseFloat(val) || 0 }; setTiers(c);
  };
  const removeTier = (i) => setTiers(tiers.filter((_, x) => x !== i));

  const save = async () => {
    setSaving(true);
    try {
      const sorted = [...tiers].filter(t => t.min_hl > 0).sort((a, b) => a.min_hl - b.min_hl);
      await api.put(`/products/${product.id}`, { hecto_tiers: sorted, volume_liters: parseFloat(volume) || null });
      toast.success(t("toast.tarif_hecto_sauvegarde"));
      onClose();
    } catch { toast.error(t("toast.erreur")); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-stone-200 max-w-md w-full p-6 space-y-3" data-testid="hecto-modal">
        <h3 className="font-display text-2xl">Tarif à l'hecto — {product.name}</h3>
        <p className="text-xs text-stone-500">La remise s'applique automatiquement selon le volume total commandé de ce produit (qty × volume unitaire, converti en hL).</p>
        <div>
          <label className="text-xs">Volume par unité (L)</label>
          <input type="number" step="0.01" value={volume} onChange={e => setVolume(e.target.value)} className="input-crm mt-1 min-h-[48px]" data-testid="hecto-volume" />
          <p className="text-[11px] text-stone-500 mt-1">Ex : 30 (fût 30L), 0.33 (33cl bouteille), 20 (fût 20L).</p>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          <p className="text-xs font-medium text-stone-700">Paliers</p>
          {tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2" data-testid={`tier-row-${i}`}>
              <span className="text-xs text-stone-500">à partir de</span>
              <input type="number" step="0.5" value={t.min_hl} onChange={e => updateTier(i, "min_hl", e.target.value)} className="input-crm w-20 min-h-[44px]" />
              <span className="text-xs">hL →</span>
              <input type="number" step="0.5" value={t.discount_pct} onChange={e => updateTier(i, "discount_pct", e.target.value)} className="input-crm w-20 min-h-[44px]" />
              <span className="text-xs">% off</span>
              <button onClick={() => removeTier(i)} className="text-stone-400 hover:text-red-600 ml-auto min-w-[44px] min-h-[44px] flex items-center justify-center"><Trash2 size={14} /></button>
            </div>
          ))}
          {tiers.length === 0 && <p className="text-xs text-stone-400 py-2">Aucun palier. Ajoutez-en un.</p>}
        </div>
        <button onClick={addTier} className="btn-ghost text-sm min-h-[44px]" data-testid="add-tier"><Plus size={14} /> Ajouter un palier</button>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="btn-ghost min-h-[44px]">Annuler</button>
          <button onClick={save} disabled={saving} className="btn-primary min-h-[44px]" data-testid="save-hecto">{saving ? "…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}
