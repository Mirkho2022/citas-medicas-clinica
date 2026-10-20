// Pruebas de lib/fechas/lima.ts (H3, tarea 7.2; design.md, D8). Ejecutar con: npm run test:agenda
// Se comprueban en el proceso actual y en procesos hijos con TZ=UTC y TZ=Asia/Tokyo; además, el mismo archivo se puede correr
// con la zona del proceso cambiada (en PowerShell: $env:TZ='Asia/Tokyo'; npm run test:agenda).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import {
  esFechaLima,
  esHoraLima,
  fechaYHoraLima,
  finDiaLima,
  hoyLima,
  inicioDiaLima,
  instanteDesdeLima,
} from "../../lib/fechas/lima.ts";

test("14:30 de Lima del 14/10/2026 es 19:30Z", () => {
  assert.equal(instanteDesdeLima("2026-10-14", "14:30").toISOString(), "2026-10-14T19:30:00.000Z");
  assert.deepEqual(fechaYHoraLima("2026-10-14T19:30:00Z"), { fecha: "2026-10-14", hora: "14:30" });
});

test("las 23:30 de Lima siguen siendo del 14/10 aunque en UTC ya sea el 15", () => {
  const instante = instanteDesdeLima("2026-10-14", "23:30");
  assert.equal(instante.toISOString(), "2026-10-15T04:30:00.000Z");
  assert.deepEqual(fechaYHoraLima(instante), { fecha: "2026-10-14", hora: "23:30" });
  assert.equal(hoyLima(instante), "2026-10-14");
});

test("hoy en Lima cambia a las 00:00 de Lima (05:00Z), no a las 00:00 UTC", () => {
  assert.equal(hoyLima(new Date("2026-10-15T04:59:59Z")), "2026-10-14");
  assert.equal(hoyLima(new Date("2026-10-15T05:00:00Z")), "2026-10-15");
  // A las 21:00 de Lima (02:00 UTC del día siguiente) todavía es el mismo día de Lima (spec: vigencia por defecto).
  assert.equal(hoyLima(new Date("2026-10-15T02:00:00Z")), "2026-10-14");
  assert.match(hoyLima(), /^\d{4}-\d{2}-\d{2}$/);
});

test("el inicio del día de Lima es 05:00Z y el fin es el inicio del día siguiente", () => {
  assert.equal(inicioDiaLima("2026-10-14").toISOString(), "2026-10-14T05:00:00.000Z");
  assert.equal(finDiaLima("2026-10-14").toISOString(), "2026-10-15T05:00:00.000Z");
  // Cambios de mes y de año, y un 29 de febrero.
  assert.equal(finDiaLima("2026-10-31").toISOString(), "2026-11-01T05:00:00.000Z");
  assert.equal(finDiaLima("2026-12-31").toISOString(), "2027-01-01T05:00:00.000Z");
  assert.equal(finDiaLima("2028-02-29").toISOString(), "2028-03-01T05:00:00.000Z");
  assert.equal(finDiaLima("2027-02-28").toISOString(), "2027-03-01T05:00:00.000Z");
});

test("un día de Lima contiene sus horas de 00:00 a 23:59 y excluye el instante del día siguiente", () => {
  const inicio = inicioDiaLima("2026-10-14").getTime();
  const fin = finDiaLima("2026-10-14").getTime();
  assert.ok(instanteDesdeLima("2026-10-14", "00:00").getTime() >= inicio);
  assert.ok(instanteDesdeLima("2026-10-14", "23:59").getTime() < fin);
  assert.equal(instanteDesdeLima("2026-10-15", "00:00").getTime(), fin);
});

test("ida y vuelta entre instante y fecha y hora de Lima", () => {
  for (const instante of ["2026-01-01T05:00:00Z", "2026-10-14T19:30:00Z", "2026-10-15T04:59:00Z", "2028-02-29T13:20:00Z"]) {
    const { fecha, hora } = fechaYHoraLima(instante);
    assert.equal(instanteDesdeLima(fecha, hora).toISOString(), new Date(instante).toISOString());
  }
});

test("las fechas y horas mal escritas lanzan en lugar de adivinar", () => {
  for (const fecha of ["2026-02-30", "2026-13-01", "2026-00-10", "14/10/2026", "2026-10-1", "", "mañana"]) {
    assert.equal(esFechaLima(fecha), false, fecha);
    assert.throws(() => inicioDiaLima(fecha), /Fecha de Lima no válida/, fecha);
  }
  for (const hora of ["24:00", "9:30", "12:60", "12:30:00", "", "tarde"]) {
    assert.equal(esHoraLima(hora), false, hora);
    assert.throws(() => instanteDesdeLima("2026-10-14", hora), /Hora de Lima no válida/, hora);
  }
  assert.equal(esFechaLima("2028-02-29"), true);
  assert.equal(esFechaLima("2027-02-29"), false);
  assert.throws(() => fechaYHoraLima("no es una fecha"), /Fecha no válida/);
  assert.throws(() => hoyLima(new Date("x")), /Fecha no válida/);
});

// El mismo cálculo en procesos con otra zona horaria (TZ): el resultado no debe cambiar.
const GUION = `
  import { fechaYHoraLima, finDiaLima, hoyLima, inicioDiaLima, instanteDesdeLima } from "./lib/fechas/lima.ts";
  const salida = [
    new Date(2026, 0, 1).getTimezoneOffset(),
    instanteDesdeLima("2026-10-14", "14:30").toISOString(),
    instanteDesdeLima("2026-10-14", "23:30").toISOString(),
    JSON.stringify(fechaYHoraLima("2026-10-15T04:30:00Z")),
    inicioDiaLima("2026-10-14").toISOString(),
    finDiaLima("2026-10-14").toISOString(),
    hoyLima(new Date("2026-10-15T02:00:00Z")),
    hoyLima(new Date("2026-10-15T05:00:00Z")),
  ];
  console.log(salida.join("|"));
`;
const ESPERADO_SIN_DESFASE = [
  "2026-10-14T19:30:00.000Z",
  "2026-10-15T04:30:00.000Z",
  '{"fecha":"2026-10-14","hora":"23:30"}',
  "2026-10-14T05:00:00.000Z",
  "2026-10-15T05:00:00.000Z",
  "2026-10-14",
  "2026-10-15",
];
const DESFASE_ESPERADO: Record<string, number> = { UTC: 0, "Asia/Tokyo": -540 };

for (const zona of ["UTC", "Asia/Tokyo"]) {
  test(`el resultado no depende de la zona del proceso (TZ=${zona})`, () => {
    const salida = execFileSync(process.execPath, ["--input-type=module", "-e", GUION], {
      env: { ...process.env, TZ: zona },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const [desfase, ...resto] = salida.trim().split("|");
    // Comprueba que la zona pedida sí se aplicó al proceso hijo (si no, la prueba pasaría sin probar nada).
    assert.equal(Number(desfase), DESFASE_ESPERADO[zona], `el proceso hijo no corre en ${zona}`);
    assert.deepEqual(resto, ESPERADO_SIN_DESFASE);
  });
}
