// Pruebas de lib/medico/jornada.ts (armarJornada, textoHace), lib/medico/marcar-atendida.ts, lib/turnos/semana.ts y lib/turnos/avisos.ts
// (H7, tareas 5.1, 8.1 y 8.3). Ejecutar con: npm run test:turnos-dashboard. Se repite con TZ=UTC y TZ=Asia/Tokyo (repetirEnZonas).
import assert from "node:assert/strict";
import { test } from "node:test";
import { fallo, exito } from "../../lib/acciones/resultado.ts";
import { instanteDesdeLima } from "../../lib/fechas/lima.ts";
import { armarJornada, DIAS_DE_JORNADA, textoHace, type CitaDeJornada } from "../../lib/medico/jornada.ts";
import {
  ID_ENCABEZADO_JORNADA,
  MENSAJE_CITA_ATENDIDA,
  MENSAJE_CITA_YA_NO_CONFIRMADA,
  mensajeDeResultado,
  siguienteFoco,
} from "../../lib/medico/marcar-atendida.ts";
import { CAUSAS_DE_AVISO, textoCausa } from "../../lib/turnos/avisos.ts";
import { diasDeLaSemana, encabezadoDeDia, lunesDeLaSemana, semanaPedida } from "../../lib/turnos/semana.ts";
import { repetirEnZonas } from "./_zonas.ts";

const HOY = "2026-10-12"; // lunes
const cita = (id: string, fecha: string, hora: string, minutos = 20, minutosDesdeInicio: number | null = null): CitaDeJornada => {
  const inicio = instanteDesdeLima(fecha, hora);
  return {
    id,
    inicio: inicio.toISOString(),
    fin: new Date(inicio.getTime() + minutos * 60_000).toISOString(),
    paciente: { nombres: "Paula", apellidos: "Prueba", tipoDocumento: "DNI", documento: "74000001" },
    minutosDesdeInicio,
  };
};
const plantilla = [{ diaSemana: 1, horaInicio: "09:00:00", horaFin: "13:00:00", vigenteDesde: "2020-01-01", vigenteHasta: null }];

test("la jornada cubre hoy y los 7 días siguientes", () => {
  const j = armarJornada({ hoy: HOY, plantilla: [], bloqueos: [], citas: [] });
  assert.equal(DIAS_DE_JORNADA, 8);
  assert.equal(j.dias.length, 8);
  assert.equal(j.dias[0]!.fecha, "2026-10-12");
  assert.equal(j.dias[7]!.fecha, "2026-10-19");
  assert.deepEqual(j.dias.map((d) => d.esHoy), [true, false, false, false, false, false, false, false]);
  assert.equal(j.totalCitas, 0);
});

test("citas del día en orden, con su horario; una cita a las 23:30 de Lima es de ese día aunque en UTC ya sea el siguiente", () => {
  const j = armarJornada({
    hoy: HOY,
    plantilla,
    bloqueos: [],
    citas: [cita("b", "2026-10-12", "10:00"), cita("a", "2026-10-12", "09:20"), cita("n", "2026-10-13", "23:30"), cita("m", "2026-10-14", "00:15")],
  });
  assert.deepEqual(j.dias[0]!.horarios, [{ inicio: "09:00", fin: "13:00" }]);
  assert.deepEqual(j.dias[0]!.citas.map((c) => c.id), ["a", "b"]);
  assert.deepEqual(j.dias[1]!.citas.map((c) => c.id), ["n"]);
  assert.deepEqual(j.dias[2]!.citas.map((c) => c.id), ["m"]);
  assert.equal(j.totalCitas, 4);
});

test("un bloqueo de 08:00 a 12:00 de mañana aparece en ese día, recortado y con sus horas de Lima", () => {
  const j = armarJornada({
    hoy: HOY,
    plantilla: [],
    bloqueos: [{ desde: instanteDesdeLima("2026-10-13", "08:00").toISOString(), hasta: instanteDesdeLima("2026-10-13", "12:00").toISOString() }],
    citas: [],
  });
  assert.deepEqual(j.dias[1]!.bloqueos, [{ inicio: "08:00", fin: "12:00", todoElDia: false }]);
  assert.deepEqual(j.dias[0]!.bloqueos, []);
  assert.deepEqual(j.dias[2]!.bloqueos, []);
});

test("un bloqueo de varios días se recorta por día y los límites son semiabiertos", () => {
  const j = armarJornada({
    hoy: HOY,
    plantilla: [],
    // del martes 13 a las 15:00 al jueves 15 a las 00:00 (exclusive: el jueves no está cubierto)
    bloqueos: [{ desde: instanteDesdeLima("2026-10-13", "15:00").toISOString(), hasta: instanteDesdeLima("2026-10-15", "00:00").toISOString() }],
    citas: [],
  });
  assert.deepEqual(j.dias[1]!.bloqueos, [{ inicio: "15:00", fin: "24:00", todoElDia: false }]);
  assert.deepEqual(j.dias[2]!.bloqueos, [{ inicio: "00:00", fin: "24:00", todoElDia: true }]);
  assert.deepEqual(j.dias[3]!.bloqueos, []);
});

test("una baja sin fecha de fin cubre todos los días desde su inicio", () => {
  const j = armarJornada({ hoy: HOY, plantilla: [], bloqueos: [{ desde: instanteDesdeLima("2026-10-14", "00:00").toISOString(), hasta: null }], citas: [] });
  assert.deepEqual(j.dias.map((d) => d.bloqueos.length), [0, 0, 1, 1, 1, 1, 1, 1]);
  assert.ok(j.dias.slice(2).every((d) => d.bloqueos[0]!.todoElDia));
});

test("textoHace: minutos, horas y horas con minutos", () => {
  assert.equal(textoHace(12), "Hace 12 min");
  assert.equal(textoHace(0), "Hace 0 min");
  assert.equal(textoHace(59), "Hace 59 min");
  assert.equal(textoHace(60), "Hace 1 h");
  assert.equal(textoHace(65), "Hace 1 h 5 min");
  assert.equal(textoHace(125.9), "Hace 2 h 5 min");
  assert.equal(textoHace(-3), "Hace 0 min");
});

// ---- Marcar atendida (8.3) ----
test("marcar atendida: éxito, cita que ya no está confirmada y sin permiso", () => {
  assert.deepEqual(mensajeDeResultado(exito()), { tipo: "exito", texto: "Cita marcada como atendida" });
  assert.equal(MENSAJE_CITA_ATENDIDA, "Cita marcada como atendida");
  assert.equal(MENSAJE_CITA_YA_NO_CONFIRMADA, "La cita ya no está confirmada. Actualice la pantalla");
  const noConfirmada = { tipo: "error", texto: MENSAJE_CITA_YA_NO_CONFIRMADA };
  assert.deepEqual(mensajeDeResultado(fallo("TRANSICION_INVALIDA", "Solo se puede marcar «Atendida» una cita confirmada cuya hora ya empezó")), noConfirmada);
  assert.deepEqual(mensajeDeResultado(fallo("CITA_NO_VIGENTE", "La cita ya no está vigente")), noConfirmada, "una cita ajena o inexistente no revela si existe");
  assert.deepEqual(mensajeDeResultado(fallo("NO_AUTORIZADO", "No tiene permiso para realizar esta operación")), {
    tipo: "error",
    texto: "No tiene permiso para realizar esta operación",
  });
  assert.deepEqual(mensajeDeResultado(fallo("ERROR_INTERNO", "No se pudo completar la operación. Intente nuevamente.")), {
    tipo: "error",
    texto: "No se pudo completar la operación. Intente nuevamente.",
  });
});

test("orden del foco: la siguiente cita o, si no queda ninguna, el encabezado", () => {
  assert.equal(siguienteFoco(["a", "b", "c"], "a"), "b");
  assert.equal(siguienteFoco(["a", "b", "c"], "b"), "c");
  assert.equal(siguienteFoco(["a", "b", "c"], "c"), null, "la última pasa el foco al encabezado");
  assert.equal(siguienteFoco(["a"], "a"), null);
  assert.equal(siguienteFoco(["a", "b"], "z"), null);
  assert.equal(siguienteFoco([], "a"), null);
  assert.equal(ID_ENCABEZADO_JORNADA, "titulo-jornada");
});

// ---- Semana de turnos y avisos ----
test("la semana empieza el lunes: un domingo pertenece a la semana que termina en él", () => {
  assert.equal(lunesDeLaSemana("2026-10-12"), "2026-10-12");
  assert.equal(lunesDeLaSemana("2026-10-14"), "2026-10-12");
  assert.equal(lunesDeLaSemana("2026-10-18"), "2026-10-12");
  assert.equal(lunesDeLaSemana("2026-10-19"), "2026-10-19");
  assert.equal(lunesDeLaSemana("2027-01-01"), "2026-12-28");
  assert.deepEqual(diasDeLaSemana("2026-12-28"), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
});

test("la semana pedida por la dirección: una fecha real o, si no sirve, la de hoy", () => {
  assert.equal(semanaPedida("2032-03-03", HOY), "2032-03-01");
  assert.equal(semanaPedida(undefined, HOY), "2026-10-12");
  assert.equal(semanaPedida("2026-02-30", HOY), "2026-10-12");
  assert.equal(semanaPedida("basura", HOY), "2026-10-12");
});

test("encabezado de un día: nombre en español y dd/MM", () => {
  assert.deepEqual(encabezadoDeDia("2026-10-12"), { dia: "Lunes", fecha: "12/10" });
  assert.deepEqual(encabezadoDeDia("2026-10-18"), { dia: "Domingo", fecha: "18/10" });
});

test("causas de aviso: el texto de la spec y sin el motivo del bloqueo", () => {
  assert.deepEqual([...CAUSAS_DE_AVISO], ["enfermera_de_baja", "medico_de_baja", "bloqueo_de_agenda"]);
  assert.equal(textoCausa("bloqueo_de_agenda"), "El médico tiene un bloqueo de agenda ese día");
  assert.equal(textoCausa("medico_de_baja"), "El médico está dado de baja");
  assert.equal(textoCausa("enfermera_de_baja"), "La enfermera está dada de baja");
  assert.throws(() => textoCausa("otra"), /Causa de aviso desconocida/);
});

repetirEnZonas(import.meta.url);
