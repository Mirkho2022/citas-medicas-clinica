import { expect, test, type Page } from "@playwright/test";
import { esperarArea, iniciarSesion, prepararPagina, variable } from "./helpers";

// Turnos de enfermería del administrativo (H7, tarea 5.3; specs/turnos-de-enfermeria). Con fecha de 2032 para no estorbar a nadie:
// asigna un turno, lo ve en la semana, intenta asignar el mismo y ve el mensaje de choque, cambia el médico por un servicio, lo quita y ya
// no aparece; y el intento sin médico ni servicio. La prueba limpia lo que crea (quita el turno al final aunque falle a medias).
// Necesita los datos de demostración (al menos una enfermera y un médico activos; ver docs/07-testing/datos-demo.md); sin ellos se omite
// con un aviso. Los avisos por bloqueo de agenda o por baja de personal los cubren pgTAP 80 y tests/integracion/turnos-enfermeria.test.ts.
// Negativo: una enfermera, un médico o un paciente que abre /administrativo/turnos es devuelto a su área (las de enfermera y médico se
// cubren en e2e/enfermera.spec.ts y e2e/medico.spec.ts, que necesitan TOTP).
test.describe.configure({ mode: "serial" });

const FECHA = "2032-03-01"; // lunes
const SEMANA = `/administrativo/turnos?semana=${FECHA}`;

async function abrirSemana(page: Page): Promise<void> {
  await page.goto(SEMANA);
  await expect(page.getByRole("heading", { name: "Turnos de enfermería", level: 1 })).toBeVisible();
}

async function quitarSiExiste(page: Page): Promise<void> {
  await abrirSemana(page);
  const modificar = page.getByRole("link", { name: /^Modificar/ }).first();
  while (await modificar.isVisible().catch(() => false)) {
    await modificar.click();
    await page.getByRole("button", { name: "Quitar turno" }).click();
    await page.getByRole("button", { name: "Sí, quitar turno" }).click();
    await expect(page).toHaveURL(/\/administrativo\/turnos\?semana=/);
    await abrirSemana(page);
  }
}

test("administrativo: asigna, ve, choca, cambia a un servicio, quita; y sin médico ni servicio no guarda", async ({ page }) => {
  test.setTimeout(240_000);
  await prepararPagina(page);
  await iniciarSesion(page, variable("E2E_ADMINISTRATIVO_EMAIL"), variable("E2E_ADMINISTRATIVO_PASSWORD"), {
    totpSecret: variable("E2E_ADMINISTRATIVO_TOTP_SECRET"),
  });
  await esperarArea(page, "/administrativo", "Panel administrativo");

  await test.step("«Turnos de enfermería» es un enlace de la navegación", async () => {
    await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Turnos de enfermería" }).click();
    await expect(page).toHaveURL(/\/administrativo\/turnos$/);
    await expect(page.getByRole("table")).toBeVisible();
  });

  await abrirSemana(page);
  const asignar = page.getByRole("link", { name: /^Asignar/ }).first();
  test.skip(!(await asignar.isVisible().catch(() => false)), "Sin datos de demostración (hace falta una enfermera activa): ver docs/07-testing/datos-demo.md");
  await quitarSiExiste(page); // por si una corrida anterior se interrumpió

  try {
    await test.step("asigna un turno de mañana con un médico y lo ve en la semana", async () => {
      await abrirSemana(page);
      await page.getByRole("link", { name: /^Asignar/ }).first().click();
      await expect(page.getByRole("heading", { name: "Asignar turno", level: 1 })).toBeVisible();
      const medico = page.locator("#turno-medico");
      await medico.selectOption({ index: 1 });
      await page.getByRole("button", { name: "Asignar turno" }).click();
      await expect(page).toHaveURL(/\/administrativo\/turnos\?semana=2032-03-01/);
      await expect(page.getByText("Turno asignado.")).toBeVisible();
      await expect(page.getByRole("table").getByText("Mañana").first()).toBeVisible();
      // La franja se muestra solo con su nombre: ninguna hora en la tabla de turnos.
      await expect(page.getByRole("table").getByText(/Mañana\s*\d{1,2}:\d{2}/)).toHaveCount(0);
    });

    await test.step("asignar el mismo turno otra vez muestra el choque y no duplica", async () => {
      await page.getByRole("link", { name: /^Asignar/ }).first().click();
      await page.locator("#turno-medico").selectOption({ index: 1 });
      await page.getByRole("button", { name: "Asignar turno" }).click();
      await expect(page.getByText("La enfermera ya tiene un turno asignado en esa fecha y franja")).toBeVisible();
      await expect(page).toHaveURL(/\/administrativo\/turnos\/nuevo/);
    });

    await test.step("sin médico ni servicio no se guarda y el mensaje queda junto al grupo", async () => {
      await page.getByRole("radio", { name: "Tarde" }).check({ force: true });
      await page.locator("#turno-medico").selectOption({ index: 0 });
      await page.getByRole("button", { name: "Asignar turno" }).click();
      await expect(page.getByText("Indique el médico o el servicio con el que trabajará la enfermera")).toBeVisible();
      await expect(page).toHaveURL(/\/administrativo\/turnos\/nuevo/);
    });

    await test.step("cambia el turno a un servicio", async () => {
      await abrirSemana(page);
      await page.getByRole("link", { name: /^Modificar/ }).first().click();
      await expect(page.getByRole("heading", { name: "Modificar turno", level: 1 })).toBeVisible();
      await page.getByRole("radio", { name: "En un servicio" }).check({ force: true });
      await page.locator("#turno-servicio").selectOption({ index: 1 });
      await page.getByRole("button", { name: "Guardar cambios" }).click();
      await expect(page.getByText("Turno actualizado.")).toBeVisible();
      await expect(page.getByRole("table").getByText(/Servicio: /).first()).toBeVisible();
    });
  } finally {
    await test.step("quita el turno y ya no aparece", async () => {
      await quitarSiExiste(page);
      await expect(page.getByRole("link", { name: /^Modificar/ })).toHaveCount(0);
    });
  }
});

test("paciente: abrir /administrativo/turnos lo devuelve a su área sin ver el contenido", async ({ page }) => {
  await prepararPagina(page);
  await iniciarSesion(page, variable("E2E_PACIENTE_EMAIL"), variable("E2E_PACIENTE_PASSWORD"));
  await page.goto("/administrativo/turnos");
  await expect(page).toHaveURL(/\/paciente/);
  await expect(page.getByRole("heading", { name: "Turnos de enfermería" })).toHaveCount(0);
});
