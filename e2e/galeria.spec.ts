import { expect, test } from "@playwright/test";
import { iniciarSesion, prepararPagina, variable } from "./helpers";

test.beforeEach(async ({ page }) => {
  await prepararPagina(page);
});

// H2b, tarea 3.2: la galería exige sesión; en producción no existe (esa regla se prueba en tests/tema/galeria.test.ts).
test("sin sesión, la galería redirige a iniciar sesión", async ({ page }) => {
  await page.goto("/guia-de-estilo");
  await expect(page).toHaveURL(/sign-in|iniciar-sesion/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Guía de estilo" })).toHaveCount(0);
});

test("con sesión de paciente, la galería responde 200", async ({ page }) => {
  await iniciarSesion(
    page,
    variable("E2E_PACIENTE_EMAIL"),
    variable("E2E_PACIENTE_PASSWORD"),
  );
  const respuesta = await page.goto("/guia-de-estilo");
  expect(respuesta?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Guía de estilo" })).toBeVisible();
});
