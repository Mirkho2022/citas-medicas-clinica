import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { iniciarSesion, prepararPagina, variable } from "./helpers";

// H2b, grupo 7: revisión automática de accesibilidad (WCAG 2.1 A y AA) con axe sobre la galería y las áreas. Falla ante
// cualquier violación. axe no mide todo (orden lógico del foco, lector de pantalla…): la lista de revisión manual está en
// docs/pruebas-e2e.md. Las pantallas de Clerk (/iniciar-sesion, /registro) quedan fuera: su marcado no es nuestro.
const ETIQUETAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function revisar(page: Page, nombre: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(ETIQUETAS).analyze();
  const resumen = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes
        .slice(0, 4)
        .map((n) => n.target.join(" "))
        .join("\n    ")}`,
  );
  expect(violations, `Violaciones de accesibilidad en ${nombre}:\n${resumen.join("\n")}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await prepararPagina(page);
});

test("la portada pública y la galería de componentes no tienen violaciones WCAG A/AA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await revisar(page, "la portada pública");

  await iniciarSesion(
    page,
    variable("E2E_PACIENTE_EMAIL"),
    variable("E2E_PACIENTE_PASSWORD"),
  );
  await page.goto("/guia-de-estilo");
  await expect(page.getByRole("heading", { name: "Guía de estilo" })).toBeVisible();
  await revisar(page, "la galería (1280 px)");

  // Con el horario elegido (aparece la advertencia) y el selector de documento en Carné de Extranjería.
  await page.getByRole("button", { name: "14:30" }).click();
  await page.locator("#g-doc-dni-tipo").selectOption("CE");
  await revisar(page, "la galería con un horario elegido");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Guía de estilo" })).toBeVisible();
  await revisar(page, "la galería (390 px)");

  await page.goto("/paciente");
  await expect(page.getByRole("heading", { name: "Portal del paciente" })).toBeVisible();
  await revisar(page, "/paciente (390 px)");
});

test("el panel administrativo no tiene violaciones WCAG A/AA", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await iniciarSesion(
    page,
    variable("E2E_ADMINISTRATIVO_EMAIL"),
    variable("E2E_ADMINISTRATIVO_PASSWORD"),
    { totpSecret: variable("E2E_ADMINISTRATIVO_TOTP_SECRET") },
  );
  await expect(page.getByRole("heading", { name: "Panel administrativo" })).toBeVisible();
  await revisar(page, "/administrativo (1280 px)");
});
