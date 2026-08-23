import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { FileDown, Calendar, AlertTriangle } from "lucide-react";
import { t } from "@/lib/i18n";
import { usePageMeta } from "@/lib/pageMeta";

export default function DRM() {
  usePageMeta({ title: `DRM · BEVID` });
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/drm/${year}/${month}`);
      setData(data);
    } catch (err) { toast.error(err.response?.data?.detail || t("toast.erreur")); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [year, month]);

  const exportCSV = () => {
    if (!data) return;
    const header = ["Produit", "Type", "Deg %", "Entrees L", "Sorties L", "Casse L", "Dégust L", "Don L", "Net L", "Alcool pur L"];
    const rows = data.lines.map(l => [l.product_name, l.alcohol_type, l.abv_pct, l.entrees_l, l.sorties_l, l.casse_l, l.degust_l, l.don_l, l.net_l, l.alcool_pur_l]);
    rows.push(["TOTAL", "", "", "", "", "", "", "", "", data.total_alcool_pur_l]);
    const csv = [header, ...rows].map(r => r.map(v => `"${v ?? ''}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `DRM-${data.period}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (user?.role !== "manager") return <div className="p-8 text-stone-500">{t("manager_only")}</div>;

  return (
    <div className="space-y-6" data-testid="drm-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="overline">{t("compliance_tax")}</p>
          <h1 className="font-display text-4xl">{t("drm_page_title")}</h1>
          <p className="text-sm text-stone-500 mt-1">{t("drm_help")}</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900" data-testid="drm-disclaimer">
        <p className="font-medium flex items-center gap-2"><AlertTriangle size={16} /> Aide à la déclaration — pas un télédéclarant agréé</p>
        <p className="mt-2">Ce récapitulatif est calculé automatiquement à partir des mouvements de stock enregistrés dans BEVID (contenants, sorties, retours, casse, dégustation, dons). Vérifiez les chiffres avant transmission aux Douanes.</p>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-4 flex items-center gap-3 flex-wrap" data-testid="period-selector">
        <Calendar size={16} className="text-stone-500" />
        <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="input-crm max-w-[140px] min-h-[44px]" data-testid="drm-month">
          {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{new Date(2020, m-1).toLocaleString("fr-FR", { month: "long" })}</option>)}
        </select>
        <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="input-crm max-w-[100px] min-h-[44px]" data-testid="drm-year">
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y}>{y}</option>)}
        </select>
        <button onClick={exportCSV} disabled={!data?.lines?.length} className="btn-ghost flex items-center gap-2 min-h-[44px] ml-auto" data-testid="drm-export-csv"><FileDown size={16} /> Export CSV</button>
      </div>

      {loading ? <p className="text-stone-500">Calcul…</p> : data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl p-5 border border-stone-200"><p className="overline">Période</p><p className="font-display text-2xl mt-1">{data.period}</p></div>
            <div className="bg-white rounded-2xl p-5 border border-stone-200"><p className="overline">Références alcoolisées</p><p className="font-display text-2xl mt-1">{data.lines.length}</p></div>
            <div className="bg-white rounded-2xl p-5 border border-[#4A154B]/30 bg-[#4A154B]/5"><p className="overline">Alcool pur total sorti (L)</p><p className="font-display text-3xl mt-1 text-[#4A154B]" data-testid="drm-total-ap">{data.total_alcool_pur_l}</p></div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto scroll-shadow">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="bg-stone-50">
                <tr className="text-left text-stone-500 text-xs">
                  <th className="p-3 sticky left-0 bg-stone-50 z-10">{t("column.product")}</th>
                  <th className="p-3">{t("column.type")}</th>
                  <th className="p-3">°</th>
                  <th className="p-3">Entrées L</th>
                  <th className="p-3">Sorties L</th>
                  <th className="p-3">Casse L</th>
                  <th className="p-3">Dégust. L</th>
                  <th className="p-3">Don L</th>
                  <th className="p-3">Net L</th>
                  <th className="p-3">Alcool pur L</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map(l => (
                  <tr key={l.product_id} className="border-t border-stone-100" data-testid={`drm-row-${l.product_id}`}>
                    <td className="p-3 font-medium sticky left-0 bg-white z-10">{l.product_name}</td>
                    <td className="p-3 text-stone-500">{l.alcohol_type}</td>
                    <td className="p-3">{l.abv_pct}%</td>
                    <td className="p-3">{l.entrees_l}</td>
                    <td className="p-3">{l.sorties_l}</td>
                    <td className="p-3">{l.casse_l}</td>
                    <td className="p-3">{l.degust_l}</td>
                    <td className="p-3">{l.don_l}</td>
                    <td className="p-3 font-medium">{l.net_l}</td>
                    <td className="p-3 font-medium text-[#4A154B]">{l.alcool_pur_l}</td>
                  </tr>
                ))}
                {data.lines.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-stone-400">{t("empty.no_movement")}</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-stone-500">{data.note}</p>
        </>
      )}
    </div>
  );
}
