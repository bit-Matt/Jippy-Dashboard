import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Indents should be 2
      "indent": ["error", 2],

      // Requires having semicolon always
      "semi": ["error", "always"],

      // Trailing comma at the end
      "comma-dangle": ["error", "always-multiline"],

      // Ends a file with a new line always
      "eol-last": ["error", "always"],

      // File requires having LF line ending
      "linebreak-style": ["error", "unix"],

      // Enforces the use of double quotes
      "quotes": ["error", "double"],

      // Optional: Enforces double quotes for JSX attributes specifically
      "jsx-quotes": ["error", "prefer-double"],
    },
  },
]);

export default eslintConfig;
