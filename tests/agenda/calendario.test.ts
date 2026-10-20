// Pruebas de lib/ui/calendario.ts (H3, selector de fecha). Ejecutar con: npm run test:agenda. Aritmética de calendario en UTC:
// los resultados no dependen de la zona del proceso (se repiten con TZ=UTC y TZ=Asia/Tokyo en la verificación manual).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  celdasDelMes,
  diaDeLaSemana,
  etiquetaFecha,
  mesDeFecha,
  sumarDias,
  sumarMeses,
  textoFechaConDia,
  textoMes,
} from "../../lib/ui/calendario.ts";

test("la semana empieza en lunes: octubre de 2026 empieza en jueves, con tres celdas vacías", () => {
  const celdas = celdasDelMes({ anio: 2026, mes: 9 });
  assert.deepEqual(celdas.slice(0, 4), [null, null, null, "2026-10-01"]);
  assert.equal(celdas.length, 3 + 31);
  assert.equal(celdas.at(-1), "2026-10-31");
});

test("un mes que empieza en lunes no lleva celdas vacías (junio de 2026) y uno que empieza en domingo lleva seis (febrero de 2026)", () => {
  assert.equal(celdasDelMes({ anio: 2026, mes: 5 })[0], "2026-06-01");
  const febrero = celdasDelMes({ anio: 2026, mes: 1 });
  assert.deepEqual(febrero.slice(0, 7), [null, null, null, null, null, null, "2026-02-01"]);
  assert.equal(febrero.filter(Boolean).length, 28);
});

test("febrero de un año bisiesto tiene 29 días", () => {
  assert.equal(celdasDelMes({ anio: 2028, mes: 1 }).filter(Boolean).length, 29);
});

test("sumarMeses cruza el año hacia adelante y hacia atrás", () => {
  assert.deepEqual(sumarMeses({ anio: 2026, mes: 11 }, 1), { anio: 2027, mes: 0 });
  assert.deepEqual(sumarMeses({ anio: 2026, mes: 0 }, -1), { anio: 2025, mes: 11 });
  assert.deepEqual(sumarMeses({ anio: 2026, mes: 5 }, 0), { anio: 2026, mes: 5 });
  assert.deepEqual(sumarMeses({ anio: 2026, mes: 5 }, 25), { anio: 2028, mes: 6 });
});

test("sumarDias cruza el mes, el año y el 29 de febrero", () => {
  assert.equal(sumarDias("2026-10-31", 1), "2026-11-01");
  assert.equal(sumarDias("2026-01-01", -1), "2025-12-31");
  assert.equal(sumarDias("2028-02-28", 1), "2028-02-29");
  assert.equal(sumarDias("2026-02-28", 1), "2026-03-01");
  assert.equal(sumarDias("2026-10-20", 0), "2026-10-20");
});

test("el día de la semana y las etiquetas están en español", () => {
  assert.equal(diaDeLaSemana("2026-10-18"), 0); // domingo
  assert.equal(diaDeLaSemana("2026-10-19"), 1); // lunes
  assert.equal(etiquetaFecha("2026-10-20"), "martes 20 de octubre de 2026");
  assert.equal(textoFechaConDia("2026-10-20"), "Martes 20/10/2026");
  assert.equal(textoFechaConDia("2026-01-05"), "Lunes 05/01/2026");
  assert.equal(textoMes({ anio: 2026, mes: 9 }), "octubre de 2026");
  assert.deepEqual(mesDeFecha("2026-10-20"), { anio: 2026, mes: 9 });
});

test("una fecha mal escrita se rechaza con un mensaje que dice el formato", () => {
  assert.throws(() => sumarDias("20/10/2026", 1), /Use el formato AAAA-MM-DD/);
  assert.throws(() => mesDeFecha("2026-10"), /Fecha no válida/);
});
