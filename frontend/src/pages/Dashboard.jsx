import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { TrendingUp, Users, ShoppingCart, Award, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import FollowUpsWidget from "@/components/FollowUpsWidget";
import GoalsWidget from "@/components/GoalsWidget";
import TeamGoalGauge from "@/components/TeamGoalGauge";
import SalesWeather from "@/components/SalesWeather";
import OverdueBanner from "@/components/OverdueBanner";
import CashflowWidget from "@/components/CashflowWidget";
import MorningChecklist from "@/components/MorningChecklist";
import AnniversariesWidget from "@/components/AnniversariesWidget";
import DepositCapitalWidget from "@/components/DepositCapitalWidget";
import SyncFeed from "@/components/SyncFeed";
import { t } from "@/lib/i18n";
import { usePageMeta } from "@/lib/pageMeta";

export default function Dashboard() {
  usePageMeta({ title: `${t("dashboard")} · BEVID` });
  const { user } = useAuth();
  const [k, setK] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [lowStock, setLowStock] = useState({ items: [], count: 0 });

  const load = async () => {
    try {
      const [{ data: kpi }, { data: ls }] = await Promise.all([api.get("/dashboard/kpis"), api.get("/alerts/low-stock?threshold=30")]);
      setK(kpi); setLowStock(ls);
    }
    catch(e) { toast.error(t("toast.erreur_chargement_kpis")); }
  };
  useEffect(() => { load(); }, []);

  const seed = async () => {
    setSeeding(true);
    try { await api.post("/seed/demo"); await load(); toast.success(t("toast.donnees_de_demo_ajoutees")); }
    catch(e) { toast.error(t("toast.erreur_seed")); }
    finally { setSeeding(false); }
  };

  if (!k) return <div className="text-stone-500">{t("loading_ellipsis")}</div>;

  const cards = [
    { label: t("kpi_revenue"), value: `${k.total_ca.toLocaleString(undefined)} €`, icon: TrendingUp, color: "#2D5A4C" },
    { label: t("kpi_orders"), value: k.orders_count, icon: ShoppingCart, color: "#4A154B" },
    { label: t("kpi_active_clients"), value: k.active_clients, icon: Users, color: "#C78B3A" },
    { label: t("kpi_vip_clients"), value: k.vip_clients, icon: Award, color: "#4A154B" },
  ];

  const empty = k.orders_count === 0 && k.clients_count === 0;

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="overline">{t("dashboard_overview")}</p>
          <h1 className="font-display text-4xl md:text-5xl mt-1">{t("dashboard_greeting", { name: user?.name?.split(' ')[0] || "" })}</h1>
          <p className="text-stone-500 mt-1 text-sm">{t("dashboard_glance")}</p>
        </div>
        {empty && (
          <button onClick={seed} disabled={seeding} className="btn-primary flex items-center gap-2 min-h-[44px]" data-testid="seed-demo-btn">
            <Sparkles size={16} aria-hidden="true" /> {seeding ? t("loading_ellipsis") : t("dashboard_load_demo")}
          </button>
        )}
      </div>

      {lowStock.count > 0 && (
        <div className="card-crm p-4 border-l-4 border-l-[#C78B3A] flex items-start gap-3" data-testid="low-stock-banner">
          <AlertTriangle size={20} className="text-[#C78B3A] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-sm">{t("low_stock_alert", { n: lowStock.count }) || `Alerte stock bas · ${lowStock.count} produit${lowStock.count > 1 ? 's' : ''}`}</p>
            <p className="text-xs text-stone-600 mt-1">
              {lowStock.items.slice(0, 5).map(p => `${p.name} (${p.stock})`).join(" · ")}
              {lowStock.items.length > 5 && ` +${lowStock.items.length - 5} ${t("others") || "autres"}`}
            </p>
          </div>
        </div>
      )}

      <MorningChecklist />
      <OverdueBanner />
      {user?.role === "manager" && <DepositCapitalWidget />}
      {user?.role === "manager" && <SyncFeed />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="card-crm p-5" data-testid={`kpi-${c.label.toLowerCase().replace(/[^a-z]/g,'-')}`}>
            <div className="flex items-center justify-between mb-3">
              <c.icon size={18} strokeWidth={1.5} style={{ color: c.color }} />
              <span className="overline">{c.label}</span>
            </div>
            <div className="font-display text-3xl md:text-4xl" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <TeamGoalGauge />
      <SalesWeather />
      <CashflowWidget />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <FollowUpsWidget />
        <GoalsWidget />
        <AnniversariesWidget />
        <div className="card-crm p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl">{t("revenue_evolution")}</h2>
            <span className="overline">{t("last_6_months")}</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={k.chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E4DF" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8A8A8A' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8A8A8A' }} />
                <Tooltip contentStyle={{ border: '1px solid #E7E4DF', borderRadius: 8 }} />
                <Line type="monotone" dataKey="ca" stroke="#4A154B" strokeWidth={2} dot={{ r: 4, fill: '#4A154B' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-crm p-6">
          <h2 className="font-display text-xl mb-4">{t("top_products")}</h2>
          <div className="space-y-3">
            {k.top_products.length === 0 && <p className="text-sm text-stone-500">{t("empty.no_data")}</p>}
            {k.top_products.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-stone-100 pb-2 last:border-0" data-testid={`top-product-${i}`}>
                <div>
                  <div className="font-medium text-stone-800">{p.name}</div>
                  <div className="text-xs text-stone-500">{p.qty} unités</div>
                </div>
                <div className="font-display text-[#2D5A4C]">{p.ca.toLocaleString(undefined)} €</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
