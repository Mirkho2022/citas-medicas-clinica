import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { esperarArea, iniciarSesion, prepararPagina } from "./helpers";

// Vista de la enfermera (H7, tarea 6.3; specs/turnos-de-enfermeria, «La enfermera ve su turno y con quién trabaja, y nada más»): inicia
// sesión (con TOTP), ve «Hoy» y «Próximos días» con la franja SIN horas, el médico con su especialidad o el servicio; no ve nada de otras
// enfermeras; abrir /administrativo, /medico y /paciente la devuelve a /enfermera; la página no lleva enlaces a citas ni pacientes; axe sin
// violaciones y sin desplazamiento horizontal a 390 px.
// Necesita la cuenta de la enfermera con TOTP (paso manual 1.2 de openspec/changes/turnos-y-dashboard/tasks.md:
// E2E_ENFERMERA_EMAIL, E2E_ENFERMERA_PASSWORD y E2E_ENFERMERA_TOTP_SECRET); sin ellas se omite con un aviso. Lo que no depende de la
// pantalla (aislamiento en la base de datos) lo cubren pgTAP 83 y tests/integracion/turnos-enfermeria.test.ts.
const EMAIL = process.env.E2E_ENFERMERA_EMAIL;
const PASSWORD = process.env.E2E_ENFERMERA_PASSWORD;
const TOTP = process.env.E2E_ENFERMERA_TOTP_SECRET;
test.skip(!EMAIL || !PASSWORD || !TOTP, "Faltan E2E_ENFERMERA_EMAIL, E2E_ENFERMERA_PASSWORD o E2E_ENFERMERA_TOTP_SECRET (paso manual 1.2 del change turnos-y-dashboard)");

test.beforeEach(async ({ page }) => {
  await prepararPagina(page);
  await iniciarSesion(page, EMAIL!, PASSWORD!, { totpSecret: TOTP! });
  await esperarArea(page, "/enfermera", "Panel de enfermería");
});

test("la enfermera ve «Hoy» y sus turnos con médico o servicio, sin horas, y nada de pacientes ni citas", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Hoy", level: 2 })).toBeVisible();
  const main = page.getByRole("main");
  const vacio = main.getByText("No tiene turnos asignados en los próximos 14 días");
  if (await vacio.isVisible().catch(() => false)) {
    test.info().annotations.push({ type: "aviso", description: "La enfermera de pruebas no tiene turnos en los próximos 14 días; se comprueban solo las restricciones." });
  } else {
    // Cada turno dice su franja con su nombre y trae el médico con su especialidad o «Servicio: …».
    await expect(main.getByText(/^(Mañana|Tarde|Noche)$/).first()).toBeVisible();
    await expect(main.getByText(/·|Servicio: /).first()).toBeVisible();
    await expect(main.getByText(/\b\d{1,2}:\d{2}\b/)).toHaveCount(0);
  }
  // Nada más: ningún enlace a citas, pacientes, historias ni funciones administrativas dentro de la pantalla.
  await expect(main.getByRole("link")).toHaveCount(0);
  await expect(main.getByText(/paciente|historia cl[ií]nica/i)).toHaveCount(0);
});

test("abrir /administrativo, /medico y /paciente devuelve a la enfermera a /enfermera", async ({ page }) => {
  for (const area of ["/administrativo", "/medico", "/paciente", "/administrativo/turnos"]) {
    await page.goto(area);
    await expect(page).toHaveURL(/\/enfermera$/);
  }
});

test("accesibilidad: axe sin violaciones y sin desplazamiento horizontal a 390 px", async ({ page }) => {
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && Number(a.effect?.getComputedTiming().endTime) !== Infinity).length)).toBe(0);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations, violations.map((v) => `${v.id}: ${v.help}`).join("\n")).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Panel de enfermería" })).toBeVisible();
  const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(desborda, "la página no se desplaza en horizontal a 390 px").toBe(false);
});
