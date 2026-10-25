// Recorrido por TODAS las pantallas y estados del portal del paciente, para las E2E que miran cada una con la misma vara: la accesibilidad
// con axe (e2e/portal-accesibilidad.spec.ts) y el diseño adaptable (e2e/portal-responsive.spec.ts). Cada pantalla se anuncia con `ver(nombre)`.
// Usa el escenario de e2e/datos-portal.ts (médico con agenda abierta las 24 horas, dos pacientes) y deja la agenda del médico vacía al terminar.
import { expect, type Page } from "@playwright/test";
import {
  asegurarPerfilCuenta2,
  idPaciente2,
  borrarCitasDelMedico,
  dejarCuenta2SinFicha,
  ESPECIALIDAD_E2E,
  hoyEnLima,
  instanteDeLima,
  NOMBRE_MEDICO_E2E,
  restaurarPaciente2,
  sembrarCita,
  sumarDiasA,
  type EscenarioPortal,
} from "./datos-portal";

export type Ver = (nombre: string) => Promise<void>;

const titulo = (page: Page, nombre: string | RegExp) => page.getByRole("heading", { name: nombre, level: 1 });

// Segundo paciente, sin ficha: la espera de la cuenta en preparación, «Complete su registro» vacío y con errores.
export async function recorrerRegistro(page: Page, ver: Ver): Promise<void> {
  await dejarCuenta2SinFicha({ sinPerfil: true });
  await page.goto("/completar-registro");
  await expect(page.getByText("Estamos preparando su cuenta…")).toBeVisible();
  await ver("Complete su registro: en espera");

  await asegurarPerfilCuenta2();
  await expect(page.getByLabel("Número de documento")).toBeVisible({ timeout: 30_000 });
  await ver("Complete su registro: vacío");

  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("El DNI debe tener 8 dígitos")).toBeVisible();
  await ver("Complete su registro: con errores");
}

// Segundo paciente, con su ficha estándar y sin citas: «Inicio» y «Mis citas» vacío.
export async function recorrerPacienteSinCitas(page: Page, ver: Ver): Promise<void> {
  await restaurarPaciente2();
  await page.goto("/paciente");
  await expect(page.getByRole("heading", { name: "Portal del paciente" })).toBeVisible();
  await ver("Inicio sin citas");
  await page.goto("/paciente/citas");
  await expect(titulo(page, "Mis citas")).toBeVisible();
  await expect(page.getByText("Todavía no tiene citas.")).toBeVisible();
  await ver("Mis citas vacío");
}

// Primer paciente: «Inicio», «Mis citas» con datos, el diálogo de cancelación y cada paso de «Reservar», con la confirmación, la alerta de
// horario tomado por otra persona y la cita reservada. `teclado` recorre los pasos con el teclado en lugar del ratón.
export async function recorrerPortalConCitas(page: Page, escenario: EscenarioPortal, ver: Ver): Promise<void> {
  await restaurarPaciente2();
  await borrarCitasDelMedico(escenario);
  const hoy = hoyEnLima();
  const dia = sumarDiasA(hoy, 15);
  await sembrarCita(escenario, escenario.paciente1, instanteDeLima(sumarDiasA(hoy, 14), "12:00"));

  await page.goto("/paciente");
  await expect(page.getByRole("heading", { name: "Portal del paciente" })).toBeVisible();
  await ver("Inicio con una próxima cita");

  await page.goto("/paciente/citas");
  await expect(titulo(page, "Mis citas")).toBeVisible();
  await expect(page.getByRole("region", { name: "Próximas" })).toContainText(NOMBRE_MEDICO_E2E);
  await ver("Mis citas con datos");

  await page.getByRole("button", { name: "Cancelar cita", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await ver("Diálogo de cancelación");
  await page.getByRole("button", { name: "No cancelar" }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();

  await page.goto("/paciente/citas/nueva");
  await expect(titulo(page, "Reservar cita")).toBeVisible();
  await ver("Reservar: especialidad");

  await page.getByRole("link", { name: ESPECIALIDAD_E2E }).click();
  await expect(titulo(page, "Elija un médico")).toBeVisible();
  await ver("Reservar: médico");

  await page.getByRole("link", { name: new RegExp(NOMBRE_MEDICO_E2E) }).click();
  await expect(titulo(page, "Elija un día")).toBeVisible();
  await ver("Reservar: día");

  await page.locator(`a[href*="dia=${dia}"]`).click();
  await expect(titulo(page, "Elija un horario")).toBeVisible();
  await ver("Reservar: horario");

  await page.getByRole("button", { name: "09:20" }).click();
  await expect(titulo(page, "Confirme su cita")).toBeVisible();
  await ver("Reservar: confirmación");

  // Otra persona toma ese horario mientras esta pantalla sigue abierta: se vuelve a los horarios con su alerta. (El literal exacto
  // `Registro de cita ya agendado` de la carrera real entre dos pacientes lo cubre e2e/portal-reserva.spec.ts.)
  await sembrarCita(escenario, await idPaciente2(), instanteDeLima(dia, "09:20"));
  await page.getByRole("button", { name: "Confirmar cita" }).click();
  await expect(page.getByText("El horario elegido ya no está disponible. Elija otro horario.")).toBeVisible({ timeout: 30_000 });
  await ver("Reservar: alerta de horario tomado");

  await page.getByRole("button", { name: "09:40" }).click();
  await expect(titulo(page, "Confirme su cita")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar cita" }).click();
  await expect(titulo(page, "Su cita quedó reservada")).toBeVisible({ timeout: 30_000 });
  await ver("Reservar: cita reservada");

  await borrarCitasDelMedico(escenario);
}
