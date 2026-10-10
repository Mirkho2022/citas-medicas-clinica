// Regla de presentación de la ventana de cancelación (H2b, tarea 4.3). Ejecutar con: npm run test:tema
import assert from "node:assert/strict";
import { test } from "node:test";
import { puedeCancelar } from "../../lib/ui/cancelacion.ts";

const INICIO = "2026-10-14T19:30:00Z"; // 14:30 en Lima

test("se puede cancelar con 1 hora o más de anticipación (igual que el disparador de la base de datos)", () => {
  assert.equal(puedeCancelar("reservada", INICIO, new Date("2026-10-14T18:30:00Z")), true); // exactamente 1 h
  assert.equal(puedeCancelar("confirmada", INICIO, new Date("2026-10-13T12:00:00Z")), true);
});

test("con menos de 1 hora ya no se puede cancelar", () => {
  assert.equal(puedeCancelar("reservada", INICIO, new Date("2026-10-14T18:30:01Z")), false);
  assert.equal(puedeCancelar("reservada", INICIO, new Date("2026-10-14T19:31:00Z")), false); // ya pasó
});

test("una cita que no está activa no se puede cancelar", () => {
  const antes = new Date("2026-10-13T12:00:00Z");
  for (const estado of ["atendida", "cancelada", "no_asistio"] as const) {
    assert.equal(puedeCancelar(estado, INICIO, antes), false, estado);
  }
});
