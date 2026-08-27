import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Users, Plus, Phone, Smartphone, Mail, Star, Pencil, Trash2, Loader2, X, Check,
  Briefcase,
} from "lucide-react";

/**
 * Bloc « Interlocuteurs » — enrichi avec téléphone fixe + portable
 * + fonction (libre) + email secondaire.
 *
 * Décisions produit :
 * - Rôles fermés (10 valeurs) permettent de filtrer/analyser plus tard.
 * - `job_title` en champ libre pour préciser (« Directeur des achats », etc.).
 * - Fixe et portable séparés — usage terrain : le fixe est le standard (heures
 *   ouvrées), le portable est direct (urgence, tournée).
 * - Rétro-compat : les anciens contacts avec un seul champ `phone` restent
 *   visibles sous « Téléphone » tant qu'aucun fixe/portable n'est renseigné.
 */
const ROLES = [
  { v: "gerant", label: "Gérant" },
  { v: "proprietaire", label: "Propriétaire" },
  { v: "comptable", label: "Comptable" },
  { v: "acheteur", label: "Acheteur" },
  { v: "chef_cuisine", label: "Chef de cuisine" },
  { v: "chef_cave", label: "Chef de cave" },
  { v: "sommelier", label: "Sommelier" },
  { v: "responsable_achats", label: "Responsable achats" },
  { v: "reception", label: "Réception" },
  { v: "autre", label: "Autre" },
];
const ROLE_LABELS = Object.fromEntries(ROLES.map(r => [r.v, r.label]));

const emptyForm = {
  id: null, role: "gerant", name: "", job_title: "",
  phone_landline: "", phone_mobile: "", phone: "",
  email: "", email_secondary: "",
  notes: "", is_primary: false,
};

function TelLink({ value, kind, testId }) {
  if (!value) return null;
  const clean = value.replace(/\s/g, "");
  const Icon = kind === "mobile" ? Smartphone : Phone;
  const label = kind === "mobile" ? "Portable" : (kind === "landline" ? "Fixe" : "Tél.");
  return (
    <a href={`tel:${clean}`}
       className="text-stone-600 dark:text-stone-300 hover:text-[#4A154B] flex items-center gap-1"
       data-testid={testId}
       aria-label={`${label} : ${value}`}>
      <Icon size={11} />
      <span className="text-xs uppercase tracking-wider text-stone-400 mr-0.5">{label}</span>
      {value}
    </a>
  );
}

function MailLink({ value, testId, secondary }) {
  if (!value) return null;
  return (
    <a href={`mailto:${value}`}
       className="text-stone-600 dark:text-stone-300 hover:text-[#4A154B] flex items-center gap-1 truncate max-w-[240px]"
       data-testid={testId}
       aria-label={`Email : ${value}`}>
      <Mail size={11} />
      {secondary && <span className="text-xs uppercase tracking-wider text-stone-400 mr-0.5">2e</span>}
      {value}
    </a>
  );
}

export default function ContactsPanel({ establishmentId }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/establishments/${establishmentId}/contacts`);
      setContacts(Array.isArray(data) ? data : []);
    } catch { setContacts([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (establishmentId) load(); }, [establishmentId]);

  const sorted = useMemo(() => {
    const roleOrder = ROLES.reduce((acc, r, i) => { acc[r.v] = i; return acc; }, {});
    return [...contacts].sort((a, b) => {
      if ((b.is_primary ? 1 : 0) !== (a.is_primary ? 1 : 0)) return (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0);
      const ra = roleOrder[a.role] ?? 99;
      const rb = roleOrder[b.role] ?? 99;
      if (ra !== rb) return ra - rb;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [contacts]);

  const openCreate = () => { setForm(emptyForm); setShowModal(true); };
  const openEdit = (c) => { setForm({ ...emptyForm, ...c }); setShowModal(true); };

  const save = async () => {
    const name = form.name.trim();
    if (!name) { toast.error("Nom requis"); return; }
    setSaving(true);
    try {
      const payload = {
        role: form.role,
        name,
        job_title: (form.job_title || "").trim(),
        phone_landline: (form.phone_landline || "").trim(),
        phone_mobile: (form.phone_mobile || "").trim(),
        phone: (form.phone || "").trim(),
        email: (form.email || "").trim(),
        email_secondary: (form.email_secondary || "").trim(),
        notes: (form.notes || "").trim(),
        is_primary: !!form.is_primary,
      };
      if (form.id) {
        await api.patch(`/establishments/${establishmentId}/contacts/${form.id}`, payload);
        toast.success("Interlocuteur modifié");
      } else {
        await api.post(`/establishments/${establishmentId}/contacts`, payload);
        toast.success("Interlocuteur ajouté");
      }
      setShowModal(false);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Supprimer ${c.name} ?`)) return;
    try {
      await api.delete(`/establishments/${establishmentId}/contacts/${c.id}`);
      toast.success("Interlocuteur supprimé");
      await load();
    } catch { toast.error("Suppression impossible"); }
  };

  return (
    <div data-testid="contacts-panel">
      <div className="flex items-center justify-between mb-3">
        <p className="overline flex items-center gap-1">
          <Users size={11} className="text-[#4A154B] dark:text-[#B076B4]" />
          Interlocuteurs
          {contacts.length > 0 && (
            <span className="ml-1 text-stone-400">· {contacts.length}</span>
          )}
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="text-xs text-[#4A154B] dark:text-[#B076B4] flex items-center gap-1 hover:underline"
          data-testid="contacts-add-btn"
        >
          <Plus size={12} /> Ajouter
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-stone-500 flex items-center gap-1" data-testid="contacts-loading">
          <Loader2 size={12} className="animate-spin" /> Chargement…
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-xs text-stone-500" data-testid="contacts-empty">
          Aucun interlocuteur renseigné. <button className="underline hover:text-[#4A154B]" onClick={openCreate}>Ajouter le premier</button>
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map(c => {
            // rétro-compat : afficher `phone` uniquement si pas de fixe/portable
            const showLegacyPhone = !!c.phone && !c.phone_landline && !c.phone_mobile;
            return (
              <li key={c.id} className="border border-stone-200 dark:border-stone-700 rounded-lg p-3" data-testid={`contact-${c.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="font-medium text-sm text-stone-800 dark:text-stone-100">{c.name}</span>
                      {c.is_primary && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-[#C78B3A]" title="Contact principal" data-testid={`contact-primary-${c.id}`}>
                          <Star size={10} className="fill-[#C78B3A]" /> principal
                        </span>
                      )}
                    </div>
                    <p className="text-xs uppercase tracking-wider text-stone-500 mt-0.5 flex items-center gap-1">
                      {ROLE_LABELS[c.role] || c.role}
                      {c.job_title && (
                        <>
                          <span className="text-stone-300">·</span>
                          <span className="normal-case tracking-normal text-stone-500 flex items-center gap-1">
                            <Briefcase size={9} /> {c.job_title}
                          </span>
                        </>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
                      <TelLink value={c.phone_landline} kind="landline" testId={`contact-landline-${c.id}`} />
                      <TelLink value={c.phone_mobile} kind="mobile" testId={`contact-mobile-${c.id}`} />
                      {showLegacyPhone && <TelLink value={c.phone} kind="other" testId={`contact-phone-${c.id}`} />}
                      <MailLink value={c.email} testId={`contact-email-${c.id}`} />
                      <MailLink value={c.email_secondary} testId={`contact-email2-${c.id}`} secondary />
                    </div>
                    {c.notes && (
                      <p className="text-xs text-stone-500 mt-1.5 italic whitespace-pre-wrap">{c.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => openEdit(c)}
                            className="p-1.5 text-stone-400 hover:text-[#4A154B] rounded"
                            aria-label={`Modifier ${c.name}`}
                            data-testid={`contact-edit-${c.id}`}>
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={() => remove(c)}
                            className="p-1.5 text-stone-400 hover:text-[#8C2A2A] rounded"
                            aria-label={`Supprimer ${c.name}`}
                            data-testid={`contact-delete-${c.id}`}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
             onClick={() => !saving && setShowModal(false)}>
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-700 p-5 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-3"
               onClick={ev => ev.stopPropagation()}
               data-testid="contact-modal">
            <div className="flex items-center justify-between sticky top-0 bg-white dark:bg-stone-900 pb-2 -mx-5 px-5 border-b border-stone-100 dark:border-stone-800">
              <h3 className="font-display text-2xl">
                {form.id ? "Modifier l'interlocuteur" : "Nouvel interlocuteur"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-stone-400 hover:text-stone-700"
                      aria-label="Fermer">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-stone-500">Rôle *</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="input-crm mt-1"
                  data-testid="contact-role-select"
                >
                  {ROLES.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-stone-500">Fonction (libre)</label>
                <input
                  type="text"
                  value={form.job_title}
                  onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))}
                  className="input-crm mt-1"
                  placeholder="Ex. Directeur des achats"
                  data-testid="contact-jobtitle-input"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-stone-500">Nom *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="input-crm mt-1"
                placeholder="Prénom Nom"
                data-testid="contact-name-input"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-stone-500 flex items-center gap-1"><Phone size={10} /> Téléphone fixe</label>
                <input
                  type="tel"
                  value={form.phone_landline}
                  onChange={e => setForm(f => ({ ...f, phone_landline: e.target.value }))}
                  className="input-crm mt-1"
                  placeholder="05 59 12 34 56"
                  data-testid="contact-phone-landline-input"
                />
              </div>
              <div>
                <label className="text-xs text-stone-500 flex items-center gap-1"><Smartphone size={10} /> Téléphone portable</label>
                <input
                  type="tel"
                  value={form.phone_mobile}
                  onChange={e => setForm(f => ({ ...f, phone_mobile: e.target.value }))}
                  className="input-crm mt-1"
                  placeholder="06 12 34 56 78"
                  data-testid="contact-phone-mobile-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="text-xs text-stone-500">Email principal</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="input-crm mt-1"
                  placeholder="nom@societe.fr"
                  data-testid="contact-email-input"
                />
              </div>
              <div>
                <label className="text-xs text-stone-500">Email secondaire (compta, dpt…)</label>
                <input
                  type="email"
                  value={form.email_secondary}
                  onChange={e => setForm(f => ({ ...f, email_secondary: e.target.value }))}
                  className="input-crm mt-1"
                  placeholder="compta@societe.fr"
                  data-testid="contact-email-secondary-input"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-stone-500">Notes internes</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="input-crm mt-1"
                placeholder="Ex. disponible en semaine uniquement…"
                data-testid="contact-notes-input"
              />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!form.is_primary}
                onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))}
                data-testid="contact-primary-checkbox"
              />
              <span>Contact principal</span>
              <span className="text-xs text-stone-400">
                (les autres seront démotés)
              </span>
            </label>

            <div className="flex gap-2 justify-end pt-2 sticky bottom-0 bg-white dark:bg-stone-900 -mx-5 px-5 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={saving}
                className="btn-ghost"
                data-testid="contact-cancel-btn"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="btn-primary flex items-center gap-1"
                data-testid="contact-save-btn"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {form.id ? "Enregistrer" : "Ajouter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
