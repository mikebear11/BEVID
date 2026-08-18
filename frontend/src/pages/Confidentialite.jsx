import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";
import { ShieldCheck, MapPin, Mic, Database, FileDown, Trash2 } from "lucide-react";
import PuceEtat from "@/components/system/PuceEtat";

export default function Confidentialite() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [settings, setSettings] = useState(null);
  const [audit, setAudit] = useState([]);
  const [clientId, setClientId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/org/settings").then(r => setSettings(r.data));
    if (user?.role === "manager") {
      api.get("/admin/audit-logs?limit=50").then(r => setAudit(r.data)).catch(() => {});
    }
  }, [user]);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/org/settings", settings);
      setSettings(data);
      toast.success("Réglages sauvegardés");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    } finally { setSaving(false); }
  };

  const exportClient = async () => {
    if (!clientId) return;
    try {
      const { data } = await api.get(`/rgpd/clients/${clientId}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `rgpd-export-${clientId}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Export téléchargé");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    }
  };

  const deleteClient = async () => {
    if (!clientId) return;
    if (!window.confirm(`Supprimer DÉFINITIVEMENT toutes les données du contact ${clientId} ? Irréversible.`)) return;
    try {
      const { data } = await api.delete(`/rgpd/clients/${clientId}`);
      toast.success(`Contact supprimé (${data.orders_deleted} commandes, ${data.visits_deleted} visites)`);
      setClientId("");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    }
  };

  const purgeVoice = async () => {
    if (!window.confirm("Purger les transcriptions vocales au-delà de la période de rétention ?")) return;
    const { data } = await api.post("/admin/voice/purge");
    toast.success(`${data.purged} transcriptions purgées (rétention ${data.cutoff_days}j)`);
  };

  if (!settings) return <div className="p-8 text-stone-500">{t("loading")}</div>;

  const isManager = user?.role === "manager";

  return (
    <div className="space-y-6" data-testid="privacy-page">
      <div>
        <p className="overline">Conformité</p>
        <h2 className="font-display text-3xl mt-1">{t("privacy")} · RGPD / CNIL</h2>
      </div>

      {/* Note légale */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900" data-testid="cnil-notice">
        <p className="font-medium">⚠️ Point de vigilance CNIL / RGPD</p>
        <p className="mt-2">
          En France, tout dispositif de géolocalisation doit être justifié par une finalité légitime, proportionné,
          inscrit au registre des traitements et les salariés doivent en être informés individuellement.
          Ce logiciel n'effectue qu'un <b>horodatage ponctuel</b> lors d'une visite ou d'une signature — jamais un suivi continu.
        </p>
        <p className="mt-2 text-xs">
          À faire valider par un DPO avant mise en service si la géolocalisation ponctuelle est activée.
        </p>
      </div>

      {/* Hébergement */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5" data-testid="hosting-block">
        <h3 className="font-medium flex items-center gap-2 mb-3"><Database size={18} /> Hébergement</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-stone-500 text-xs">Zone d'hébergement</p>
            <p className="font-medium mt-1">🇪🇺 Union Européenne</p>
          </div>
          <div>
            <p className="text-stone-500 text-xs">Chiffrement en transit</p>
            <p className="font-medium mt-1 flex items-center gap-1"><ShieldCheck size={14} className="text-emerald-600" /> TLS 1.3</p>
          </div>
          <div>
            <p className="text-stone-500 text-xs">Chiffrement au repos</p>
            <p className="font-medium mt-1 flex items-center gap-1"><ShieldCheck size={14} className="text-emerald-600" /> AES-256</p>
          </div>
        </div>
      </div>

      {/* Géoloc + audio */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5" data-testid="tracking-block">
        <h3 className="font-medium mb-4">Traçage et audio</h3>
        <div className="space-y-4">
          <label className="flex items-start gap-3 p-3 rounded-lg hover:bg-stone-50 cursor-pointer" data-testid="geo-toggle">
            <input
              type="checkbox"
              className="mt-1 w-5 h-5"
              checked={!!settings.geolocation_enabled}
              disabled={!isManager}
              onChange={e => setSettings({ ...settings, geolocation_enabled: e.target.checked })}
            />
            <div>
              <p className="font-medium flex items-center gap-2"><MapPin size={16} /> {t("geolocation")} ponctuelle</p>
              <p className="text-xs text-stone-500 mt-1">
                Horodatage GPS uniquement au moment d'une visite ou d'une signature. Jamais en continu.
                Chaque commercial peut aussi refuser individuellement dans son mobile.
              </p>
            </div>
          </label>

          <div className="p-3 rounded-lg hover:bg-stone-50">
            <p className="font-medium flex items-center gap-2"><Mic size={16} /> {t("audio_retention")}</p>
            <p className="text-xs text-stone-500 mt-1">Les transcriptions vocales sont supprimées après cette durée.</p>
            <div className="flex items-center gap-3 mt-3">
              <input
                type="number"
                min={1}
                max={365}
                value={settings.voice_transcript_retention_days || 90}
                disabled={!isManager}
                onChange={e => setSettings({ ...settings, voice_transcript_retention_days: parseInt(e.target.value) || 90 })}
                className="input-crm w-28 min-h-[44px]"
                data-testid="audio-retention-input"
              />
              <span className="text-sm">{t("days")}</span>
              {isManager && (
                <button onClick={purgeVoice} className="btn-ghost text-xs ml-auto min-h-[44px]" data-testid="purge-voice-btn">
                  Purger maintenant
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!settings.voice_delete_after_transcription}
                disabled={!isManager}
                onChange={e => setSettings({ ...settings, voice_delete_after_transcription: e.target.checked })}
                data-testid="audio-delete-after-transcription"
              />
              Supprimer l'audio brut immédiatement après transcription
            </label>
          </div>
        </div>
        {isManager && (
          <div className="mt-4 flex justify-end">
            <button onClick={save} disabled={saving} className="btn-primary min-h-[48px]" data-testid="save-privacy-btn">
              {saving ? "…" : t("save")}
            </button>
          </div>
        )}
      </div>

      {/* RGPD droits */}
      {isManager && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5" data-testid="rgpd-rights-block">
          <h3 className="font-medium mb-3">Droits RGPD sur un contact</h3>
          <p className="text-xs text-stone-500 mb-3">Sur demande d'un contact, exportez ou supprimez l'ensemble de ses données.</p>
          <div className="flex gap-3 flex-wrap">
            <input
              placeholder="ID client / établissement"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              className="input-crm flex-1 min-w-[240px] min-h-[48px]"
              data-testid="rgpd-client-id"
            />
            <button onClick={exportClient} disabled={!clientId} className="btn-ghost flex items-center gap-2 min-h-[48px]" data-testid="rgpd-export-btn">
              <FileDown size={16} /> {t("export_data")}
            </button>
            <button onClick={deleteClient} disabled={!clientId} className="btn-ghost flex items-center gap-2 text-red-600 min-h-[48px]" data-testid="rgpd-delete-btn">
              <Trash2 size={16} /> {t("delete_data")}
            </button>
          </div>
        </div>
      )}

      {/* Audit */}
      {isManager && (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden" data-testid="audit-block">
          <div className="p-5 border-b border-stone-100">
            <h3 className="font-medium">Journal des accès (50 derniers)</h3>
            <p className="text-xs text-stone-500 mt-1">Traçabilité de toutes les actions sensibles.</p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-stone-50 sticky top-0">
                <tr className="text-left text-stone-500">
                  <th className="p-2">Quand</th>
                  <th className="p-2">Utilisateur</th>
                  <th className="p-2">Action</th>
                  <th className="p-2">Détails</th>
                </tr>
              </thead>
              <tbody>
                {audit.map(a => (
                  <tr key={a.id} className="border-t border-stone-100">
                    <td className="p-2 text-stone-500">{a.at?.slice(0, 16).replace("T", " ")}</td>
                    <td className="p-2 font-mono">{(a.user_id || "").slice(0, 8)}</td>
                    <td className="p-2"><PuceEtat etat="info" variante="douce" libelle={a.action} /></td>
                    <td className="p-2 text-stone-500 truncate max-w-xs">{JSON.stringify(a.details)}</td>
                  </tr>
                ))}
                {audit.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-stone-400">Aucune entrée.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
