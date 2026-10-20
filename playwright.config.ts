import { defineConfig, devices } from "@playwright/test";

// Local: lee .env.local (E2E_*, claves de Clerk). En CI las variables llegan de secretos.
try {
  process.loadEnvFile(".env.local");
} catch {
  // sin .env.local (CI): se usa el entorno del proceso
}

// Sin PLAYWRIGHT_BASE_URL se levanta `next dev`; en CI apunta al preview de Vercel del PR.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // Iniciar sesión con TOTP puede esperar a la ventana de 30 s siguiente si Clerk rechaza el código (ver `iniciarSesion`).
  timeout: 60_000,
  // Las cuentas de prueba son compartidas: un solo worker, sin paralelismo.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Local: el Chrome instalado (sin descargar navegador). CI: el Chromium de Playwright.
        channel: process.env.CI ? undefined : "chrome",
      },
      dependencies: ["setup"],
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
