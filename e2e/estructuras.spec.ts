import { expect, test } from "@playwright/test";
import {
  esperarArea,
  iniciarSesion,
  prepararPagina,
  variable,
} from "./helpers";

// H2b, tarea 5.2: estructuras de pantalla de cada área. Las E2E de roles.spec.ts y db.spec.ts siguen valiendo sin cambios.
test.beforeEach(async ({ page }) => {
  await prepararPagina(page);
});

test("portal del paciente a 390 px: una columna sin desborde, tres destinos y botón de 48 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await iniciarSesion(
    page,
    variable("E2E_PACIENTE_EMAIL"),
    variable("E2E_PACIENTE_PASSWORD"),
  );
  await esperarArea(page, "/paciente", "Portal del paciente");

  const desborda = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(desborda).toBe(false);

  const destinos = page.getByRole("navigation", { name: "Principal" }).getByRole("listitem");
  await expect(destinos).toHaveCount(3);
  await expect(destinos).toContainText(["Inicio", "Mis citas", "Reservar"]);

  // Desde H4 «Reservar cita» es un enlace con forma de botón de 48 px (lleva a los pasos de la reserva).
  const boton = page.getByRole("link", { name: "Reservar cita", exact: true });
  const caja = await boton.boundingBox();
  expect(caja?.height ?? 0).toBeGreaterThanOrEqual(48);

  // Una sola columna de hasta 640 px, aunque la ventana sea más ancha.
  await page.setViewportSize({ width: 1280, height: 800 });
  const ancho = await page.getByRole("main").evaluate((el) => el.getBoundingClientRect().width);
  expect(ancho).toBeLessThanOrEqual(640);
});

test("paciente que abre el área de personal sigue sin ver su contenido", async ({ page }) => {
  await iniciarSesion(
    page,
    variable("E2E_PACIENTE_EMAIL"),
    variable("E2E_PACIENTE_PASSWORD"),
  );
  await esperarArea(page, "/paciente", "Portal del paciente");
  for (const area of ["/administrativo", "/medico", "/enfermera"]) {
    await page.goto(area);
    await expect(page).toHaveURL(/\/paciente$/);
    await expect(page.getByRole("heading", { name: /Panel/ })).toHaveCount(0);
  }
});

test("consola del personal a 1280 px: barra lateral de 240 px y destinos futuros deshabilitados", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await iniciarSesion(
    page,
    variable("E2E_ADMINISTRATIVO_EMAIL"),
    variable("E2E_ADMINISTRATIVO_PASSWORD"),
    { totpSecret: variable("E2E_ADMINISTRATIVO_TOTP_SECRET") },
  );
  await esperarArea(page, "/administrativo", "Panel administrativo");

  const lateral = await page.locator("aside").evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(lateral)).toBe(240);

  const navegacion = page.getByRole("navigation", { name: "Principal" });
  await expect(navegacion.getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page");
  // Los destinos que construye H3 son enlaces; los de hitos futuros (Notificaciones) no lo son: no llevan a rutas que responden 404.
  await expect(navegacion.getByRole("link")).toHaveCount(5);
  for (const destino of ["Agenda", "Pacientes", "Horarios", "Bajas médicas"]) {
    await expect(navegacion.getByRole("link", { name: destino })).toBeVisible();
  }
  await expect(navegacion.getByText("Próximamente")).toHaveCount(1);

  const desborda = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(desborda).toBe(false);
});

test("la portada pública conserva sus dos enlaces y los muestra como botones", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/iniciar-sesion");
  await expect(page.getByRole("link", { name: "Registrarme" })).toHaveAttribute("href", "/registro");
  // Foco visible al recorrer con el teclado (anillo del sistema, no el contorno por defecto).
  await page.keyboard.press("Tab");
  const anillo = await page.evaluate(() => getComputedStyle(document.activeElement!).boxShadow);
  expect(anillo).not.toBe("none");
});
