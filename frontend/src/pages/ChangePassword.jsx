import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";
import PasswordInput from "@/components/PasswordInput";

export default function ChangePassword() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [old_password, setOld] = useState("");
  const [new_password, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (new_password !== confirm) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/change-password", { old_password, new_password });
      toast.success("✓ Mot de passe mis à jour");
      nav("/");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-md mx-auto" data-testid="change-password-page">
      <p className="overline">Sécurité</p>
      <h2 className="font-display text-3xl mt-1 mb-6">{t("change_password")}</h2>
      <form onSubmit={submit} className="space-y-4 bg-white p-6 rounded-2xl border border-stone-200">
        <div>
          <label className="text-xs text-stone-600">{t("old_password")}</label>
          <PasswordInput required value={old_password} onChange={e => setOld(e.target.value)} className="mt-1" autoComplete="current-password" data-testid="cp-old" />
        </div>
        <div>
          <label className="text-xs text-stone-600">{t("new_password")}</label>
          <PasswordInput required minLength={8} value={new_password} onChange={e => setNew(e.target.value)} className="mt-1" autoComplete="new-password" data-testid="cp-new" />
          <p className="text-xs text-stone-500 mt-1">8 caractères minimum.</p>
        </div>
        <div>
          <label className="text-xs text-stone-600">{t("confirm")}</label>
          <PasswordInput required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} className="mt-1" autoComplete="new-password" data-testid="cp-confirm" />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full min-h-[48px]" data-testid="cp-submit">
          {loading ? "…" : t("save")}
        </button>
      </form>
    </div>
  );
}
