import { expect, test } from "@playwright/test";
import {
  enviarCredenciales,
  esperarArea,
  iniciarSesion,
  prepararPagina,
  variable,
} from "./helpers";

const AREAS = ["/administrativo", "/medico", "/enfermera", "/paciente"];

test.beforeEach(async ({ page }) => {
  await prepararPagina(page);
});

test("sin sesión, las áreas protegidas redirigen a iniciar sesión", async ({
  page,
}) => {
  for (const area of AREAS) {
    await page.goto(area);
    await expect(page).toHaveURL(/sign-in|iniciar-sesion/, { timeout: 30_000 });
    await expect(page.locator("main", { hasText: /Panel|Portal/ })).toHaveCount(0);
  }
});

test("credenciales inválidas no abren sesión", async ({ page }) => {
  await enviarCredenciales(
    page,
    variable("E2E_PACIENTE_EMAIL"),
    "ContrasenaIncorrecta#000",
  );
  // El texto del error depende del idioma de Clerk; lo estable es el elemento de error del formulario.
  await expect(page.getByTestId("form-feedback-error")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).not.toHaveURL(/\/paciente$/);
});

test("paciente inicia sesión, aterriza en su área y no entra a las de personal", async ({
  page,
}) => {
  await iniciarSesion(
    page,
    variable("E2E_PACIENTE_EMAIL"),
    variable("E2E_PACIENTE_PASSWORD"),
  );
  await esperarArea(page, "/paciente", "Portal del paciente");

  for (const area of ["/administrativo", "/medico", "/enfermera"]) {
    await page.goto(area);
    await expect(page).toHaveURL(/\/paciente$/);
  }
});

test("administrativo inicia sesión con TOTP y aterriza en su panel", async ({
  page,
}) => {
  await iniciarSesion(
    page,
    variable("E2E_ADMINISTRATIVO_EMAIL"),
    variable("E2E_ADMINISTRATIVO_PASSWORD"),
    { totpSecret: variable("E2E_ADMINISTRATIVO_TOTP_SECRET") },
  );

  await esperarArea(page, "/administrativo", "Panel administrativo");

  for (const area of ["/paciente", "/medico", "/enfermera"]) {
    await page.goto(area);
    await expect(page).toHaveURL(/\/administrativo$/);
  }
});
