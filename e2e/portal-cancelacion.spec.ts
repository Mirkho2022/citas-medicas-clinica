import { expect, test, type Page } from "@playwright/test";
import {
  borrarCitasDelMedico,
  citasDe,
  estadoDeCita,
  hayBaseDeDatos,
  hoyEnLima,
  inicioEnMenosDeUnaHora,
  instanteDeLima,
  moverCita,
  NOMBRE_MEDICO_E2E,
  prepararEscenario,
  retirarEscenario,
  sembrarCita,
  sumarDiasA,
  traspasarCita,
  type EscenarioPortal,
} from "./datos-portal";
import { esperarArea, iniciarSesion, prepararPagina, variable } from "./helpers";

// «Mis citas» y cancelación del portal (H4, tarea 7.3; specs/mis-citas-y-cancelacion): cancelar una cita lejana, la ventana de 1 hora (sin botón
// y, con la pantalla desactualizada, con el mensaje del servidor), una cita que ya no es del paciente, el doble envío y que no hay «Reprogramar».
//
// Usan el médico de prueba y la ficha del segundo paciente de e2e/datos-portal.ts: sin `E2E_DATABASE_URL` (ni `DATABASE_URL_UNPOOLED` en
// .env.local) o sin la segunda cuenta de paciente se omiten con un aviso. Las citas se siembran a 14 días (o a menos de 1 hora, la que prueba la
// ventana) y cada prueba deja la agenda del médico vacía.
test.describe.configure({ mode: "serial" });

const faltaAlgo = !hayBaseDeDatos() || !process.env.E2E_PACIENTE2_EMAIL || !process.env.E2E_PACIENTE2_PASSWORD;
test.skip(
  faltaAlgo,
  "Necesitan E2E_DATABASE_URL (o DATABASE_URL_UNPOOLED) y E2E_PACIENTE2_EMAIL/E2E_PACIENTE2_PASSWORD: ver docs/pruebas-e2e.md",
);

let escenario: EscenarioPortal;
const DIA = sumarDiasA(hoyEnLima(), 14);
const MIS_CITAS = "/paciente/citas";

test.beforeAll(async () => {
  escenario = await prepararEscenario();
});

test.beforeEach(async () => {
  await borrarCitasDelMedico(escenario);
});

test.afterAll(async () => {
  await retirarEscenario();
});

async function entrar(page: Page): Promise<void> {
  await prepararPagina(page);
  await iniciarSesion(page, variable("E2E_PACIENTE_EMAIL"), variable("E2E_PACIENTE_PASSWORD"));
  await esperarArea(page, "/paciente", "Portal del paciente");
}

const abrirMisCitas = async (page: Page) => {
  await page.goto(MIS_CITAS);
  await expect(page.getByRole("heading", { name: "Mis citas", level: 1 })).toBeVisible();
};
const botonDeLaTarjeta = (page: Page) => page.getByRole("button", { name: "Cancelar cita", exact: true });
const dialogo = (page: Page) => page.getByRole("alertdialog");
const confirmarEnElDialogo = (page: Page) => dialogo(page).getByRole("button", { name: "Cancelar cita", exact: true });

test("cancelar una cita lejana la pasa a «Anteriores» como «Cancelada» y su horario vuelve a la búsqueda", async ({ page }) => {
  const citaId = await sembrarCita(escenario, escenario.paciente1, instanteDeLima(DIA, "12:00"));
  await entrar(page);
  await abrirMisCitas(page);

  const proximas = page.getByRole("region", { name: "Próximas" });
  await expect(proximas).toContainText(NOMBRE_MEDICO_E2E);
  await expect(proximas.getByText("Reservada")).toBeVisible();

  await botonDeLaTarjeta(page).click();
  await expect(dialogo(page)).toBeVisible();
  await expect(dialogo(page)).toContainText("Esta acción no se puede deshacer");
  await expect(dialogo(page)).toContainText(NOMBRE_MEDICO_E2E);
  // El foco empieza en lo seguro.
  await expect(dialogo(page).getByRole("button", { name: "No cancelar" })).toBeFocused();

  await confirmarEnElDialogo(page).click();
  await expect(page.getByText("Su cita fue cancelada.")).toBeVisible();
  await expect(dialogo(page)).toBeHidden();

  // Pasó a «Anteriores», con su estado en texto.
  const anteriores = page.getByRole("region", { name: "Anteriores" });
  await expect(anteriores).toContainText(NOMBRE_MEDICO_E2E);
  await expect(anteriores.getByText("Cancelada")).toBeVisible();
  await expect(page.getByRole("region", { name: "Próximas" })).not.toContainText(NOMBRE_MEDICO_E2E);
  expect(await estadoDeCita(citaId)).toBe("cancelada");
  const [cita] = await citasDe(escenario.paciente1, escenario.medicoId);
  expect(cita!.cancelada_por).not.toBeNull();

  // El horario quedó libre otra vez para quien lo busque.
  await page.goto(`/paciente/citas/nueva?medico=${escenario.medicoId}&dia=${DIA}`);
  await expect(page.getByRole("heading", { name: "Elija un horario" })).toBeVisible();
  await expect(page.getByRole("button", { name: /12:00/ })).toBeEnabled();
});

test("una cita que empieza en menos de 1 hora no ofrece cancelar y dice por qué", async ({ page }) => {
  const citaId = await sembrarCita(escenario, escenario.paciente1, inicioEnMenosDeUnaHora());
  await entrar(page);
  await abrirMisCitas(page);

  await expect(page.getByRole("region", { name: "Próximas" })).toContainText(NOMBRE_MEDICO_E2E);
  await expect(botonDeLaTarjeta(page)).toHaveCount(0);
  await expect(page.getByText("Ya no se puede cancelar por el portal")).toBeVisible();
  expect(await estadoDeCita(citaId)).toBe("reservada");
});

test("con la pantalla desactualizada, forzar el envío dentro de la última hora da el mensaje de la ventana y no cancela", async ({ page }) => {
  const citaId = await sembrarCita(escenario, escenario.paciente1, instanteDeLima(DIA, "12:20"));
  await entrar(page);
  await abrirMisCitas(page);
  await botonDeLaTarjeta(page).click();
  await expect(dialogo(page)).toBeVisible();

  // Mientras el diálogo sigue abierto, la cita pasa a empezar en menos de 1 hora: el servidor decide con SU reloj.
  await moverCita(citaId, inicioEnMenosDeUnaHora());
  await confirmarEnElDialogo(page).click();

  await expect(dialogo(page).getByRole("alert")).toContainText("Ya no es posible cancelar esta cita porque falta menos de 1 hora.");
  await expect(dialogo(page).getByRole("alert")).toContainText("avise a la clínica");
  expect(await estadoDeCita(citaId)).toBe("reservada");

  // Al cerrar, la lista se lee de nuevo y la cita ya no ofrece el botón.
  await dialogo(page).getByRole("button", { name: "Cerrar" }).click();
  await expect(botonDeLaTarjeta(page)).toHaveCount(0);
  await expect(page.getByText("Ya no se puede cancelar por el portal")).toBeVisible();
});

test("cancelar una cita que ya es de otro paciente dice «No encontramos esa cita» y la deja intacta", async ({ page }) => {
  const citaId = await sembrarCita(escenario, escenario.paciente1, instanteDeLima(DIA, "12:40"));
  await entrar(page);
  await abrirMisCitas(page);
  await botonDeLaTarjeta(page).click();
  await expect(dialogo(page)).toBeVisible();

  // La cita deja de ser suya: lo que envía la pantalla ya no corresponde a una cita propia.
  await traspasarCita(citaId, escenario.paciente2);
  await confirmarEnElDialogo(page).click();

  await expect(dialogo(page).getByRole("alert")).toContainText("No encontramos esa cita");
  expect(await estadoDeCita(citaId)).toBe("reservada");
  const [ajena] = await citasDe(escenario.paciente2, escenario.medicoId);
  expect(ajena).toMatchObject({ id: citaId, estado: "reservada", cancelada_por: null });
});

test("el doble clic en «Cancelar cita» cancela una sola vez y no muestra un error", async ({ page }) => {
  const citaId = await sembrarCita(escenario, escenario.paciente1, instanteDeLima(DIA, "13:00"));
  await entrar(page);
  await abrirMisCitas(page);
  await botonDeLaTarjeta(page).click();
  await expect(dialogo(page)).toBeVisible();

  await confirmarEnElDialogo(page).dblclick();
  await expect(page.getByText("Su cita fue cancelada.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Anteriores" }).getByText("Cancelada")).toBeVisible();
  // El anunciador de rutas de Next también es un `role="alert"` (fuera de `main`): solo cuentan las alertas de la pantalla.
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("ya está cancelada");
  expect(await estadoDeCita(citaId)).toBe("cancelada");
});

test("el portal no ofrece reprogramar", async ({ page }) => {
  await sembrarCita(escenario, escenario.paciente1, instanteDeLima(DIA, "13:20"));
  await entrar(page);
  await abrirMisCitas(page);
  await expect(page.getByRole("region", { name: "Próximas" })).toContainText(NOMBRE_MEDICO_E2E);
  await expect(page.getByText(/reprogramar/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /reprogramar/i })).toHaveCount(0);
  await botonDeLaTarjeta(page).click();
  await expect(dialogo(page)).toBeVisible();
  await expect(dialogo(page).getByText(/reprogramar/i)).toHaveCount(0);
});
