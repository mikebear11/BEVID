import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { usePageMeta } from "@/lib/pageMeta";
import {
  Smartphone, Database, Bell, HardDrive, Clock, UploadCloud,
  CheckCircle2, XCircle, HelpCircle, Loader2, Shield,
} from "lucide-react";
import { pwaDiagnostics, requestPersistentStorage, purgeIfQuotaHigh } from "@/lib/pwa";
import { subscribePush, sendTestPush, pushSupported } from "@/lib/push";
import { api } from "@/lib/api";

/**
 * Écran de diagnostic PWA — 6 lignes utiles pour dépanner un commercial à distance.
 * Accessible depuis /pwa-status. Manager & commercial peuvent consulter leur propre appareil.
 */
function StatusIcon({ ok }) {
  if (ok === true) return <CheckCircle2 size={16} className="text-emerald-600" aria-label="Oui" />;
  if (ok === false) return <XCircle size={16} className="text-red-600" aria-label="Non" />;
  return <HelpCircle size={16} className="text-stone-400" aria-label="Inconnu" />;
}

function Row({ icon: Icon, label, value, ok, hint, testid }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-stone-100 dark:border-stone-800 last:border-0" data-testid={testid}>
      <Icon size={16} className="text-[#4A154B] mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-stone-500 mt-0.5">{hint}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm">{value}</span>
        {ok !== undefined && <StatusIcon ok={ok} />}
      </div>
    </div>
  );
}

export default function PwaDiagnostics() {
  usePageMeta({ title: "Diagnostic hors-ligne · BEVID" });
  const [diag, setDiag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [team, setTeam] = useState([]);
  const [colleague, setColleague] = useState("");
  const [meId, setMeId] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setDiag(await pwaDiagnostics()); } catch { /* best-effort : ignoré volontairement */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, []);

  // Chargement de l'équipe pour le test à un collègue (manager only)
  useEffect(() => {
    (async () => {
      try {
        const [me, teamRes] = await Promise.all([
          api.get("/auth/me"),
          api.get("/org/team").catch(() => ({ data: { members: [] } })),
        ]);
        setMeId(me.data?.id || null);
        setTeam((teamRes.data?.members || []).filter(m => m.id !== me.data?.id));
      } catch { /* silencieux */ }
    })();
  }, []);

  const testPushToColleague = async () => {
    if (!colleague) { toast.error("Choisissez un collègue"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/notifications/test-push-to/${colleague}`);
      if (data.ok && !data.simulated) toast.success(`Test envoyé à ${data.to?.name || "collègue"}`);
      else if (data.simulated) toast.info("Test simulé côté serveur (VAPID absent ou push_disabled)");
      else toast.error(data.reason || "Envoi impossible");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Envoi impossible");
    } finally { setBusy(false); }
  };

  const requestPersist = async () => {
    setBusy(true);
    try {
      // Sur iOS : demander d'abord la permission notification (nécessaire au persist)
      if (diag?.is_ios && diag?.notification_permission !== "granted") {
        try {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") {
            toast.error("Sans autorisation notifications, iOS refuse le stockage persistant");
            setBusy(false); return;
          }
        } catch { /* best-effort : ignoré volontairement */ }
      }
      const r = await requestPersistentStorage();
      if (r.ok) toast.success(r.already ? "Stockage persistant déjà accordé" : "Stockage persistant accordé");
      else toast.error("Refusé par le navigateur — les données peuvent être effacées après quelques jours d'inactivité");
      await load();
    } finally { setBusy(false); }
  };

  const enablePush = async () => {
    setBusy(true);
    try {
      const r = await subscribePush();
      toast.success(r.simulated ? "Notifications activées (mode simulé côté serveur)" : "Notifications activées");
      await load();
    } catch (e) {
      toast.error(e?.message || "Activation impossible");
    } finally { setBusy(false); }
  };

  const testPush = async () => {
    setBusy(true);
    try {
      const r = await sendTestPush();
      if (r.ok && !r.simulated) toast.success("Notification test envoyée");
      else if (r.simulated) toast.info("Notification simulée côté serveur (VAPID absent)");
      else toast.error(r.reason || "Envoi impossible");
    } catch (e) { toast.error("Envoi impossible"); }
    finally { setBusy(false); }
  };

  const doPurge = async () => {
    setBusy(true);
    try {
      const r = await purgeIfQuotaHigh();
      if (r.purged > 0) toast.success(`${r.purged} anciens éléments purgés (file d'envoi préservée)`);
      else toast.info("Rien à purger (utilisation < 80 %)");
      await load();
    } finally { setBusy(false); }
  };

  if (loading) return <div className="text-sm text-stone-500 p-4" data-testid="pwa-diag-loading">Chargement…</div>;
  if (!diag) return <div className="text-sm text-stone-500 p-4">Diagnostic indisponible.</div>;

  const notifValue = ({
    granted: "Accordées",
    denied: "Refusées",
    default: "Non demandées",
    unsupported: "Non supportées",
  })[diag.notification_permission] || diag.notification_permission;
  const notifOk = diag.notification_permission === "granted" ? true
    : diag.notification_permission === "denied" ? false : undefined;

  const quotaPct = diag.quota?.percent;
  const quotaMB = diag.quota ? (diag.quota.usage / 1024 / 1024).toFixed(1) : null;
  const quotaMaxMB = diag.quota ? (diag.quota.quota / 1024 / 1024).toFixed(0) : null;
  const quotaOk = quotaPct != null ? quotaPct < 80 : undefined;

  const snapDate = diag.snapshot_at ? new Date(diag.snapshot_at) : null;
  const snapValue = snapDate ? snapDate.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "Jamais";
  const snapOk = snapDate ? (Date.now() - snapDate.getTime() < 3 * 24 * 3600 * 1000) : false;

  return (
    <div className="space-y-6 max-w-2xl" data-testid="pwa-diagnostics-page">
      <div>
        <p className="overline">Fiabilité mobile</p>
        <h1 className="font-display text-4xl">Diagnostic hors-ligne</h1>
        <p className="text-sm text-stone-500 mt-1">
          Six lignes utiles pour dépanner votre téléphone. Ouvrez cet écran quand quelque chose « ne marche pas ».
        </p>
      </div>

      <section className="card-crm p-4" data-testid="pwa-diag-list">
        <Row testid="diag-installed" icon={Smartphone} label="Application installée"
          value={diag.installed ? "Oui" : "Non"} ok={diag.installed}
          hint={!diag.installed ? "Onglet Safari : purge possible après 7 jours d'inactivité. Installer via Partager → « Sur l'écran d'accueil »." : "Isolée du navigateur, meilleure persistance."} />
        <Row testid="diag-persist" icon={Shield} label="Stockage persistant"
          value={diag.persistent_storage ? "Accordé" : "Non accordé"} ok={diag.persistent_storage}
          hint={diag.persistent_storage
            ? "Les données ne seront pas effacées automatiquement."
            : "Sur iOS, exige l'accord des notifications d'abord. Vos données hors-ligne peuvent être effacées après quelques jours d'inactivité."} />
        <Row testid="diag-notif" icon={Bell} label="Notifications"
          value={notifValue} ok={notifOk}
          hint="Nécessaires pour recevoir mentions et rappels sur mobile." />
        <Row testid="diag-quota" icon={HardDrive} label="Espace utilisé"
          value={quotaPct != null ? `${quotaMB} Mo / ${quotaMaxMB} Mo (${quotaPct}%)` : "Non mesurable"} ok={quotaOk}
          hint={quotaPct != null && quotaPct >= 80 ? "Au-dessus de 80 % — purge automatique des anciens instantanés (jamais la file d'envoi)." : "Sous le seuil de purge."} />
        <Row testid="diag-snapshot" icon={Clock} label="Dernier instantané hors-ligne"
          value={snapValue} ok={snapOk}
          hint={snapOk ? "À jour." : "Datant de plus de 3 jours — rafraîchissez-vous à la prochaine connexion."} />
        <Row testid="diag-pending" icon={UploadCloud} label="En attente de synchronisation"
          value={`${diag.pending_sync_count} élément${diag.pending_sync_count > 1 ? "s" : ""}`}
          ok={diag.pending_sync_count === 0}
          hint={diag.pending_sync_count > 0
            ? `Dont ${diag.message_outbox_count} message(s). Partira automatiquement au retour du réseau.`
            : "File d'envoi vide. Aucun travail non enregistré."} />
      </section>

      <section className="card-crm p-4 space-y-3" data-testid="pwa-actions">
        <h2 className="font-display text-lg">Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={requestPersist} disabled={busy || diag.persistent_storage}
            className={`btn-primary min-h-[44px] flex items-center justify-center gap-2 ${diag.persistent_storage ? "opacity-40" : ""}`}
            data-testid="action-request-persist">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
            {diag.persistent_storage ? "Persistant déjà accordé" : "Demander le stockage persistant"}
          </button>
          <button onClick={enablePush} disabled={busy || !pushSupported() || diag.notification_permission === "granted"}
            className="btn-ghost min-h-[44px] flex items-center justify-center gap-2 border border-stone-200 dark:border-stone-700"
            data-testid="action-enable-push">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
            {diag.notification_permission === "granted" ? "Notifications activées" : "Activer les notifications"}
          </button>
          <button onClick={testPush} disabled={busy || diag.notification_permission !== "granted"}
            className="btn-ghost min-h-[44px] flex items-center justify-center gap-2 border border-stone-200 dark:border-stone-700"
            data-testid="action-test-push">
            <Bell size={14} /> Envoyer une notification de test
          </button>
          <button onClick={doPurge} disabled={busy}
            className="btn-ghost min-h-[44px] flex items-center justify-center gap-2 border border-stone-200 dark:border-stone-700"
            data-testid="action-purge">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
            Nettoyer les anciens instantanés
          </button>
        </div>
        <p className="text-xs text-stone-500">
          💡 La file d'envoi de messages et de visites n'est <b>jamais</b> supprimée par le nettoyage — c'est du travail non enregistré.
        </p>
      </section>

      {team.length > 0 && (
        <section className="card-crm p-4 space-y-3" data-testid="test-to-colleague">
          <h2 className="font-display text-lg">Tester le téléphone d'un collègue</h2>
          <p className="text-xs text-stone-500">
            Manager only — envoyez une notification test à un collègue pour valider son appareil en un clic.
          </p>
          <div className="flex flex-wrap gap-2">
            <select value={colleague} onChange={e => setColleague(e.target.value)}
              className="input-crm text-sm min-h-[40px] flex-1 min-w-[200px]" data-testid="colleague-select">
              <option value="">— Sélectionner —</option>
              {team.map(m => (
                <option key={m.id} value={m.id}>
                  {m.display_name || m.name || m.email} · {m.role}
                </option>
              ))}
            </select>
            <button onClick={testPushToColleague} disabled={busy || !colleague}
              className="btn-primary min-h-[40px] px-4 flex items-center gap-2" data-testid="test-colleague-btn">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
              Envoyer test
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
