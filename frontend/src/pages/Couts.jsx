import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";
import { Lock, Unlock, AlertTriangle } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { t } from "@/lib/i18n";

export default function Couts() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { confirm } = useConfirm();
  const [lock, setLock] = useState(null);
  const [products, setProducts] = useState([]);
  const [costs, setCosts] = useState({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [l, p, c] = await Promise.all([
      api.get("/margins/lock-status"),
      api.get("/products"),
      api.get("/product-costs").catch(() => ({ data: [] })),
    ]);
    setLock(l.data);
    setProducts(p.data);
    const map = {};
    (c.data || []).forEach(x => { map[x.product_id] = x; });
    setCosts(map);
  };
  useEffect(() => { load(); }, []);

  if (user?.role !== "manager") {
    return <div className="p-8 text-stone-500">Réservé au manager.</div>;
  }

  const setCost = async (pid, field, val) => {
    const current = costs[pid] || { product_id: pid, cost_price: 0, packaging_cost: 0, transport_cost: 0, other_cost: 0 };
    const updated = { ...current, [field]: parseFloat(val) || 0 };
    updated.total_cost = (updated.cost_price || 0) + (updated.packaging_cost || 0) + (updated.transport_cost || 0) + (updated.other_cost || 0);
    setCosts({ ...costs, [pid]: updated });
  };

  const saveCost = async (pid) => {
    setSaving(true);
    try {
      const c = costs[pid];
      await api.post("/product-costs", c);
      toast.success(t("toast.cout_enregistre"));
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("toast.erreur"));
    } finally { setSaving(false); }
  };

  const validate = async () => {
    if (!(await confirm({ title: "Valider les coûts de revient ?", message: "Confirmez-vous avoir saisi vos coûts de revient de façon sérieuse et vérifiée ? Une fois validé, les écrans de marge s'ouvriront.", confirmLabel: "Valider" }))) return;
    try {
      const { data } = await api.post("/admin/costs/validate");
      toast.success(t("toast.v1_couts_valides_marges_activees", { v1: data.products_validated }));
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("toast.erreur"));
    }
  };
  const invalidate = async () => {
    if (!(await confirm({ title: "Réinvalider les coûts ?", message: "Les écrans de marge seront fermés tant que la validation n'aura pas été refaite.", confirmLabel: "Réinvalider", tone: "danger" }))) return;
    await api.post("/admin/costs/invalidate");
    toast.success(t("toast.couts_reinvalides"));
    load();
  };

  return (
    <div className="space-y-6" data-testid="costs-page">
      <div>
        <p className="overline">Paramétrage</p>
        <h2 className="font-display text-3xl mt-1">{t("costs")}</h2>
      </div>

      {/* Verrou */}
      <div className={`rounded-2xl p-5 border ${lock?.unlocked ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`} data-testid="lock-status-block">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            {lock?.unlocked ? <Unlock size={20} className="text-emerald-700 mt-0.5" /> : <Lock size={20} className="text-amber-700 mt-0.5" />}
            <div>
              <p className={`font-medium ${lock?.unlocked ? "text-emerald-900" : "text-amber-900"}`}>
                {lock?.unlocked ? "Marges activées" : t("costs_locked")}
              </p>
              <p className="text-xs mt-1 text-stone-600">
                {lock?.costs_saisis || 0} coûts saisis sur {lock?.products_total || 0} produits.
                {lock?.validated_at && ` Dernière validation : ${lock.validated_at.slice(0, 16).replace("T", " ")}.`}
              </p>
              {!lock?.unlocked && (
                <p className="text-xs mt-2 text-amber-800 flex items-start gap-1">
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                  Une hiérarchie de marges fondée sur des coûts approximatifs produit des décisions fausses.
                  Saisissez chaque coût sérieusement puis validez.
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {lock?.unlocked ? (
              <button onClick={invalidate} className="btn-ghost min-h-[44px]" data-testid="invalidate-btn">{t("invalidate_costs")}</button>
            ) : (
              <button onClick={validate} className="btn-primary min-h-[44px]" data-testid="validate-btn">{t("validate_costs")}</button>
            )}
          </div>
        </div>
      </div>

      {/* Table produits */}
      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50">
            <tr className="text-left text-stone-500 text-xs">
              <th className="p-3">Produit</th>
              <th className="p-3">SKU</th>
              <th className="p-3">Prix vente HT</th>
              <th className="p-3">Coût matière</th>
              <th className="p-3">Conditionnement</th>
              <th className="p-3">Transport</th>
              <th className="p-3">Autres</th>
              <th className="p-3">Total coût</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => {
              const c = costs[p.id] || {};
              return (
                <tr key={p.id} className="border-t border-stone-100" data-testid={`cost-row-${p.id}`}>
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3 text-stone-500 text-xs">{p.sku || "—"}</td>
                  <td className="p-3">{p.price?.toFixed(2)} €</td>
                  <td className="p-3"><input type="number" step="0.01" defaultValue={c.cost_price ?? ""} onBlur={e => setCost(p.id, "cost_price", e.target.value)} className="input-crm w-24 min-h-[44px]" data-testid={`cost-price-${p.id}`} /></td>
                  <td className="p-3"><input type="number" step="0.01" defaultValue={c.packaging_cost ?? ""} onBlur={e => setCost(p.id, "packaging_cost", e.target.value)} className="input-crm w-24 min-h-[44px]" /></td>
                  <td className="p-3"><input type="number" step="0.01" defaultValue={c.transport_cost ?? ""} onBlur={e => setCost(p.id, "transport_cost", e.target.value)} className="input-crm w-24 min-h-[44px]" /></td>
                  <td className="p-3"><input type="number" step="0.01" defaultValue={c.other_cost ?? ""} onBlur={e => setCost(p.id, "other_cost", e.target.value)} className="input-crm w-24 min-h-[44px]" /></td>
                  <td className="p-3 font-medium">{(c.total_cost ?? 0).toFixed(2)} €</td>
                  <td className="p-3"><button onClick={() => saveCost(p.id)} disabled={saving} className="btn-primary text-xs min-h-[44px]" data-testid={`save-cost-${p.id}`}>{t("save")}</button></td>
                </tr>
              );
            })}
            {products.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-stone-400">Aucun produit.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
