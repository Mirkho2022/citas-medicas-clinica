import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { esperarArea, iniciarSesion, prepararPagina, variable } from "./helpers";

// Bajas médicas y reasignación (H3, tarea 12.2; specs/reasignacion-por-baja-medica y disponibilidad-y-slots): agendar dos citas con
// el médico de Medicina general 14 días adelante, registrar una ausencia que las cubra (el aviso dice cuántas caen dentro y enlaza a
// reasignar), reasignar UNA al sustituto sembrado (el segundo médico de Medicina general), confirmar la cita nueva y dejar la otra
// por reasignar; al terminar se cancelan las citas y se borra la ausencia. Negativo: un paciente que abre /administrativo/bajas es
// devuelto a su área sin ver el contenido. Necesita los datos de demostración (docs/datos-demo.md); sin ellos se omite con un aviso.
// La marca «Contactar al paciente» (cita sin ningún sustituto libre) no se puede provocar desde la interfaz sin dar de baja al
// sustituto: la cubre tests/integracion/consultas.test.ts contra la base real.
//
// Con CAPTURAS_H3=<carpeta> guarda capturas de los pasos clave (revisión visual, tarea 13.3).
test.describe.configure({ mode: "serial" });

const hoyEnLima = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
function diaLaborableDentroDe(dias: number): string {
  const d = new Date(`${hoyEnLima()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const base = Number(String(Date.now()).slice(-6));
const documento = (n: number) => `98${String(base + n).padStart(6, "0").slice(-6)}`;
// Un día distinto del de agenda.spec (14 días) para que ninguna prueba toque los horarios de la otra.
const DIA = diaLaborableDentroDe(17);
const MOTIVO = `Baja E2E ${base}`;

async function capturar(page: Page, nombre: string): Promise<void> {
  const carpeta = process.env.CAPTURAS_H3;
  if (carpeta) await page.screenshot({ path: `${carpeta}/${nombre}.png`, fullPage: true });
}

async function registrarPaciente(page: Page, doc: string, apellidos: string): Promise<string> {
  await page.goto("/administrativo/pacientes");
  await page.getByLabel("Número de documento").fill(doc);
  await page.getByLabel("Nombres").fill("Baja");
  await page.getByLabel("Apellidos").fill(apellidos);
  await page.getByLabel("Fecha de nacimiento").fill("1988-03-09");
  await page.locator("fieldset", { hasText: "Sexo" }).getByText("M", { exact: true }).click();
  await page.getByLabel("Correo electrónico").fill(`e2e${doc}@demo.invalid`);
  await page.getByRole("button", { name: "Registrar paciente" }).click();
  await expect(page.getByText("Paciente registrado")).toBeVisible();
  const href = await page.getByRole("link", { name: "Agendar una cita para este paciente" }).getAttribute("href");
  return new URL(href!, "http://x").searchParams.get("paciente")!;
}

async function agendar(page: Page, pacienteId: string, medicoId: string, indiceHorario: number): Promise<string> {
  await page.goto(`/administrativo/agenda/nueva?paciente=${pacienteId}&medico=${medicoId}&fecha=${DIA}`);
  const horarios = page.getByRole("group", { name: "Horarios disponibles" }).getByRole("button");
  await expect(horarios.first()).toBeVisible();
  const hora = (await horarios.nth(indiceHorario).innerText()).trim();
  await horarios.nth(indiceHorario).click();
  await page.getByRole("button", { name: "Reservar cita" }).click();
  await expect(page.getByText(`Cita reservada para las ${hora}.`)).toBeVisible();
  return hora;
}

const fila = (page: Page, hora: string, texto: string) => page.getByRole("row").filter({ hasText: hora }).filter({ hasText: texto });

test("bajas: una ausencia cubre dos citas, se reasigna una al sustituto y la otra queda por reasignar", async ({ page }) => {
  test.setTimeout(300_000);
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
  test.skip(generales.length < 2, "Sin datos de demostración (hacen falta dos médicos de Medicina general): ver docs/datos-demo.md");
  const [titular, sustituto] = generales as [(typeof generales)[number], (typeof generales)[number]];
  const nombreTitular = titular.texto.split(" · ")[0]!;
  const nombreSustituto = sustituto.texto.split(" · ")[0]!;

  await test.step("Bajas médicas y Horarios son enlaces de la navegación", async () => {
    const nav = page.getByRole("navigation", { name: "Principal" });
    await expect(nav.getByRole("link", { name: "Bajas médicas" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Horarios" })).toBeVisible();
  });

  const apellidoA = `Baja A${base}`;
  const apellidoB = `Baja B${base}`;
  let idA = "";
  let idB = "";
  await test.step("registrar dos pacientes y agendar sus citas con el titular", async () => {
    idA = await registrarPaciente(page, documento(1), apellidoA);
    idB = await registrarPaciente(page, documento(2), apellidoB);
  });
  const horaA = await agendar(page, idA, titular.valor, 0);
  const horaB = await agendar(page, idB, titular.valor, 1);

  await test.step("la ausencia dice cuántas citas caen dentro y enlaza a reasignarlas", async () => {
    await page.goto("/administrativo/horarios");
    await expect(page.getByRole("heading", { name: "Horarios", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: new RegExp(`Ver horarios de ${nombreTitular}`) }).click();
    await expect(page.getByRole("heading", { name: nombreTitular, level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Agregar ausencia" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar ausencia" });
    await expect(dialogo).toBeVisible();
    await dialogo.getByLabel("Desde").fill(`${DIA}T06:00`);
    await dialogo.getByLabel("Hasta").fill(`${DIA}T14:00`);
    await dialogo.getByLabel("Motivo").fill(MOTIVO);
    await dialogo.getByRole("button", { name: "Guardar ausencia" }).click();
    await expect(page.getByText("Ausencia guardada. 2 citas vigentes caen dentro: reasígnelas.")).toBeVisible();
    const ausencia = page.getByRole("listitem").filter({ hasText: MOTIVO });
    await expect(ausencia.getByText("2 citas vigentes caen dentro de esta ausencia.")).toBeVisible();
    await capturar(page, "10-horarios-con-ausencia");
  });

  await test.step("la lista de bajas cuenta las dos citas por reasignar", async () => {
    await page.goto("/administrativo/bajas");
    const baja = page.getByRole("row").filter({ hasText: MOTIVO });
    await expect(baja).toBeVisible();
    await expect(baja.getByRole("cell").nth(3)).toHaveText("2");
    await capturar(page, "11-bajas-lista");
    await baja.getByRole("link", { name: /^Reasignar/ }).click();
    await expect(page.getByRole("heading", { name: `Baja de ${nombreTitular}`, level: 1 })).toBeVisible();
  });

  await test.step("el detalle propone el mismo horario con el sustituto; accesibilidad sin violaciones", async () => {
    const tarjetaA = page.getByRole("listitem").filter({ hasText: apellidoA });
    await expect(tarjetaA.getByText("Mismo horario").first()).toBeVisible();
    await expect(tarjetaA.getByText(nombreSustituto).first()).toBeVisible();
    await capturar(page, "12-baja-detalle");
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });

  await test.step("reasignar solo la primera: queda la otra, sin tocarla", async () => {
    const tarjetaA = page.getByRole("listitem").filter({ hasText: apellidoA });
    await tarjetaA.getByRole("radio").first().check();
    await expect(page.getByRole("button", { name: "Reasignar 1 cita" })).toBeEnabled();
    await page.getByRole("button", { name: "Reasignar 1 cita" }).click();
    await expect(page.getByText("1 cita reasignada.")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: apellidoA })).toHaveCount(0);
    await expect(page.getByRole("listitem").filter({ hasText: apellidoB })).toBeVisible();
  });

  await test.step("la cita nueva está con el sustituto, reservada, y se puede confirmar", async () => {
    await page.goto(`/administrativo/agenda?fecha=${DIA}&medico=${sustituto.valor}`);
    const nueva = fila(page, horaA, apellidoA);
    await expect(nueva.getByText("Reservada")).toBeVisible();
    await nueva.getByRole("button", { name: /^Confirmar/ }).click();
    await expect(page.getByText(`Cita de las ${horaA} confirmada.`)).toBeVisible();
    await expect(nueva.getByText("Confirmada")).toBeVisible();
    // la original del titular quedó cancelada; la otra sigue vigente
    await page.goto(`/administrativo/agenda?fecha=${DIA}&medico=${titular.valor}`);
    await expect(fila(page, horaA, apellidoA).getByText("Cancelada")).toBeVisible();
    await expect(fila(page, horaB, apellidoB).getByText("Reservada")).toBeVisible();
  });

  await test.step("limpiar: cancelar las citas que quedaron vigentes y borrar la ausencia", async () => {
    const cancelar = async (hora: string, apellido: string) => {
      await fila(page, hora, apellido).getByRole("button", { name: /^Cancelar/ }).click();
      await page.getByRole("alertdialog", { name: "¿Cancelar esta cita?" }).getByRole("button", { name: "Cancelar cita" }).click();
      await expect(fila(page, hora, apellido).getByText("Cancelada")).toBeVisible();
    };
    // La cita de B sigue vigente (la ausencia la cubre, pero no se reasignó): se cancela.
    await cancelar(horaB, apellidoB);
    await page.goto(`/administrativo/agenda?fecha=${DIA}&medico=${sustituto.valor}`);
    await cancelar(horaA, apellidoA);

    await page.goto("/administrativo/horarios");
    await page.getByRole("link", { name: new RegExp(`Ver horarios de ${nombreTitular}`) }).click();
    const ausencia = page.getByRole("listitem").filter({ hasText: MOTIVO });
    await ausencia.getByRole("button", { name: /^Eliminar/ }).click();
    await page.getByRole("alertdialog", { name: "¿Eliminar esta ausencia?" }).getByRole("button", { name: "Eliminar ausencia" }).click();
    await expect(page.getByText("Ausencia eliminada.")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: MOTIVO })).toHaveCount(0);
  });
});

test("un paciente que abre /administrativo/bajas es devuelto a su área sin ver el contenido", async ({ page }) => {
  await prepararPagina(page);
  await iniciarSesion(page, variable("E2E_PACIENTE_EMAIL"), variable("E2E_PACIENTE_PASSWORD"));
  for (const ruta of ["/administrativo/bajas", "/administrativo/horarios", "/administrativo/agenda", "/administrativo/pacientes"]) {
    await page.goto(ruta);
    await expect(page).toHaveURL(/\/paciente$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Bajas médicas" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Portal del paciente" })).toBeVisible();
  }
});
