import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";
import { Mail, CheckCircle2 } from "lucide-react";

export default function ForgotPassword() {
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
      toast.error(err.response?.data?.detail || "Erreur");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-stone-50">
      <div className="w-full max-w-sm bg-white rounded-2xl p-8 shadow-sm border border-stone-200" data-testid="forgot-password-page">
        <p className="overline">BEVID</p>
        <h2 className="font-display text-3xl mt-1 mb-6">{t("forgot_password")}</h2>

        {sent ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-emerald-50 rounded-lg text-emerald-800 text-sm" data-testid="forgot-sent-message">
              <CheckCircle2 size={20} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Email envoyé</p>
                <p className="mt-1">Si votre adresse est enregistrée, vous allez recevoir un lien de réinitialisation valable 60 minutes.</p>
              </div>
            </div>
            <Link to="/login" className="btn-primary w-full flex items-center justify-center min-h-[48px]">
              {t("back_to_login")}
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" data-testid="forgot-form">
            <p className="text-sm text-stone-600">
              Saisissez l'email de votre compte. Vous recevrez un lien pour choisir un nouveau mot de passe.
            </p>
            <div>
              <label className="text-xs text-stone-600 flex items-center gap-1"><Mail size={12} /> {t("email")}</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="input-crm mt-1 min-h-[48px]" data-testid="forgot-email" />
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
  );
}
