import React, { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Users, Plus, Phone, Smartphone, Mail, Star, X, Check, Loader2, ChevronDown, History,
  UserCog, ArrowRight,
} from "lucide-react";

/**
 * Liste des contacts (Lot 9 étape 3) + création rapide 3 champs.
 *
 * Décisions produit :
 *  - **Création en 3 champs max** : nom + rôle + établissement (déjà connu).
 *    Aucun autre champ obligatoire ; tout se complète depuis le terrain.
 *  - **Rôles fermés** (20 valeurs) — récupérés depuis /roles/catalog.
 *  - **Rôles clos** replié par défaut (`History` toggle) — un rôle clos n'est
 *    JAMAIS supprimé, il porte une `date_fin`.
 *  - **Actions rapides** sur chaque contact : appeler, envoyer SMS, envoyer
 *    email — 3 actions, pas un menu.
 */
const emptyForm = { prenom: "", nom: "", role: "acheteur", principal: false, peut_engager: false };

export default function ContactsPanelV2({ establishmentId, onChange }) {
  const [catalog, setCatalog] = useState({ roles: [], channels: [], timeslots: [] });
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showChangeManager, setShowChangeManager] = useState(false);

  useEffect(() => {
    api.get("/roles/catalog").then(r => setCatalog(r.data)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [activeR, allR] = await Promise.all([
        api.get(`/establishments/${establishmentId}/roles`),
        api.get(`/establishments/${establishmentId}/roles?include_closed=true`),
      ]);
      // On garde 2 listes : actifs (par défaut), tout (historique)
      setRoles({ active: activeR.data || [], all: allR.data || [] });
    } catch {
      setRoles({ active: [], all: [] });
    } finally { setLoading(false); }
  }, [establishmentId]);

  useEffect(() => { if (establishmentId) load(); }, [establishmentId, load]);

  const roleLabel = (key) => {
    const r = (catalog.roles || []).find(x => x.key === key);
    return r?.label || key;
  };

  const groups = useMemo(() => {
    const active = roles.active || [];
    return {
      direction: active.filter(r => (r.role_meta?.group || "") === "direction"),
      operationnel: active.filter(r => r.role_meta?.group === "operationnel"),
      administratif: active.filter(r => r.role_meta?.group === "administratif"),
      autre: active.filter(r => r.role_meta?.group === "autre"),
    };
  }, [roles.active]);

  const closedRoles = useMemo(() => {
    const all = roles.all || [];
    return all.filter(r => r.date_fin);
  }, [roles.all]);

  const save = async () => {
    if (!form.nom.trim()) { toast.error("Nom requis"); return; }
    setSaving(true);
    try {
      await api.post("/contacts-v2", {
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        role: form.role,
        establishment_id: establishmentId,
        principal: form.principal,
        peut_engager: form.peut_engager,
      });
      toast.success("Contact ajouté");
      setShowAdd(false); setForm(emptyForm);
      await load();
      onChange && onChange();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Enregistrement impossible");
    } finally { setSaving(false); }
  };

  const closeRole = async (role) => {
    if (!window.confirm(`Clôturer le rôle « ${roleLabel(role.role)} » de ${role.contact?.prenom || ""} ${role.contact?.nom || ""} ?`)) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      await api.patch(`/roles/${role.id}`, { date_fin: today });
      toast.success("Rôle clôturé (historique conservé)");
      await load(); onChange && onChange();
    } catch { toast.error("Clôture impossible"); }
  };

  const promotePrimary = async (role) => {
    try {
      await api.patch(`/roles/${role.id}`, { principal: true });
      toast.success("Contact principal mis à jour");
      await load(); onChange && onChange();
    } catch { toast.error("Modification impossible"); }
  };

  const renderRole = (r) => {
    const c = r.contact || {};
    const phone = c.mobile_pro || c.telephone_pro;
    return (
      <li key={r.id} className="border border-stone-200 dark:border-stone-700 rounded-lg p-3" data-testid={`role-${r.id}`}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="font-medium text-sm">{[c.prenom, c.nom].filter(Boolean).join(" ") || "—"}</span>
              {r.principal && (
                <span className="inline-flex items-center gap-0.5 text-xs text-[#C78B3A]"
                      data-testid={`role-primary-${r.id}`}>
                  <Star size={10} className="fill-[#C78B3A]" /> principal
                </span>
              )}
              {r.peut_engager && (
                <span className="text-xs font-medium text-[#2D5A4C] px-1 rounded bg-[#2D5A4C]/10">
                  peut engager
                </span>
              )}
            </div>
            <p className="text-xs uppercase tracking-wider text-stone-500">
              {r.role_meta?.label || r.role}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs">
              {phone && (
                <a href={`tel:${phone.replace(/\s/g, "")}`} className="text-stone-600 hover:text-[#4A154B] flex items-center gap-1">
                  <Smartphone size={10} /> {phone}
                </a>
              )}
              {c.email_pro && (
                <a href={`mailto:${c.email_pro}`} className="text-stone-600 hover:text-[#4A154B] flex items-center gap-1 truncate max-w-[220px]">
                  <Mail size={10} /> {c.email_pro}
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1 items-end shrink-0 text-xs">
            {!r.principal && (
              <button type="button" onClick={() => promotePrimary(r)}
                      className="text-stone-400 hover:text-[#C78B3A]"
                      data-testid={`role-promote-${r.id}`}>Principal</button>
            )}
            <button type="button" onClick={() => closeRole(r)}
                    className="text-stone-400 hover:text-[#8C2A2A]"
                    data-testid={`role-close-${r.id}`}>Clôturer</button>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="card-crm p-4" data-testid="contacts-panel-v2">
      <div className="flex items-center justify-between mb-3">
        <p className="overline flex items-center gap-1">
          <Users size={11} className="text-[#4A154B]" />
          Interlocuteurs
          {(roles.active?.length || 0) > 0 && (
            <span className="ml-1 text-stone-400">· {roles.active.length}</span>
          )}
        </p>
        <div className="flex items-center gap-3 text-xs">
          <button type="button" onClick={() => setShowChangeManager(true)}
                  className="text-[#C78B3A] hover:underline flex items-center gap-1"
                  data-testid="change-manager-btn">
            <UserCog size={11} /> Changement de gérant
          </button>
          <button type="button" onClick={() => setShowAdd(true)}
                  className="text-[#4A154B] hover:underline flex items-center gap-1"
                  data-testid="contact-add-btn">
            <Plus size={12} /> Ajouter
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-stone-500 flex items-center gap-1" data-testid="contacts-loading">
          <Loader2 size={12} className="animate-spin" /> Chargement…
        </div>
      ) : (roles.active?.length || 0) === 0 ? (
        <p className="text-xs text-stone-500">
          Aucun interlocuteur actif. <button className="underline hover:text-[#4A154B]" onClick={() => setShowAdd(true)}>Ajouter le premier</button>
        </p>
      ) : (
        <div className="space-y-3">
          {["direction", "operationnel", "administratif", "autre"].map(g => (
            groups[g].length > 0 && (
              <div key={g}>
                <p className="text-xs uppercase tracking-wider text-stone-400 mb-1">
                  {g === "direction" ? "Direction" : g === "operationnel" ? "Opérationnel" :
                   g === "administratif" ? "Administratif" : "Autre"}
                </p>
                <ul className="space-y-1.5">{groups[g].map(renderRole)}</ul>
              </div>
            )
          ))}
        </div>
      )}

      {closedRoles.length > 0 && (
        <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
          <button type="button" onClick={() => setShowHistory(v => !v)}
                  className="text-xs text-stone-500 hover:text-stone-700 flex items-center gap-1"
                  data-testid="history-toggle">
            <History size={11} />
            Historique ({closedRoles.length} rôle{closedRoles.length > 1 ? "s" : ""} clos)
            <ChevronDown size={11} className={`transition-transform ${showHistory ? "rotate-180" : ""}`} />
          </button>
          {showHistory && (
            <ul className="mt-2 space-y-1" data-testid="history-list">
              {closedRoles.map(r => (
                <li key={r.id} className="text-xs text-stone-500 border-l-2 border-stone-200 pl-2 py-0.5" data-testid={`history-${r.id}`}>
                  <span className="text-stone-700 dark:text-stone-300">{[r.contact?.prenom, r.contact?.nom].filter(Boolean).join(" ") || "—"}</span>
                  {" — "}{roleLabel(r.role)}{" · "}
                  <span className="italic">{r.date_debut} → {r.date_fin}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Modal création rapide — 3 champs (nom + rôle + principal) */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
             onClick={() => !saving && setShowAdd(false)}>
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-700 p-5 max-w-sm w-full space-y-3"
               onClick={ev => ev.stopPropagation()} data-testid="contact-add-modal">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-2xl">Nouveau contact</h3>
              <button onClick={() => setShowAdd(false)} className="text-stone-400 hover:text-stone-700">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-stone-500">
              3 champs suffisent. Vous complèterez depuis le terrain.
            </p>

            <div>
              <label className="text-xs text-stone-500">Prénom (facultatif)</label>
              <input type="text" value={form.prenom}
                     onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
                     className="input-crm mt-1" data-testid="contact-add-prenom" />
            </div>
            <div>
              <label className="text-xs text-stone-500">Nom *</label>
              <input type="text" value={form.nom}
                     onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                     className="input-crm mt-1" autoFocus data-testid="contact-add-nom" />
            </div>
            <div>
              <label className="text-xs text-stone-500">Rôle *</label>
              <select value={form.role}
                      onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                      className="input-crm mt-1" data-testid="contact-add-role">
                {(catalog.roles || []).map(r => (
                  <option key={r.key} value={r.key}>{r.group ? `[${r.group[0].toUpperCase()}] ` : ""}{r.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.principal}
                       onChange={e => setForm(f => ({ ...f, principal: e.target.checked }))}
                       data-testid="contact-add-principal" />
                Principal
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.peut_engager}
                       onChange={e => setForm(f => ({ ...f, peut_engager: e.target.checked }))}
                       data-testid="contact-add-engager" />
                Peut engager
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAdd(false)}
                      disabled={saving} className="btn-ghost">Annuler</button>
              <button type="button" onClick={save} disabled={saving}
                      className="btn-primary flex items-center gap-1"
                      data-testid="contact-add-save">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {showChangeManager && (
        <ChangeManagerModal
          establishmentId={establishmentId}
          onClose={() => setShowChangeManager(false)}
          onDone={() => { setShowChangeManager(false); load(); onChange && onChange(); }}
        />
      )}
    </div>
  );
}

/**
 * Parcours guidé « Changement de gérant » (Lot 9 étape 6).
 *
 * 3 étapes : saisie nouveau gérant → question sur les autres contacts →
 * confirmation avec bouclier orange.
 */
function ChangeManagerModal({ establishmentId, onClose, onDone }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ prenom: "", nom: "", mobile_pro: "", email_pro: "" });
  const [closeAll, setCloseAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.nom.trim()) { toast.error("Nom du nouveau gérant requis"); return; }
    setSaving(true);
    try {
      const { data } = await api.post(`/establishments/${establishmentId}/change-of-manager`, {
        new_manager: form,
        close_all_other_contacts: closeAll,
      });
      toast.success(
        `Changement enregistré · ${data.closed_direction_roles} rôle(s) direction clos` +
        (closeAll ? ` + ${data.closed_other_roles} autre(s)` : "")
      );
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Enregistrement impossible");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
         onClick={() => !saving && onClose()}>
      <div className="bg-white dark:bg-stone-900 rounded-2xl border p-5 max-w-md w-full space-y-4"
           onClick={ev => ev.stopPropagation()} data-testid="change-manager-modal">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-2xl flex items-center gap-2">
            <UserCog size={20} className="text-[#C78B3A]" /> Changement de gérant
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X size={18} />
          </button>
        </div>

        {step === 1 && (
          <>
            <p className="text-sm text-stone-600 dark:text-stone-300">
              L'ancien gérant sera clôturé (jamais supprimé). Renseignez le nouveau.
            </p>
            <div>
              <label className="text-xs text-stone-500">Prénom</label>
              <input value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
                     className="input-crm mt-1" data-testid="cm-prenom" />
            </div>
            <div>
              <label className="text-xs text-stone-500">Nom *</label>
              <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                     className="input-crm mt-1" autoFocus data-testid="cm-nom" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-stone-500">Portable</label>
                <input value={form.mobile_pro} onChange={e => setForm(f => ({ ...f, mobile_pro: e.target.value }))}
                       className="input-crm mt-1" data-testid="cm-mobile" />
              </div>
              <div>
                <label className="text-xs text-stone-500">Email</label>
                <input value={form.email_pro} onChange={e => setForm(f => ({ ...f, email_pro: e.target.value }))}
                       className="input-crm mt-1" data-testid="cm-email" />
              </div>
            </div>
            <button type="button" onClick={() => form.nom.trim() && setStep(2)}
                    disabled={!form.nom.trim()}
                    className="btn-primary w-full flex items-center justify-center gap-1"
                    data-testid="cm-next">
              Suivant <ArrowRight size={14} />
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm text-stone-600 dark:text-stone-300">
              Les autres interlocuteurs (acheteur, chef barman, comptable…) restent-ils en poste ?
            </p>
            <div className="space-y-2">
              <label className="flex items-start gap-2 p-3 border rounded-lg cursor-pointer">
                <input type="radio" checked={!closeAll} onChange={() => setCloseAll(false)}
                       data-testid="cm-keep-others" />
                <div>
                  <p className="font-medium text-sm">Ils restent en poste</p>
                  <p className="text-xs text-stone-500">Seul le gérant change.</p>
                </div>
              </label>
              <label className="flex items-start gap-2 p-3 border rounded-lg cursor-pointer">
                <input type="radio" checked={closeAll} onChange={() => setCloseAll(true)}
                       data-testid="cm-close-all" />
                <div>
                  <p className="font-medium text-sm">Toute l'équipe est renouvelée</p>
                  <p className="text-xs text-stone-500">Tous les rôles actifs seront clôturés à la date du jour.</p>
                </div>
              </label>
            </div>
            <div className="p-3 rounded-lg border"
                 style={{ background: "var(--ds-state-warning-soft-bg, #FFF7ED)",
                          borderColor: "var(--ds-state-warning, #C78B3A)",
                          color: "var(--ds-state-warning-soft-fg, #7C4A1A)" }}>
              <p className="text-xs">
                <strong>Rappel important :</strong> un nouveau gérant est un nouveau risque.
                L'encours et le délai de paiement seront ramenés en <strong>bouclier orange</strong>
                jusqu'à revalidation par le manager (conditions tarifaires, référencement produits,
                conditions de paiement).
              </p>
            </div>
            <div className="flex justify-between gap-2">
              <button type="button" onClick={() => setStep(1)} disabled={saving}
                      className="btn-ghost">Retour</button>
              <button type="button" onClick={submit} disabled={saving}
                      className="btn-primary flex items-center gap-1"
                      data-testid="cm-confirm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Confirmer le changement
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
