// Pruebas de lib/medico/horarios.ts (H7, tarea 3.4; design.md, D7). Ejecutar con: npm run test:turnos-dashboard
// El archivo se repite en procesos hijos con TZ=UTC y TZ=Asia/Tokyo (repetirEnZonas): el resultado no depende de la zona.
import assert from "node:assert/strict";
import { test } from "node:test";
import { horariosPorDia, type TramoPlantilla } from "../../lib/medico/horarios.ts";
import { repetirEnZonas } from "./_zonas.ts";

// Plantilla de ejemplo (0 = domingo, como en la base de datos).
const tramo = (diaSemana: number, horaInicio: string, horaFin: string, vigenteDesde = "2020-01-01", vigenteHasta: string | null = null): TramoPlantilla => ({
  diaSemana,
  horaInicio,
  horaFin,
  vigenteDesde,
  vigenteHasta,
});

// 12/10/2026 es lunes.
const LUNES = "2026-10-12";

test("un lunes: devuelve los bloques del lunes, ordenados, y los días sin horario salen con bloques vacíos", () => {
  const plantilla = [tramo(1, "15:00:00", "18:00:00"), tramo(1, "08:00:00", "12:00:00"), tramo(3, "09:00", "13:00")];
  const dias = horariosPorDia(plantilla, LUNES, 7);
  assert.equal(dias.length, 7);
  assert.deepEqual(dias.map((d) => d.fecha), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  assert.deepEqual(dias[0]!.bloques, [{ inicio: "08:00", fin: "12:00" }, { inicio: "15:00", fin: "18:00" }]);
  assert.deepEqual(dias[2]!.bloques, [{ inicio: "09:00", fin: "13:00" }], "el miércoles (3) atiende de 09:00 a 13:00");
  assert.deepEqual(dias[1]!.bloques, []);
  assert.deepEqual(dias[6]!.bloques, []);
});

test("un domingo es el día 0 de la base de datos, no el 7", () => {
  const plantilla = [tramo(0, "09:00", "12:00")];
  const dias = horariosPorDia(plantilla, "2026-10-18", 2); // 18/10/2026 es domingo
  assert.deepEqual(dias[0]!.bloques, [{ inicio: "09:00", fin: "12:00" }]);
  assert.deepEqual(dias[1]!.bloques, [], "el lunes siguiente no atiende en domingo");
  assert.deepEqual(horariosPorDia([tramo(7, "09:00", "12:00")], "2026-10-18", 1)[0]!.bloques, [], "un 7 no existe");
});

test("una disponibilidad que vence a mitad de la ventana deja de aparecer el día siguiente a su fin (el último día cuenta)", () => {
  const plantilla = [tramo(1, "08:00", "12:00", "2020-01-01", "2026-10-19")]; // vence el lunes 19
  const dias = horariosPorDia(plantilla, LUNES, 15); // desde el 12 hasta el 26
  assert.deepEqual(dias[0]!.bloques, [{ inicio: "08:00", fin: "12:00" }]); // lunes 12
  assert.deepEqual(dias[7]!.bloques, [{ inicio: "08:00", fin: "12:00" }], "el lunes 19, su último día de vigencia, todavía cuenta");
  assert.equal(dias[7]!.fecha, "2026-10-19");
  assert.deepEqual(dias[14]!.bloques, [], "el lunes 26 ya venció");
  assert.equal(dias[14]!.fecha, "2026-10-26");
});

test("una disponibilidad que aún no empieza solo aparece desde su fecha de inicio (el primer día cuenta)", () => {
  const plantilla = [tramo(1, "08:00", "12:00", "2026-10-19")];
  const dias = horariosPorDia(plantilla, LUNES, 15);
  assert.deepEqual(dias[0]!.bloques, [], "lunes 12: aún no vigente");
  assert.deepEqual(dias[7]!.bloques, [{ inicio: "08:00", fin: "12:00" }], "lunes 19: primer día de vigencia");
  assert.deepEqual(dias[14]!.bloques, [{ inicio: "08:00", fin: "12:00" }]);
});

test("dos vigencias consecutivas del mismo día se reparten sin solaparse", () => {
  const plantilla = [tramo(1, "08:00", "12:00", "2020-01-01", "2026-10-18"), tramo(1, "14:00", "18:00", "2026-10-19")];
  const dias = horariosPorDia(plantilla, LUNES, 8);
  assert.deepEqual(dias[0]!.bloques, [{ inicio: "08:00", fin: "12:00" }]);
  assert.deepEqual(dias[7]!.bloques, [{ inicio: "14:00", fin: "18:00" }]);
});

test("el fin 24:00 de la base de datos se conserva y los segundos se recortan", () => {
  const dias = horariosPorDia([tramo(2, "00:00:00", "24:00:00")], "2026-10-13", 1);
  assert.deepEqual(dias[0]!.bloques, [{ inicio: "00:00", fin: "24:00" }]);
});

test("sin plantilla o con cero días", () => {
  assert.deepEqual(horariosPorDia([], LUNES, 2).map((d) => d.bloques), [[], []]);
  assert.deepEqual(horariosPorDia([tramo(1, "08:00", "12:00")], LUNES, 0), []);
});

test("cruza el fin de mes y de año sin depender de la zona del proceso", () => {
  const dias = horariosPorDia([tramo(4, "10:00", "11:00")], "2026-12-30", 4); // 31/12/2026 es jueves
  assert.deepEqual(dias.map((d) => d.fecha), ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  assert.deepEqual(dias.map((d) => d.bloques.length), [0, 1, 0, 0]);
});

repetirEnZonas(import.meta.url);
