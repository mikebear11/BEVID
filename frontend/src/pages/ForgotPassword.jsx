import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";
import { Mail, CheckCircle2, KeyRound, Copy, ArrowLeft, ArrowRight } from "lucide-react";
import BevidLogo from "@/components/BevidLogo";
import PasswordInput from "@/components/PasswordInput";
import { usePageMeta } from "@/lib/pageMeta";

/**
 * Récupération par code OTP 6 chiffres.
 *
 * Deux étapes sur la même page :
 *  1. Saisie de l'email → génération du code (envoi email + affichage
 *     à l'écran si l'email n'a pas pu partir — mode dégradé documenté).
 *  2. Saisie du code + nouveau mot de passe → reset immédiat, redirection
 *     vers /login.
 */
export default function ForgotPassword() {
  usePageMeta({
    title: "Mot de passe oublié · BEVID",
    canonical: "/forgot-password",
  });
  const { t } = useI18n();
  const nav = useNavigate();
  const [step, setStep] = useState(1);          // 1 = email, 2 = code + pwd
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [fallbackCode, setFallbackCode] = useState(null); // code renvoyé quand email KO
  const [emailDelivered, setEmailDelivered] = useState(null);

  const submitEmail = async (e) => {
    e.preventDefault();
    setLoading(true); setFallbackCode(null);
    try {
      const { data } = await api.post("/auth/forgot-password-code", { email });
      setEmailDelivered(!!data.email_delivered);
      if (data.code) {
        setFallbackCode(data.code);
        toast.info("Email indisponible — code affiché à l'écran");
      } else {
        toast.success("Un code à 6 chiffres a été envoyé");
      }
      setStep(2);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erreur — réessayez dans un instant");
    } finally { setLoading(false); }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    if (pwd !== confirm) { toast.error("Les mots de passe ne correspondent pas"); return; }
    if (pwd.length < 8) { toast.error("8 caractères minimum"); return; }
    if (code.trim().length !== 6) { toast.error("Le code fait 6 chiffres"); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password-code", {
        email, code: code.trim(), new_password: pwd,
      });
      toast.success("Mot de passe modifié. Redirection…");
      setTimeout(() => nav("/login"), 1500);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Code invalide ou expiré");
    } finally { setLoading(false); }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(fallbackCode);
      toast.success("Code copié");
    } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen flex">
      <div data-testid="brand-panel" className="hidden md:flex md:w-1/2 relative bg-[#4A154B] text-white p-12 flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 opacity-90" aria-hidden="true" style={{ background: "radial-gradient(circle at 20% 20%, #6B2470 0%, transparent 55%), radial-gradient(circle at 80% 70%, #B076B4 0%, transparent 45%), linear-gradient(135deg, #4A154B 0%, #2B0C2D 100%)" }} />
        <div className="absolute inset-0 opacity-10" aria-hidden="true" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <div className="relative z-10 flex items-center gap-2">
          <BevidLogo size={28} />
          <span className="overline text-white/80">BEVID · CRM</span>
        </div>
        <div className="relative z-10">
          <h1 className="font-display text-5xl leading-tight mb-4">{t("forgot_hero_title_line1")}<br/>{t("forgot_hero_title_line2")}</h1>
          <p className="text-white/80 max-w-md">{t("forgot_hero_subtitle")}</p>
        </div>
        <div className="relative z-10 overline text-white/50">© 2026 BEVID</div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm" data-testid="forgot-password-page">
          <p className="overline">BEVID</p>
          <h2 className="font-display text-4xl mt-1 mb-6">
            {step === 1 ? "Mot de passe oublié" : "Entrez votre code"}
          </h2>

          {step === 1 && (
            <form onSubmit={submitEmail} className="space-y-4" data-testid="forgot-form" noValidate>
              <p className="text-sm text-stone-600 dark:text-stone-300">
                Saisissez l'email de votre compte. Vous recevrez un code à 6 chiffres pour choisir un nouveau mot de passe.
              </p>
              <div>
                <label htmlFor="forgot-email" className="text-xs text-stone-600 dark:text-stone-300 flex items-center gap-1">
                  <Mail size={12} aria-hidden="true" /> Email
                </label>
                <input id="forgot-email" name="email" type="email" autoComplete="email" required inputMode="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  className="input-crm mt-1 min-h-[48px]" data-testid="forgot-email" />
              </div>
              <button type="submit" disabled={loading || !email.trim()}
                      className="btn-primary w-full min-h-[48px] flex items-center justify-center gap-2"
                      data-testid="forgot-submit">
                {loading ? "…" : <>Recevoir un code <ArrowRight size={14} /></>}
              </button>
              <p className="text-sm text-stone-500 text-center">
                <Link to="/login" className="text-[#4A154B] font-medium">Retour à la connexion</Link>
              </p>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={submitCode} className="space-y-4" data-testid="reset-code-form" noValidate>
              {fallbackCode && (
                <div
                  role="status"
                  data-testid="fallback-code-banner"
                  className="rounded-lg border p-3 space-y-2"
                  style={{
                    background: "var(--ds-state-warning-soft-bg, #FFF7ED)",
                    borderColor: "var(--ds-state-warning, #C78B3A)",
                    color: "var(--ds-state-warning-soft-fg, #7C4A1A)",
                  }}
                >
                  <p className="text-xs font-medium">Email indisponible — voici votre code</p>
                  <div className="flex items-center gap-2 justify-between">
                    <span className="font-mono text-2xl tracking-[0.4em] font-bold" data-testid="fallback-code-value">
                      {fallbackCode}
                    </span>
                    <button type="button" onClick={copyCode}
                            className="text-xs flex items-center gap-1 hover:underline"
                            data-testid="fallback-code-copy">
                      <Copy size={11} /> Copier
                    </button>
                  </div>
                  <p className="text-[10px]">
                    Ce code s'affiche uniquement parce que l'email n'a pas pu partir. En production
                    normale, il arrive dans votre boîte email.
                  </p>
                </div>
              )}
              {emailDelivered && !fallbackCode && (
                <div
                  role="status"
                  className="rounded-lg border p-3 flex items-start gap-2"
                  style={{
                    background: "var(--ds-state-success-soft-bg)",
                    borderColor: "var(--ds-state-success)",
                    color: "var(--ds-state-success-soft-fg)",
                  }}
                >
                  <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
                  <p className="text-xs">
                    Code envoyé à <strong>{email}</strong>. Vérifiez votre boîte de réception (et les spams).
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="otp-code" className="text-xs text-stone-600 dark:text-stone-300 flex items-center gap-1">
                  <KeyRound size={12} aria-hidden="true" /> Code à 6 chiffres
                </label>
                <input
                  id="otp-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code"
                  maxLength={6} pattern="[0-9]{6}"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="input-crm mt-1 min-h-[48px] text-center font-mono text-2xl tracking-[0.4em]"
                  placeholder="••••••"
                  data-testid="otp-code-input"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs text-stone-600 dark:text-stone-300">Nouveau mot de passe</label>
                <PasswordInput required minLength={8} value={pwd}
                               onChange={e => setPwd(e.target.value)}
                               className="mt-1" autoComplete="new-password"
                               data-testid="new-pwd-input" />
              </div>
              <div>
                <label className="text-xs text-stone-600 dark:text-stone-300">Confirmer</label>
                <PasswordInput required minLength={8} value={confirm}
                               onChange={e => setConfirm(e.target.value)}
                               className="mt-1" autoComplete="new-password"
                               data-testid="confirm-pwd-input" />
              </div>

              <button type="submit" disabled={loading || code.length !== 6 || pwd.length < 8}
                      className="btn-primary w-full min-h-[48px]"
                      data-testid="reset-code-submit">
                {loading ? "…" : "Réinitialiser le mot de passe"}
              </button>
              <button type="button" onClick={() => { setStep(1); setCode(""); setPwd(""); setConfirm(""); setFallbackCode(null); }}
                      className="w-full text-sm text-stone-500 flex items-center justify-center gap-1 hover:text-[#4A154B]"
                      data-testid="reset-code-back">
                <ArrowLeft size={12} /> Changer d'email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
