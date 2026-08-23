import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Bell, BellOff, Loader2, Moon } from "lucide-react";
import { subscribePush, unsubscribePush, pushSupported } from "@/lib/push";

/**
 * Panneau de préférences notifications — 3 niveaux + plage silence.
 * Niveau 1 (immédiat) : mentions @user
 * Niveau 2 (résumé 8h + 14h) : activité sur mes objets
 * Niveau 3 (inbox seulement) : le reste — jamais de push
 */
export default function NotificationSettings() {
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const supported = pushSupported();

  useEffect(() => {
    api.get("/notifications/preferences")
      .then(r => setPrefs(r.data))
      .catch(() => toast.error("Préférences indisponibles"));
  }, []);

  const patch = async (partial) => {
    setSaving(true);
    try {
      const { data } = await api.put("/notifications/preferences", partial);
      setPrefs(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Enregistrement impossible");
    } finally { setSaving(false); }
  };

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (prefs?.push_enabled) {
        await unsubscribePush();
        setPrefs({ ...prefs, push_enabled: false });
        toast.success("Notifications push désactivées");
      } else {
        const r = await subscribePush();
        setPrefs({ ...prefs, push_enabled: true });
        toast.success(r?.simulated ? "Push activé (mode simulé côté serveur)" : "Notifications push activées");
      }
    } catch (e) {
      toast.error(e?.message || "Activation impossible");
    } finally { setPushBusy(false); }
  };

  if (!prefs) return <div className="text-sm text-stone-500" data-testid="notif-settings-loading">Chargement…</div>;

  return (
    <section className="card-crm p-4 space-y-4" data-testid="notif-settings">
      <div className="flex items-center gap-2">
        <Bell size={16} className="text-[#4A154B]" aria-hidden="true" />
        <h2 className="font-display text-xl">Notifications</h2>
      </div>

      <div className="space-y-3">
        <ToggleRow
          label="Mentions immédiates"
          hint="Quand quelqu'un vous @mentionne dans un fil"
          checked={prefs.mentions_immediate}
          onChange={v => patch({ mentions_immediate: v })}
          testid="notif-mentions-immediate"
        />
        <ToggleRow
          label="Résumé 2×/jour (8h et 14h)"
          hint="Activité sur les clients dont vous êtes commercial"
          checked={prefs.digest_owned_objects}
          onChange={v => patch({ digest_owned_objects: v })}
          testid="notif-digest"
        />
        <ToggleRow
          label="Inbox seulement pour le reste"
          hint="Les messages hors de vos objets restent silencieux et visibles en boîte"
          checked={prefs.inbox_only_rest}
          onChange={v => patch({ inbox_only_rest: v })}
          testid="notif-inbox-only"
        />
      </div>

      <div className="border-t border-stone-200 dark:border-stone-700 pt-3">
        <div className="flex items-center gap-2 mb-2">
          <Moon size={14} className="text-stone-500" aria-hidden="true" />
          <h3 className="font-medium text-sm">Plage silence obligatoire</h3>
        </div>
        <p className="text-xs text-stone-500 mb-2">
          Aucune notification pendant cette fenêtre — mise en file, distribuée à la fin.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-stone-500">
            De
            <input type="time" value={prefs.silence_start} onChange={e => patch({ silence_start: e.target.value })}
              className="input-crm min-h-[40px] text-sm mt-1 block" data-testid="notif-silence-start" />
          </label>
          <label className="text-xs text-stone-500">
            À
            <input type="time" value={prefs.silence_end} onChange={e => patch({ silence_end: e.target.value })}
              className="input-crm min-h-[40px] text-sm mt-1 block" data-testid="notif-silence-end" />
          </label>
          <label className="text-xs text-stone-500 flex items-center gap-2 min-h-[40px]">
            <input type="checkbox" checked={prefs.silence_sundays}
              onChange={e => patch({ silence_sundays: e.target.checked })}
              data-testid="notif-silence-sundays" />
            <span>Dimanche entier</span>
          </label>
        </div>
      </div>

      <div className="border-t border-stone-200 dark:border-stone-700 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-medium text-sm flex items-center gap-2">
              {prefs.push_enabled ? <Bell size={14} /> : <BellOff size={14} />}
              Notifications navigateur (push)
            </h3>
            <p className="text-xs text-stone-500 mt-1">
              {supported ? "Recevez les mentions immédiates directement sur votre appareil, même app fermée."
                          : "Non supporté par ce navigateur."}
            </p>
          </div>
          <button onClick={togglePush} disabled={!supported || pushBusy}
            className={`min-h-[36px] px-3 text-sm rounded-lg ${prefs.push_enabled ? "bg-red-600 text-white" : "bg-[#4A154B] text-white"} ${!supported ? "opacity-40 cursor-not-allowed" : ""}`}
            data-testid="notif-push-toggle">
            {pushBusy ? <Loader2 size={14} className="animate-spin" /> : prefs.push_enabled ? "Désactiver" : "Activer"}
          </button>
        </div>
      </div>

      {saving && <p className="text-xs text-stone-500" aria-live="polite">Enregistrement…</p>}
    </section>
  );
}

function ToggleRow({ label, hint, checked, onChange, testid }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-stone-500">{hint}</p>}
      </div>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)}
        className="min-w-[20px] min-h-[20px]" data-testid={testid} />
    </label>
  );
}
