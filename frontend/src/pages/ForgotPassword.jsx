import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";
import { Mail, CheckCircle2 } from "lucide-react";
import BevidLogo from "@/components/BevidLogo";
import { usePageMeta } from "@/lib/pageMeta";

export default function ForgotPassword() {
  usePageMeta({
    title: "Mot de passe oublié · BEVID",
    canonical: "/forgot-password",
  });
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || t("toast.error_generic"));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex">
      <div data-testid="brand-panel" className="hidden md:flex md:w-1/2 relative bg-[#4A154B] text-white p-12 flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1562601579-599dec564e06?w=1200')", backgroundSize: "cover", backgroundPosition: "center", mixBlendMode: "multiply" }} />
        <div className="relative z-10 flex items-center gap-2">
          <BevidLogo size={28} />
          <span className="overline text-white/80">BEVID · CRM</span>
        </div>
        <div className="relative z-10">
          <h1 className="font-display text-5xl leading-tight mb-4">Un lien sécurisé,<br/>valable 60 minutes.</h1>
          <p className="text-white/80 max-w-md">Nous n'affichons jamais si l'email existe ou non. Cela empêche l'énumération des comptes commerciaux.</p>
        </div>
        <div className="relative z-10 overline text-white/50">© 2026 BEVID</div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm" data-testid="forgot-password-page">
          <p className="overline">BEVID</p>
          <h2 className="font-display text-4xl mt-1 mb-6">{t("forgot_password")}</h2>

          {sent ? (
            <div className="space-y-4">
              <div
                role="status"
                data-testid="forgot-sent-message"
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: 16, borderRadius: 12,
                  background: "var(--ds-state-success-soft-bg)",
                  color: "var(--ds-state-success-soft-fg)",
                  border: "1px solid var(--ds-state-success)",
                }}
              >
                <CheckCircle2 size={20} style={{ marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
                <div>
                  <p className="font-medium">Email envoyé</p>
                  <p className="mt-1 text-sm">Si votre adresse est enregistrée, vous allez recevoir un lien de réinitialisation valable 60 minutes.</p>
                </div>
              </div>
              <Link to="/login" className="btn-primary w-full flex items-center justify-center min-h-[48px]">
                {t("back_to_login")}
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" data-testid="forgot-form" noValidate>
              <p className="text-sm text-stone-600 dark:text-stone-300">
                Saisissez l'email de votre compte. Vous recevrez un lien pour choisir un nouveau mot de passe.
              </p>
              <div>
                <label htmlFor="forgot-email" className="text-xs text-stone-600 dark:text-stone-300 flex items-center gap-1">
                  <Mail size={12} aria-hidden="true" /> {t("email")}
                </label>
                <input id="forgot-email" name="email" type="email" autoComplete="email" required inputMode="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  className="input-crm mt-1 min-h-[48px]" data-testid="forgot-email" />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full min-h-[48px]" data-testid="forgot-submit">
                {loading ? "…" : "Envoyer le lien"}
              </button>
              <p className="text-sm text-stone-500 text-center">
                <Link to="/login" className="text-[#4A154B] font-medium">{t("back_to_login")}</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
