import { expect, test, type Page } from "@playwright/test";
import { esperarArea, iniciarSesion, prepararPagina, variable } from "./helpers";

// Agenda del administrativo (H3, tarea 12.1; specs/gestion-de-citas e identificacion-de-pacientes): registrar un paciente `99…`,
// agendar 14 días adelante con la advertencia y su hora límite en Lima, provocar la doble reserva desde un segundo contexto y ver
// `Registro de cita ya agendado`, confirmar (la insignia pasa a «Confirmada» y «No asistió» aún no se ofrece), reprogramar y cancelar
// (la cita queda «Cancelada» sin acciones). Las citas de la prueba se cancelan al terminar. Necesita los datos de demostración
// (docs/07-testing/datos-demo.md: médicos con horario); sin ellos se omite con un aviso. Los pacientes `99…` quedan: no se pueden borrar.
//
// Con CAPTURAS_H3=<carpeta> guarda una captura de cada pantalla en los pasos clave (revisión visual, tarea 13.3).
test.describe.configure({ mode: "serial" });

// Lima no tiene horario de verano: es UTC-5 todo el año.
const hoyEnLima = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

// Un día de lunes a viernes (los médicos de demostración atienden de lunes a viernes), a 14 días o más.
function diaLaborableDentroDe(dias: number): string {
  const d = new Date(`${hoyEnLima()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const base = Number(String(Date.now()).slice(-6));
const documento = (n: number) => `99${String(base + n).padStart(6, "0").slice(-6)}`;
const DIA = diaLaborableDentroDe(14);

async function capturar(page: Page, nombre: string): Promise<void> {
  const carpeta = process.env.CAPTURAS_H3;
  if (carpeta) await page.screenshot({ path: `${carpeta}/${nombre}.png`, fullPage: true });
}

async function registrarPaciente(page: Page, doc: string, nombres: string, apellidos: string): Promise<void> {
  await page.goto("/administrativo/pacientes");
  await page.getByLabel("Número de documento").fill(doc);
  await page.getByLabel("Nombres").fill(nombres);
  await page.getByLabel("Apellidos").fill(apellidos);
  await page.getByLabel("Fecha de nacimiento").fill("1990-05-17");
  await page.locator("fieldset", { hasText: "Sexo" }).getByText("F", { exact: true }).click();
  await page.getByLabel("Correo electrónico").fill(`e2e${doc}@demo.invalid`);
  await page.getByRole("button", { name: "Registrar paciente" }).click();
}

// La fila de una cita (o de un hueco) por su hora y, si se da, por el paciente.
const fila = (page: Page, hora: string, texto?: string) => {
  const porHora = page.getByRole("row").filter({ hasText: hora });
  return texto ? porHora.filter({ hasText: texto }) : porHora;
};

test("agenda: registrar pacientes, agendar, doble reserva, confirmar, reprogramar y cancelar", async ({ page, browser }) => {
  test.setTimeout(300_000);
  await prepararPagina(page);
  await iniciarSesion(page, variable("E2E_ADMINISTRATIVO_EMAIL"), variable("E2E_ADMINISTRATIVO_PASSWORD"), {
    totpSecret: variable("E2E_ADMINISTRATIVO_TOTP_SECRET"),
  });
  await esperarArea(page, "/administrativo", "Panel administrativo");

  // Sin datos de demostración no hay médicos con horario: se omite con un aviso.
  await page.goto("/administrativo/agenda");
  await expect(page.getByRole("heading", { name: "Agenda del día" })).toBeVisible();
  const medicos = await page.locator("#filtro-medico option").evaluateAll((os) =>
    (os as HTMLOptionElement[]).map((o) => ({ valor: o.value, texto: o.textContent ?? "" })).filter((o) => o.valor),
  );
  test.skip(medicos.length === 0, "Sin datos de demostración (no hay médicos): ver docs/07-testing/datos-demo.md");
  const medico = medicos.find((m) => m.texto.includes("Medicina general")) ?? medicos[0]!;
  await capturar(page, "01-agenda-hoy");

  let idA = "";
  let idB = "";
  const nombreA = `E2E Agenda A${base}`;
  const nombreB = `E2E Agenda B${base}`;

  await test.step("registrar: un DNI de 7 dígitos muestra su mensaje bajo el campo", async () => {
    await page.goto("/administrativo/pacientes");
    await page.getByLabel("Número de documento").fill("1234567");
    await page.getByLabel("Nombres").fill("Prueba");
    await page.getByLabel("Apellidos").fill("Invalida");
    await page.getByRole("button", { name: "Registrar paciente" }).click();
    await expect(page.getByText("El DNI debe tener 8 dígitos").first()).toBeVisible();
    await capturar(page, "02-pacientes-con-errores");
  });

  await test.step("registrar: dos pacientes nuevos y un duplicado que ofrece abrir al existente", async () => {
    await registrarPaciente(page, documento(1), "E2E", nombreA);
    await expect(page.getByText("Paciente registrado")).toBeVisible();
    idA = new URL((await page.getByRole("link", { name: "Agendar una cita para este paciente" }).getAttribute("href"))!, "http://x").searchParams.get("paciente")!;
    expect(idA).toMatch(/^[0-9a-f-]{36}$/);

    await registrarPaciente(page, documento(2), "E2E", nombreB);
    await expect(page.getByText("Paciente registrado")).toBeVisible();
    idB = new URL((await page.getByRole("link", { name: "Agendar una cita para este paciente" }).getAttribute("href"))!, "http://x").searchParams.get("paciente")!;

    await registrarPaciente(page, documento(1), "Otro", "Duplicado");
    await expect(page.getByText("Ya existe un paciente con ese documento").first()).toBeVisible();
    await page.getByRole("link", { name: "Abrir el paciente existente" }).click();
    await expect(page).toHaveURL(new RegExp(`q=${documento(1)}`));
    await expect(page.getByRole("row").filter({ hasText: nombreA })).toBeVisible();
    await capturar(page, "03-pacientes-busqueda");
  });

  const urlNueva = (paciente: string) => `/administrativo/agenda/nueva?paciente=${paciente}&medico=${medico.valor}&fecha=${DIA}`;
  const horarios = (p: Page) => p.getByRole("group", { name: "Horarios disponibles" }).getByRole("button");
  const limiteDe = (hora: string) => {
    const [h, m] = hora.split(":").map(Number);
    return `${String(h! - 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  let s1 = "";
  await test.step("agendar: muestra la advertencia con la hora límite de Lima y reserva", async () => {
    await page.goto(urlNueva(idA));
    await expect(page.getByRole("heading", { name: "Agendar cita" })).toBeVisible();
    await expect(horarios(page).first()).toBeVisible();
    s1 = (await horarios(page).first().innerText()).trim();
    await horarios(page).first().click();
    await expect(
      page.getByText(`Informe al paciente: la cita solo puede cancelarse hasta 1 hora antes, a las ${limiteDe(s1)}.`),
    ).toBeVisible();
    await capturar(page, "04-agendar-con-resumen");
    await page.getByRole("button", { name: "Reservar cita" }).click();
    await expect(page).toHaveURL(new RegExp(`/administrativo/agenda\\?fecha=${DIA}`));
    await expect(page.getByText(`Cita reservada para las ${s1}.`)).toBeVisible();
    await expect(fila(page, s1, nombreA).getByText("Reservada")).toBeVisible();
    await capturar(page, "05-agenda-con-cita");
  });

  let s2 = "";
  await test.step("doble reserva: desde un segundo contexto, el horario tomado da el mensaje exacto", async () => {
    const segundo = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
      storageState: await page.context().storageState(),
    });
    const page2 = await segundo.newPage();
    try {
      await prepararPagina(page2);
      await page.goto(urlNueva(idA));
      await page2.goto(urlNueva(idB));
      await expect(horarios(page).first()).toBeVisible();
      await expect(horarios(page2).first()).toBeVisible();
      s2 = (await horarios(page).first().innerText()).trim();
      expect((await horarios(page2).first().innerText()).trim()).toBe(s2);
      await horarios(page).first().click();
      await horarios(page2).first().click();

      await page.getByRole("button", { name: "Reservar cita" }).click();
      await expect(page.getByText(`Cita reservada para las ${s2}.`)).toBeVisible();

      await page2.getByRole("button", { name: "Reservar cita" }).click();
      await expect(page2.getByRole("alert").filter({ hasText: "Registro de cita ya agendado" })).toBeVisible();
      await capturar(page2, "06-doble-reserva");
      // la lista se vuelve a leer: el horario tomado ya no se ofrece
      await expect(horarios(page2).filter({ hasText: s2 })).toHaveCount(0);
    } finally {
      await segundo.close();
    }
  });

  await test.step("confirmar: la insignia pasa a «Confirmada» y «No asistió» aún no se ofrece", async () => {
    await page.goto(`/administrativo/agenda?fecha=${DIA}&medico=${medico.valor}`);
    const f = fila(page, s1, nombreA);
    await f.getByRole("button", { name: /^Confirmar/ }).click();
    await expect(page.getByText(`Cita de las ${s1} confirmada.`)).toBeVisible();
    await expect(f.getByText("Confirmada")).toBeVisible();
    await expect(f.getByRole("button", { name: /No asistió/ })).toHaveCount(0);
    await expect(f.getByRole("button", { name: /^Confirmar/ })).toHaveCount(0);
  });

  let s3 = "";
  await test.step("reprogramar: la original queda cancelada y nace una nueva reservada", async () => {
    await page.goto(`/administrativo/agenda?fecha=${DIA}&medico=${medico.valor}`);
    await fila(page, s2, nombreA).getByRole("link", { name: /^Reprogramar/ }).click();
    await expect(page.getByRole("heading", { name: "Reprogramar cita" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Cita actual" })).toBeVisible();
    await expect(horarios(page).first()).toBeVisible();
    s3 = (await horarios(page).first().innerText()).trim();
    await horarios(page).first().click();
    await capturar(page, "07-reprogramar");
    await page.getByRole("button", { name: "Reprogramar cita" }).click();
    await expect(page).toHaveURL(new RegExp(`/administrativo/agenda\\?fecha=${DIA}`));
    await expect(page.getByText(`Cita reprogramada para las ${s3}.`)).toBeVisible();
    await expect(fila(page, s2, nombreA).getByText("Cancelada")).toBeVisible();
    await expect(fila(page, s3, nombreA).getByText("Reservada")).toBeVisible();
  });

  await test.step("cancelar: con confirmación; la cita queda «Cancelada» sin acciones", async () => {
    const f = fila(page, s1, nombreA);
    await f.getByRole("button", { name: /^Cancelar/ }).click();
    const dialogo = page.getByRole("alertdialog", { name: "¿Cancelar esta cita?" });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Volver" })).toBeFocused();
    await capturar(page, "08-dialogo-cancelar");
    await dialogo.getByRole("button", { name: "Cancelar cita" }).click();
    await expect(page.getByText("Cita cancelada. El horario quedó libre.")).toBeVisible();
    await expect(dialogo).toBeHidden();
    const cancelada = fila(page, s1, nombreA);
    await expect(cancelada.getByText("Cancelada")).toBeVisible();
    await expect(cancelada.getByRole("button")).toHaveCount(0);
    await expect(cancelada.getByRole("link")).toHaveCount(0);
    await capturar(page, "09-agenda-cancelada");
  });

  await test.step("limpiar: se cancela la cita reprogramada que quedó vigente", async () => {
    await fila(page, s3, nombreA).getByRole("button", { name: /^Cancelar/ }).click();
    await page.getByRole("alertdialog", { name: "¿Cancelar esta cita?" }).getByRole("button", { name: "Cancelar cita" }).click();
    await expect(fila(page, s3, nombreA).getByText("Cancelada")).toBeVisible();
  });
});
