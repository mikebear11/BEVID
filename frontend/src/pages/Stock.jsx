import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Package, ArrowRight, Warehouse } from "lucide-react";
import { Link } from "react-router-dom";
import { t } from "@/lib/i18n";
import { usePageMeta } from "@/lib/pageMeta";

export default function Stock() {
  usePageMeta({ title: `${t("stock_state")} · BEVID` });
  const { user } = useAuth();
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/stock/summary").then(r => setSummary(r.data)).finally(() => setLoading(false));
  }, []);

  const totals = summary.reduce((s, r) => ({
    en_stock: s.en_stock + (r.en_stock || 0),
    chez_client: s.chez_client + (r.chez_client || 0),
    retour: s.retour + (r.retour || 0),
    vide: s.vide + (r.vide || 0),
    volume_l: s.volume_l + (r.volume_l || 0),
  }), { en_stock: 0, chez_client: 0, retour: 0, vide: 0, volume_l: 0 });

  return (
    <div className="space-y-6" data-testid="stock-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="overline">{t("warehouse_field")}</p>
          <h1 className="font-display text-4xl">{t("stock_state")}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/containers" className="btn-ghost min-h-[44px]">{t("containers")}</Link>
          <Link to="/scan" className="btn-primary min-h-[44px]">{t("scan")}</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { l: t("column.in_stock"), v: totals.en_stock, c: "text-emerald-700 bg-emerald-50" },
          { l: t("column.at_clients"), v: totals.chez_client, c: "text-amber-700 bg-amber-50" },
          { l: t("column.returns"), v: totals.retour, c: "text-blue-700 bg-blue-50" },
          { l: t("column.empty"), v: totals.vide, c: "text-stone-700 bg-stone-100" },
          { l: t("column.volume"), v: totals.volume_l.toFixed(0), c: "text-[#4A154B] bg-[#4A154B]/5" },
        ].map(k => (
          <div key={k.l} className={`rounded-2xl p-4 ${k.c}`} data-testid={`stock-kpi-${k.l}`}>
            <p className="text-xs">{k.l}</p>
            <p className="font-display text-2xl mt-1">{k.v}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-stone-500">{t("loading_ellipsis")}</p>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto scroll-shadow">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-stone-50">
              <tr className="text-left text-stone-500 text-xs">
                <th className="p-3 sticky left-0 bg-stone-50 z-10">{t("column.product")}</th>
                <th className="p-3">{t("column.category")}</th>
                <th className="p-3">{t("column.degrees")}</th>
                <th className="p-3">{t("column.in_stock")}</th>
                <th className="p-3">{t("column.at_clients")}</th>
                <th className="p-3">{t("column.returns")}</th>
                <th className="p-3">{t("column.empty")}</th>
                <th className="p-3">{t("column.volume")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(r => (
                <tr key={r.product_id} className="border-t border-stone-100" data-testid={`stock-row-${r.product_id}`}>
                  <td className="p-3 font-medium sticky left-0 bg-white z-10">{r.product_name}</td>
                  <td className="p-3 text-stone-500">{r.category || "—"}</td>
                  <td className="p-3">{r.abv_pct ? `${r.abv_pct}%` : "—"}</td>
                  <td className="p-3">{r.en_stock || 0}</td>
                  <td className="p-3">{r.chez_client || 0}</td>
                  <td className="p-3">{r.retour || 0}</td>
                  <td className="p-3">{r.vide || 0}</td>
                  <td className="p-3 font-medium">{(r.volume_l || 0).toFixed(0)}</td>
                </tr>
              ))}
              {summary.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-stone-400">{t("empty.no_stock")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
