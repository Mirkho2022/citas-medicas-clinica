import { expect, test, type Page } from "@playwright/test";
import { esperarArea, iniciarSesion, prepararPagina, variable } from "./helpers";

// Horarios de un médico (H3, tareas 9.2 y 9.3; specs/disponibilidad-y-slots): alta de un tramo semanal, rechazo de uno que se cruza
// con el mensaje propio del solape (nunca el de la doble reserva), y la advertencia al eliminar un tramo con una cita futura encima:
// la página muestra la cita fuera del horario SIN cancelarla. Se usa el domingo (los médicos de demostración atienden de lunes a
// viernes), así que no toca los horarios de las demás pruebas; la cita y el paciente `97…` se limpian o quedan como dato sintético.
// Necesita los datos de demostración (docs/07-testing/datos-demo.md); sin ellos se omite con un aviso.
test.describe.configure({ mode: "serial" });

const hoyEnLima = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
function domingoDentroDe(dias: number): string {
  const d = new Date(`${hoyEnLima()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const base = Number(String(Date.now()).slice(-6));
const DOMINGO = domingoDentroDe(15);
const apellido = `Horario H${base}`;

async function capturar(page: Page, nombre: string): Promise<void> {
  const carpeta = process.env.CAPTURAS_H3;
  if (carpeta) await page.screenshot({ path: `${carpeta}/${nombre}.png`, fullPage: true });
}

test("horarios: alta de un tramo, rechazo del solape y aviso de la cita que queda fuera, sin cancelarla", async ({ page }) => {
  test.setTimeout(240_000);
  await prepararPagina(page);
  await iniciarSesion(page, variable("E2E_ADMINISTRATIVO_EMAIL"), variable("E2E_ADMINISTRATIVO_PASSWORD"), {
    totpSecret: variable("E2E_ADMINISTRATIVO_TOTP_SECRET"),
  });
  await esperarArea(page, "/administrativo", "Panel administrativo");

  await page.goto("/administrativo/agenda");
  const medicos = await page.locator("#filtro-medico option").evaluateAll((os) =>
    (os as HTMLOptionElement[]).map((o) => ({ valor: o.value, texto: o.textContent ?? "" })).filter((o) => o.valor),
  );
  const generales = medicos.filter((m) => m.texto.includes("Medicina general"));
  test.skip(generales.length < 2, "Sin datos de demostración (hacen falta dos médicos de Medicina general): ver docs/07-testing/datos-demo.md");
  const medico = generales[1]!;
  const nombre = medico.texto.split(" · ")[0]!;
  const url = `/administrativo/horarios/${medico.valor}`;

  const abrirFormulario = async () => {
    await page.getByRole("button", { name: "Agregar horario" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar horario" });
    await expect(dialogo).toBeVisible();
    return dialogo;
  };
  const llenar = async (dialogo: ReturnType<Page["getByRole"]>, inicio: string, fin: string) => {
    await dialogo.getByLabel("Día de la semana").selectOption("0"); // domingo
    await dialogo.getByLabel("Hora de inicio").fill(inicio);
    await dialogo.getByLabel("Hora de fin").fill(fin);
    await dialogo.getByLabel("Minutos por cita").fill("20");
  };
  const domingo = () => page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Domingo", level: 3 }) }).first();

  await test.step("alta: un tramo de domingo de 08:00 a 09:00 cada 20 minutos", async () => {
    // Idempotente: si una corrida anterior falló a medias dejó una cita y un tramo del domingo en la base compartida del preview.
    // Primero se cancelan las citas de ese domingo (así los tres huecos vuelven a estar libres) y luego se borra el tramo.
    await page.goto(`/administrativo/agenda?fecha=${DOMINGO}&medico=${medico.valor}`);
    await expect(page.getByRole("heading", { name: "Agenda del día" })).toBeVisible();
    const citasSobrantes = page.getByRole("button", { name: /^Cancelar/ });
    while ((await citasSobrantes.count()) > 0) {
      await citasSobrantes.first().click();
      const cancelar = page.getByRole("alertdialog", { name: "¿Cancelar esta cita?" });
      await cancelar.getByRole("button", { name: "Cancelar cita" }).click();
      await expect(cancelar).toBeHidden();
      await page.waitForTimeout(500);
    }

    await page.goto(url);
    await expect(page.getByRole("heading", { name: nombre, level: 1 })).toBeVisible();
    const sobrantes = domingo().getByRole("button", { name: /^Eliminar/ });
    while ((await sobrantes.count()) > 0) {
      await sobrantes.first().click();
      const confirmar = page.getByRole("alertdialog", { name: "¿Eliminar este horario?" });
      await confirmar.getByRole("button", { name: "Eliminar horario" }).click();
      await expect(confirmar).toBeHidden();
      await page.waitForTimeout(500);
    }
    await expect(domingo().getByText("Sin horario")).toBeVisible();
    const dialogo = await abrirFormulario();
    await llenar(dialogo, "08:00", "09:00");
    await dialogo.getByRole("button", { name: "Guardar horario" }).click();
    await expect(page.getByText("Horario guardado.")).toBeVisible();
    await expect(domingo().getByText("08:00–09:00", { exact: true })).toBeVisible();
    await expect(domingo().getByText(/cada 20 min/).first()).toBeVisible();
    await capturar(page, "13-horarios-con-tramo");
  });

  await test.step("solape: un tramo que se cruza se rechaza con el mensaje propio del solape", async () => {
    const dialogo = await abrirFormulario();
    await llenar(dialogo, "08:30", "09:30");
    await dialogo.getByRole("button", { name: "Guardar horario" }).click();
    await expect(dialogo.getByRole("alert").filter({ hasText: "Este horario se cruza con otro ya definido para el médico" })).toBeVisible();
    await expect(page.getByText("Registro de cita ya agendado")).toHaveCount(0);
    await capturar(page, "14-horarios-solape");
    await dialogo.getByRole("button", { name: "Volver" }).click();
    await expect(dialogo).toBeHidden();
    await expect(domingo().getByText("08:30–09:30", { exact: true })).toHaveCount(0);
  });

  let idPaciente = "";
  await test.step("agendar una cita sobre ese tramo (el domingo ya tiene huecos)", async () => {
    await page.goto("/administrativo/pacientes");
    await page.getByLabel("Número de documento").fill(`97${String(base).padStart(6, "0").slice(-6)}`);
    await page.getByLabel("Nombres").fill("Horario");
    await page.getByLabel("Apellidos").fill(apellido);
    await page.getByLabel("Fecha de nacimiento").fill("1991-02-03");
    await page.locator("fieldset", { hasText: "Sexo" }).getByText("F", { exact: true }).click();
    await page.getByLabel("Correo electrónico").fill(`e2e97${base}@demo.invalid`);
    await page.getByRole("button", { name: "Registrar paciente" }).click();
    await expect(page.getByText("Paciente registrado")).toBeVisible();
    const href = await page.getByRole("link", { name: "Agendar una cita para este paciente" }).getAttribute("href");
    idPaciente = new URL(href!, "http://x").searchParams.get("paciente")!;

    await page.goto(`/administrativo/agenda/nueva?paciente=${idPaciente}&medico=${medico.valor}&fecha=${DOMINGO}`);
    const horarios = page.getByRole("group", { name: "Horarios disponibles" }).getByRole("button");
    await expect(horarios).toHaveCount(3); // 08:00, 08:20 y 08:40
    await horarios.first().click();
    await page.getByRole("button", { name: "Reservar cita" }).click();
    await expect(page.getByText("Cita reservada para las 08:00.")).toBeVisible();
  });

  await test.step("eliminar el tramo: la cita queda fuera del horario, se muestra y NO se cancela", async () => {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: nombre, level: 1 })).toBeVisible();
    // Con el tramo vigente la cita nueva está dentro del horario: el aviso no cuenta más citas que las que ya había fuera (de otras
    // corridas o de otros domingos); al eliminar el tramo debe subir exactamente en una.
    const fueraDelHorario = async () => {
      const titulo = page.getByText(/\d+ citas? vigentes? fuera del horario/).first();
      return (await titulo.count()) === 0 ? 0 : Number((await titulo.innerText()).match(/^\d+/)![0]);
    };
    const antes = await fueraDelHorario();
    await domingo().getByRole("button", { name: /^Eliminar/ }).click();
    const dialogo = page.getByRole("alertdialog", { name: "¿Eliminar este horario?" });
    await expect(dialogo).toContainText("Las citas ya agendadas no se cancelan");
    await dialogo.getByRole("button", { name: "Eliminar horario" }).click();
    await expect(page.getByText("Horario eliminado.")).toBeVisible();
    await expect(domingo().getByText("Sin horario")).toBeVisible();

    const ahora = antes + 1;
    const aviso = page.getByRole("status").filter({ hasText: `${ahora} ${ahora === 1 ? "cita vigente" : "citas vigentes"} fuera del horario` });
    await expect(aviso).toBeVisible();
    const fila = page.getByRole("row").filter({ hasText: apellido });
    await expect(fila).toBeVisible();
    await expect(fila.getByText("Reservada")).toBeVisible();
    await expect(fila.getByRole("link", { name: /^Reprogramar/ })).toBeVisible();
    await capturar(page, "15-horarios-cita-fuera");
  });

  await test.step("la cita sigue vigente en la agenda; se cancela al terminar", async () => {
    await page.goto(`/administrativo/agenda?fecha=${DOMINGO}&medico=${medico.valor}`);
    const fila = page.getByRole("row").filter({ hasText: apellido });
    await expect(fila.getByText("Reservada")).toBeVisible();
    await fila.getByRole("button", { name: /^Cancelar/ }).click();
    await page.getByRole("alertdialog", { name: "¿Cancelar esta cita?" }).getByRole("button", { name: "Cancelar cita" }).click();
    await expect(fila.getByText("Cancelada")).toBeVisible();
  });
});
