import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  ShoppingCart, Crown, Wallet, PenLine, Phone, Smartphone, Mail, Plus, AlertCircle,
} from "lucide-react";
import AvailabilityBadge from "@/components/AvailabilityBadge";

/**
 * Bloc « Les 4 questions » (Lot 9 étape 2).
 *
 * Ergonomie : le commercial ouvre la fiche, il voit immédiatement les 4
 * réponses. Un trou visible se comble ; un trou invisible reste. Donc on
 * affiche TOUJOURS les 4 lignes — vides en creux « À renseigner ».
 *
 * On garde les lignes très denses (mobile-first). Une seule action rapide
 * primaire par contact : tap sur le téléphone → appel ; tap sur l'email → mail.
 */
const QUESTIONS = [
  { key: "qui_commande", label: "Qui commande ?", icon: ShoppingCart,
    hint: "acheteur, resp. salle, chef barman…" },
  { key: "qui_decide",   label: "Qui décide du référencement ?", icon: Crown,
    hint: "gérant, directeur, propriétaire…" },
  { key: "qui_paie",     label: "Qui paie ?", icon: Wallet,
    hint: "comptable, cabinet, contact facturation…" },
  { key: "qui_signe",    label: "Qui peut signer ?", icon: PenLine,
    hint: "gérant ou porteur d'une délégation" },
];

// Micro-animation d'entrée (spec finish 23/02) : fade + slide 8px, staggered
// 60ms par ligne. CSS pur, aucune dépendance ajoutée. `prefers-reduced-motion`
// respecté via la media query en bas du fichier — les utilisateurs sensibles
// gardent un rendu instantané, statique.
//
// Halo pulse sur « Qui peut signer ? » quand `peut_engager=True` : signale
// visuellement le contact autorisé à engager l'entreprise (spec finish 23/02).
const FQ_ANIM_STYLES = `
@keyframes fqSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fqPulseHalo {
  0%, 100% { box-shadow: 0 0 0 0 rgba(45, 90, 76, 0.25); }
  50%      { box-shadow: 0 0 0 6px rgba(45, 90, 76, 0.06); }
}
.fq-line {
  animation: fqSlideIn 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.fq-can-engage {
  border-radius: 6px;
  animation:
    fqSlideIn 320ms cubic-bezier(0.22, 1, 0.36, 1) both,
    fqPulseHalo 2.4s ease-in-out 1s infinite;
}
@media (prefers-reduced-motion: reduce) {
  .fq-line, .fq-can-engage { animation: none; }
}
`;

function Initials({ prenom, nom }) {
  const p = (prenom || "").trim();
  const n = (nom || "").trim();
  const initials = ((p[0] || "") + (n[0] || "")).toUpperCase() || "?";
  // Couleur déterministe basée sur les initiales
  const hue = ((initials.charCodeAt(0) || 65) * 7 + (initials.charCodeAt(1) || 65) * 13) % 360;
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
      style={{ background: `hsl(${hue}, 45%, 42%)` }}
      aria-hidden
    >{initials}</div>
  );
}

function Line({ q, contact, onAssign, index = 0, establishment }) {
  const Icon = q.icon;
  // Stagger 60ms : chaque ligne démarre 60ms après la précédente.
  const style = { animationDelay: `${index * 60}ms` };
  if (!contact) {
    return (
      <button
        type="button"
        onClick={() => onAssign(q.key)}
        className="fq-line flex items-center gap-3 w-full text-left py-2 border-l-2 border-dashed border-stone-300 dark:border-stone-600 pl-2 hover:border-[#4A154B] transition-colors"
        style={style}
        data-testid={`fq-slot-empty-${q.key}`}
      >
        <div className="w-9 h-9 rounded-full border-2 border-dashed border-stone-300 dark:border-stone-600 flex items-center justify-center text-stone-400 shrink-0">
          <Icon size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-stone-500">{q.label}</p>
          <p className="text-sm text-stone-400 italic">À renseigner · <span className="underline text-[#4A154B] dark:text-[#B076B4]">{q.hint}</span></p>
        </div>
        <Plus size={14} className="text-stone-400" />
      </button>
    );
  }
  return (
    <div
      className={`fq-line ${q.key === "qui_signe" && contact.peut_engager ? "fq-can-engage" : ""} flex items-start gap-3 py-2 border-l-2 border-[#4A154B]/40 pl-2`}
      style={style}
      data-testid={`fq-slot-${q.key}`}
    >
      <Initials prenom={contact.prenom} nom={contact.nom} />
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-wider text-stone-500 flex items-center gap-1">
          <Icon size={11} /> {q.label}
        </p>
        <p className="text-sm text-stone-800 dark:text-stone-100 truncate">
          {[contact.prenom, contact.nom].filter(Boolean).join(" ")}
          <span className="ml-1 text-xs text-stone-500">· {contact.role_label}</span>
        </p>
        <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1 items-center">
          <AvailabilityBadge contact={contact} establishment={establishment} size="xs" />
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs">
          {contact.mobile_pro && (
            <a href={`tel:${contact.mobile_pro.replace(/\s/g,"")}`}
               className="text-stone-600 dark:text-stone-300 hover:text-[#4A154B] flex items-center gap-1"
               data-testid={`fq-mobile-${q.key}`}>
              <Smartphone size={10} /> {contact.mobile_pro}
            </a>
          )}
          {contact.telephone_pro && !contact.mobile_pro && (
            <a href={`tel:${contact.telephone_pro.replace(/\s/g,"")}`}
               className="text-stone-600 dark:text-stone-300 hover:text-[#4A154B] flex items-center gap-1">
              <Phone size={10} /> {contact.telephone_pro}
            </a>
          )}
          {contact.email_pro && (
            <a href={`mailto:${contact.email_pro}`}
               className="text-stone-600 dark:text-stone-300 hover:text-[#4A154B] flex items-center gap-1 truncate max-w-[220px]"
               data-testid={`fq-email-${q.key}`}>
              <Mail size={10} /> {contact.email_pro}
            </a>
          )}
        </div>
      </div>
      {q.key === "qui_signe" && contact.peut_engager && (
        <span className="text-xs font-medium text-[#2D5A4C] px-1.5 py-0.5 rounded bg-[#2D5A4C]/10 shrink-0"
              data-testid="fq-engager-badge">
          Peut engager
        </span>
      )}
    </div>
  );
}

export default function FourQuestions({ establishmentId, onAddContact, refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [establishment, setEstablishment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toRequalify, setToRequalify] = useState(null);

  useEffect(() => {
    if (!establishmentId) return;
    setLoading(true);
    Promise.all([
      api.get(`/establishments/${establishmentId}/four-questions`).then(r => r.data).catch(() => null),
      api.get(`/establishments/${establishmentId}`).then(r => r.data).catch(() => null),
    ]).then(([fq, est]) => {
      setData(fq);
      setEstablishment(est || null);
      setToRequalify(est?.to_requalify ? {
        reason: est?.to_requalify_reason,
        since: est?.to_requalify_since,
      } : null);
    }).finally(() => setLoading(false));
  }, [establishmentId, refreshKey]);

  return (
    <div className="card-crm p-4" data-testid="four-questions-block">
      <style>{FQ_ANIM_STYLES}</style>
      {toRequalify && (
        <div
          className="mb-3 p-2 rounded-lg text-xs flex items-start gap-2"
          style={{
            background: "var(--ds-state-warning-soft-bg, #FFF7ED)",
            borderLeft: "3px solid var(--ds-state-warning, #C78B3A)",
            color: "var(--ds-state-warning-soft-fg, #7C4A1A)",
          }}
          data-testid="requalify-banner"
        >
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <div>
            <strong>Établissement à requalifier</strong>
            {toRequalify.reason === "change_of_manager" && (
              <> — nouveau gérant. Revalidez conditions tarifaires,
                 référencement produits et <strong>conditions de paiement</strong>.</>
            )}
          </div>
        </div>
      )}

      <p className="overline mb-2">Les 4 questions</p>
      {loading ? (
        <div className="text-xs text-stone-500 py-2" data-testid="fq-loading">Chargement…</div>
      ) : (
        <div className="space-y-1">
          {QUESTIONS.map((q, i) => (
            <Line
              key={q.key}
              q={q}
              contact={data?.[q.key] || null}
              onAssign={onAddContact}
              index={i}
              establishment={establishment}
            />
          ))}
        </div>
      )}
    </div>
  );
}
