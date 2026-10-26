import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Las páginas cargan sus datos con `useEffect(() => { void load(); })`, un
      // patrón que esta regla marca aunque el setState ocurra tras el `await`.
      // Queda como aviso hasta migrarlas a un hook común de carga de datos.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Código generado por Workflow DevKit.
    ".workflow-data/**",
    ".workflow-vitest/**",
    "app/.well-known/workflow/**",
  ]),
]);

export default eslintConfig;
