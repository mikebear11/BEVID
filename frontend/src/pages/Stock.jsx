import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Package, ArrowRight, Warehouse } from "lucide-react";
import { Link } from "react-router-dom";

export default function Stock() {
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
          <p className="overline">Entrepôt & terrain</p>
          <h1 className="font-display text-4xl">État du stock</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/containers" className="btn-ghost min-h-[44px]">Contenants</Link>
          <Link to="/scan" className="btn-primary min-h-[44px]">Scanner</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { l: "En stock", v: totals.en_stock, c: "text-emerald-700 bg-emerald-50" },
          { l: "Chez clients", v: totals.chez_client, c: "text-amber-700 bg-amber-50" },
          { l: "Retour attendu", v: totals.retour, c: "text-blue-700 bg-blue-50" },
          { l: "Vides / à laver", v: totals.vide, c: "text-stone-700 bg-stone-100" },
          { l: "Volume total (L)", v: totals.volume_l.toFixed(0), c: "text-[#4A154B] bg-[#4A154B]/5" },
        ].map(k => (
          <div key={k.l} className={`rounded-2xl p-4 ${k.c}`} data-testid={`stock-kpi-${k.l}`}>
            <p className="text-xs">{k.l}</p>
            <p className="font-display text-2xl mt-1">{k.v}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-stone-500">Chargement…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50">
              <tr className="text-left text-stone-500 text-xs">
                <th className="p-3">Produit</th>
                <th className="p-3">Catégorie</th>
                <th className="p-3">Deg.</th>
                <th className="p-3">En stock</th>
                <th className="p-3">Chez clients</th>
                <th className="p-3">Retours</th>
                <th className="p-3">Vides</th>
                <th className="p-3">Volume (L)</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(r => (
                <tr key={r.product_id} className="border-t border-stone-100" data-testid={`stock-row-${r.product_id}`}>
                  <td className="p-3 font-medium">{r.product_name}</td>
                  <td className="p-3 text-stone-500">{r.category || "—"}</td>
                  <td className="p-3">{r.abv_pct ? `${r.abv_pct}%` : "—"}</td>
                  <td className="p-3">{r.en_stock || 0}</td>
                  <td className="p-3">{r.chez_client || 0}</td>
                  <td className="p-3">{r.retour || 0}</td>
                  <td className="p-3">{r.vide || 0}</td>
                  <td className="p-3 font-medium">{(r.volume_l || 0).toFixed(0)}</td>
                </tr>
              ))}
              {summary.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-stone-400">Aucun contenant enregistré.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
