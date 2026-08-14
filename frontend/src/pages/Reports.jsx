import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { Download, Sparkles, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";

const COLORS = ["#4A154B", "#2D5A4C", "#C78B3A", "#8C2A2A", "#6B2D5C"];

export default function Reports() {
  const [perf, setPerf] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [aiSummary, setAiSummary] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: k }] = await Promise.all([api.get("/reports/agents-performance"), api.get("/dashboard/kpis")]);
      setPerf(p); setKpis(k);
    })();
  }, []);

  const genSummary = async () => {
    setLoading(true); setAiSummary("");
    try {
      const ctx = `Rapport de performance:\n${perf.map(a => `- ${a.name} (${a.role}): ${a.ca}€ CA, ${a.orders} cmd, ${a.clients} clients, panier moy ${a.avg_order}€`).join('\n')}\n\nCA total: ${kpis?.total_ca}€ sur ${kpis?.orders_count} commandes.`;
      const { data } = await api.post("/ai/ask", {
        prompt: "Analyse ces performances commerciales. Donne un verdict global (1 phrase), identifie les 2 meilleurs et les points d'amélioration, et propose 3 actions managériales concrètes.",
        context: ctx,
      });
      setAiSummary(data.answer);
    } catch { toast.error("Erreur IA"); }
    finally { setLoading(false); }
  };

  const exportCsv = () => {
    const rows = ["Agent,Rôle,CA (€),Commandes,Clients,Panier moyen"];
    perf.forEach(a => rows.push(`${a.name},${a.role},${a.ca},${a.orders},${a.clients},${a.avg_order}`));
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `rapport-performance-${Date.now()}.csv`; a.click();
    toast.success("Rapport exporté");
  };

  if (!kpis) return <div className="text-stone-500">Chargement…</div>;

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-3">
        <div><p className="overline">Analyse</p><h1 className="font-display text-4xl">Rapports</h1></div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="btn-ghost flex items-center gap-2" data-testid="export-csv-btn"><Download size={14} /> Export CSV</button>
          <button onClick={genSummary} disabled={loading} className="btn-primary flex items-center gap-2" data-testid="ai-summary-btn">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Synthèse IA
          </button>
        </div>
      </div>

      {aiSummary && (
        <div className="card-crm p-6 border-l-4 border-l-[#4A154B]" data-testid="ai-report-content">
          <p className="overline mb-2 flex items-center gap-1"><FileText size={12} /> Synthèse managériale</p>
          <div className="text-sm whitespace-pre-wrap text-stone-800 leading-relaxed">{aiSummary}</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-crm p-6">
          <h3 className="font-display text-xl mb-4">Performance des commerciaux</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={perf}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E4DF" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="ca" fill="#4A154B" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-crm p-6">
          <h3 className="font-display text-xl mb-4">Répartition CA</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={perf} dataKey="ca" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                  {perf.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card-crm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200 text-left overline">
            <tr><th className="p-3">Agent</th><th className="p-3">CA</th><th className="p-3">Commandes</th><th className="p-3 hidden md:table-cell">Clients</th><th className="p-3 hidden md:table-cell">Panier moyen</th></tr>
          </thead>
          <tbody>
            {perf.map(a => (
              <tr key={a.agent_id} className="border-b border-stone-100" data-testid={`perf-row-${a.agent_id}`}>
                <td className="p-3 font-medium">{a.name} <span className="text-xs text-stone-500">· {a.role}</span></td>
                <td className="p-3 font-display text-[#2D5A4C]">{a.ca.toLocaleString('fr-FR')} €</td>
                <td className="p-3">{a.orders}</td>
                <td className="p-3 hidden md:table-cell">{a.clients}</td>
                <td className="p-3 hidden md:table-cell">{a.avg_order.toLocaleString('fr-FR')} €</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
