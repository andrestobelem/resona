import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([".agents/**", "coverage/**", "dist/**", "**/dist/**", "node_modules/**"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["packages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Use Resona keyed randomness so musical output remains reproducible.",
        },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
      },
    },
  },
);
