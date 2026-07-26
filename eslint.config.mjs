import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * Next 16 removed the `next lint` command, so linting runs ESLint directly.
 * `eslint-config-next` v16 ships native flat configs, so these import as arrays.
 */
const config = [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "public/**"],
  },
  ...coreWebVitals,
  ...typescript,
];

export default config;
