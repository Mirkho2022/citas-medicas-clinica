import { expect, test } from "@playwright/test";
import { cabecerasBypass, esperarArea, iniciarSesion, prepararPagina, variable } from "./helpers";

// ADR-0023 de extremo a extremo (H2, tarea 8.2): Neon valida el JWT de Clerk y Postgres reconoce al usuario.
// Requiere DATABASE_AUTHENTICATED_URL en el entorno que sirve la app, apuntando a un branch con las migraciones
// de H2 y la JWKS de la instancia de Clerk registrada para ese branch (docs/spike-rls-h2.md).

test.beforeEach(async ({ page }) => {
  await prepararPagina(page);
});

test("sin sesión, /api/db-sesion no devuelve la identidad de nadie", async ({ request }) => {
  // auth.protect() redirige a iniciar sesión (o responde 401/404): sin seguir la redirección, nunca es un 200.
  const respuesta = await request.get("/api/db-sesion", { maxRedirects: 0, headers: cabecerasBypass() });
  expect([301, 302, 303, 307, 308, 401, 403, 404]).toContain(respuesta.status());
  expect(await respuesta.text()).not.toContain("clerk_user_id");
});

// H4: las E2E de aislamiento y de doble reserva necesitan dos pacientes con sesión (docs/pasos-manuales-h4.md, paso 4).
// El segundo no tiene ficha hasta que una E2E del portal la siembra (e2e/datos-portal.ts) y la ficha queda después: según el orden de las
// corridas, la app lo lleva a `/paciente` o a `/completar-registro`. Esta prueba solo comprueba que Postgres lo reconoce.
const PACIENTES = [
  { nombre: "primer paciente", correo: "E2E_PACIENTE_EMAIL", clave: "E2E_PACIENTE_PASSWORD", conFicha: true },
  { nombre: "segundo paciente", correo: "E2E_PACIENTE2_EMAIL", clave: "E2E_PACIENTE2_PASSWORD", conFicha: false },
];

for (const paciente of PACIENTES) {
  test(`con sesión, Postgres reconoce al usuario por su token de Clerk (${paciente.nombre})`, async ({ page }) => {
    await iniciarSesion(page, variable(paciente.correo), variable(paciente.clave));
    if (paciente.conFicha) {
      await esperarArea(page, "/paciente", "Portal del paciente");
    } else {
      await expect(page).toHaveURL(/\/(paciente|completar-registro)$/, { timeout: 30_000 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.waitForFunction(() => Boolean((window as any).Clerk?.user?.id));

    const clerkId = await page.evaluate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => (window as any).Clerk.user.id as string,
    );
    const { status, cuerpo } = await page.evaluate(async () => {
      const r = await fetch("/api/db-sesion");
      return { status: r.status, cuerpo: await r.json() };
    });

    // El cuerpo (con `detalle` fuera de producción) hace que un fallo de configuración se explique solo.
    expect(status, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.estado).toBe("ok");
    expect(cuerpo.clerk_user_id).toBe(clerkId);
    expect(cuerpo.rol).toBe("paciente");
    // H4: el claim `email` de la plantilla del JWT de Clerk llega a la base, en minúsculas (public.correo_actual()).
    expect(cuerpo.correo).toBe(variable(paciente.correo).toLowerCase());
  });
}
