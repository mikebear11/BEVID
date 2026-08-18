import React from "react";
import { CheckCircle2, Info, AlertTriangle, XCircle } from "lucide-react";

/**
 * PuceEtat — Composant UNIQUE pour tout signalement d'état.
 * Règles :
 *  - Aucun état n'est signalé par la couleur seule → icône ET mot toujours présents.
 *  - Deux variantes : "douce" (fond teinté + texte sombre) et "pleine" (fond saturé).
 *  - Contrastes imposés variante pleine : noir sur vert/ambre, blanc sur rouge.
 *  - Les 4 couleurs d'état sont réservées, jamais utilisées ailleurs.
 *
 * Props :
 *  - etat   : "succes" | "info" | "avertissement" | "danger"
 *  - variante : "douce" (défaut) | "pleine"
 *  - libelle  : mot(s) obligatoires (jamais vide, jamais purement décoratif)
 *  - icone    : optionnel, sinon l'icône par défaut de l'état est utilisée
 */
const CONFIG = {
  succes: {
    Icon: CheckCircle2,
    mot: "À jour",
    soft:  { bg: "var(--ds-state-success-soft-bg)",  fg: "var(--ds-state-success-soft-fg)",  bd: "var(--ds-state-success)" },
    solid: { bg: "var(--ds-state-success-solid-bg)", fg: "var(--ds-state-success-solid-fg)", bd: "var(--ds-state-success)" },
  },
  info: {
    Icon: Info,
    mot: "Info",
    soft:  { bg: "var(--ds-state-info-soft-bg)",     fg: "var(--ds-state-info-soft-fg)",     bd: "var(--ds-state-info)" },
    solid: { bg: "var(--ds-state-info-solid-bg)",    fg: "var(--ds-state-info-solid-fg)",    bd: "var(--ds-state-info)" },
  },
  vigilance: {
    Icon: AlertTriangle,
    mot: "Vigilance",
    soft:  { bg: "var(--ds-state-warning-soft-bg)",  fg: "var(--ds-state-warning-soft-fg)",  bd: "var(--ds-state-warning)" },
    solid: { bg: "var(--ds-state-warning-solid-bg)", fg: "var(--ds-state-warning-solid-fg)", bd: "var(--ds-state-warning)" },
  },
  bloque: {
    Icon: XCircle,
    mot: "Bloqué",
    soft:  { bg: "var(--ds-state-danger-soft-bg)",   fg: "var(--ds-state-danger-soft-fg)",   bd: "var(--ds-state-danger)" },
    solid: { bg: "var(--ds-state-danger-solid-bg)",  fg: "var(--ds-state-danger-solid-fg)",  bd: "var(--ds-state-danger)" },
  },
};

// Alias historiques pour éviter la casse pendant la migration progressive
CONFIG.avertissement = CONFIG.vigilance;
CONFIG.danger = CONFIG.bloque;

export default function PuceEtat({ etat = "info", variante = "douce", libelle, icone: IconeOverride, testId }) {
  const cfg = CONFIG[etat] || CONFIG.info;
  const palette = variante === "pleine" ? cfg.solid : cfg.soft;
  const Icone = IconeOverride || cfg.Icon;
  const texte = libelle ?? cfg.mot;

  return (
    <span
      data-testid={testId || `puce-etat-${etat}-${variante}`}
      role="status"
      aria-label={`${etat} : ${texte}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "3px 10px",
        borderRadius: "var(--ds-radius-pill)",
        fontFamily: "var(--ds-font-sans)",
        fontSize: "var(--ds-font-size-xs)",
        fontWeight: 600,
        letterSpacing: "0.02em",
        lineHeight: 1.4,
        background: palette.bg,
        color: palette.fg,
        border: variante === "douce" ? `1px solid ${palette.bd}` : "none",
      }}
    >
      <Icone size={14} strokeWidth={2.25} aria-hidden="true" />
      <span>{texte}</span>
    </span>
  );
}
