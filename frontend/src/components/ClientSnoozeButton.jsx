import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { BellOff, Bell, Loader2 } from "lucide-react";

/**
 * Bouton « Silencier ce client 24h » — dispose côté user seul, indépendant
 * du DND global. Silence uniquement les push (mentions, rappels) liés à ce
 * client précis. L'inbox et l'historique restent alimentés.
 */
export default function ClientSnoozeButton({ establishmentId, establishmentName }) {
  const [snoozedUntil, setSnoozedUntil] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/snoozes/mine");
      const match = (data.snoozes || []).find(s => s.establishment_id === establishmentId);
      setSnoozedUntil(match?.until || null);
    } catch { setSnoozedUntil(null); }
  };
  useEffect(() => { if (establishmentId) load(); }, [establishmentId]); // eslint-disable-line

  const snooze24h = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/snoozes/client/${establishmentId}`, { hours: 24 });
      setSnoozedUntil(data.until);
      toast.success(`« ${establishmentName || "Client"} » silencié 24 h`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Silence impossible");
    } finally { setBusy(false); }
  };

  const clearSnooze = async () => {
    setBusy(true);
    try {
      await api.delete(`/snoozes/client/${establishmentId}`);
      setSnoozedUntil(null);
      toast.success("Notifications réactivées pour ce client");
    } catch { toast.error("Impossible"); }
    finally { setBusy(false); }
  };

  const active = snoozedUntil && new Date(snoozedUntil).getTime() > Date.now();
  if (!establishmentId) return null;

  return (
    <button
      type="button"
      onClick={active ? clearSnooze : snooze24h}
      disabled={busy}
      className={`min-h-[32px] px-2.5 text-xs rounded-full inline-flex items-center gap-1 border transition-colors ${
        active
          ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300"
          : "border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800"
      }`}
      data-testid={active ? "client-snooze-active" : "client-snooze-btn"}
      aria-pressed={active ? "true" : "false"}
      title={active ? `Silencié jusqu'au ${new Date(snoozedUntil).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` : "Silencier ce client 24 heures"}
    >
      {busy ? <Loader2 size={11} className="animate-spin" />
        : active ? <BellOff size={11} aria-hidden="true" />
        : <Bell size={11} aria-hidden="true" />}
      {active ? "Silencié" : "Silencier 24 h"}
    </button>
  );
}
