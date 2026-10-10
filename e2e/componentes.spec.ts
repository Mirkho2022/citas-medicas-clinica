import { expect, test, type Page } from "@playwright/test";
import { iniciarSesion, prepararPagina, variable } from "./helpers";

// H2b, grupo 4: comportamiento de los componentes del sistema de diseño, probado sobre la galería (/guia-de-estilo) con
// los datos sintéticos de lib/ui/ejemplos.ts. Se inicia sesión una sola vez para todo el archivo.
test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }) => {
  const contexto = await browser.newContext();
  page = await contexto.newPage();
  await prepararPagina(page);
  await iniciarSesion(
    page,
    variable("E2E_PACIENTE_EMAIL"),
    variable("E2E_PACIENTE_PASSWORD"),
  );
  await page.goto("/guia-de-estilo");
  await expect(page.getByRole("heading", { name: "Guía de estilo" })).toBeVisible();
});

test.afterAll(async () => {
  await page.context().close();
});

const seccion = (nombre: string) => page.getByRole("region", { name: nombre });

test("4.1 cada estado de cita lleva etiqueta, icono oculto a lectores y texto", async () => {
  const esperados: Array<[string, string]> = [
    ["reservada", "Reservada"],
    ["confirmada", "Confirmada"],
    ["atendida", "Atendida"],
    ["cancelada", "Cancelada"],
    ["no_asistio", "No asistió"],
  ];
  for (const [estado, etiqueta] of esperados) {
    const insignia = seccion("Insignias de estado").locator(`[data-estado="${estado}"]`);
    await expect(insignia).toHaveText(etiqueta);
    await expect(insignia.locator('svg[aria-hidden="true"]')).toHaveCount(1);
  }
});

test("4.1 la alerta de error se anuncia como alerta y la doble reserva se muestra tal cual", async () => {
  const alertas = seccion("Alertas");
  const error = alertas.getByRole("alert");
  await expect(error).toHaveCount(1);
  await expect(error).toHaveText("Registro de cita ya agendado");
  // Los demás tonos se anuncian como estado, no como alerta.
  await expect(alertas.getByRole("status")).toHaveCount(3);
  await expect(alertas.locator('svg[aria-hidden="true"]')).toHaveCount(4);
});

test("4.2 cada campo tiene su etiqueta y el error se asocia al campo", async () => {
  await expect(page.getByLabel("Nombres (obligatorio)", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Motivo de consulta")).toBeVisible();

  const dni = page.locator("#g-dni");
  await expect(dni).toHaveAttribute("aria-invalid", "true");
  const describedBy = (await dni.getAttribute("aria-describedby")) ?? "";
  expect(describedBy.split(" ")).toContain("g-dni-error");
  const error = page.locator("#g-dni-error");
  await expect(error).toHaveAttribute("role", "alert");
  await expect(error).toContainText("El DNI debe tener 8 dígitos");
  await expect(error.locator('svg[aria-hidden="true"]')).toHaveCount(1);
});

test("4.2 el dato de solo lectura se puede seleccionar y no está deshabilitado", async () => {
  const dato = page.locator("#g-registro");
  await expect(dato).toBeEnabled();
  await expect(dato).toHaveAttribute("readonly", "");
  await expect(dato).not.toHaveAttribute("disabled", /.*/);
  await expect(seccion("Campos de formulario").getByText("Solo lectura").first()).toBeVisible();
  const seleccionados = await dato.evaluate((el: HTMLInputElement) => {
    el.select();
    return el.selectionEnd! - el.selectionStart!;
  });
  expect(seleccionados).toBe("Rosa Ejemplo Quispe".length);
});

test("4.2 el campo de documento muestra el formato de DNI y de Carné de Extranjería", async () => {
  await expect(page.getByText("8 dígitos, por ejemplo 12345678.")).toBeVisible();
  await expect(page.getByText("De 9 a 12 letras o números, sin espacios.")).toBeVisible();
  // Cambiar el tipo cambia la ayuda.
  await page.locator("#g-doc-dni-tipo").selectOption("CE");
  await expect(page.getByText("8 dígitos, por ejemplo 12345678.")).toHaveCount(0);
  await expect(page.getByText("De 9 a 12 letras o números, sin espacios.")).toHaveCount(2);
  await page.locator("#g-doc-dni-tipo").selectOption("DNI");
});

test("4.3 elegir las 14:30 muestra la hora límite 13:30 y un horario ocupado no se puede elegir", async () => {
  const selector = seccion("Selector de horario");
  await expect(selector.getByText(/a las 13:30/)).toHaveCount(0);

  const a1430 = selector.getByRole("button", { name: "14:30" });
  await a1430.click();
  await expect(a1430).toHaveAttribute("aria-pressed", "true");
  await expect(selector.getByText("Podrá cancelar esta cita hasta 1 hora antes, a las 13:30.")).toBeVisible();

  const ocupado = selector.getByRole("button", { name: /15:00/ });
  await expect(ocupado).toBeDisabled();
  await expect(ocupado).toContainText("No disponible");
  await expect(selector.locator('input[name="inicio"]')).toHaveValue("2026-10-14T19:30:00Z");
});

test("4.3 la tarjeta ofrece cancelar solo mientras se pueda", async () => {
  const tarjetas = seccion("Tarjetas de cita");
  // Una cita futura, una a 30 minutos y una pasada sin atender: solo la primera se puede cancelar.
  await expect(tarjetas.getByRole("button", { name: "Cancelar cita" })).toHaveCount(1);
  await expect(tarjetas.getByText("Puede cancelar hasta las 13:30.")).toHaveCount(1);
  await expect(tarjetas.getByText("14/10/2026")).toBeVisible();
  await expect(tarjetas.getByText("14:30")).toBeVisible();
});

test("4.4 una fila cancelada no ofrece reprogramar y las activas sí", async () => {
  const tabla = seccion("Tabla de agenda").getByRole("table", { name: "Agenda de ejemplo" });
  const filas = tabla.getByRole("row");
  for (const estado of ["Cancelada", "Atendida", "No asistió"]) {
    const fila = filas.filter({ has: page.getByText(estado, { exact: true }) });
    await expect(fila).toHaveCount(1);
    await expect(fila.getByRole("button", { name: "Reprogramar" })).toHaveCount(0);
  }
  for (const estado of ["Reservada", "Confirmada"]) {
    const activas = filas.filter({ has: page.getByText(estado, { exact: true }) });
    await expect(activas.first().getByRole("button", { name: "Reprogramar" })).toBeVisible();
  }
  await expect(seccion("Tabla de agenda").getByText("No hay citas para este filtro.")).toBeVisible();
});

test("4.4 la atención firmada tiene sello, datos de solo lectura, addenda y ningún botón de editar", async () => {
  const atencion = seccion("Atención firmada");
  await expect(atencion.getByText("Firmada", { exact: true })).toBeVisible();
  await expect(atencion.getByRole("button", { name: /editar|modificar/i })).toHaveCount(0);
  await expect(atencion.getByRole("button", { name: "Agregar addenda" })).toBeVisible();
  await expect(atencion.locator("#g-atencion-nombres")).toHaveAttribute("readonly", "");
});

test("4.4 a 390 px la galería no desborda horizontalmente", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Guía de estilo" })).toBeVisible();
  const desborda = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(desborda).toBe(false);
});
