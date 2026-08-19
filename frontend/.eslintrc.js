/**
 * ESLint — interdit toute valeur hexadécimale codée en dur hors design-system.
 * Config minimale : parser par défaut (espree) + ecmaFeatures.jsx, sans dépendance
 * externe pour rester chargeable en dev comme en build.
 */
module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
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
