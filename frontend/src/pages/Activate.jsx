import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Smartphone, CheckCircle2, AlertCircle } from "lucide-react";
import BevidLogo from "@/components/BevidLogo";
import PasswordInput from "@/components/PasswordInput";
import { t as tt } from "@/lib/i18n";
import { usePageMeta } from "@/lib/pageMeta";

/**
 * /activate/:token — Parcours d'activation post-invitation.
 * Objectif : < 90 secondes entre le scan et la première tournée.
 * - Un GET public pré-remplit nom + org + savoir si e-mail requis (QR/SMS)
 * - 1 seul champ mot de passe (pas de confirmation, l'œil suffit)
 * - Instructions d'installation (iOS/Android détecté)
 * - Redirection directe vers /tournee
 */
function detectInstall() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export default function Activate() {
  usePageMeta({ title: "Activation · BEVID", noindex: true });
  const { token } = useParams();
  const nav = useNavigate();
  const [pwd, setPwd] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [device] = useState(detectInstall);
  const [started] = useState(Date.now());

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/auth/invitation/${token}`);
        setMeta(data);
        if (data.prefill_name) setName(data.prefill_name);
        if (data.email) setEmail(data.email);
      } catch (err) {
        setError(err.response?.data?.detail || "Invitation invalide ou expirée.");
      }
    })();
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (pwd.length < 10) { toast.error(tt("toast.password_min_10")); return; }
    if (meta?.requires_email && !email) { toast.error(tt("toast.email_required")); return; }
    setLoading(true);
    try {
      const payload = { token, password: pwd, name };
      if (meta?.requires_email) payload.email = email;
      await api.post("/auth/accept-invitation", payload);
      const elapsed = Math.round((Date.now() - started) / 1000);
      toast.success(tt("toast.account_activated", { seconds: elapsed }));
      nav("/tournee", { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || tt("toast.error_generic"));
    } finally { setLoading(false); }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" data-testid="activate-error">
        <div className="w-full max-w-sm text-center">
          <div className="flex items-center gap-2 mb-6 justify-center">
            <BevidLogo size={40} />
            <span className="font-display text-3xl">BEVID</span>
          </div>
          <AlertCircle className="mx-auto mb-4 text-rose-600" size={48} />
          <h1 className="font-display text-2xl mb-2">Lien invalide</h1>
          <p className="text-sm text-stone-600 mb-6">{error}</p>
          <p className="text-xs text-stone-500">Demandez un nouveau lien à votre manager.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" data-testid="activate-page">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <BevidLogo size={40} />
          <span className="font-display text-3xl">BEVID</span>
        </div>
        <h1 className="font-display text-2xl mb-2 text-center">Bienvenue dans l'équipe</h1>
        <p className="text-sm text-stone-600 text-center mb-6">
          {meta?.org_name ? <>Rejoindre <strong>{meta.org_name}</strong>. </> : null}
          Choisissez un mot de passe et vous êtes prêt à démarrer votre première tournée.
        </p>

        {device !== "desktop" && (
          <div className="card-crm p-4 mb-4 text-sm" data-testid="install-hint">
            <div className="flex items-center gap-2 mb-2 font-medium"><Smartphone size={16} /> Installer sur l'écran d'accueil</div>
            {device === "ios" ? (
              <p className="text-xs text-stone-600">
                Appuyez sur <strong>Partager</strong> (⎋) en bas, puis <strong>Sur l'écran d'accueil</strong>.
                L'app s'ouvrira comme une vraie application, hors-ligne aussi.
              </p>
            ) : (
              <p className="text-xs text-stone-600">
                Une bannière <strong>« Installer l'application »</strong> apparaît en bas. Appuyez dessus.
                Sinon, menu du navigateur → <strong>Installer BEVID</strong>.
              </p>
            )}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4" data-testid="activate-form" noValidate>
          <div>
            <label htmlFor="act-name" className="text-xs text-stone-600 block">Votre nom</label>
            <input id="act-name" value={name} onChange={e => setName(e.target.value)}
              autoComplete="name" required
              className="input-crm mt-1 min-h-[48px]" data-testid="activate-name" />
          </div>
          {meta?.requires_email && (
            <div>
              <label htmlFor="act-email" className="text-xs text-stone-600 block">Votre e-mail (pour vous reconnecter)</label>
              <input id="act-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                autoComplete="email" required
                className="input-crm mt-1 min-h-[48px]" data-testid="activate-email" />
            </div>
          )}
          <div>
            <label htmlFor="act-pwd" className="text-xs text-stone-600 block">Mot de passe (10 caractères min., l'œil vérifie)</label>
            <PasswordInput id="act-pwd" required minLength={10} value={pwd}
              onChange={e => setPwd(e.target.value)} autoComplete="new-password"
              className="mt-1" data-testid="activate-password" />
          </div>
          <button type="submit" disabled={loading || !meta} className="btn-primary w-full min-h-[48px]" data-testid="activate-submit">
            {loading ? "…" : "Activer et démarrer ma tournée"}
          </button>
          <p className="text-xs text-stone-500 text-center flex items-center justify-center gap-1">
            <CheckCircle2 size={12} /> Un seul champ, pas de confirmation — vous relisez avec l'œil.
          </p>
        </form>
      </div>
    </div>
  );
}
