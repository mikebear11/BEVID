import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Shield, RefreshCw, Loader2, AlertOctagon } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

const SEVERITY_MAP = {
  block: { cls: "border-red-500 bg-red-50", label: "Bloqué", color: "text-red-800" },
  watch: { cls: "border-amber-500 bg-amber-50", label: "Surveillance", color: "text-amber-800" },
  info:  { cls: "border-blue-500 bg-blue-50", label: "Info", color: "text-blue-800" },
};

export default function Bouclier() {
  const [alerts, setAlerts] = useState([]);
  const [scanning, setScanning] = useState(false);

  const load = async () => {
    const { data } = await api.get("/bouclier/alerts?limit=100");
    setAlerts(data);
  };
  useEffect(() => { load(); }, []);

  const scan = async () => {
    setScanning(true);
    try {
      const { data } = await api.post("/bouclier/scan-now");
      toast.success(t("toast.scan_bodacc_v1_alertes_sur_v2_siren", { v1: data.alerts, v2: data.sirens_scanned }));
      load();
    } catch { toast.error(t("toast.erreur_scan")); }
    finally { setScanning(false); }
  };

  return (
    <div className="space-y-4" data-testid="bouclier-page">
      <div className="flex items-start justify-between">
        <div>
          <p className="overline flex items-center gap-2"><Shield size={12} /> Bouclier encours</p>
          <h1 className="font-display text-4xl">Procédures collectives</h1>
          <p className="text-xs text-stone-500 mt-1">Détecte quotidiennement liquidations / redressements / sauvegardes via BODACC · bloque les commandes en aval</p>
        </div>
        <button onClick={scan} disabled={scanning} className="btn-primary flex items-center gap-2" data-testid="bouclier-scan-btn">
          {scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Scanner maintenant
        </button>
      </div>

      {alerts.length === 0 && (
        <div className="card-crm p-8 text-center text-stone-500">
          <Shield size={32} className="mx-auto text-stone-300 mb-2" />
          <p>Aucune procédure collective détectée sur ton portefeuille. Le scan tourne à 05h chaque matin.</p>
        </div>
      )}
      {alerts.map(a => {
        const sev = SEVERITY_MAP[a.gravite] || SEVERITY_MAP.info;
        const p = a.payload || {};
        const jug = p.jugement || {};
        return (
          <div key={a.id} className={`card-crm p-5 border-l-4 ${sev.cls}`} data-testid={`alert-${a.id}`}>
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <AlertOctagon size={16} className={sev.color} />
                  <span className={`text-[10px] uppercase tracking-widest font-medium ${sev.color}`}>{sev.label}</span>
                  <span className="text-xs text-stone-500">· {a.occurred_at}</span>
                </div>
                <h3 className="font-display text-lg mt-2">{a.action_label}</h3>
                <p className="text-xs text-stone-600 mt-1">
                  SIREN <span className="font-mono">{a.entity_ref}</span>
                  {jug.nature && ` · Nature : ${jug.nature}`}
                  {p.tribunal && ` · ${p.tribunal}`}
                </p>
                {jug.complementJugement && <p className="text-xs text-stone-500 mt-1">{jug.complementJugement}</p>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
