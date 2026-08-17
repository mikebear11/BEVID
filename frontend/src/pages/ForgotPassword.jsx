import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";
import { Mail } from "lucide-react";

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
        <p className="overline">Cellier</p>
        <h2 className="font-display text-3xl mt-1 mb-6">{t("forgot_password")}</h2>

        {sent ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-lg text-emerald-800 text-sm" data-testid="forgot-sent-message">
              <Mail size={20} />
              <span>Votre demande a été transmise. Votre manager va vous fournir un mot de passe temporaire.</span>
            </div>
            <Link to="/login" className="btn-primary w-full flex items-center justify-center min-h-[48px]">
              {t("back_to_login")}
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" data-testid="forgot-form">
            <p className="text-sm text-stone-600">
              Saisissez votre email. Votre manager sera notifié et pourra vous fournir un mot de passe temporaire.
            </p>
            <div>
              <label className="text-xs text-stone-600">{t("email")}</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="input-crm mt-1 min-h-[48px]" data-testid="forgot-email" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full min-h-[48px]" data-testid="forgot-submit">
              {loading ? "…" : t("request_reset")}
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
