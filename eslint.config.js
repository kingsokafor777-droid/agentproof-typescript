import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const typedFiles = ["src/**/*.ts", "tests/**/*.ts"];

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "artifacts/**", "sbom/**", "node_modules/**"],
  },
  eslint.configs.recommended,
  {
    files: ["eslint.config.js", "scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: typedFiles,
    languageOptions: {
      ...config.languageOptions,
      globals: globals.node,
      parserOptions: {
        ...config.languageOptions?.parserOptions,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  })),
  {
    files: typedFiles,
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": "off",
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
