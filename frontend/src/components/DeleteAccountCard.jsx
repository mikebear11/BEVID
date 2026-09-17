import React, { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

/** N5 — Suppression de compte par l'utilisateur (exigence App Store 5.1.1(v) / Google Play). */
export function DeleteAccountCard() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [deleteOrg, setDeleteOrg] = useState(false);
  const [busy, setBusy] = useState(false);
  const isOwner = user?.role === "manager";

  const confirm = async () => {
    setBusy(true);
    try {
      await api.delete("/me/account", { data: { password: pwd, delete_org: deleteOrg } });
      toast.success("Compte supprimé");
      await logout();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Suppression impossible");
    } finally { setBusy(false); }
  };

  return (
    <section className="card-crm p-4 border-[#8C2A2A]/40" data-testid="delete-account-card">
      <h2 className="font-display text-xl text-[#8C2A2A]">Supprimer mon compte</h2>
      <p className="text-base text-stone-700 mt-1">Vos identifiants sont anonymisés, vos sessions et appareils révoqués. Les commandes et visites restent rattachées à l'organisation pour l'historique commercial.</p>
      {isOwner && <p className="text-sm text-stone-700 mt-1">Propriétaire : s'il reste d'autres membres, transférez d'abord l'organisation (Mon équipe → rôle Manager). Seul membre : exportez vos données (Réglages → Export) puis cochez la suppression de l'organisation.</p>}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 min-h-[48px] px-4 rounded-xl border border-[#8C2A2A] text-[#8C2A2A] text-base font-medium" data-testid="delete-account-open">Supprimer mon compte…</button>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block text-base">Mot de passe pour confirmer
            <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="current-password" className="input-crm w-full min-h-[48px] mt-1" data-testid="delete-account-password" />
          </label>
          {isOwner && <label className="flex items-center gap-2 text-base min-h-[44px]"><input type="checkbox" checked={deleteOrg} onChange={(e) => setDeleteOrg(e.target.checked)} data-testid="delete-account-org" /> Supprimer aussi l'organisation (je suis le seul membre)</label>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="min-h-[48px] px-4 rounded-xl border border-stone-300 text-base" data-testid="delete-account-cancel">Annuler</button>
            <button type="button" onClick={confirm} disabled={busy || !pwd} className="min-h-[48px] px-4 rounded-xl bg-[#8C2A2A] text-white text-base font-medium disabled:opacity-40" data-testid="delete-account-confirm">Supprimer définitivement</button>
          </div>
        </div>
      )}
    </section>
  );
}
