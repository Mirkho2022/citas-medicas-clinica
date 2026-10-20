import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import clerkNext from "@clerk/eslint-plugin/next";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    plugins: { "@clerk/next": clerkNext },
    rules: {
      "@clerk/next/require-auth-protection": [
        "error",
        {
          // "app/*/**" (no "app/**"): deja fuera la raíz de app/ (page.tsx,
          // layout.tsx), que debe quedar pública sin listarla aparte.
          protected: ["app/*/**"],
          public: [
            "app/iniciar-sesion/**",
            "app/registro/**",
            "app/api/salud/**",
          ],
        },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Herramientas locales de Claude Code, no código del proyecto: las skills instaladas (librerías de terceros ya
      // compiladas) y las copias de trabajo `git worktree` en .claude/worktrees, cada una con su propio `.next`. Los patrones
      // de arriba solo ignoran la raíz, así que sin esta línea ESLint lee todo eso y da miles de avisos que no son del código.
      ".claude/**",
    ],
  },
];

export default eslintConfig;
