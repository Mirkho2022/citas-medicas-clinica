// Pruebas de lib/ui/estados-cita.ts y lib/ui/formato.ts (H2b, tarea 3.1). Ejecutar con: npm run test:tema
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import {
  DATOS_ESTADO,
  ESTADOS_CITA,
  datosEstado,
  esEstadoActivo,
} from "../../lib/ui/estados-cita.ts";
import {
  fechaHoraLima,
  fechaLima,
  horaLimiteCancelacion,
  horaLima,
} from "../../lib/ui/formato.ts";

// 14 de octubre de 2026, 14:30 en Lima (UTC-5, sin horario de verano) = 19:30 UTC.
const CITA = "2026-10-14T19:30:00Z";

test("los cinco estados llevan su etiqueta, su icono y su tono", () => {
  assert.deepEqual([...ESTADOS_CITA], ["reservada", "confirmada", "atendida", "cancelada", "no_asistio"]);
  assert.deepEqual(
    ESTADOS_CITA.map((e) => [datosEstado(e).etiqueta, datosEstado(e).tono]),
    [
      ["Reservada", "info"],
      ["Confirmada", "success"],
      ["Atendida", "neutral"],
      ["Cancelada", "error"],
      ["No asistió", "warning"],
    ],
  );
  for (const estado of ESTADOS_CITA) {
    assert.ok(DATOS_ESTADO[estado].icono, `el estado ${estado} no tiene icono`);
  }
  assert.equal(new Set(ESTADOS_CITA.map((e) => DATOS_ESTADO[e].icono)).size, 5, "cada estado tiene su propio icono");
});

test("un estado desconocido lanza en lugar de pintar un color arbitrario", () => {
  assert.throws(() => datosEstado("archivada"), /Estado de cita desconocido: «archivada»/);
  assert.throws(() => datosEstado("constructor"), /Estado de cita desconocido/);
});

test("solo reservada y confirmada son estados activos", () => {
  assert.deepEqual(ESTADOS_CITA.filter(esEstadoActivo), ["reservada", "confirmada"]);
});

test("una cita a las 14:30 de Lima se formatea 14/10/2026 y 14:30, y su límite es 13:30", () => {
  assert.equal(fechaLima(CITA), "14/10/2026");
  assert.equal(horaLima(CITA), "14:30");
  assert.equal(fechaHoraLima(new Date(CITA)), "14/10/2026 14:30");
  assert.equal(horaLimiteCancelacion(CITA), "13:30");
});

test("a medianoche de Lima la fecha es la de Lima, no la de UTC", () => {
  // 2026-10-15 00:15 en Lima = 05:15 UTC del mismo día; 2026-10-14 23:45 en Lima = 04:45 UTC del 15.
  assert.equal(fechaHoraLima("2026-10-15T05:15:00Z"), "15/10/2026 00:15");
  assert.equal(fechaHoraLima("2026-10-15T04:45:00Z"), "14/10/2026 23:45");
  assert.equal(horaLimiteCancelacion("2026-10-15T05:15:00Z"), "23:15");
});

test("una fecha no válida lanza", () => {
  assert.throws(() => fechaLima("no es una fecha"), /Fecha no válida/);
});

// El proceso corre con otra zona horaria (TZ): el resultado no debe cambiar.
for (const zona of ["UTC", "Asia/Tokyo"]) {
  test(`el formato no depende de la zona del proceso (TZ=${zona})`, () => {
    const salida = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { fechaLima, horaLima, horaLimiteCancelacion } from "./lib/ui/formato.ts";
         console.log([fechaLima("${CITA}"), horaLima("${CITA}"), horaLimiteCancelacion("${CITA}")].join("|"));`,
      ],
      { env: { ...process.env, TZ: zona }, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    assert.equal(salida.trim(), "14/10/2026|14:30|13:30");
  });
}
