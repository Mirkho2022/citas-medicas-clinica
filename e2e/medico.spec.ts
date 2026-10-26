import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { esperarArea, iniciarSesion, prepararPagina } from "./helpers";

// Jornada del médico (H7, tarea 8.4; specs/jornada-del-medico): inicia sesión (con TOTP), ve «Mi jornada» con su horario de atención y solo
// sus citas confirmadas (ninguna reservada, ninguna de otro médico, ninguna enfermera ni el motivo de la cita), el título de la pestaña es
// fijo, «Marcar atendida» saca una cita de la lista sin duplicar con un doble clic, abrir /administrativo/dashboard o /administrativo/turnos
// lo devuelve a /medico, axe sin violaciones y sin desplazamiento horizontal a 390 px.
// Necesita la cuenta del médico con TOTP (paso manual 1.2: E2E_MEDICO_EMAIL, E2E_MEDICO_PASSWORD y E2E_MEDICO_TOTP_SECRET) y, para marcar
// atendida, una cita CONFIRMADA cuya hora ya empezó (los datos de demostración con `--citas-de-ahora`, tarea 9.1 del change); sin ellas
// esos pasos se omiten con un aviso. La cita que se marca atendida no se puede deshacer desde la aplicación: por eso es la única de la
// corrida y se usa con datos sintéticos. El aislamiento en la base de datos lo cubren pgTAP 84 y tests/integracion/turnos-enfermeria.test.ts.
const EMAIL = process.env.E2E_MEDICO_EMAIL;
const PASSWORD = process.env.E2E_MEDICO_PASSWORD;
const TOTP = process.env.E2E_MEDICO_TOTP_SECRET;
test.skip(!EMAIL || !PASSWORD || !TOTP, "Faltan E2E_MEDICO_EMAIL, E2E_MEDICO_PASSWORD o E2E_MEDICO_TOTP_SECRET (paso manual 1.2 del change turnos-y-dashboard)");
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await prepararPagina(page);
  await iniciarSesion(page, EMAIL!, PASSWORD!, { totpSecret: TOTP! });
  await esperarArea(page, "/medico", "Panel del médico");
});

test("el médico ve su jornada: solo citas confirmadas, sin enfermeras ni motivo, con el título fijo", async ({ page }) => {
  await expect(page).toHaveTitle("Panel del médico");
  await expect(page.getByRole("heading", { name: "Mi jornada", level: 2 })).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByText("Mi horario de atención:").first()).toBeVisible();
  // Todas las insignias de estado de la lista son «Confirmada»: ninguna reservada, atendida ni cancelada.
  for (const otro of ["Reservada", "Atendida", "Cancelada", "No asistió"]) {
    await expect(main.locator("[data-estado]").filter({ hasText: otro })).toHaveCount(0);
  }
  await expect(main.getByText(/enfermera/i)).toHaveCount(0);
  await expect(main.getByText(/motivo/i)).toHaveCount(0);
  await expect(page).toHaveURL(/\/medico$/); // la dirección no lleva datos de pacientes
});

test("«Marcar atendida» saca la cita de la lista y el doble clic no duplica ni falla", async ({ page }) => {
  const boton = page.getByRole("button", { name: /^Marcar atendida/ }).first();
  test.skip(!(await boton.isVisible().catch(() => false)), "No hay una cita confirmada cuya hora ya empezó: sembrar con --citas-de-ahora (docs/07-testing/datos-demo.md)");
  const citas = page.locator("[data-cita-jornada]");
  const antes = await citas.count();
  await boton.dblclick();
  await expect(page.getByText("Cita marcada como atendida")).toBeVisible();
  await expect(citas).toHaveCount(antes - 1);
  await expect(page.getByRole("alert").filter({ hasText: "ya no está confirmada" })).toHaveCount(0);
});

test("abrir el dashboard o la gestión de turnos del administrativo devuelve al médico a /medico", async ({ page }) => {
  for (const ruta of ["/administrativo/dashboard", "/administrativo/turnos", "/enfermera", "/paciente"]) {
    await page.goto(ruta);
    await expect(page).toHaveURL(/\/medico$/);
  }
});

test("accesibilidad: axe sin violaciones y sin desplazamiento horizontal a 390 px", async ({ page }) => {
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && Number(a.effect?.getComputedTiming().endTime) !== Infinity).length)).toBe(0);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations, violations.map((v) => `${v.id}: ${v.help}`).join("\n")).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Panel del médico" })).toBeVisible();
  const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(desborda, "la página no se desplaza en horizontal a 390 px").toBe(false);
});
