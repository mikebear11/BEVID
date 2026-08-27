import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CheckCircle2, MapPin, Phone, Package, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePageMeta } from "@/lib/pageMeta";

/**
 * Livreur — écran ultra-simplifié.
 *
 * Contrat produit (fixé par le PO) :
 *  - <10s par arrêt : un seul geste = livraison marquée. Pas de formulaire,
 *    pas de signature obligatoire.
 *  - Adapté aux gants : cibles ≥ 64px de haut, pas de gestes fins.
 *  - Lumière crue du camion : fond noir + contraste maximum + typo XL.
 *  - Pas de menu de navigation : la page se suffit à elle-même, un livreur
 *    ne doit pas fouiller dans une app.
 */
export default function Livreur() {
  usePageMeta({ title: "Livraison du jour · BEVID" });
  const [items, setItems] = useState([]);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState({});  // id → bool

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/deliveries/today");
      setItems(data.deliveries || []);
      setToday(data.today || "");
    } catch {
      toast.error("Impossible de charger les livraisons");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const markDelivered = async (id) => {
    setMarking(m => ({ ...m, [id]: true }));
    try {
      await api.post(`/orders/${id}/mark-delivered`);
      // Retire de la liste sans rafraîchir tout — le livreur voit son avancée
      setItems(list => list.filter(x => x.id !== id));
    } catch (e) {
      toast.error("Échec — réessayez");
      setMarking(m => ({ ...m, [id]: false }));
    }
  };

  const remaining = items.length;

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-24" data-testid="livreur-page">
      {/* En-tête minimal — informations vitales, rien d'autre */}
      <header className="pt-2 pb-4 border-b border-white/10">
        <p className="text-xs tracking-widest uppercase text-white/50">Livraison</p>
        <div className="flex items-baseline justify-between mt-1">
          <h1 className="text-4xl font-bold" data-testid="livreur-title">
            {new Date(today || new Date()).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h1>
          <div className="text-right">
            <div className="text-5xl font-bold tabular-nums" data-testid="livreur-remaining">{remaining}</div>
            <div className="text-xs uppercase text-white/50">à livrer</div>
          </div>
        </div>
      </header>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-white/60" data-testid="livreur-loading">
          <Loader2 className="animate-spin" /> Chargement…
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="text-center py-24" data-testid="livreur-empty">
          <CheckCircle2 size={80} className="mx-auto text-emerald-400 mb-4" />
          <p className="text-2xl font-bold">Aucune livraison</p>
          <p className="text-white/50 mt-1">Toutes les commandes sont livrées.</p>
        </div>
      )}

      <div className="space-y-3 mt-4">
        {items.map((d) => {
          const busy = !!marking[d.id];
          const address = [d.address, d.postal_code, d.city].filter(Boolean).join(" ");
          return (
            <div
              key={d.id}
              className="bg-white/5 border-2 border-white/10 rounded-2xl p-4 space-y-3"
              data-testid={`livreur-item-${d.id}`}
            >
              <div>
                <div className="text-2xl font-bold leading-tight" data-testid={`livreur-name-${d.id}`}>{d.client_name}</div>
                {address && (
                  <div className="flex items-start gap-2 mt-2 text-lg text-white/80 leading-snug">
                    <MapPin size={20} className="shrink-0 mt-0.5 text-amber-300" />
                    <span>{address}</span>
                  </div>
                )}
                <div className="flex items-center gap-4 mt-2 text-base text-white/70">
                  <span className="flex items-center gap-1.5"><Package size={16} /> {d.lines_count} lignes</span>
                  <span className="tabular-nums">{Number(d.total || 0).toLocaleString('fr-FR')} €</span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {d.phone && (
                  <a
                    href={`tel:${d.phone.replace(/\s/g,'')}`}
                    className="col-span-1 min-h-[64px] rounded-xl bg-white/10 border border-white/20 flex items-center justify-center"
                    data-testid={`livreur-call-${d.id}`}
                    aria-label="Appeler"
                  >
                    <Phone size={26} />
                  </a>
                )}
                <button
                  onClick={() => markDelivered(d.id)}
                  disabled={busy}
                  className={`${d.phone ? 'col-span-3' : 'col-span-4'} min-h-[64px] rounded-xl bg-emerald-500 text-black text-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform`}
                  data-testid={`livreur-mark-${d.id}`}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={28} />}
                  LIVRÉE
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
