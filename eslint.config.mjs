import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Next's own plugin and the hooks plugin are wired directly rather than via
// eslint-config-next: that preset pulls in eslint-plugin-react 7, which does
// not run on ESLint 10, and this codebase has two trivial React files.
const flat = (c) => (Array.isArray(c) ? c : [c]);

export default tseslint.config(
  { ignores: ["node_modules/**", ".next/**", "docs/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...flat(nextPlugin.configs["core-web-vitals"]),
  ...flat(reactHooks.configs.flat["recommended-latest"]),
  {
    rules: {
      // Tolerant extractors walk untyped Swiggy payloads; `any` is still banned.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
