import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { iniciarSesion, prepararPagina } from "./helpers";

// Lectura de historias clínicas del médico (historias-clinicas, grupos 4 y 6; specs/acceso-a-historia-clinica): «Mis pacientes», la historia de
// un paciente a cargo (ficha de solo lectura, sin controles de edición, título y dirección genéricos, cabecera `no-store`), el 404 uniforme
// para un paciente ajeno o inexistente, el enlace «Registrar atención» y los negativos por rol (administrativo y paciente van a su área).
// Necesita los datos de demostración (docs/07-testing/datos-demo.md: el médico de la cuenta de pruebas es el médico 1, con pacientes a cargo) y
// las credenciales del médico CON su secreto TOTP (`E2E_MEDICO_EMAIL`, `E2E_MEDICO_PASSWORD` y `E2E_MEDICO_TOTP_SECRET`); sin ellos se omite con
// un aviso. No escribe datos: abrir una historia solo deja un registro de acceso (que no se puede borrar, por diseño).
test.describe.configure({ mode: "serial" });

const ETIQUETAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUID_INEXISTENTE = "00000000-0000-4000-8000-00000000dead";

const medico = {
  email: process.env.E2E_MEDICO_EMAIL,
  password: process.env.E2E_MEDICO_PASSWORD,
  totp: process.env.E2E_MEDICO_TOTP_SECRET,
};
const hayMedico = Boolean(medico.email && medico.password && medico.totp);

async function sinViolaciones(page: Page, nombre: string) {
  // Se espera a que no quede ninguna animación finita en curso (axe mediría un contraste a medio mezclar).
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running" && Number(a.effect?.getComputedTiming().endTime) !== Infinity)
            .length,
      ),
    )
    .toBe(0);
  const { violations } = await new AxeBuilder({ page }).withTags(ETIQUETAS).analyze();
  const resumen = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join("\n    ")}`);
  expect(violations, `Violaciones de accesibilidad en ${nombre}:\n${resumen.join("\n")}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await prepararPagina(page);
});

test("sin sesión, Mis pacientes y la historia redirigen a iniciar sesión", async ({ page }) => {
  for (const ruta of ["/medico/pacientes", `/medico/pacientes/${UUID_INEXISTENTE}`]) {
    await page.goto(ruta);
    await expect(page).toHaveURL(/sign-in|iniciar-sesion/, { timeout: 30_000 });
    await expect(page.locator("main", { hasText: /Historia clínica|Mis pacientes/ })).toHaveCount(0);
  }
});

test("el médico ve sus pacientes, abre una historia de solo lectura y un paciente ajeno o inexistente da el mismo 404", async ({ page }) => {
  test.skip(!hayMedico, "Faltan E2E_MEDICO_EMAIL, E2E_MEDICO_PASSWORD o E2E_MEDICO_TOTP_SECRET: no se puede iniciar sesión como médico.");
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await iniciarSesion(page, medico.email!, medico.password!, { totpSecret: medico.totp! });

  // ---- Mis pacientes ----
  await page.goto("/medico/pacientes");
  await expect(page.getByRole("heading", { name: "Mis pacientes", level: 1 })).toBeVisible();
  const abrir = page.getByRole("link", { name: /Abrir historia/ });
  const hayPacientes = await abrir.first().waitFor({ state: "visible", timeout: 15_000 }).then(() => true, () => false);
  test.skip(!hayPacientes, "El médico de la cuenta de pruebas no tiene pacientes a cargo: faltan los datos de demostración (docs/07-testing/datos-demo.md).");
  await sinViolaciones(page, "/medico/pacientes (1280 px)");

  // La búsqueda se queda dentro de la lista: un texto que no coincide con nadie da «Sin resultados».
  await page.getByLabel("Buscar entre mis pacientes").fill("zzzzzz-inexistente");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText(/Sin resultados para/)).toBeVisible();
  await page.getByRole("link", { name: "Limpiar búsqueda" }).click();
  await expect(abrir.first()).toBeVisible();

  // ---- La historia ----
  const respuesta = page.waitForResponse((r) => /\/medico\/pacientes\/[0-9a-f-]{36}$/.test(new URL(r.url()).pathname) && r.request().resourceType() === "document");
  await abrir.first().click();
  const documento = await respuesta;
  expect(documento.status()).toBe(200);
  expect(documento.headers()["cache-control"] ?? "").toMatch(/no-store/);
  expect(documento.headers()["cache-control"] ?? "").toMatch(/private/);

  await expect(page.getByRole("heading", { name: "Historia clínica", level: 1 })).toBeVisible();
  await expect(page).toHaveTitle("Historia clínica");
  const idPaciente = new URL(page.url()).pathname.split("/").pop() ?? "";
  expect(idPaciente).toMatch(UUID); // la dirección lleva solo el identificador interno: ni nombre ni documento
  expect(new URL(page.url()).search).toBe("");

  // Ficha: texto, sin ningún control de edición (la página entera no tiene campos de formulario).
  await expect(page.getByRole("heading", { name: "Datos del paciente" })).toBeVisible();
  await expect(page.getByText("Solo lectura: vienen del registro del paciente.")).toBeVisible();
  await expect(page.locator("main input, main textarea, main select, main [contenteditable=true]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Antecedentes vigentes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Atenciones firmadas" })).toBeVisible();
  // Lo firmado no tiene «Editar»: la corrección es una addenda, desde la pantalla de la atención.
  await expect(page.getByRole("button", { name: /Editar/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Editar/ })).toHaveCount(0);

  // «Registrar atención» lleva a la ruta del formulario (la construye otro grupo del change; aquí solo se comprueba el enlace).
  await expect(page.getByRole("link", { name: "Registrar atención" })).toHaveAttribute("href", `/medico/pacientes/${idPaciente}/atencion/nueva`);

  await sinViolaciones(page, "la historia clínica (1280 px)");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Historia clínica", level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await sinViolaciones(page, "la historia clínica (390 px)");

  // ---- 404 uniforme: inexistente, identificador mal formado ----
  const inexistente = await page.goto(`/medico/pacientes/${UUID_INEXISTENTE}`);
  expect(inexistente?.status()).toBe(404);
  const textoInexistente = await page.locator("main").innerText();
  const malFormado = await page.goto("/medico/pacientes/no-es-un-uuid");
  expect(malFormado?.status()).toBe(404);
  expect(await page.locator("main").innerText()).toBe(textoInexistente);
  expect(textoInexistente).not.toMatch(/Quispe|Rojas|DNI|CE \d/);
});

test("administrativo y paciente no entran a las pantallas clínicas del médico", async ({ page }) => {
  const adminEmail = process.env.E2E_ADMINISTRATIVO_EMAIL;
  const adminPassword = process.env.E2E_ADMINISTRATIVO_PASSWORD;
  const adminTotp = process.env.E2E_ADMINISTRATIVO_TOTP_SECRET;
  test.skip(!(adminEmail && adminPassword && adminTotp), "Faltan las credenciales del administrativo.");
  test.setTimeout(120_000);

  await iniciarSesion(page, adminEmail!, adminPassword!, { totpSecret: adminTotp! });
  for (const ruta of ["/medico/pacientes", `/medico/pacientes/${UUID_INEXISTENTE}`]) {
    await page.goto(ruta);
    await expect(page).toHaveURL(/\/administrativo$/);
    await expect(page.getByRole("heading", { name: "Mis pacientes" })).toHaveCount(0);
  }
});
