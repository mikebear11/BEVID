import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, postOffline } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Search, Minus, Plus, Trash2, ShoppingCart, MapPin, Clock, RotateCcw, Check, AlertOctagon, Loader2 } from "lucide-react";
import { t } from "@/lib/i18n";

const CREDIT_LABEL = { vert: "En règle", orange: "Retard — vigilance", rouge: "COMPTE BLOQUÉ" };
const CREDIT_BG = { vert: "bg-emerald-50 text-emerald-800 border-emerald-200",
                    orange: "bg-amber-50 text-amber-900 border-amber-200",
                    rouge: "bg-red-50 text-red-800 border-red-200" };
const TVA = 0.20; // TVA par défaut

export default function MobileOrder() {
  const { id } = useParams();
  const nav = useNavigate();
  const [catalog, setCatalog] = useState(null);
  const [cart, setCart] = useState({}); // { product_id: { qty, unit_price, discount_pct, product_name } }
  const [step, setStep] = useState(1); // 1 catalog+cart · 2 récap · 3 signature
  const [q, setQ] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [geoAllowed, setGeoAllowed] = useState(true);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [signed, setSigned] = useState(false);
  const [gps, setGps] = useState(null);

  useEffect(() => {
    api.get("/org/settings").then(r => setGeoAllowed(!!r.data.geolocation_enabled)).catch(() => {});
    api.get(`/establishments/${id}/catalog`)
       .then(r => setCatalog(r.data))
       .catch(() => toast.error(t("toast.erreur_chargement_catalogue")));
  }, [id]);

  const products = catalog?.products || [];
  const est = catalog?.establishment;
  const maxDiscount = catalog?.max_discount_pct ?? 15;
  const blocked = est?.credit_status === "rouge";

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products;
    return products.filter(p => (p.name || "").toLowerCase().includes(s) || (p.sku || "").toLowerCase().includes(s));
  }, [q, products]);

  const cartArr = Object.values(cart);

  // Calcul du palier de remise hecto applicable pour un produit,
  // basé sur la quantité totale commandée du produit dans le panier.
  const applicableHecto = (pid, qty) => {
    const p = products.find(x => x.id === pid);
    if (!p || !p.volume_liters || !(p.hecto_tiers || []).length) return { pct: 0, tier: null, next: null, hl: 0 };
    const hl = (qty * p.volume_liters) / 100;
    const sorted = [...p.hecto_tiers].sort((a, b) => a.min_hl - b.min_hl);
    let active = null, next = null;
    for (const t of sorted) {
      if (hl >= t.min_hl) active = t;
      else if (!next) next = t;
    }
    return { pct: active?.discount_pct || 0, tier: active, next, hl };
  };

  const subtotal = cartArr.reduce((s, l) => {
    const hectoPct = applicableHecto(l.product_id, l.qty).pct;
    const totalPct = Math.min(100, (l.discount_pct || 0) + hectoPct);
    return s + l.qty * l.unit_price * (1 - totalPct / 100);
  }, 0);
  const tva = subtotal * TVA;
  const total = subtotal + tva;

  const setQty = (p, delta) => {
    setCart(prev => {
      const cur = prev[p.id] || { product_id: p.id, qty: 0, unit_price: p.unit_price_client ?? p.price, discount_pct: 0, product_name: p.name };
      const q = Math.max(0, cur.qty + delta);
      if (q === 0) { const c = { ...prev }; delete c[p.id]; return c; }
      return { ...prev, [p.id]: { ...cur, qty: q } };
    });
  };
  const setDiscount = (pid, val) => {
    const d = Math.min(Math.max(parseFloat(val) || 0, 0), maxDiscount);
    setCart(prev => ({ ...prev, [pid]: { ...prev[pid], discount_pct: d } }));
  };

  // --- Signature canvas ---
  const getPoint = (ev) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    const t = ev.touches ? ev.touches[0] : ev;
    return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) };
  };
  const start = (ev) => { ev.preventDefault(); drawingRef.current = true; const p = getPoint(ev); const ctx = canvasRef.current.getContext("2d"); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (ev) => { if (!drawingRef.current) return; ev.preventDefault(); const p = getPoint(ev); const ctx = canvasRef.current.getContext("2d"); ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#111"; ctx.lineTo(p.x, p.y); ctx.stroke(); setSigned(true); };
  const end = () => { drawingRef.current = false; };
  const clearSig = () => { const c = canvasRef.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); setSigned(false); };

  const captureGPS = () => {
    if (!geoAllowed || !navigator.geolocation) {
      toast.error(t("toast.geolocalisation_desactivee_par_l_or"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, timestamp: new Date().toISOString() });
        toast.success(t("toast.position_captee"));
      },
      (err) => toast.error(t("toast.gps_refuse_impossible")),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const finalize = async () => {
    if (blocked) return;
    if (!deliveryDate) { toast.error(t("toast.date_de_livraison_obligatoire")); return; }
    if (cartArr.length === 0) { toast.error(t("toast.panier_vide")); return; }
    if (!signed) { toast.error(t("toast.signature_client_requise")); return; }
    setCreating(true);
    try {
      const lines = Object.entries(cart).map(([pid, l]) => {
        const h = applicableHecto(pid, l.qty);
        const totalPct = Math.min(100, (l.discount_pct || 0) + h.pct);
        return {
          product_id: pid, product_name: l.product_name, quantity: l.qty,
          unit_price: parseFloat((l.unit_price * (1 - totalPct / 100)).toFixed(2)),
          discount_pct: l.discount_pct || 0,
          hecto_discount_pct: h.pct || 0,
        };
      });
      const sig = canvasRef.current.toDataURL("image/png");
      // Signature intégrée dans la même mutation → 1 seul POST, resyncable offline
      const payload = {
        client_id: id, client_name: est.name,
        lines,
        delivery_date: deliveryDate,
        notes,
        subtotal_ht: parseFloat(subtotal.toFixed(2)),
        tva_amount: parseFloat(tva.toFixed(2)),
        total_ttc: parseFloat(total.toFixed(2)),
        gps: gps || null,
        signature_data_url: sig,
        signature_gps: gps || null,
        signature_signed_at: new Date().toISOString(),
        client_uuid: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random()}`,
      };
      const res = await postOffline("/orders", payload);
      if (res.offline) {
        toast.success(t("toast.commande_signature_en_file_synchro_"), { icon: "📶" });
      } else {
        toast.success(t("toast.commande_signee"));
        // Envoi automatique du PDF par email si le client a une adresse
        try {
          const orderId = res.data?.id;
          if (orderId && est?.email) {
            await api.post(`/orders/${orderId}/send-pdf-email`, {});
            toast.success(t("toast.pdf_envoye_a_v1", { v1: est.email }), { icon: "📧" });
          }
        } catch (e) { /* silent : l'utilisateur peut renvoyer manuellement */ }
      }
      nav(`/etab/${id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || t("toast.erreur_commande"));
    } finally { setCreating(false); }
  };

  if (!catalog) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  // ---------- ÉCRAN BLOQUÉ (rouge) ----------
  if (blocked && step === 1) {
    return (
      <div className="pb-32" data-testid="mobile-order-blocked">
        <Link to={`/etab/${id}`} className="text-sm text-stone-500 flex items-center gap-1 mb-3"><ArrowLeft size={14} /> Retour</Link>
        <div className="p-6 rounded-2xl border-2 border-red-300 bg-red-50 text-red-900" data-testid="red-block">
          <div className="flex items-center gap-2 mb-2"><AlertOctagon size={22} /><h2 className="font-display text-2xl">Commande refusée</h2></div>
          <p className="text-sm">Le compte <b>{est.name}</b> est bloqué : retard {est.overdue_days || 0}j sur {(est.overdue_amount || 0).toFixed(2)} €.</p>
          <p className="text-sm mt-2">Aucune commande ne peut être prise tant que le compte n'est pas régularisé ou qu'une dérogation n'a pas été validée par le manager.</p>
          <Link to={`/etab/${id}`} className="mt-4 inline-block bg-white border border-red-300 text-red-800 px-4 py-3 rounded-xl font-medium min-h-[48px]" data-testid="ask-derogation-link">
            Demander une dérogation
          </Link>
        </div>
      </div>
    );
  }

  // ---------- STEP 1 : CATALOGUE + PANIER ----------
  if (step === 1) {
    return (
      <div className="pb-40" data-testid="mobile-order-step1">
        <div className="flex items-center justify-between mb-3">
          <Link to={`/etab/${id}`} className="text-sm text-stone-500 flex items-center gap-1"><ArrowLeft size={14} /> Retour</Link>
          <span className={`px-2 py-1 text-xs rounded-full border ${CREDIT_BG[est.credit_status] || CREDIT_BG.vert}`}>{CREDIT_LABEL[est.credit_status] || est.credit_status}</span>
        </div>
        <h1 className="font-display text-2xl mb-1">{est.name}</h1>
        <p className="text-xs text-stone-500 mb-3">Tarifs {catalog.max_discount_pct ? `spécifiques (remise max ${catalog.max_discount_pct}%)` : "par défaut"}</p>

        {/* Search */}
        <div className="sticky top-16 md:top-0 z-20 bg-stone-50/95 backdrop-blur-sm py-2 -mx-4 px-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un produit…"
              className="input-crm w-full pl-9 min-h-[48px] text-base"
              data-testid="order-search"
            />
          </div>
        </div>

        <div className="space-y-2 mt-3">
          {filtered.map(p => {
            const line = cart[p.id];
            const qty = line?.qty || 0;
            const price = p.unit_price_client ?? p.price;
            const hecto = qty > 0 ? applicableHecto(p.id, qty) : null;
            return (
              <div key={p.id} className={`bg-white rounded-xl p-3 border ${qty > 0 ? "border-[#4A154B]/50" : "border-stone-200"}`} data-testid={`product-card-${p.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{p.name}</p>
                    <p className="text-xs text-stone-500">{p.sku || p.category} · {price.toFixed(2)} €{p.on_price_list && <span className="ml-1 text-xs text-emerald-700 bg-emerald-50 px-1 rounded">tarif client</span>}{p.volume_liters ? <span className="ml-1 text-xs text-stone-500">{p.volume_liters}L/u</span> : null}</p>
                    {p.habitual_qty > 0 && <p className="text-xs text-stone-500 mt-1">Habitude : ~{p.habitual_qty} u.</p>}
                    {(p.hecto_tiers || []).length > 0 && qty === 0 && (
                      <p className="text-xs text-emerald-700 bg-emerald-50 inline-block px-1.5 py-0.5 rounded mt-1" data-testid={`hecto-badge-${p.id}`}>
                        Tarif hecto : {p.hecto_tiers.map(t => `${t.min_hl}hL → -${t.discount_pct}%`).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => setQty(p, -1)} disabled={qty === 0} className="w-11 h-11 rounded-lg bg-stone-100 text-stone-700 disabled:opacity-30 flex items-center justify-center" data-testid={`qty-minus-${p.id}`}><Minus size={16} /></button>
                    <span className="w-8 text-center font-medium text-base" data-testid={`qty-${p.id}`}>{qty}</span>
                    <button onClick={() => setQty(p, +1)} className="w-11 h-11 rounded-lg bg-[#4A154B] text-white flex items-center justify-center" data-testid={`qty-plus-${p.id}`}><Plus size={16} /></button>
                  </div>
                </div>
                {qty > 0 && (
                  <div className="mt-2 pt-2 border-t border-stone-100 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <label className="text-stone-500">Remise %</label>
                      <input type="number" min={0} max={maxDiscount} step={0.5} value={line.discount_pct || 0}
                             onChange={(e) => setDiscount(p.id, e.target.value)}
                             className="w-16 border border-stone-300 rounded px-2 py-1 min-h-[36px]" data-testid={`discount-${p.id}`} />
                      <span className="text-stone-400">(max {maxDiscount}%)</span>
                      <span className="ml-auto font-medium">{(qty * price * (1 - ((line.discount_pct || 0) + (hecto?.pct || 0)) / 100)).toFixed(2)} €</span>
                    </div>
                    {hecto && hecto.pct > 0 && (
                      <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-2 py-1 rounded" data-testid={`hecto-active-${p.id}`}>
                        <span>🍺 Palier {hecto.tier.min_hl}hL activé → -{hecto.tier.discount_pct}% ({hecto.hl.toFixed(2)}hL)</span>
                      </div>
                    )}
                    {hecto && hecto.next && (
                      <div className="text-stone-500" data-testid={`hecto-next-${p.id}`}>
                        +{(hecto.next.min_hl - hecto.hl).toFixed(1)} hL pour palier -{hecto.next.discount_pct}%
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && <p className="text-center py-10 text-stone-400">Aucun produit</p>}
        </div>

        {/* Bottom sheet cart (thumb-zone) */}
        <div className="fixed bottom-0 left-0 right-0 md:left-64 z-30 bg-white border-t border-stone-200 p-3 pb-safe" data-testid="cart-summary">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-stone-500">{cartArr.length} produit(s) · {cartArr.reduce((s, l) => s + l.qty, 0)} u.</p>
              <p className="font-display text-xl truncate">{total.toFixed(2)} € <span className="text-xs text-stone-500">TTC</span></p>
            </div>
            <button onClick={() => setStep(2)} disabled={cartArr.length === 0} className="btn-primary min-h-[48px] px-6 flex items-center gap-2 disabled:opacity-40" data-testid="cart-next">
              Suite <ShoppingCart size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- STEP 2 : RÉCAP + LIVRAISON ----------
  if (step === 2) {
    return (
      <div className="pb-40" data-testid="mobile-order-step2">
        <button onClick={() => setStep(1)} className="text-sm text-stone-500 flex items-center gap-1 mb-3"><ArrowLeft size={14} /> Modifier panier</button>
        <h1 className="font-display text-2xl mb-3">Récapitulatif</h1>

        <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100 mb-4">
          {cartArr.map((l, i) => (
            <div key={i} className="p-3 flex items-center justify-between text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{l.product_name}</p>
                <p className="text-xs text-stone-500">{l.qty} × {l.unit_price.toFixed(2)} € {l.discount_pct ? `(-${l.discount_pct}%)` : ""}</p>
              </div>
              <p className="font-medium flex-shrink-0">{(l.qty * l.unit_price * (1 - (l.discount_pct || 0) / 100)).toFixed(2)} €</p>
            </div>
          ))}
          <div className="p-3 flex justify-between text-sm"><span className="text-stone-500">Sous-total HT</span><span>{subtotal.toFixed(2)} €</span></div>
          <div className="p-3 flex justify-between text-sm"><span className="text-stone-500">TVA {(TVA * 100).toFixed(0)}%</span><span>{tva.toFixed(2)} €</span></div>
          <div className="p-3 flex justify-between font-medium"><span>Total TTC</span><span className="font-display text-lg">{total.toFixed(2)} €</span></div>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-3 space-y-3">
          <div>
            <label className="text-xs text-stone-600">Date de livraison souhaitée *</label>
            <input type="date" required value={deliveryDate} min={new Date().toISOString().slice(0, 10)}
                   onChange={(e) => setDeliveryDate(e.target.value)}
                   className="input-crm mt-1 min-h-[48px] text-base" data-testid="delivery-date" />
          </div>
          <div>
            <label className="text-xs text-stone-600">Notes</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="input-crm mt-1" placeholder="Ex : livraison entre 8h et 10h côté cour" data-testid="order-notes" />
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 md:left-64 z-30 bg-white border-t border-stone-200 p-3 pb-safe">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="flex-1 font-display text-xl">{total.toFixed(2)} €</div>
            <button onClick={() => deliveryDate ? setStep(3) : toast.error(t("toast.date_obligatoire"))} className="btn-primary min-h-[48px] px-6" data-testid="to-signature">
              Signature client →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- STEP 3 : SIGNATURE + GPS ----------
  return (
    <div className="pb-40" data-testid="mobile-order-step3">
      <button onClick={() => setStep(2)} className="text-sm text-stone-500 flex items-center gap-1 mb-3"><ArrowLeft size={14} /> Récap</button>
      <h1 className="font-display text-2xl mb-1">Signature client</h1>
      <p className="text-xs text-stone-500 mb-4">Le client signe avec le doigt. Horodatage et position captés au moment de la signature (jamais en continu).</p>

      <div className="bg-white rounded-xl border border-stone-300 p-3">
        <canvas
          ref={canvasRef}
          width={700} height={240}
          className="w-full h-56 border border-dashed border-stone-300 rounded bg-white touch-none"
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          data-testid="signature-canvas"
        />
        <div className="flex items-center justify-between mt-2">
          <button onClick={clearSig} className="text-sm text-stone-500 flex items-center gap-1 min-h-[44px] px-2" data-testid="signature-clear"><RotateCcw size={14} /> Effacer</button>
          <span className="text-xs text-stone-500 flex items-center gap-1"><Clock size={12} /> {new Date().toLocaleString('fr-FR')}</span>
        </div>
      </div>

      {/* GPS ponctuel */}
      <div className="mt-4 bg-white rounded-xl border border-stone-200 p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium flex items-center gap-2"><MapPin size={14} /> Position (ponctuelle)</p>
            {gps ? (
              <p className="text-xs text-stone-500 mt-1">📍 {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} · ±{Math.round(gps.accuracy)}m</p>
            ) : (
              <p className="text-xs text-stone-500 mt-1">{geoAllowed ? "Non captée" : "Désactivée par l'organisation"}</p>
            )}
          </div>
          <button onClick={captureGPS} disabled={!geoAllowed} className="btn-ghost min-h-[44px] px-3 text-sm disabled:opacity-40" data-testid="capture-gps-btn">
            {gps ? "Recapter" : "Capter"}
          </button>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 md:left-64 z-30 bg-white border-t border-stone-200 p-3 pb-safe">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="flex-1 font-display text-xl">{total.toFixed(2)} €</div>
          <button onClick={finalize} disabled={!signed || creating} className="btn-primary min-h-[48px] px-6 flex items-center gap-2 disabled:opacity-40" data-testid="confirm-order">
            {creating ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}
