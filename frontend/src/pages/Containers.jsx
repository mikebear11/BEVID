import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { QrCode, Plus, MapPin, Package } from "lucide-react";
import { toast } from "sonner";

const TYPES = ["fut", "carton", "palette", "bouteille", "autre"];
const STATUS_LABEL = { en_stock: "En stock", sorti: "Sorti", chez_client: "Chez client", retour: "Retour", vide: "Vide", consigne_facturee: "Consigne facturée", casse: "Cassé" };
const STATUS_COLOR = { en_stock: "bg-emerald-100 text-emerald-800", sorti: "bg-amber-100 text-amber-800", chez_client: "bg-amber-100 text-amber-800", retour: "bg-blue-100 text-blue-800", vide: "bg-stone-100 text-stone-700", consigne_facturee: "bg-purple-100 text-purple-800", casse: "bg-red-100 text-red-800" };

export default function Containers() {
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState({ status: "", type: "" });
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ type: "fut", product_id: "", batch_lot: "", deposit_amount: 50, filled_volume_l: 30, barcode: "" });

  const load = async () => {
    const q = new URLSearchParams();
    if (filter.status) q.set("status", filter.status);
    if (filter.type) q.set("type", filter.type);
    const [c, p] = await Promise.all([
      api.get(`/containers?${q.toString()}`),
      api.get("/products"),
    ]);
    setItems(c.data);
    setProducts(p.data);
  };
  useEffect(() => { load(); }, [filter]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/containers", {
        ...form,
        deposit_amount: parseFloat(form.deposit_amount) || 0,
        filled_volume_l: parseFloat(form.filled_volume_l) || null,
        filled_at: new Date().toISOString(),
      });
      toast.success("Contenant enregistré");
      setShow(false);
      setForm({ type: "fut", product_id: "", batch_lot: "", deposit_amount: 50, filled_volume_l: 30, barcode: "" });
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Erreur"); }
  };

  return (
    <div className="space-y-6" data-testid="containers-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="overline">Traçabilité</p>
          <h1 className="font-display text-4xl">Contenants</h1>
          <p className="text-sm text-stone-500 mt-1">Fûts, cartons, palettes — chaque unité a son QR code.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/scan" className="btn-ghost flex items-center gap-2 min-h-[44px]" data-testid="goto-scan"><QrCode size={16} /> Scanner</Link>
          <button onClick={() => setShow(true)} className="btn-primary flex items-center gap-2 min-h-[44px]" data-testid="add-container"><Plus size={16} /> Enregistrer</button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })} className="input-crm max-w-xs min-h-[44px]" data-testid="filter-status">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filter.type} onChange={e => setFilter({ ...filter, type: e.target.value })} className="input-crm max-w-xs min-h-[44px]" data-testid="filter-type">
          <option value="">Tous les types</option>
          {TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(c => (
          <Link to={`/containers/${c.id}`} key={c.id} className="card-crm p-4 block" data-testid={`container-${c.id}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="overline">{c.type} · {c.filled_volume_l ? `${c.filled_volume_l}L` : "—"}</p>
                <h3 className="font-medium mt-1">{c.product_name || "(sans produit)"}</h3>
                <p className="text-xs text-stone-500 mt-1 font-mono truncate">{c.id.slice(0, 8)}…{c.barcode ? ` · ${c.barcode}` : ""}</p>
              </div>
              <QrCode size={22} className="text-stone-400" />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className={`text-[10px] uppercase tracking-widest font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status] || ""}`}>{STATUS_LABEL[c.status]}</span>
              <span className="text-xs text-stone-500 flex items-center gap-1"><MapPin size={11} /> {c.current_location_name || c.current_location || "—"}</span>
            </div>
            {c.deposit_amount > 0 && <p className="text-xs text-stone-500 mt-2">Consigne : {c.deposit_amount.toFixed(2)} €</p>}
          </Link>
        ))}
        {items.length === 0 && <p className="col-span-full p-8 text-center text-stone-400">Aucun contenant.</p>}
      </div>

      {show && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShow(false)}>
          <form onSubmit={submit} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3" data-testid="new-container-modal">
            <h3 className="font-display text-2xl">Nouveau contenant</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs">Type</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="input-crm mt-1 min-h-[44px]">{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
              <div><label className="text-xs">Produit</label>
                <select value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })} className="input-crm mt-1 min-h-[44px]">
                  <option value="">—</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div><label className="text-xs">Lot / DLC</label><input value={form.batch_lot} onChange={e => setForm({ ...form, batch_lot: e.target.value })} className="input-crm mt-1 min-h-[44px]" /></div>
              <div><label className="text-xs">Volume (L)</label><input type="number" step="0.01" value={form.filled_volume_l} onChange={e => setForm({ ...form, filled_volume_l: e.target.value })} className="input-crm mt-1 min-h-[44px]" /></div>
              <div><label className="text-xs">Consigne (€)</label><input type="number" step="0.01" value={form.deposit_amount} onChange={e => setForm({ ...form, deposit_amount: e.target.value })} className="input-crm mt-1 min-h-[44px]" /></div>
              <div><label className="text-xs">Code-barres (optionnel)</label><input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="EAN..." className="input-crm mt-1 min-h-[44px]" /></div>
            </div>
            <p className="text-xs text-stone-500">Un QR code sera généré automatiquement à partir de l'ID.</p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShow(false)} className="btn-ghost min-h-[44px]">Annuler</button>
              <button className="btn-primary min-h-[44px]" data-testid="submit-container">Enregistrer</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
