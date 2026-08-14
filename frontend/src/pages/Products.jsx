import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Plus, Trash2, Wine } from "lucide-react";
import { toast } from "sonner";

const CATS = ["vin", "biere", "spiritueux", "soft", "eau", "autre"];

export default function Products() {
  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: "", category: "vin", price: 0, stock: 0, sku: "" });

  const load = async () => { const { data } = await api.get("/products"); setItems(data); };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try { await api.post("/products", { ...form, price: parseFloat(form.price), stock: parseInt(form.stock) }); toast.success("Produit ajouté"); setShow(false); setForm({ name: "", category: "vin", price: 0, stock: 0, sku: "" }); load(); }
    catch { toast.error("Erreur"); }
  };
  const del = async (id) => { if (!confirm("Supprimer ?")) return; await api.delete(`/products/${id}`); load(); };

  return (
    <div className="space-y-6" data-testid="products-page">
      <div className="flex justify-between items-center">
        <div>
          <p className="overline">Catalogue</p>
          <h1 className="font-display text-4xl">Produits</h1>
        </div>
        <button onClick={() => setShow(true)} className="btn-primary flex items-center gap-2" data-testid="add-product-btn"><Plus size={16} /> Ajouter</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.length === 0 && <div className="col-span-full text-stone-500 text-sm">Aucun produit. Ajoutez votre premier article.</div>}
        {items.map(p => (
          <div key={p.id} className="card-crm p-5" data-testid={`product-${p.id}`}>
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-full bg-[#4A154B]/10 flex items-center justify-center text-[#4A154B]"><Wine size={18} strokeWidth={1.5} /></div>
              <button onClick={() => del(p.id)} className="text-stone-400 hover:text-[#8C2A2A]"><Trash2 size={14} /></button>
            </div>
            <div className="mt-3">
              <p className="overline">{p.category}</p>
              <h3 className="font-display text-lg mt-1 leading-tight">{p.name}</h3>
              {p.sku && <p className="text-xs text-stone-500 mt-1">{p.sku}</p>}
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div><p className="overline">Prix</p><p className="font-display text-2xl text-[#4A154B]">{p.price.toFixed(2)} €</p></div>
              <div className="text-right"><p className="overline">Stock</p><p className={`font-display text-2xl ${p.stock < 20 ? 'text-[#8C2A2A]' : 'text-[#2D5A4C]'}`}>{p.stock}</p></div>
            </div>
          </div>
        ))}
      </div>

      {show && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShow(false)}>
          <form onSubmit={submit} onClick={e=>e.stopPropagation()} className="bg-white rounded-2xl border border-stone-200 max-w-md w-full p-6 space-y-3" data-testid="product-modal">
            <h3 className="font-display text-2xl">Nouveau produit</h3>
            <div><label className="text-xs">Nom *</label><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-crm mt-1" data-testid="prod-name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs">Catégorie</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="input-crm mt-1">{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
              <div><label className="text-xs">SKU</label><input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} className="input-crm mt-1" /></div>
              <div><label className="text-xs">Prix €</label><input type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="input-crm mt-1" data-testid="prod-price" /></div>
              <div><label className="text-xs">Stock</label><input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className="input-crm mt-1" data-testid="prod-stock" /></div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setShow(false)} className="btn-ghost">Annuler</button>
              <button className="btn-primary" data-testid="prod-submit">Enregistrer</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
