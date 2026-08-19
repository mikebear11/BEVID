import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Database, ExternalLink, CheckCircle2, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

export default function SourcesDonnees() {
  const [sources, setSources] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: s }, { data: r }] = await Promise.all([
        api.get("/sources-donnees"),
        api.get("/ingestion-runs?limit=30"),
      ]);
      setSources(s); setRuns(r);
    } catch { toast.error(t("toast.erreur_chargement")); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6" data-testid="sources-donnees-page">
      <div>
        <p className="overline flex items-center gap-2"><Database size={12} /> Transparence des données</p>
        <h1 className="font-display text-4xl">Sources de données</h1>
        <p className="text-xs text-stone-500 mt-1">
          Producteurs publics utilisés · Licences ouvertes · Journal d'ingestion 90 jours
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sources.map(s => (
          <div key={s.id} className="card-crm p-5" data-testid={`source-${s.id}`}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3 className="font-display text-lg">{s.name}</h3>
                <a href={s.url} target="_blank" rel="noreferrer" className="text-xs text-[#4A154B] hover:underline flex items-center gap-1 mt-1">
                  {s.url} <ExternalLink size={10} />
                </a>
              </div>
              {s.last_sync_status === "ok"
                ? <CheckCircle2 size={18} className="text-emerald-600" />
                : s.last_sync_status
                  ? <AlertTriangle size={18} className="text-red-600" />
                  : <span className="text-xs text-stone-400">Jamais</span>}
            </div>
            <p className="text-xs text-stone-500 mt-2 mb-3">{s.usage}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="overline">Licence</span><br/><span className="text-stone-800">{s.license}</span></div>
              <div><span className="overline">Éditeur</span><br/><span className="text-stone-800">{s.publisher}</span></div>
              <div><span className="overline">Rythme</span><br/><span className="text-stone-800">{s.freshness}</span></div>
              <div><span className="overline">Rate limit</span><br/><span className="text-stone-800">{s.rate_limit_rps} req/s</span></div>
            </div>
            {s.last_sync_at && (
              <div className="mt-3 pt-3 border-t border-stone-100 text-xs text-stone-600">
                Dernière sync : {new Date(s.last_sync_at).toLocaleString("fr-FR")}
                {" · "}{s.last_records ?? 0} enregistrements
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card-crm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-xl">Journal d'ingestion (30 dernières exécutions)</h3>
          <button onClick={load} className="text-xs text-stone-500 hover:text-[#4A154B] flex items-center gap-1" data-testid="reload-runs">
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Actualiser
          </button>
        </div>
        <table className="w-full text-xs">
          <thead className="text-left overline text-stone-500 border-b border-stone-200">
            <tr><th className="p-2">Date</th><th className="p-2">Source</th><th className="p-2">Type</th><th className="p-2">Statut</th><th className="p-2 text-right">Records</th><th className="p-2 text-right">Durée</th></tr>
          </thead>
          <tbody>
            {runs.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-stone-400">Aucune exécution</td></tr>}
            {runs.map(r => (
              <tr key={r.id} className="border-b border-stone-50" data-testid={`run-${r.id}`}>
                <td className="p-2 text-stone-600">{new Date(r.started_at).toLocaleString("fr-FR")}</td>
                <td className="p-2 font-medium">{r.source}</td>
                <td className="p-2 text-stone-500">{r.kind}</td>
                <td className="p-2">
                  {r.status === "ok"
                    ? <span className="text-emerald-700">✓ ok</span>
                    : <span className="text-red-700" title={r.error}>✗ {r.http_status || "err"}</span>}
                </td>
                <td className="p-2 text-right font-mono">{r.records ?? 0}</td>
                <td className="p-2 text-right text-stone-500">{r.duration_ms} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
