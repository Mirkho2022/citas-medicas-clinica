import { expect, test } from "@playwright/test";
import { esperarArea, iniciarSesion, prepararPagina, variable } from "./helpers";

// Aislamiento del paciente en el portal (H4, tarea 8.3; specs/aislamiento-del-paciente). Complementa a pgTAP 72 (lo que la base de
// datos le niega al rol) y a tests/portal/guarda-estatica.test.ts (el código del portal no nombra tablas clínicas): aquí, lo que un
// paciente real puede alcanzar con el navegador.

test.beforeEach(async ({ page }) => {
  await prepararPagina(page);
  await iniciarSesion(page, variable("E2E_PACIENTE_EMAIL"), variable("E2E_PACIENTE_PASSWORD"));
  await esperarArea(page, "/paciente", "Portal del paciente");
});

// Rutas de personal que el portal no ofrece y que un paciente no debe alcanzar escribiendo la dirección a mano.
const RUTAS_DE_PERSONAL = [
  "/administrativo",
  "/administrativo/agenda",
  "/administrativo/pacientes",
  "/administrativo/horarios",
  "/administrativo/bajas",
  "/medico",
  "/enfermera",
];

test("un paciente que abre las rutas de administrativo, médico y enfermería es llevado a /paciente", async ({ page }) => {
  for (const ruta of RUTAS_DE_PERSONAL) {
    await page.goto(ruta);
    await expect(page, ruta).toHaveURL(/\/paciente$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Portal del paciente" })).toBeVisible();
  }
});

test("el portal no tiene ningún enlace hacia contenido clínico ni de personal", async ({ page }) => {
  const enlaces = await page.locator("a[href]").evaluateAll((nodos) => nodos.map((n) => (n as HTMLAnchorElement).getAttribute("href") ?? ""));
  expect(enlaces.length).toBeGreaterThan(0);
  const prohibido = /\/(administrativo|medico|enfermera|historia|historias|atencion|atenciones|antecedentes|auditoria)(\/|$|\?)/i;
  for (const enlace of enlaces) {
    expect(enlace, `enlace hacia contenido que el paciente no ve: ${enlace}`).not.toMatch(prohibido);
  }
});

test("el título de la pestaña del portal no contiene datos personales", async ({ page }) => {
  const titulo = await page.title();
  const correo = variable("E2E_PACIENTE_EMAIL");
  expect(titulo.length).toBeGreaterThan(0);
  expect(titulo.toLowerCase()).not.toContain(correo.toLowerCase());
  expect(titulo.toLowerCase()).not.toContain(correo.split("@")[0]!.toLowerCase());
  expect(titulo, "un título con un documento de 8 dígitos").not.toMatch(/\d{8}/);
  expect(titulo, "un título con nombre de paciente de demostración").not.toMatch(/Paula/i);
});

test("las rutas de la API del personal no responden datos al paciente", async ({ page }) => {
  // Solo existen /api/db-sesion (informa al propio usuario), /api/salud y el webhook de Clerk; ninguna devuelve datos clínicos.
  const { status, cuerpo } = await page.evaluate(async () => {
    const r = await fetch("/api/db-sesion");
    return { status: r.status, cuerpo: await r.json() };
  });
  expect(status).toBe(200);
  expect(Object.keys(cuerpo).sort()).toEqual(["clerk_user_id", "correo", "estado", "rol"]);
  expect(cuerpo.rol).toBe("paciente");
});
