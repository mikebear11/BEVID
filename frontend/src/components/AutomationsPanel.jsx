import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Zap, ZapOff, AlertTriangle, Clock, Mail, ClipboardList, Loader2, Shield, X,
} from "lucide-react";

/**
 * AutomationsPanel — Section Automatisations dans Réglages.
 *
 * Contient les 8 scénarios prêts à l'emploi (§6 du lot recentrage),
 * le kill switch général, et un rappel des garde-fous.
 *
 * Design produit : pas de constructeur, uniquement des cartes activables.
 * Chaque carte force le mode « Créer une tâche » par défaut ; l'envoi auto
 * est une case à cocher explicite, jamais silencieux.
 */
export default function AutomationsPanel() {
  const [state, setState] = useState({ presets: [], kill_switch: false });
  const [busy, setBusy] = useState(false);
  const [previewOf, setPreviewOf] = useState(null); // preset en cours d'activation

  const load = async () => {
    try {
      const { data } = await api.get("/automations/presets");
      setState(data);
    } catch (e) {
      toast.error("Chargement des automatisations impossible");
    }
  };
  useEffect(() => { load(); }, []);

  const toggleKillSwitch = async () => {
    const next = !state.kill_switch;
    if (next && !window.confirm("Couper TOUTES les automatisations ? Aucun email ni tâche ne sera plus créé jusqu'à ce que tu le réactives.")) return;
    setBusy(true);
    try {
      await api.put("/automations/kill-switch", { enabled: next });
      setState(s => ({ ...s, kill_switch: next }));
      toast.success(next ? "Toutes les automatisations sont coupées" : "Automatisations réactivées");
    } catch { toast.error("Impossible"); }
    finally { setBusy(false); }
  };

  const enablePreset = (preset) => {
    // Passe par la modale de prévisualisation qui montre le stock existant
    setPreviewOf(preset);
  };

  const disablePreset = async (preset) => {
    try {
      await api.put(`/automations/presets/${preset.preset_key}`, { enabled: false });
      toast.success(`« ${preset.label} » désactivé`);
      load();
    } catch { toast.error("Impossible"); }
  };

  const changeMode = async (preset, mode) => {
    if (mode === "email" && !window.confirm(`Envoi automatique d'emails à activer pour « ${preset.label} » ?\n\nRappel : max 1 email/client/14 jours toutes règles confondues, aucun soir ni week-end ni jour férié.`)) return;
    try {
      await api.put(`/automations/presets/${preset.preset_key}`, { action_mode: mode });
      toast.success("Mode mis à jour");
      load();
    } catch { toast.error("Impossible"); }
  };

  return (
    <div className="card-crm p-6 space-y-5" data-testid="automations-panel">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1"><Zap size={18} className="text-[#4A154B]" aria-hidden="true" /><h2 className="font-display text-xl">Automatisations</h2></div>
          <p className="text-xs text-stone-500 max-w-xl">
            8 scénarios prêts à l'emploi qui créent une tâche pour le commercial responsable
            au bon moment. Aucun envoi silencieux : chaque scénario propose par défaut
            « créer une tâche », pas d'email.
          </p>
        </div>
        <button
          onClick={toggleKillSwitch}
          disabled={busy}
          data-testid="kill-switch-btn"
          className={`flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-lg font-medium text-sm ${state.kill_switch
            ? "bg-red-100 text-red-800 border border-red-300"
            : "bg-stone-100 text-stone-700 border border-stone-300 hover:bg-stone-200"}`}
        >
          {state.kill_switch ? <ZapOff size={16} /> : <Zap size={16} />}
          {state.kill_switch ? "Tout est coupé — réactiver" : "Interrupteur général"}
        </button>
      </div>

      {state.kill_switch && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 text-sm text-red-900" data-testid="kill-switch-warning">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
          <p>Toutes les automatisations sont coupées globalement. Les scénarios activés ci-dessous ne s'exécuteront pas jusqu'à réactivation.</p>
        </div>
      )}

      <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 text-xs text-stone-700 space-y-1" data-testid="guardrails-reminder">
        <p className="font-medium flex items-center gap-1"><Shield size={12} aria-hidden="true" /> Garde-fous en place</p>
        <ul className="list-disc list-inside space-y-0.5 ml-1">
          <li>Max 1 email automatique par client tous les 14 jours, toutes règles confondues</li>
          <li>Aucun envoi le soir (20 h → 8 h), le week-end, ou les jours fériés FR</li>
          <li>Arrêt automatique pour un client qui a répondu, commandé ou été visité récemment</li>
          <li>Relances commerciales suspendues en cas de litige ; relances de paiement continuent</li>
          <li>Envoi au nom du commercial responsable, avec un lien de désinscription valable pour toutes les règles</li>
        </ul>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="preset-grid">
        {state.presets.map(p => (
          <PresetCard key={p.preset_key} preset={p}
            onEnable={() => enablePreset(p)}
            onDisable={() => disablePreset(p)}
            onModeChange={(m) => changeMode(p, m)} />
        ))}
      </div>

      {previewOf && (
        <ActivatePreviewModal
          preset={previewOf}
          onClose={() => setPreviewOf(null)}
          onConfirm={() => { setPreviewOf(null); load(); }}
        />
      )}
    </div>
  );
}

function PresetCard({ preset, onEnable, onDisable, onModeChange }) {
  const isPaymentDomain = preset.domain === "paiement";
  return (
    <div className={`border rounded-lg p-3 ${preset.enabled ? "border-[#4A154B] bg-[#4A154B]/5" : "border-stone-200"}`}
      data-testid={`preset-card-${preset.preset_key}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{preset.label}</p>
          <p className="text-xs text-stone-500 mt-0.5">{preset.trigger}</p>
        </div>
        {preset.enabled ? (
          <button onClick={onDisable} className="text-xs text-red-700 underline min-h-[32px]"
            data-testid={`disable-${preset.preset_key}`}>Désactiver</button>
        ) : (
          <button onClick={onEnable} className="text-xs bg-[#4A154B] text-white px-3 py-1.5 rounded min-h-[32px]"
            data-testid={`enable-${preset.preset_key}`}>Activer</button>
        )}
      </div>
      <p className="text-xs text-stone-700 mt-2 flex items-start gap-1">
        {preset.action_mode === "task" ? <ClipboardList size={12} className="mt-0.5 shrink-0" /> : <Mail size={12} className="mt-0.5 shrink-0" />}
        <span>{preset.action_label}</span>
      </p>
      {preset.enabled && (
        <div className="mt-2 flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1 cursor-pointer" data-testid={`mode-task-${preset.preset_key}`}>
            <input type="radio" checked={preset.action_mode === "task"} onChange={() => onModeChange("task")} className="accent-[#4A154B]" />
            Créer une tâche
          </label>
          <label className={`flex items-center gap-1 cursor-pointer ${isPaymentDomain ? "text-stone-800" : "text-stone-700"}`} data-testid={`mode-email-${preset.preset_key}`}>
            <input type="radio" checked={preset.action_mode === "email"} onChange={() => onModeChange("email")} className="accent-[#4A154B]" />
            Envoyer un email
          </label>
        </div>
      )}
      {preset.last_run_at && (
        <p className="text-xs text-stone-400 mt-2 flex items-center gap-1">
          <Clock size={10} aria-hidden="true" /> Dernière exécution : {new Date(preset.last_run_at).toLocaleString("fr-FR")}
        </p>
      )}
    </div>
  );
}

function ActivatePreviewModal({ preset, onClose, onConfirm }) {
  const [count, setCount] = useState(null);
  const [stockPolicy, setStockPolicy] = useState("ignore");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/automations/preview/${preset.preset_key}`)
      .then(r => setCount(r.data.matches_today))
      .catch(() => setCount(0));
  }, [preset.preset_key]);

  const confirm = async () => {
    setBusy(true);
    try {
      await api.put(`/automations/presets/${preset.preset_key}`, {
        enabled: true, stock_policy: stockPolicy,
      });
      toast.success(`« ${preset.label} » activé`);
      onConfirm();
    } catch (e) { toast.error(e?.response?.data?.detail || "Impossible"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose} data-testid="activation-preview-modal">
      <div className="bg-white dark:bg-stone-900 rounded-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="overline">Activation</p>
            <h2 className="font-display text-xl">{preset.label}</h2>
            <p className="text-xs text-stone-500 mt-1">{preset.trigger}</p>
          </div>
          <button onClick={onClose} className="min-h-[36px] min-w-[36px] flex items-center justify-center" aria-label="Fermer"><X size={18} /></button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 mb-4">
          <AlertTriangle size={16} className="text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm text-amber-900">
            {count === null ? (
              <p className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Calcul du nombre de clients concernés…</p>
            ) : count === 0 ? (
              <p><strong>Aucun client concerné aujourd'hui.</strong> La règle ne créera de tâche que sur les nouveaux cas.</p>
            ) : (
              <p><strong>Cette règle concerne {count} client{count > 1 ? "s" : ""} aujourd'hui.</strong> Que faire du stock existant ?</p>
            )}
          </div>
        </div>

        {count > 0 && (
          <div className="space-y-2 mb-4" data-testid="stock-policy-choice">
            <label className="flex items-start gap-2 p-2 border rounded cursor-pointer hover:bg-stone-50" data-testid="policy-ignore">
              <input type="radio" name="policy" checked={stockPolicy === "ignore"} onChange={() => setStockPolicy("ignore")} className="mt-1 accent-[#4A154B]" />
              <div>
                <p className="text-sm font-medium">Ignorer le stock, ne déclencher que sur les nouveaux cas</p>
                <p className="text-xs text-stone-500">Aucune action sur les {count} client{count > 1 ? "s" : ""} actuels. La règle s'appliquera aux prochains clients qui rentrent dans le déclencheur.</p>
              </div>
            </label>
            <label className="flex items-start gap-2 p-2 border rounded cursor-pointer hover:bg-stone-50" data-testid="policy-throttle">
              <input type="radio" name="policy" checked={stockPolicy === "throttle"} onChange={() => setStockPolicy("throttle")} className="mt-1 accent-[#4A154B]" />
              <div>
                <p className="text-sm font-medium">Traiter progressivement, 5 clients par jour maximum</p>
                <p className="text-xs text-stone-500">Jamais d'envoi de masse. Étalage sur {Math.ceil(count / 5)} jour{Math.ceil(count / 5) > 1 ? "s" : ""}.</p>
              </div>
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
          <button onClick={onClose} className="btn-ghost min-h-[40px] px-3">Annuler</button>
          <button onClick={confirm} disabled={busy || count === null}
            data-testid="activation-confirm-btn"
            className="btn-primary min-h-[40px] px-4 flex items-center gap-2">
            {busy && <Loader2 size={14} className="animate-spin" />} Activer
          </button>
        </div>
      </div>
    </div>
  );
}
