// Pruebas de lib/citas/consultas.ts (H3, tarea 10.1): la parte que no toca la base de datos. Ejecutar con: npm run test:agenda.
// El `Ejecutor` es un doble. Lo que lee de la base de datos (con la RLS del administrativo) está en tests/integracion/consultas.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Ejecutor, Fila, Sentencia } from "../../lib/db/ejecutor.ts";
import {
  agendaDelDia,
  aIso,
  esUuid,
  horariosLibres,
  ordenarAgenda,
  pacientePorId,
  parametrosAgenda,
  type FilaAgendaDia,
} from "../../lib/citas/consultas.ts";

const MEDICO = "11111111-1111-4111-8111-111111111111";
const OTRO = "22222222-2222-4222-8222-222222222222";

function ejecutorDe(...respuestas: Fila[][]) {
  const llamadas: Sentencia[][] = [];
  const ejecutar: Ejecutor = async (sentencias) => {
    llamadas.push([...sentencias]);
    return respuestas.length > 0 ? respuestas : sentencias.map(() => []);
  };
  return { ejecutar, llamadas };
}

const hueco = (inicio: string, medico: string): FilaAgendaDia => ({
  tipo: "hueco", medicoId: MEDICO, medico, servicio: "Medicina general", inicio, fin: inicio,
});

test("aIso acepta un Date y un texto, y siempre devuelve ISO en UTC; un valor inválido lanza", () => {
  assert.equal(aIso(new Date("2026-10-20T14:30:00-05:00")), "2026-10-20T19:30:00.000Z");
  assert.equal(aIso("2026-10-20T19:30:00+00:00"), "2026-10-20T19:30:00.000Z");
  assert.throws(() => aIso("no es una fecha"), /Instante no válido/);
});

test("esUuid solo acepta la forma de un uuid", () => {
  assert.equal(esUuid(MEDICO), true);
  assert.equal(esUuid("11111111-1111-4111-8111-11111111111"), false);
  assert.equal(esUuid("todos"), false);
  assert.equal(esUuid(undefined), false);
  assert.equal(esUuid("1; drop table citas"), false);
});

test("parametrosAgenda usa hoy si la fecha falta o es inválida, y todos los médicos si el identificador no es un uuid", () => {
  const hoy = "2026-10-20";
  assert.deepEqual(parametrosAgenda({}, hoy), { fecha: hoy, medicoId: null });
  assert.deepEqual(parametrosAgenda({ fecha: "2026-02-30", medico: "todos" }, hoy), { fecha: hoy, medicoId: null });
  assert.deepEqual(parametrosAgenda({ fecha: "2026-10-22", medico: MEDICO }, hoy), { fecha: "2026-10-22", medicoId: MEDICO });
  assert.deepEqual(parametrosAgenda({ fecha: ["2026-10-23", "2026-10-24"], medico: [MEDICO] }, hoy), { fecha: "2026-10-23", medicoId: MEDICO });
  assert.deepEqual(parametrosAgenda({ fecha: "'; select", medico: "x" }, hoy), { fecha: hoy, medicoId: null });
});

test("ordenarAgenda ordena por hora y, a igual hora, por médico; no cambia el arreglo original", () => {
  const original = [hueco("2026-10-20T15:00:00.000Z", "Zoila"), hueco("2026-10-20T14:00:00.000Z", "Ana"), hueco("2026-10-20T15:00:00.000Z", "Ángel")];
  const ordenado = ordenarAgenda(original);
  assert.deepEqual(ordenado.map((f) => (f as { medico: string }).medico), ["Ana", "Ángel", "Zoila"]);
  assert.equal((original[0] as { medico: string }).medico, "Zoila");
});

test("agendaDelDia pide el día de Lima (05:00Z a 05:00Z del día siguiente) y el médico, en UNA transacción de dos sentencias", async () => {
  const { ejecutar, llamadas } = ejecutorDe([], []);
  const agenda = await agendaDelDia(ejecutar, "2026-10-20", MEDICO);
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].length, 2);
  assert.deepEqual(llamadas[0][0].parametros, ["2026-10-20T05:00:00.000Z", "2026-10-21T05:00:00.000Z", MEDICO]);
  assert.deepEqual(llamadas[0][1].parametros, ["2026-10-20", MEDICO]);
  assert.deepEqual(agenda, { fecha: "2026-10-20", filas: [], citas: 0, huecos: 0 });
});

test("agendaDelDia intercala citas y huecos por hora y cuenta cada tipo", async () => {
  const cita: Fila = {
    id: "c1", inicio: new Date("2026-10-20T14:20:00Z"), fin: new Date("2026-10-20T14:40:00Z"), estado: "confirmada", medico_id: MEDICO,
    paciente_id: "p1", paciente_nombres: "Rosa", paciente_apellidos: "Quispe", tipo_documento: "CE", numero_documento: "990000003",
    medico_nombres: "Lucía", medico_apellidos: "Vargas", servicio: "Medicina general", por_baja: true,
  };
  const libre: Fila = { medico_id: MEDICO, nombres: "Lucía", apellidos: "Vargas", servicio: "Medicina general", inicio: "2026-10-20T14:00:00Z", fin: "2026-10-20T14:20:00Z" };
  const { ejecutar } = ejecutorDe([cita], [libre]);
  const agenda = await agendaDelDia(ejecutar, "2026-10-20");
  assert.deepEqual(agenda.filas.map((f) => f.tipo), ["hueco", "cita"]);
  assert.equal(agenda.citas, 1);
  assert.equal(agenda.huecos, 1);
  const c = agenda.filas[1];
  assert.ok(c.tipo === "cita");
  assert.equal(c.inicio, "2026-10-20T14:20:00.000Z");
  assert.equal(c.porBaja, true);
  assert.equal(c.medico, "Lucía Vargas");
  assert.deepEqual(c.paciente, { id: "p1", nombres: "Rosa", apellidos: "Quispe", tipoDocumento: "CE", documento: "990000003" });
});

test("agendaDelDia rechaza una fecha o un médico mal formados sin llegar a la base de datos", async () => {
  const { ejecutar, llamadas } = ejecutorDe();
  await assert.rejects(() => agendaDelDia(ejecutar, "20/10/2026"), /Fecha de Lima no válida/);
  await assert.rejects(() => agendaDelDia(ejecutar, "2026-10-20", "1; drop table citas"), /médico no válido/);
  await assert.rejects(() => horariosLibres(ejecutar, OTRO, "2026-13-01"), /Fecha de Lima no válida/);
  await assert.rejects(() => horariosLibres(ejecutar, "x", "2026-10-20"), /médico no válido/);
  assert.equal(llamadas.length, 0);
});

test("pacientePorId devuelve null sin consultar si el identificador no es un uuid, y null si no hay fila", async () => {
  const { ejecutar, llamadas } = ejecutorDe([]);
  assert.equal(await pacientePorId(ejecutar, "no-es-uuid"), null);
  assert.equal(llamadas.length, 0);
  assert.equal(await pacientePorId(ejecutar, MEDICO), null);
  assert.equal(llamadas.length, 1);
});
