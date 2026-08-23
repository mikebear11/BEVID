import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Building2, Loader2, TrendingUp, ShoppingCart, Landmark, ExternalLink } from "lucide-react";
import { usePageMeta } from "@/lib/pageMeta";

export default function CompanyDetail() {
  const { id } = useParams();
  const [company, setCompany] = useState(null);
  const [agg, setAgg] = useState(null);
  const [loading, setLoading] = useState(true);
  usePageMeta({ title: `${company?.legal_name || "Société"} · BEVID` });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [c, a] = await Promise.all([
          api.get(`/companies/${id}`),
          api.get(`/companies/${id}/aggregate`).catch(() => ({ data: null })),
        ]);
        if (cancelled) return;
        setCompany(c.data);
        setAgg(a.data);
      } catch { toast.error("Chargement impossible"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <div className="p-8"><Loader2 size={20} className="animate-spin mx-auto text-stone-400" aria-hidden="true" /></div>;
  if (!company) return <div className="p-8 text-stone-500">Société introuvable.</div>;

  return (
    <div className="space-y-6" data-testid="company-detail-page">
      <Link to="/companies" className="text-sm text-stone-500 flex items-center gap-1 min-h-[44px]" data-testid="back-to-companies">
        <ArrowLeft size={14} aria-hidden="true" /> Sociétés
      </Link>

      <div>
        <p className="overline flex items-center gap-1"><Building2 size={12} aria-hidden="true" /> Entité juridique</p>
        <h1 className="font-display text-4xl">{company.legal_name}</h1>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
          {company.siren && <span>SIREN <span className="font-mono">{company.siren}</span></span>}
          {company.ownership_type && <span>Forme {company.ownership_type}</span>}
          {company.rcs && <span>RCS {company.rcs}</span>}
          {company.tva_intracom && <span>TVA {company.tva_intracom}</span>}
          {company.capital_social && <span>Capital {company.capital_social}</span>}
        </div>
      </div>

      {agg && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="card-crm p-4"><p className="overline">Établissements</p><p className="font-display text-3xl mt-1">{agg.establishments.length}</p></div>
          <div className="card-crm p-4"><p className="overline flex items-center gap-1"><ShoppingCart size={10} aria-hidden="true" /> Commandes</p><p className="font-display text-3xl mt-1">{agg.orders_count}</p></div>
          <div className="card-crm p-4"><p className="overline flex items-center gap-1"><TrendingUp size={10} aria-hidden="true" /> CA total</p><p className="font-display text-3xl mt-1 text-[#2D5A4C]">{Number(agg.total_revenue || 0).toLocaleString(undefined)} €</p></div>
          <div className="card-crm p-4 md:col-span-3"><p className="overline flex items-center gap-1"><Landmark size={10} aria-hidden="true" /> Encours factures ouvertes</p><p className="font-display text-2xl mt-1 text-[#8C2A2A]">{Number(agg.invoices_open_ttc || 0).toLocaleString(undefined)} €</p></div>
        </div>
      )}

      <div className="card-crm overflow-x-auto scroll-shadow">
        <div className="px-4 py-3 border-b border-stone-200"><h2 className="font-display text-xl">Établissements rattachés</h2></div>
        <table className="w-full text-sm min-w-[520px]">
          <thead className="bg-stone-50 border-b border-stone-200 text-left overline">
            <tr>
              <th className="p-3 sticky left-0 bg-stone-50 z-10">Nom</th>
              <th className="p-3">SIRET</th>
              <th className="p-3">Ville</th>
              <th className="p-3 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {(company.establishments || []).length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-stone-500">Aucun établissement rattaché. Depuis une fiche établissement, associez-la à cette société.</td></tr>
            )}
            {(company.establishments || []).map(e => (
              <tr key={e.id} className="border-b border-stone-100 hover:bg-stone-50">
                <td className="p-3 sticky left-0 bg-white z-10 font-medium">
                  <Link to={`/clients/${e.id}`} className="hover:text-[#4A154B]" data-testid={`etab-link-${e.id}`}>{e.name}</Link>
                </td>
                <td className="p-3 font-mono text-xs text-stone-500">{e.siret || "—"}</td>
                <td className="p-3 text-stone-500">{e.city || "—"}</td>
                <td className="p-3 text-right">
                  <Link to={`/clients/${e.id}`} className="text-xs text-[#4A154B] hover:underline flex items-center gap-1 justify-end">
                    <ExternalLink size={11} aria-hidden="true" /> Ouvrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
