import React, { useEffect, useState } from "react";
import { api, API } from "@/lib/api";
import { Plus, X, Trash2, FileDown, PenLine, Repeat, Link2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import SignaturePad from "@/components/SignaturePad";
import PaymentModal from "@/components/PaymentModal";
import XlsxIO from "@/components/XlsxIO";
import { t } from "@/lib/i18n";

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [show, setShow] = useState(false);
  const [selClient, setSelClient] = useState("");
  const [lines, setLines] = useState([]);
  const [notes, setNotes] = useState("");
  const [sigOrderId, setSigOrderId] = useState(null);
  const [payOrderId, setPayOrderId] = useState(null);

  const downloadPdf = async (oid) => {
    const res = await fetch(`${API}/orders/${oid}/pdf`, { credentials: "include" });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `commande-${oid.slice(0,8)}.pdf`; a.click();
    URL.revokeObjectURL(url);
    toast.success(t("toast.pdf_telecharge"));
  };

  const saveSignature = async (dataUrl) => {
    await api.post(`/orders/${sigOrderId}/signature`, { signature: dataUrl });
    toast.success(t("toast.signature_enregistree"));
    setSigOrderId(null); load();
  };

  const reorder = async (oid) => {
    try {
      await api.post(`/orders/reorder/${oid}`);
      toast.success(t("toast.recommande_creee_en_1_clic"));
      load();
    } catch { toast.error(t("toast.erreur")); }
  };

  const generateSignLink = async (oid) => {
    try {
      const { data } = await api.post(`/orders/${oid}/signature-link`);
      const url = `${window.location.origin}${data.url_path}`;
      await navigator.clipboard.writeText(url);
      toast.success(t("toast.lien_copie_envoyez_le_au_client_par"));
    } catch { toast.error(t("toast.erreur")); }
  };

  const load = async () => {
    const [{ data: o }, { data: c }, { data: p }] = await Promise.all([
      api.get("/orders"), api.get("/clients"), api.get("/products")
    ]);
    setOrders(o); setClients(c); setProducts(p);
  };
  useEffect(() => { load(); }, []);

  const addLine = () => setLines([...lines, { product_id: "", product_name: "", quantity: 1, unit_price: 0 }]);
  const updateLine = (i, patch) => setLines(lines.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const rmLine = (i) => setLines(lines.filter((_, idx) => idx !== i));

  const selectProduct = (i, pid) => {
    const p = products.find(x => x.id === pid);
    if (!p) return;
    updateLine(i, { product_id: p.id, product_name: p.name, unit_price: p.price });
  };

  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

  const submit = async (e) => {
    e.preventDefault();
    const client = clients.find(c => c.id === selClient);
    if (!client || lines.length === 0) { toast.error(t("toast.client_et_lignes_requis")); return; }
    await api.post("/orders", { client_id: client.id, client_name: client.name, lines, notes });
    toast.success(t("toast.commande_creee"));
    setShow(false); setSelClient(""); setLines([]); setNotes("");
    load();
  };

  return (
    <div className="space-y-6" data-testid="orders-page">
      <div className="flex justify-between items-center">
        <div><p className="overline">Ventes</p><h1 className="font-display text-4xl">Commandes</h1></div>
        <div className="flex gap-2">
          <XlsxIO kind="orders" label="Excel" />
          <button onClick={() => setShow(true)} className="btn-primary flex items-center gap-2" data-testid="new-order-btn"><Plus size={16} /> Nouvelle commande</button>
        </div>
      </div>

      <div className="card-crm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200 text-left overline">
            <tr><th className="p-3">#</th><th className="p-3">Client</th><th className="p-3 hidden md:table-cell">Date</th><th className="p-3 hidden md:table-cell">Lignes</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Actions</th></tr>
          </thead>
          <tbody>
            {orders.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-stone-500">Aucune commande</td></tr>}
            {orders.map(o => (
              <tr key={o.id} className="border-b border-stone-100 hover:bg-stone-50" data-testid={`order-row-${o.id}`}>
                <td className="p-3 font-mono text-xs">{o.id.slice(0,8)}</td>
                <td className="p-3 font-medium">{o.client_name} {o.signature && <span className="text-[#2D5A4C] text-xs ml-1">· signée</span>}</td>
                <td className="p-3 hidden md:table-cell text-stone-600">{o.created_at.slice(0,10)}</td>
                <td className="p-3 hidden md:table-cell">{o.lines.length}</td>
                <td className="p-3 text-right font-display text-[#2D5A4C]">{o.total.toLocaleString('fr-FR')} €</td>
                <td className="p-3 text-right">
                  <div className="inline-flex gap-1">
                    <button onClick={() => setPayOrderId(o.id)} className="text-stone-500 hover:text-[#2D5A4C] p-1" title="Encaisser (Apple Pay / Google Pay)" data-testid={`pay-btn-${o.id}`}><CreditCard size={14} /></button>
                    <button onClick={() => reorder(o.id)} className="text-stone-500 hover:text-[#2D5A4C] p-1" title="Recommander (1-clic)" data-testid={`reorder-btn-${o.id}`}><Repeat size={14} /></button>
                    <button onClick={() => generateSignLink(o.id)} className="text-stone-500 hover:text-[#4A154B] p-1" title="Lien signature à distance" data-testid={`share-sign-btn-${o.id}`}><Link2 size={14} /></button>
                    <button onClick={() => setSigOrderId(o.id)} className="text-stone-500 hover:text-[#4A154B] p-1" title="Signer sur place" data-testid={`sign-btn-${o.id}`}><PenLine size={14} /></button>
                    <button onClick={() => downloadPdf(o.id)} className="text-stone-500 hover:text-[#4A154B] p-1" title="PDF" data-testid={`pdf-btn-${o.id}`}><FileDown size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {show && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShow(false)}>
          <form onSubmit={submit} onClick={e=>e.stopPropagation()} className="bg-white rounded-2xl border border-stone-200 max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto" data-testid="order-modal">
            <h3 className="font-display text-2xl">Nouvelle commande</h3>
            <div>
              <label className="text-xs">Client *</label>
              <select required value={selClient} onChange={e => setSelClient(e.target.value)} className="input-crm mt-1" data-testid="order-client-select">
                <option value="">— Choisir —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs overline">Lignes</label>
                <button type="button" onClick={addLine} className="text-xs text-[#4A154B] flex items-center gap-1" data-testid="add-line-btn"><Plus size={12} /> Ajouter</button>
              </div>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-center">
                  <select value={l.product_id} onChange={e => selectProduct(i, e.target.value)} className="input-crm col-span-6 text-sm" required>
                    <option value="">Produit…</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.price}€)</option>)}
                  </select>
                  <input type="number" min={1} value={l.quantity} onChange={e => updateLine(i, { quantity: parseInt(e.target.value) || 1 })} className="input-crm col-span-2 text-sm" />
                  <input type="number" step="0.01" value={l.unit_price} onChange={e => updateLine(i, { unit_price: parseFloat(e.target.value) || 0 })} className="input-crm col-span-3 text-sm" />
                  <button type="button" onClick={() => rmLine(i)} className="col-span-1 text-stone-400"><Trash2 size={14} /></button>
                </div>
              ))}
              {lines.length === 0 && <p className="text-xs text-stone-500">Aucune ligne. Cliquez sur "Ajouter".</p>}
            </div>
            <div><label className="text-xs">Notes</label><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="input-crm mt-1" /></div>
            <div className="flex justify-between items-center border-t pt-3">
              <div><p className="overline">Total</p><p className="font-display text-3xl text-[#2D5A4C]">{total.toFixed(2)} €</p></div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShow(false)} className="btn-ghost">Annuler</button>
                <button className="btn-primary" data-testid="order-submit">Valider</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {sigOrderId && <SignaturePad onSave={saveSignature} onClose={() => setSigOrderId(null)} />}
      {payOrderId && <PaymentModal orderId={payOrderId} onClose={() => setPayOrderId(null)} onPaid={load} />}
    </div>
  );
}
