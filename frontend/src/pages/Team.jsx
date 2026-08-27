import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { UserPlus, Mail, Smartphone, QrCode, Trash2, Crown } from "lucide-react";
import { t as tt } from "@/lib/i18n";
import { usePageMeta } from "@/lib/pageMeta";

/** Encode texte en URL de QR image (générateur public sans dépendance). */
function qrDataUrl(text) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(text)}`;
}

export default function Team() {
  usePageMeta({ title: `${tt("team")} · BEVID` });
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [features, setFeatures] = useState({ sms_configured: false });
  const [showInvite, setShowInvite] = useState(false);
  const [channel, setChannel] = useState("email");
  const [form, setForm] = useState({ email: "", phone: "", name: "", role: "commercial" });
  const [qr, setQr] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [orgName, setOrgName] = useState("");

  const load = async () => {
    const [team, branding, cfg] = await Promise.all([
      api.get("/org/team"),
      api.get("/org/branding"),
      api.get("/config/features"),
    ]);
    setData(team.data); setOrgName(branding.data.name); setFeatures(cfg.data);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = { channel, role: form.role, name: form.name };
      if (channel === "email") payload.email = form.email;
      if (channel === "sms") payload.phone = form.phone;
      const { data: r } = await api.post("/org/invitations", payload);
      if (channel === "qr") {
        setQr(r.invitation);
        setShowInvite(false);
      } else {
        toast.success(tt("toast.invitation_sent"));
        setShowInvite(false); setForm({ email: "", phone: "", name: "", role: "commercial" });
      }
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.errors?.email || tt("toast.error_generic"));
    }
  };

  const revoke = async (id) => {
    if (!window.confirm(tt("confirm.revoke_invitation"))) return;
    await api.post(`/org/invitations/${id}/revoke`);
    toast.success(tt("toast.invitation_revoked")); load();
  };

  const initiateTransfer = async (e) => {
    e.preventDefault();
    try {
      const { data: r } = await api.post("/org/transfer-ownership/initiate", {
        target_user_id: transferTarget, org_name_confirm: orgName,
      });
      toast.success(r.message);
      setTransferOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || tt("toast.error_generic"));
    }
  };

  if (!data) return <div className="text-stone-500">{tt("loading_ellipsis")}</div>;
  const isManager = user?.role === "manager";
  const smsDisabled = !features.sms_configured;

  return (
    <div className="space-y-6" data-testid="team-page">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="overline">Déploiement équipe</p>
          <h1 className="font-display text-4xl">Mon équipe</h1>
        </div>
        {isManager && (
          <button onClick={() => setShowInvite(true)} className="btn-primary flex items-center gap-2 min-h-[44px]" data-testid="invite-btn">
            <UserPlus size={16} /> Inviter un membre
          </button>
        )}
      </div>

      <section className="card-crm p-4" data-testid="members-list">
        <h2 className="font-display text-xl mb-3">Membres actifs ({data.members.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.members.map(m => (
            <div key={m.id} className="border rounded-lg p-3 flex items-center gap-3" data-testid={`member-${m.id}`}>
              <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center font-medium text-sm">
                {(m.display_name || m.name || m.email).slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{m.display_name || m.name}</p>
                <p className="text-xs text-stone-500">{m.email} · {m.role}</p>
                <p className="text-xs" style={{ color: m.state === "active" ? "var(--ds-state-success)" : "var(--ds-state-warning)" }}>
                  {m.state === "active" ? `Dernier accès : ${m.last_active_at ? new Date(m.last_active_at).toLocaleDateString("fr-FR") : "—"}` : "Première connexion en attente"}
                </p>
              </div>
              {isManager && m.role === "manager" && m.id !== user.id && (
                <button onClick={() => { setTransferTarget(m.id); setTransferOpen(true); }}
                  className="btn-ghost text-xs" title="Transférer la propriété" data-testid={`transfer-to-${m.id}`}>
                  <Crown size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {data.invitations.length > 0 && (
        <section className="card-crm p-4" data-testid="pending-invitations">
          <h2 className="font-display text-xl mb-3">Invitations en cours ({data.invitations.length})</h2>
          <div className="space-y-2">
            {data.invitations.map(inv => (
              <div key={inv.id} className="border rounded-lg p-3 flex items-center gap-3 text-sm" data-testid={`inv-${inv.id}`}>
                {inv.channel === "email" && <Mail size={16} />}
                {inv.channel === "sms" && <Smartphone size={16} />}
                {inv.channel === "qr" && <QrCode size={16} />}
                <div className="flex-1">
                  <p>{inv.email || inv.phone || "QR"} — {inv.role}</p>
                  <p className="text-xs text-stone-500">
                    Expire le {new Date(inv.expires_at).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                {inv.channel === "qr" && (
                  <button onClick={() => setQr(inv)} className="btn-ghost text-xs" data-testid={`show-qr-${inv.id}`}>
                    Afficher QR
                  </button>
                )}
                <button onClick={() => revoke(inv.id)} className="btn-ghost text-xs" data-testid={`revoke-${inv.id}`}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {showInvite && (
        <div role="dialog" aria-modal="true" onClick={() => setShowInvite(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <form onClick={e => e.stopPropagation()} onSubmit={submit}
            className="card-crm p-6 w-full max-w-md space-y-4" data-testid="invite-modal">
            <h3 className="font-display text-2xl">Inviter un membre</h3>
            <div className="flex gap-2" role="tablist">
              {["email", "sms", "qr"].map(c => {
                const disabled = c === "sms" && smsDisabled;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => !disabled && setChannel(c)}
                    disabled={disabled}
                    aria-disabled={disabled}
                    title={disabled ? "Envoi SMS non configuré — utilisez le QR code ou l'e-mail" : ""}
                    data-testid={`channel-${c}`}
                    className={`flex-1 min-h-[44px] rounded-lg border ${channel === c ? "bg-[#4A154B] text-white border-transparent" : "bg-white"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    {c === "email" ? "E-mail" : c === "sms" ? "SMS" : "QR code"}
                  </button>
                );
              })}
            </div>
            <input placeholder="Nom (pré-rempli)" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="input-crm min-h-[44px] w-full" data-testid="invite-name" />
            {channel !== "sms" && (
              <input type="email" placeholder="E-mail" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="input-crm min-h-[44px] w-full" required={channel === "email"} data-testid="invite-email" />
            )}
            {channel === "sms" && (
              <input type="tel" placeholder="+33 6 …" value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className="input-crm min-h-[44px] w-full" required data-testid="invite-phone" />
            )}
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
              className="input-crm min-h-[44px] w-full" data-testid="invite-role">
              <option value="commercial">Commercial</option>
              <option value="manager">Manager</option>
            </select>
            <p className="text-xs text-stone-500" data-testid="channel-hint">
              {channel === "email" && "Lien envoyé par e-mail, valable 7 jours."}
              {channel === "sms" && (smsDisabled
                ? "Envoi SMS non configuré — utilisez le QR code ou l'e-mail."
                : "SMS envoyé via Twilio, lien valable 24 h.")}
              {channel === "qr" && "QR affiché à l'écran, valable 24 h, à usage unique."}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowInvite(false)} className="btn-ghost flex-1 min-h-[44px]">Annuler</button>
              <button type="submit" className="btn-primary flex-1 min-h-[44px]" data-testid="invite-submit">Créer l'invitation</button>
            </div>
          </form>
        </div>
      )}

      {qr && (
        <div role="dialog" aria-modal="true" onClick={() => setQr(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card-crm p-6 w-full max-w-sm text-center" data-testid="qr-modal">
            <h3 className="font-display text-2xl mb-2">Scanner le QR code</h3>
            <p className="text-xs text-stone-500 mb-4">Nominatif · à usage unique · valable 24 h</p>
            <img src={qrDataUrl(qr.activate_url)} alt="QR d'activation" width={280} height={280} className="mx-auto" data-testid="qr-image" />
            <p className="text-xs text-stone-500 mt-3 break-all">{qr.activate_url}</p>
            <button onClick={() => setQr(null)} className="btn-primary w-full mt-4 min-h-[44px]">Fermer</button>
          </div>
        </div>
      )}

      {transferOpen && (
        <div role="dialog" aria-modal="true" onClick={() => setTransferOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <form onClick={e => e.stopPropagation()} onSubmit={initiateTransfer}
            className="card-crm p-6 w-full max-w-md space-y-3" data-testid="transfer-modal">
            <h3 className="font-display text-xl">Transférer la propriété</h3>
            <p className="text-sm text-stone-600">
              Le destinataire doit ensuite accepter le transfert depuis son compte. Vous restez manager, vous n'êtes pas éjecté.
            </p>
            <label className="text-xs text-stone-500 block">Tapez le nom exact de l'entreprise pour confirmer :</label>
            <input placeholder={orgName} required
              onInput={e => { const el = e.target; el.setCustomValidity(el.value === orgName ? "" : "Nom incorrect"); }}
              className="input-crm min-h-[44px] w-full" data-testid="transfer-confirm-name" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setTransferOpen(false)} className="btn-ghost flex-1 min-h-[44px]">Annuler</button>
              <button type="submit" className="btn-primary flex-1 min-h-[44px]" data-testid="transfer-submit">Envoyer la demande</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
