// Pruebas de lib/schemas/turno.ts y lib/turnos/franjas.ts (H7, tarea 3.1; specs/turnos-de-enfermeria).
// Ejecutar con: npm run test:turnos-dashboard. Sin Clerk, sin Next, sin red y sin base de datos.
import assert from "node:assert/strict";
import { test } from "node:test";
import { falloPorValidacion } from "../../lib/acciones/resultado.ts";
import {
  MENSAJE_DESTINO_DOBLE,
  MENSAJE_SIN_DESTINO,
  turnoActualizacionSchema,
  turnoRefSchema,
  turnoSchema,
} from "../../lib/schemas/turno.ts";
import { ETIQUETA_FRANJA, esFranja, etiquetaFranja, FRANJAS, ordenFranja } from "../../lib/turnos/franjas.ts";
import { repetirEnZonas } from "./_zonas.ts";

const ENFERMERA = "11111111-1111-4111-8111-111111111111";
const MEDICO = "22222222-2222-4222-8222-222222222222";
const ESPECIALIDAD = "33333333-3333-4333-8333-333333333333";
const valido = { enfermera_id: ENFERMERA, fecha: "2032-03-01", turno: "manana" };

function mensajes(entrada: unknown): Record<string, string> | null {
  const r = turnoSchema.safeParse(entrada);
  return r.success ? null : (falloPorValidacion(r.error).campos ?? {});
}

test("acepta un turno con médico solo", () => {
  const r = turnoSchema.safeParse({ ...valido, medico_id: MEDICO });
  assert.ok(r.success);
  assert.deepEqual(r.data, { ...valido, medico_id: MEDICO });
});

test("acepta un turno con servicio solo", () => {
  const r = turnoSchema.safeParse({ ...valido, turno: "tarde", especialidad_id: ESPECIALIDAD });
  assert.ok(r.success);
  assert.equal(r.data.especialidad_id, ESPECIALIDAD);
  assert.equal(r.data.medico_id, undefined);
});

test("un formulario manda vacío el selector que no se eligió: se trata como ausente", () => {
  const r = turnoSchema.safeParse({ ...valido, medico_id: MEDICO, especialidad_id: "" });
  assert.ok(r.success);
  assert.equal(r.data.especialidad_id, undefined);
});

test("rechaza un turno sin médico y sin servicio con el mensaje exacto de la spec", () => {
  assert.deepEqual(mensajes(valido), { _: "Indique el médico o el servicio con el que trabajará la enfermera" });
  assert.equal(MENSAJE_SIN_DESTINO, "Indique el médico o el servicio con el que trabajará la enfermera");
  // Vacíos de formulario (`""`) cuentan como ausentes.
  assert.deepEqual(mensajes({ ...valido, medico_id: "", especialidad_id: "" }), { _: MENSAJE_SIN_DESTINO });
});

test("rechaza un turno con médico y servicio a la vez con el mensaje exacto de la spec", () => {
  assert.deepEqual(mensajes({ ...valido, medico_id: MEDICO, especialidad_id: ESPECIALIDAD }), {
    _: "Elija solo una opción: un médico o un servicio",
  });
  assert.equal(MENSAJE_DESTINO_DOBLE, "Elija solo una opción: un médico o un servicio");
});

test("rechaza una fecha que no existe en el calendario, una vacía y una mal escrita", () => {
  assert.deepEqual(mensajes({ ...valido, fecha: "2026-02-30", medico_id: MEDICO }), {
    fecha: "La fecha del turno no es válida (use AAAA-MM-DD)",
  });
  assert.deepEqual(mensajes({ ...valido, fecha: "", medico_id: MEDICO }), { fecha: "Ingrese la fecha del turno" });
  assert.deepEqual(mensajes({ ...valido, fecha: "05/03/2032", medico_id: MEDICO }), {
    fecha: "La fecha del turno no es válida (use AAAA-MM-DD)",
  });
  assert.equal(mensajes({ ...valido, fecha: "2032-02-29", medico_id: MEDICO }), null, "2032 es bisiesto");
});

test("rechaza una franja inexistente, una ausente y una con otra grafía", () => {
  const esperado = { turno: "Seleccione la franja del turno: mañana, tarde o noche" };
  assert.deepEqual(mensajes({ ...valido, turno: "madrugada", medico_id: MEDICO }), esperado);
  assert.deepEqual(mensajes({ ...valido, turno: "", medico_id: MEDICO }), esperado);
  assert.deepEqual(mensajes({ enfermera_id: ENFERMERA, fecha: "2032-03-01", medico_id: MEDICO }), esperado);
  assert.deepEqual(mensajes({ ...valido, turno: "Mañana", medico_id: MEDICO }), esperado);
});

test("rechaza una enfermera ausente o con un identificador que no es uuid", () => {
  assert.deepEqual(mensajes({ ...valido, enfermera_id: "", medico_id: MEDICO }), { enfermera_id: "Seleccione una enfermera" });
  assert.deepEqual(mensajes({ ...valido, enfermera_id: "no-es-uuid", medico_id: MEDICO }), { enfermera_id: "Seleccione una enfermera" });
});

test("un médico con identificador mal formado tiene su propio mensaje", () => {
  assert.deepEqual(mensajes({ ...valido, medico_id: "no-es-uuid" }), { medico_id: "El médico elegido no es válido" });
});

test("una entrada que no es un objeto se rechaza con un mensaje en español", () => {
  for (const entrada of [null, undefined, "texto", 7]) {
    const r = turnoSchema.safeParse(entrada);
    assert.ok(!r.success);
    assert.equal(falloPorValidacion(r.error).mensaje, "Revise los datos ingresados");
  }
});

test("todos los errores del envío salen a la vez", () => {
  const campos = mensajes({ enfermera_id: "", fecha: "", turno: "x" });
  assert.deepEqual(Object.keys(campos ?? {}).sort(), ["_", "enfermera_id", "fecha", "turno"]);
});

test("modificar: acepta la franja y un solo destino; la enfermera y la fecha no se piden", () => {
  const ok = turnoActualizacionSchema.safeParse({ id: ENFERMERA, turno: "noche", medico_id: MEDICO });
  assert.ok(ok.success);
  assert.deepEqual(ok.data, { id: ENFERMERA, turno: "noche", medico_id: MEDICO });
  for (const entrada of [
    { id: ENFERMERA, turno: "noche" },
    { id: ENFERMERA, turno: "noche", medico_id: MEDICO, especialidad_id: ESPECIALIDAD },
  ]) {
    const r = turnoActualizacionSchema.safeParse(entrada);
    assert.ok(!r.success);
    assert.deepEqual(falloPorValidacion(r.error).campos, {
      _: "medico_id" in entrada && "especialidad_id" in entrada ? MENSAJE_DESTINO_DOBLE : MENSAJE_SIN_DESTINO,
    });
  }
  const sinId = turnoActualizacionSchema.safeParse({ turno: "noche", medico_id: MEDICO });
  assert.ok(!sinId.success);
  assert.deepEqual(falloPorValidacion(sinId.error).campos, { id: "Seleccione un turno" });
});

test("quitar: pide solo el identificador del turno", () => {
  assert.ok(turnoRefSchema.safeParse({ id: ENFERMERA }).success);
  assert.ok(!turnoRefSchema.safeParse({ id: "x" }).success);
  assert.ok(!turnoRefSchema.safeParse({}).success);
});

test("franjas: las tres del enum, en orden del día y solo con su nombre, sin horas", () => {
  assert.deepEqual([...FRANJAS], ["manana", "tarde", "noche"]);
  assert.deepEqual(ETIQUETA_FRANJA, { manana: "Mañana", tarde: "Tarde", noche: "Noche" });
  for (const franja of FRANJAS) {
    assert.equal(etiquetaFranja(franja), ETIQUETA_FRANJA[franja]);
    assert.doesNotMatch(etiquetaFranja(franja), /\d/, "la etiqueta no lleva horas");
  }
  assert.deepEqual(FRANJAS.map(ordenFranja), [0, 1, 2]);
  assert.ok(esFranja("tarde"));
  assert.ok(!esFranja("Tarde") && !esFranja(undefined) && !esFranja("madrugada"));
  assert.throws(() => etiquetaFranja("madrugada"), /Franja de turno desconocida/);
});

repetirEnZonas(import.meta.url);
