/**
 * ESLint — interdit toute valeur hexadécimale codée en dur dans les composants.
 * Seule exception : le fichier src/design-system/tokens.css (source de vérité).
 *
 * Cible :
 *   - Literal string comme "#4A154B", "#fff", "#0ca30c" dans les .js/.jsx/.ts/.tsx
 *   - JSXAttribute style={{ color: "#ffffff" }}
 *
 * Contournement autorisé : `var(--ds-*)` uniquement.
 */
module.exports = {
  root: true,
  extends: ["react-app"],
  overrides: [
    {
      files: ["src/**/*.{js,jsx,ts,tsx}"],
      excludedFiles: [
        "src/design-system/**",
        "**/node_modules/**",
      ],
      rules: {
        "no-restricted-syntax": [
          "warn",
          {
            selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
            message:
              "Couleur hex interdite hors src/design-system/tokens.css. Utilise var(--ds-…).",
          },
          {
            selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}/]",
            message:
              "Couleur hex interdite dans un template string. Utilise var(--ds-…).",
          },
        ],
      },
    },
  ],
};
