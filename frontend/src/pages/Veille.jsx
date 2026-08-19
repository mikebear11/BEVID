import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AlertOctagon, RefreshCw, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

export default function Veille() {
  const [rappels, setRappels] = useState([]);
  const [impactModal, setImpactModal] = useState(null);
  const [scanning, setScanning] = useState(false);

  const load = async () => {
    const { data } = await api.get("/veille/rappels?limit=100");
    setRappels(data);
  };
  useEffect(() => { load(); }, []);

  const scan = async () => {
    setScanning(true);
    try {
      const { data } = await api.post("/veille/scan-now");
      toast.success(t("toast.scan_rappelconso_v1_match_sur_v2_ra", { v1: data.matches, v2: data.checked }));
      load();
    } catch { toast.error(t("toast.erreur_scan")); }
    finally { setScanning(false); }
  };

  const openImpacts = async (id) => {
    setImpactModal({ id, loading: true });
    try {
      const { data } = await api.get(`/veille/rappels/${id}/impacted-clients`);
      setImpactModal({ id, ...data, loading: false });
    } catch { toast.error(t("toast.erreur")); setImpactModal(null); }
  };

  return (
    <div className="space-y-4" data-testid="veille-page">
      <div className="flex items-start justify-between">
        <div>
          <p className="overline flex items-center gap-2"><AlertOctagon size={12} /> Sécurité produit</p>
          <h1 className="font-display text-4xl">Veille rappels produits</h1>
          <p className="text-xs text-stone-500 mt-1">Surveillance horaire RappelConso (DGCCRF) par code-barres GTIN + lots</p>
        </div>
        <button onClick={scan} disabled={scanning} className="btn-primary flex items-center gap-2" data-testid="veille-scan-btn">
          {scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Scanner maintenant
        </button>
      </div>

      {rappels.length === 0 && (
        <div className="card-crm p-8 text-center text-stone-500">
          <AlertOctagon size={32} className="mx-auto text-stone-300 mb-2" />
          <p>Aucun rappel détecté sur ton catalogue. Le scan tourne automatiquement chaque heure.</p>
        </div>
      )}
      {rappels.map(r => {
        const p = r.payload || {};
        return (
          <div key={r.id} className={`card-crm p-5 border-l-4 ${r.gravite === "critical" ? "border-red-500" : "border-amber-500"}`} data-testid={`rappel-${r.id}`}>
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-stone-500">{r.gravite === "critical" ? "Danger" : "Attention"} · {r.occurred_at?.slice(0, 10)}</p>
                <h3 className="font-display text-lg mt-1">{p.marque_produit || p.modeles_ou_references || "Rappel"}</h3>
                <p className="text-xs text-stone-600">{p.modeles_ou_references || p.identification_produits}</p>
                <p className="text-xs text-stone-500 mt-1">GTIN : <span className="font-mono">{r.entity_ref}</span> · Motif : {p.motif_rappel}</p>
              </div>
              <button onClick={() => openImpacts(r.id)} className="text-xs bg-red-600 text-white px-3 py-2 rounded-lg flex items-center gap-1 min-h-[36px]" data-testid={`impacts-${r.id}`}>
                <Users size={12} /> Clients touchés
              </button>
            </div>
            {p.risques_encourus && <p className="text-xs text-red-800 bg-red-50 rounded p-2 mt-2">⚠ {p.risques_encourus}</p>}
          </div>
        );
      })}

      {impactModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setImpactModal(null)} data-testid="impacts-modal">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="font-display text-2xl mb-4">Clients impactés</h2>
            {impactModal.loading && <Loader2 className="animate-spin text-stone-500" />}
            {!impactModal.loading && (
              <>
                <p className="text-sm text-stone-600 mb-4">
                  <b>{impactModal.impacted_count}</b> client(s) ont reçu ce produit. Notifie-les.
                </p>
                <table className="w-full text-sm">
                  <thead className="text-left overline text-stone-500 border-b">
                    <tr><th className="p-2">Client</th><th className="p-2 text-right">Qté livrée</th><th className="p-2">Dernière livraison</th></tr>
                  </thead>
                  <tbody>
                    {(impactModal.clients || []).map(c => (
                      <tr key={c.client_id} className="border-b border-stone-50">
                        <td className="p-2"><b>{c.client_name}</b><br/><span className="text-xs text-stone-500">{c.phone || c.email || ""}</span></td>
                        <td className="p-2 text-right font-mono">{c.total_quantity}</td>
                        <td className="p-2 text-stone-600">{c.last_delivery?.slice(0, 10)}</td>
                      </tr>
                    ))}
                    {impactModal.impacted_count === 0 && <tr><td colSpan={3} className="p-4 text-center text-stone-400">Aucun client livré identifié (lots non tracés)</td></tr>}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
