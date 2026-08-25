import js from "@eslint/js";
import eslintReact from "@eslint-react/eslint-plugin";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: [
      "assets/shared/redux/generated-api.ts",
      "public/**",
      "vendor/**",
      "node_modules/**",
    ],
  },
  js.configs.recommended,
  eslintReact.configs["recommended"],
  prettier,
  {
    files: ["assets/**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Modern-idiom guidance, too noisy to gate on a legacy codebase.
      // Revisit per-directory once error-level findings are at zero.
      "@eslint-react/set-state-in-effect": "off",
      "@eslint-react/use-state": "off",
      // Stale-closure detection. warn globally; error for client+shared below.
      "@eslint-react/exhaustive-deps": "warn",
    },
  },
  {
    // The screen client is the production-bug surface (issues #523/#507/#515/#522).
    // Gate it hard; admin stays warn until burned down.
    files: ["assets/client/**/*.{js,jsx}", "assets/shared/**/*.{js,jsx}"],
    rules: { "@eslint-react/exhaustive-deps": "error" },
  },
];
