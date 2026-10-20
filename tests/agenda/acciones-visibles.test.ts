// Pruebas de lib/citas/acciones-visibles.ts (H3, tareas 10.1, 10.3 y 10.4): qué botones ofrece cada fila de la agenda según el
// estado y la hora. Ejecutar con: npm run test:agenda. La autoridad real son los disparadores de la base de datos; esto solo
// decide qué se muestra, y por eso las reglas se prueban en sus bordes exactos.
import assert from "node:assert/strict";
import { test } from "node:test";
import { accionesVisibles, TEXTO_MENOS_DE_UNA_HORA, type DatosAcciones } from "../../lib/citas/acciones-visibles.ts";
import type { EstadoCita } from "../../lib/ui/estados-cita.ts";

const AHORA = new Date("2026-10-20T15:00:00.000Z");
const enMinutos = (min: number) => new Date(AHORA.getTime() + min * 60_000).toISOString();

function cita(estado: EstadoCita, inicioEnMin: number, duracionMin = 20, porBaja = false): DatosAcciones {
  return { estado, inicio: enMinutos(inicioEnMin), fin: enMinutos(inicioEnMin + duracionMin), porBaja };
}

test("una reservada futura ofrece confirmar, reprogramar y cancelar, y ninguna otra", () => {
  assert.deepEqual(accionesVisibles(cita("reservada", 180), AHORA), {
    confirmar: true,
    noAsistio: false,
    cancelar: true,
    reprogramar: true,
    avisoMenosDeUnaHora: false,
  });
});

test("una confirmada futura no ofrece confirmar ni «No asistió», pero sí cancelar y reprogramar", () => {
  assert.deepEqual(accionesVisibles(cita("confirmada", 180), AHORA), {
    confirmar: false,
    noAsistio: false,
    cancelar: true,
    reprogramar: true,
    avisoMenosDeUnaHora: false,
  });
});

test("la ventana es de 1 hora exacta: a 60 minutos todavía se cancela; a 59, no, y la fila lo explica", () => {
  assert.equal(accionesVisibles(cita("reservada", 60), AHORA).cancelar, true);
  const a59 = accionesVisibles(cita("reservada", 59), AHORA);
  assert.equal(a59.cancelar, false);
  assert.equal(a59.reprogramar, false);
  assert.equal(a59.avisoMenosDeUnaHora, true);
  assert.equal(TEXTO_MENOS_DE_UNA_HORA, "Falta menos de 1 hora: ya no se puede cancelar ni reprogramar");
});

test("con una baja del médico que cubre la cita, la ventana no aplica (ADR-0011)", () => {
  const a = accionesVisibles(cita("confirmada", 10, 20, true), AHORA);
  assert.equal(a.cancelar, true);
  assert.equal(a.reprogramar, true);
  assert.equal(a.avisoMenosDeUnaHora, false);
});

test("«No asistió» solo se ofrece en una confirmada cuya hora ya empezó (borde: exactamente al inicio)", () => {
  assert.equal(accionesVisibles(cita("confirmada", 1), AHORA).noAsistio, false);
  assert.equal(accionesVisibles(cita("confirmada", 0), AHORA).noAsistio, true);
  assert.equal(accionesVisibles(cita("confirmada", -30), AHORA).noAsistio, true);
  // una reservada que ya empezó no se marca «No asistió»: primero tendría que confirmarse
  assert.equal(accionesVisibles(cita("reservada", -10), AHORA).noAsistio, false);
});

test("confirmar solo mientras la cita no terminó (borde: exactamente al fin)", () => {
  assert.equal(accionesVisibles(cita("reservada", -10, 20), AHORA).confirmar, true); // fin en +10 min
  assert.equal(accionesVisibles(cita("reservada", -20, 20), AHORA).confirmar, false); // fin == ahora
  assert.equal(accionesVisibles(cita("reservada", -120, 20), AHORA).confirmar, false);
});

test("una cita en curso con menos de una hora muestra el aviso en vez de botones apagados", () => {
  const a = accionesVisibles(cita("confirmada", -5), AHORA);
  assert.deepEqual(a, { confirmar: false, noAsistio: true, cancelar: false, reprogramar: false, avisoMenosDeUnaHora: true });
});

test("una cita cancelada, atendida o «No asistió» no ofrece ninguna acción ni aviso", () => {
  for (const estado of ["cancelada", "atendida", "no_asistio"] as const) {
    for (const inicio of [-300, 5, 600]) {
      assert.deepEqual(
        accionesVisibles(cita(estado, inicio), AHORA),
        { confirmar: false, noAsistio: false, cancelar: false, reprogramar: false, avisoMenosDeUnaHora: false },
        `${estado} a ${inicio} min`,
      );
    }
  }
});
