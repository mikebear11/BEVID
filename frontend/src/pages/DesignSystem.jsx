import React, { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from "recharts";
import { useTheme } from "@/contexts/ThemeContext";
import PuceEtat from "@/components/system/PuceEtat";

/**
 * Page de démonstration du système de design BEVID.
 * Un seul écran, sept sections, aucun hex codé en dur ici — tout via var(--ds-…).
 */

// ---------- Sous-composants système (locaux à la démo) ----------------------

function Section({ titre, description, children }) {
  return (
    <section style={{ marginBottom: "var(--ds-space-8)" }}>
      <header style={{ marginBottom: "var(--ds-space-4)" }}>
        <h2 style={{
          fontFamily: "var(--ds-font-sans)",
          fontSize: "var(--ds-font-size-xl)",
          fontWeight: 700,
          color: "var(--ds-text-primary)",
          margin: 0,
        }}>{titre}</h2>
        {description && (
          <p style={{
            fontFamily: "var(--ds-font-sans)",
            fontSize: "var(--ds-font-size-sm)",
            color: "var(--ds-text-secondary)",
            margin: "4px 0 0",
          }}>{description}</p>
        )}
      </header>
      <div style={{
        background: "var(--ds-bg-surface)",
        border: "1px solid var(--ds-border)",
        borderRadius: "var(--ds-radius-lg)",
        padding: "var(--ds-space-6)",
      }}>{children}</div>
    </section>
  );
}

function Swatch({ label, cssVar, note }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 0", borderBottom: "1px solid var(--ds-border)" }}>
      <div style={{
        width: 44, height: 44,
        borderRadius: "var(--ds-radius-md)",
        background: `var(${cssVar})`,
        border: "1px solid var(--ds-border-strong)",
        flexShrink: 0,
      }} aria-hidden="true" />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "var(--ds-font-size-sm)", fontWeight: 600, color: "var(--ds-text-primary)" }}>{label}</div>
        <code className="ds-tabular" style={{ fontSize: "var(--ds-font-size-xs)", color: "var(--ds-text-muted)", fontFamily: "var(--ds-font-mono)" }}>{cssVar}</code>
        {note && <div style={{ fontSize: "var(--ds-font-size-xs)", color: "var(--ds-text-muted)", marginTop: 2 }}>{note}</div>}
      </div>
    </div>
  );
}

function BoutonPlein({ children, onClick, disabled, testId }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="ds-focus ds-tap"
      style={{
        fontFamily: "var(--ds-font-sans)",
        fontSize: "var(--ds-font-size-sm)",
        fontWeight: 600,
        color: "var(--ds-accent-fg)",
        background: hover && !disabled ? "var(--ds-accent-hover)" : "var(--ds-accent)",
        border: "none",
        borderRadius: "var(--ds-radius-md)",
        padding: "10px 18px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background-color 0.2s ease",
      }}
    >{children}</button>
  );
}

function BoutonGhost({ children, onClick, testId }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="ds-focus ds-tap"
      style={{
        fontFamily: "var(--ds-font-sans)",
        fontSize: "var(--ds-font-size-sm)",
        fontWeight: 500,
        color: "var(--ds-text-primary)",
        background: "transparent",
        border: "1px solid var(--ds-border-strong)",
        borderRadius: "var(--ds-radius-md)",
        padding: "10px 18px",
        cursor: "pointer",
      }}
    >{children}</button>
  );
}

function BoutonLien({ children, onClick, testId }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="ds-focus"
      style={{
        fontFamily: "var(--ds-font-sans)",
        fontSize: "var(--ds-font-size-sm)",
        fontWeight: 500,
        color: "var(--ds-accent)",
        background: "transparent",
        border: "none",
        padding: "10px 4px",
        cursor: "pointer",
        textDecoration: "underline",
      }}
    >{children}</button>
  );
}

function Tuile({ libelle, valeur, unite }) {
  return (
    <div style={{
      background: "var(--ds-bg-surface-alt)",
      border: "1px solid var(--ds-border)",
      borderRadius: "var(--ds-radius-md)",
      padding: "var(--ds-space-4)",
    }}>
      <div style={{
        fontSize: "var(--ds-font-size-xs)",
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--ds-text-muted)",
        marginBottom: 6,
      }}>{libelle}</div>
      <div className="ds-tabular" style={{
        fontSize: "var(--ds-font-size-2xl)",
        fontWeight: 700,
        color: "var(--ds-text-primary)",
        lineHeight: 1.1,
      }}>
        {valeur}
        {unite && <span style={{ fontSize: "var(--ds-font-size-lg)", color: "var(--ds-text-muted)", marginLeft: 4 }}>{unite}</span>}
      </div>
    </div>
  );
}

// ---------- Étiquette forcée sur la série verte en clair --------------------
function LabelSerie3({ x, y, width, value }) {
  // Rendue au-dessus de la barre, en encre neutre sur fond opposé (var --ds-chart-3-label-*)
  return (
    <g>
      <rect x={x + width / 2 - 22} y={y - 22} width={44} height={16} rx={3}
            fill="var(--ds-chart-3-label-bg)" stroke="var(--ds-chart-3)" strokeWidth={1} />
      <text x={x + width / 2} y={y - 10} fontSize="10" fontWeight="600" textAnchor="middle"
            fill="var(--ds-chart-3-label-fg)" fontFamily="var(--ds-font-sans)">
        {value}
      </text>
    </g>
  );
}

// ============================================================================

export default function DesignSystem() {
  const { theme, resolved, setTheme } = useTheme();
  const activeTheme = theme; // "light" | "dark" | "sun" | "system"

  const chartData = [
    { mois: "Jan", bleu: 240, orange: 180, vert: 120, violet: 90 },
    { mois: "Fév", bleu: 300, orange: 220, vert: 140, violet: 110 },
    { mois: "Mar", bleu: 280, orange: 260, vert: 180, violet: 130 },
    { mois: "Avr", bleu: 320, orange: 240, vert: 200, violet: 150 },
    { mois: "Mai", bleu: 380, orange: 280, vert: 230, violet: 170 },
    { mois: "Jun", bleu: 410, orange: 300, vert: 260, violet: 190 },
  ];

  const rows = [
    { client: "Bar Le Central",     ca: 12480.5, commandes: 42, statut: "succes",     mot: "À jour" },
    { client: "Restaurant du Port", ca:  8320.0, commandes: 28, statut: "vigilance",  mot: "Retard 21 j" },
    { client: "Caviste Pyrénées",   ca: 15900.9, commandes: 51, statut: "info",       mot: "En route" },
    { client: "Hôtel des Pins",     ca:  2140.2, commandes:  9, statut: "bloque",     mot: "Compte bloqué" },
  ];

  const themeOptions = [
    { key: "light",  label: "Clair" },
    { key: "dark",   label: "Sombre" },
    { key: "sun",    label: "Soleil" },
    { key: "system", label: "Système" },
  ];

  return (
    <div
      className="ds-font-sans"
      style={{
        background: "var(--ds-bg-app)",
        color: "var(--ds-text-primary)",
        minHeight: "100vh",
        margin: "calc(var(--ds-space-8) * -1)",
        padding: "var(--ds-space-8)",
      }}
      data-testid="design-system-page"
    >
      {/* En-tête + bascule 3 thèmes */}
      <header style={{ marginBottom: "var(--ds-space-8)" }}>
        <div style={{
          fontSize: "var(--ds-font-size-xs)", textTransform: "uppercase",
          letterSpacing: "0.15em", color: "var(--ds-text-muted)", marginBottom: 4,
        }}>Système de design · BEVID</div>
        <h1 style={{ fontSize: "var(--ds-font-size-3xl)", fontWeight: 800, margin: 0, color: "var(--ds-text-primary)" }}>
          Jetons, composants et règles.
        </h1>
        <p style={{ fontSize: "var(--ds-font-size-base)", color: "var(--ds-text-secondary)", margin: "8px 0 24px" }}>
          Page de validation. Un seul accent, un seul bouton plein, quatre couleurs d'état réservées, quatre couleurs de série imposées.
        </p>

        <div role="tablist" aria-label="Bascule de thème" style={{
          display: "inline-flex", background: "var(--ds-bg-surface-alt)",
          border: "1px solid var(--ds-border)", borderRadius: "var(--ds-radius-md)", padding: 4,
        }}>
          {themeOptions.map(o => {
            const actif = activeTheme === o.key;
            return (
              <button
                key={o.key}
                role="tab"
                aria-selected={actif}
                onClick={() => setTheme(o.key)}
                data-testid={`theme-btn-${o.key}`}
                className="ds-focus"
                style={{
                  fontFamily: "var(--ds-font-sans)",
                  fontSize: "var(--ds-font-size-sm)",
                  fontWeight: 600,
                  padding: "8px 14px",
                  minHeight: 40,
                  borderRadius: "var(--ds-radius-sm)",
                  border: "none",
                  cursor: "pointer",
                  color: actif ? "var(--ds-accent-fg)" : "var(--ds-text-secondary)",
                  background: actif ? "var(--ds-accent)" : "transparent",
                }}
              >{o.label}</button>
            );
          })}
        </div>
        <div style={{ fontSize: "var(--ds-font-size-xs)", color: "var(--ds-text-muted)", marginTop: 6 }}>
          Thème effectif : <strong>{resolved}</strong>
        </div>
      </header>

      {/* 1. Jetons */}
      <Section titre="1 · Jetons de couleur" description="Rôles seulement. Aucun hex n'apparaît hors tokens.css.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "var(--ds-space-4)" }}>
          <div>
            <h3 style={{ fontSize: "var(--ds-font-size-sm)", fontWeight: 700, color: "var(--ds-text-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>Surfaces</h3>
            <Swatch label="Fond application"  cssVar="--ds-bg-app" />
            <Swatch label="Surface"           cssVar="--ds-bg-surface" />
            <Swatch label="Surface alt"       cssVar="--ds-bg-surface-alt" />
            <Swatch label="Élevé"             cssVar="--ds-bg-elevated" />
          </div>
          <div>
            <h3 style={{ fontSize: "var(--ds-font-size-sm)", fontWeight: 700, color: "var(--ds-text-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>Accent unique</h3>
            <Swatch label="Accent"            cssVar="--ds-accent"       note="Seule couleur du cliquable." />
            <Swatch label="Accent survol"     cssVar="--ds-accent-hover" />
            <Swatch label="Focus"             cssVar="--ds-focus-ring" />
          </div>
          <div>
            <h3 style={{ fontSize: "var(--ds-font-size-sm)", fontWeight: 700, color: "var(--ds-text-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>États (réservés)</h3>
            <Swatch label="Succès"        cssVar="--ds-state-success" note="Jamais utilisé pour un graphique." />
            <Swatch label="Info"          cssVar="--ds-state-info" />
            <Swatch label="Avertissement" cssVar="--ds-state-warning" />
            <Swatch label="Danger"        cssVar="--ds-state-danger" />
          </div>
          <div>
            <h3 style={{ fontSize: "var(--ds-font-size-sm)", fontWeight: 700, color: "var(--ds-text-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>Séries graphique (imposées)</h3>
            <Swatch label="1 · Bleu"      cssVar="--ds-chart-1" note="Ordre imposé, jamais utilisé pour un état." />
            <Swatch label="2 · Orange"    cssVar="--ds-chart-2" />
            <Swatch label="3 · Vert d'eau" cssVar="--ds-chart-3" />
            <Swatch label="4 · Violet"    cssVar="--ds-chart-4" />
          </div>
        </div>
      </Section>

      {/* 2. Boutons */}
      <Section titre="2 · Boutons" description="Un seul plein par écran. Le reste : ghost ou lien.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ds-space-4)", alignItems: "center" }}>
          <BoutonPlein testId="btn-plein-1">Action principale</BoutonPlein>
          <BoutonGhost testId="btn-ghost-1">Action secondaire</BoutonGhost>
          <BoutonGhost testId="btn-ghost-2">Autre action</BoutonGhost>
          <BoutonLien  testId="btn-lien-1">Action tertiaire</BoutonLien>
          <BoutonPlein testId="btn-plein-disabled" disabled>Désactivé</BoutonPlein>
        </div>
        <p style={{ fontSize: "var(--ds-font-size-xs)", color: "var(--ds-text-muted)", marginTop: 12 }}>
          Focus visible au clavier (Tab). Cible tactile ≥ 48 px sur mobile via <code>.ds-tap</code>.
        </p>
      </Section>

      {/* 3. Puces d'état */}
      <Section titre="3 · Puces d'état" description="Composant unique PuceEtat. Icône + mot, jamais la couleur seule.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--ds-space-4)" }}>
          <div>
            <div style={{ fontSize: "var(--ds-font-size-xs)", color: "var(--ds-text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Variante douce</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
              <PuceEtat etat="succes"    variante="douce" libelle="À jour" />
              <PuceEtat etat="info"      variante="douce" libelle="En route" />
              <PuceEtat etat="vigilance" variante="douce" libelle="Retard 30 j" />
              <PuceEtat etat="bloque"    variante="douce" libelle="Compte bloqué" />
            </div>
          </div>
          <div>
            <div style={{ fontSize: "var(--ds-font-size-xs)", color: "var(--ds-text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Variante pleine</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
              <PuceEtat etat="succes"    variante="pleine" libelle="Payé" />
              <PuceEtat etat="info"      variante="pleine" libelle="Notification" />
              <PuceEtat etat="vigilance" variante="pleine" libelle="Encours 60 %" />
              <PuceEtat etat="bloque"    variante="pleine" libelle="Liquidation" />
            </div>
            <div style={{ fontSize: "var(--ds-font-size-xs)", color: "var(--ds-text-muted)", marginTop: 12 }}>
              Texte noir sur vert et ambre pleins, blanc sur rouge plein.
            </div>
          </div>
        </div>
      </Section>

      {/* 4. Tuiles */}
      <Section titre="4 · Tuiles d'indicateurs" description="Chiffres tabulaires pour un alignement parfait.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "var(--ds-space-4)" }}>
          <Tuile libelle="Chiffre d'affaires"  valeur="128 490,50" unite="€" />
          <Tuile libelle="Commandes du mois"   valeur="342" />
          <Tuile libelle="Marge brute"         valeur="27,4" unite="%" />
          <Tuile libelle="Encours moyen"       valeur="4 285,90" unite="€" />
        </div>
      </Section>

      {/* 5. Tableau */}
      <Section titre="5 · Tableau" description="Colonnes numériques en chiffres tabulaires, statut par puce.">
        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontFamily: "var(--ds-font-sans)",
            fontSize: "var(--ds-font-size-sm)",
          }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ds-text-secondary)", borderBottom: "2px solid var(--ds-border-strong)" }}>
                <th style={{ padding: "10px 8px", fontWeight: 700 }}>Client</th>
                <th style={{ padding: "10px 8px", fontWeight: 700, textAlign: "right" }}>CA (€)</th>
                <th style={{ padding: "10px 8px", fontWeight: 700, textAlign: "right" }}>Commandes</th>
                <th style={{ padding: "10px 8px", fontWeight: 700 }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.client} style={{ borderBottom: "1px solid var(--ds-border)", color: "var(--ds-text-primary)" }}>
                  <td style={{ padding: "10px 8px" }}>{r.client}</td>
                  <td className="ds-tabular" style={{ padding: "10px 8px", textAlign: "right" }}>{r.ca.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="ds-tabular" style={{ padding: "10px 8px", textAlign: "right" }}>{r.commandes}</td>
                  <td style={{ padding: "10px 8px" }}><PuceEtat etat={r.statut} variante="douce" libelle={r.mot} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 6. Formulaire */}
      <Section titre="6 · Formulaire" description="Anneau de focus visible sur chaque champ.">
        <form onSubmit={(e) => e.preventDefault()} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "var(--ds-space-4)" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: "var(--ds-font-size-xs)", fontWeight: 600, color: "var(--ds-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Nom du client</span>
            <input
              type="text" defaultValue="Bar Le Central" data-testid="ds-input-nom"
              className="ds-focus ds-tap"
              style={{
                fontFamily: "var(--ds-font-sans)",
                fontSize: "var(--ds-font-size-sm)",
                padding: "10px 12px",
                borderRadius: "var(--ds-radius-md)",
                border: "1px solid var(--ds-border-strong)",
                background: "var(--ds-bg-surface)",
                color: "var(--ds-text-primary)",
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: "var(--ds-font-size-xs)", fontWeight: 600, color: "var(--ds-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Type</span>
            <select
              defaultValue="bar" data-testid="ds-select-type"
              className="ds-focus ds-tap"
              style={{
                fontFamily: "var(--ds-font-sans)",
                fontSize: "var(--ds-font-size-sm)",
                padding: "10px 12px",
                borderRadius: "var(--ds-radius-md)",
                border: "1px solid var(--ds-border-strong)",
                background: "var(--ds-bg-surface)",
                color: "var(--ds-text-primary)",
              }}
            >
              <option value="bar">Bar</option>
              <option value="restaurant">Restaurant</option>
              <option value="caviste">Caviste</option>
              <option value="hotel">Hôtel</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
            <span style={{ fontSize: "var(--ds-font-size-xs)", fontWeight: 600, color: "var(--ds-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Notes</span>
            <textarea
              rows={3} data-testid="ds-textarea"
              defaultValue="Client attentif, préfère les livraisons du matin."
              className="ds-focus"
              style={{
                fontFamily: "var(--ds-font-sans)",
                fontSize: "var(--ds-font-size-sm)",
                padding: "10px 12px",
                borderRadius: "var(--ds-radius-md)",
                border: "1px solid var(--ds-border-strong)",
                background: "var(--ds-bg-surface)",
                color: "var(--ds-text-primary)",
                resize: "vertical",
              }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" defaultChecked data-testid="ds-check" className="ds-focus" style={{ width: 18, height: 18, accentColor: "var(--ds-accent)" }} />
            <span style={{ fontSize: "var(--ds-font-size-sm)", color: "var(--ds-text-primary)" }}>Contact prioritaire</span>
          </label>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="radio" name="paiement" defaultChecked className="ds-focus" style={{ width: 18, height: 18, accentColor: "var(--ds-accent)" }} />
              <span style={{ fontSize: "var(--ds-font-size-sm)", color: "var(--ds-text-primary)" }}>30 j</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="radio" name="paiement" className="ds-focus" style={{ width: 18, height: 18, accentColor: "var(--ds-accent)" }} />
              <span style={{ fontSize: "var(--ds-font-size-sm)", color: "var(--ds-text-primary)" }}>60 j</span>
            </label>
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <BoutonGhost testId="btn-ghost-form">Annuler</BoutonGhost>
            <BoutonPlein testId="btn-plein-form">Enregistrer</BoutonPlein>
          </div>
        </form>
      </Section>

      {/* 7. Graphique barres */}
      <Section
        titre="7 · Graphique à barres"
        description="4 séries dans l'ordre imposé — bleu, orange, vert d'eau, violet. Encre neutre, aucun dégradé, aucun double axe. Étiquette forcée sur la série verte en mode clair."
      >
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 32, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="var(--ds-chart-grid)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="mois" stroke="var(--ds-chart-axis)" tick={{ fill: "var(--ds-chart-ink)", fontSize: 12, fontFamily: "var(--ds-font-sans)" }} tickLine={false} axisLine={{ stroke: "var(--ds-chart-axis)" }} />
              <YAxis stroke="var(--ds-chart-axis)" tick={{ fill: "var(--ds-chart-ink)", fontSize: 12, fontFamily: "var(--ds-font-sans)" }} tickLine={false} axisLine={{ stroke: "var(--ds-chart-axis)" }} />
              <Tooltip
                contentStyle={{
                  background: "var(--ds-bg-elevated)",
                  border: "1px solid var(--ds-border-strong)",
                  borderRadius: "var(--ds-radius-md)",
                  color: "var(--ds-text-primary)",
                  fontFamily: "var(--ds-font-sans)",
                  fontSize: "var(--ds-font-size-sm)",
                }}
                cursor={{ fill: "var(--ds-bg-surface-alt)" }}
              />
              <Legend wrapperStyle={{ color: "var(--ds-chart-ink)", fontFamily: "var(--ds-font-sans)", fontSize: 12 }} />
              <Bar dataKey="bleu"   name="Bleu"       fill="var(--ds-chart-1)" isAnimationActive={false} />
              <Bar dataKey="orange" name="Orange"     fill="var(--ds-chart-2)" isAnimationActive={false} />
              <Bar dataKey="vert"   name="Vert d'eau" fill="var(--ds-chart-3)" isAnimationActive={false}>
                {/* Étiquette obligatoire sur la série verte en clair (LabelList masquée si non pertinent = auto en sombre) */}
                <LabelList dataKey="vert" position="top" fill="var(--ds-chart-3-label-fg)" fontSize={10} fontFamily="var(--ds-font-sans)" fontWeight={600} />
              </Bar>
              <Bar dataKey="violet" name="Violet"     fill="var(--ds-chart-4)" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <footer style={{
        fontSize: "var(--ds-font-size-xs)",
        color: "var(--ds-text-muted)",
        borderTop: "1px solid var(--ds-border)",
        paddingTop: "var(--ds-space-4)",
        marginTop: "var(--ds-space-8)",
      }}>
        Toute valeur hexadécimale de l'application doit vivre dans <code style={{ fontFamily: "var(--ds-font-mono)" }}>src/design-system/tokens.css</code>. Les composants consomment les jetons par leur rôle, jamais leur valeur.
      </footer>
    </div>
  );
}
