// Pruebas de lib/portal/pasos-reserva.ts (H4, tarea 6.3; design.md, D7): el paso se decide por los parámetros válidos de la dirección.
// Ejecutar con: npm run test:portal
import assert from "node:assert/strict";
import { test } from "node:test";
import { instanteDesdeLima } from "../../lib/fechas/lima.ts";
import {
  hrefReserva,
  leerParametros,
  parametrosAtras,
  pasoDe,
  RUTA_RESERVAR,
  type ParametrosReserva,
} from "../../lib/portal/pasos-reserva.ts";
import { DIAS_DE_BUSQUEDA } from "../../lib/portal/consultas.ts";

const HOY = "2026-10-14";
const ESP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CITA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DIA = "2026-10-20";
const HORA = instanteDesdeLima(DIA, "14:30").toISOString(); // 2026-10-20T19:30:00.000Z

test("sin parámetros el paso es la elección de la especialidad", () => {
  assert.deepEqual(leerParametros({}, HOY), {});
  assert.equal(pasoDe({}), "especialidades");
});

test("cada combinación de parámetros lleva a su paso", () => {
  const casos: Array<[ParametrosReserva, string]> = [
    [{ especialidad: ESP }, "medicos"],
    [{ modo: "medico" }, "todosLosMedicos"],
    [{ medico: MED }, "dias"],
    [{ especialidad: ESP, medico: MED }, "dias"],
    [{ medico: MED, dia: DIA }, "horarios"],
    [{ medico: MED, dia: DIA, hora: HORA }, "confirmar"],
    [{ cita: CITA }, "listo"],
    [{ medico: MED, dia: DIA, hora: HORA, cita: CITA }, "listo"],
  ];
  for (const [parametros, paso] of casos) assert.equal(pasoDe(parametros), paso, JSON.stringify(parametros));
});

test("lo que se arma con hrefReserva se vuelve a leer igual (ida y vuelta por la dirección)", () => {
  const completo: ParametrosReserva = { especialidad: ESP, medico: MED, dia: DIA, hora: HORA };
  const href = hrefReserva(completo);
  assert.ok(href.startsWith(`${RUTA_RESERVAR}?`));
  const consulta = Object.fromEntries(new URL(href, "http://localhost").searchParams);
  assert.deepEqual(leerParametros(consulta, HOY), completo);
  assert.ok(!href.includes("+"), "el instante no deja un «+» sin codificar");
});

test("la dirección no lleva ningún dato del paciente: solo identificadores, una fecha y un instante", () => {
  const href = hrefReserva({ especialidad: ESP, medico: MED, dia: DIA, hora: HORA });
  assert.match(href, /^\/paciente\/citas\/nueva\?especialidad=[0-9a-f-]{36}&medico=[0-9a-f-]{36}&dia=\d{4}-\d{2}-\d{2}&hora=/);
  assert.doesNotMatch(href, /paciente_id|perfil|correo|email|documento|dni/i);
});

test("sin parámetros, la dirección es la ruta sola; el orden de los parámetros es fijo", () => {
  assert.equal(hrefReserva(), RUTA_RESERVAR);
  assert.equal(hrefReserva({ hora: HORA, medico: MED, dia: DIA }), hrefReserva({ medico: MED, dia: DIA, hora: HORA }));
});

test("un parámetro inválido se descarta y la dirección cae en un paso anterior en vez de romper", () => {
  assert.deepEqual(leerParametros({ especialidad: "no-es-uuid" }, HOY), {});
  assert.deepEqual(leerParametros({ medico: "no-es-uuid", dia: DIA }, HOY), {});
  assert.deepEqual(leerParametros({ medico: MED, dia: "2026-02-30" }, HOY), { medico: MED }, "fecha imposible");
  assert.deepEqual(leerParametros({ medico: MED, dia: "mañana" }, HOY), { medico: MED });
  assert.deepEqual(leerParametros({ medico: MED, dia: DIA, hora: "las tres" }, HOY), { medico: MED, dia: DIA });
  assert.deepEqual(leerParametros({ dia: DIA, hora: HORA }, HOY), {}, "sin médico no hay día ni hora");
  assert.deepEqual(leerParametros({ modo: "otro" }, HOY), {});
  assert.deepEqual(leerParametros({ cita: "123" }, HOY), {});
});

test("el día debe estar entre hoy y el último día del horizonte", () => {
  assert.deepEqual(leerParametros({ medico: MED, dia: "2026-10-13" }, HOY), { medico: MED }, "ayer");
  assert.deepEqual(leerParametros({ medico: MED, dia: HOY }, HOY), { medico: MED, dia: HOY }, "hoy");
  const ultimo = "2026-11-12"; // hoy + 29
  assert.equal(DIAS_DE_BUSQUEDA, 30);
  assert.deepEqual(leerParametros({ medico: MED, dia: ultimo }, HOY), { medico: MED, dia: ultimo });
  assert.deepEqual(leerParametros({ medico: MED, dia: "2026-11-13" }, HOY), { medico: MED }, "fuera del horizonte");
});

test("la hora debe caer en el día elegido, según la hora de Lima y no la del navegador", () => {
  // 23:30 de Lima del 20/10 son las 04:30 UTC del 21/10: el día de Lima sigue siendo el 20.
  const tarde = instanteDesdeLima(DIA, "23:30").toISOString();
  assert.equal(tarde, "2026-10-21T04:30:00.000Z");
  assert.deepEqual(leerParametros({ medico: MED, dia: DIA, hora: tarde }, HOY), { medico: MED, dia: DIA, hora: tarde });
  assert.deepEqual(leerParametros({ medico: MED, dia: "2026-10-21", hora: tarde }, HOY), { medico: MED, dia: "2026-10-21" }, "es del día 20, no del 21");
});

test("la hora se normaliza a ISO en UTC aunque llegue con otro desfase", () => {
  const conDesfase = "2026-10-20T14:30:00-05:00";
  assert.deepEqual(leerParametros({ medico: MED, dia: DIA, hora: conDesfase }, HOY), { medico: MED, dia: DIA, hora: HORA });
});

test("el choque (conflicto y horario tomado) solo se lee con un día válido, y solo con los valores conocidos", () => {
  const base = { medico: MED, dia: DIA };
  assert.deepEqual(leerParametros({ ...base, conflicto: "DOBLE_RESERVA", tomado: HORA }, HOY), { ...base, conflicto: "DOBLE_RESERVA", tomado: HORA });
  assert.deepEqual(leerParametros({ ...base, conflicto: "HORARIO_NO_DISPONIBLE" }, HOY), { ...base, conflicto: "HORARIO_NO_DISPONIBLE" });
  assert.deepEqual(leerParametros({ ...base, conflicto: "<script>" }, HOY), base);
  assert.deepEqual(leerParametros({ ...base, tomado: instanteDesdeLima("2026-10-21", "10:00").toISOString() }, HOY), base, "un horario tomado de otro día se ignora");
});

test("si una dirección repite un parámetro, se toma el primero", () => {
  assert.deepEqual(leerParametros({ especialidad: [ESP, "otro"] }, HOY), { especialidad: ESP });
});

test("«Atrás» vuelve al paso anterior conservando lo que sigue siendo válido", () => {
  assert.equal(parametrosAtras({}), null);
  assert.equal(parametrosAtras({ cita: CITA }), null);
  assert.deepEqual(parametrosAtras({ especialidad: ESP }), {});
  assert.deepEqual(parametrosAtras({ modo: "medico" }), {});
  assert.deepEqual(parametrosAtras({ especialidad: ESP, medico: MED }), { especialidad: ESP });
  assert.deepEqual(parametrosAtras({ modo: "medico", medico: MED }), { modo: "medico" });
  assert.deepEqual(parametrosAtras({ medico: MED }, ESP), { especialidad: ESP }, "un médico elegido directamente vuelve a su especialidad");
  assert.deepEqual(parametrosAtras({ especialidad: ESP, medico: MED, dia: DIA }), { especialidad: ESP, medico: MED });
  assert.deepEqual(
    parametrosAtras({ especialidad: ESP, medico: MED, dia: DIA, hora: HORA }),
    { especialidad: ESP, medico: MED, dia: DIA },
  );
});
