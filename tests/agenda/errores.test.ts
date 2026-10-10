// Pruebas de lib/citas/errores.ts (H3, tarea 7.1; openspec/changes/agenda-y-reserva/design.md, D5). Ejecutar con: npm run test:agenda
//
// Los errores de prueba son `NeonDbError` reales con `code` (y a veces `constraint`), que es lo que la tarea 1.4 comprobó
// que entrega el driver HTTP de Neon, también para los errores levantados desde PL/pgSQL.
import assert from "node:assert/strict";
import { test } from "node:test";
import { NeonDbError } from "@neondatabase/serverless";
import {
  CONTEXTOS_ERROR,
  MENSAJE_CANCELACION_TARDIA,
  MENSAJE_DOBLE_RESERVA,
  MENSAJE_REPROGRAMACION_TARDIA,
  MENSAJE_SOLAPE_BLOQUEO,
  MENSAJE_SOLAPE_DISPONIBILIDAD,
  MENSAJE_TRANSICION,
  sqlstateDe,
  traducirError,
  type ContextoError,
  type ErrorInesperado,
} from "../../lib/citas/errores.ts";

// Error con la forma que entrega el driver: `NeonDbError` con `code` y, si la base lo informa, `constraint`.
function errorDeBaseDeDatos(code: string, extras: { constraint?: string; message?: string } = {}) {
  const error = new NeonDbError(extras.message ?? `texto de Postgres para ${code}`);
  error.code = code;
  if (extras.constraint) error.constraint = extras.constraint;
  return error;
}

// Registrador de prueba: evita escribir en la consola y deja ver qué se registraría.
function espia() {
  const registros: ErrorInesperado[] = [];
  return { registros, registrar: (info: ErrorInesperado) => void registros.push(info) };
}

const CONTEXTOS_QUE_INSERTAN_CITAS: ContextoError[] = ["agendar", "reprogramar", "reasignar"];

test("el mensaje de doble reserva es exactamente «Registro de cita ya agendado», carácter por carácter", () => {
  assert.equal(MENSAJE_DOBLE_RESERVA, "Registro de cita ya agendado");
  assert.equal(MENSAJE_DOBLE_RESERVA.length, 28);
  // Códigos de carácter (ASCII), escritos a mano: descartan espacios no separables, tildes o signos distintos a simple vista.
  const esperado = [
    82, 101, 103, 105, 115, 116, 114, 111, 32, 100, 101, 32, 99, 105, 116, 97, 32, 121, 97, 32, 97, 103, 101, 110, 100,
    97, 100, 111,
  ];
  assert.deepEqual([...MENSAJE_DOBLE_RESERVA].map((c) => c.charCodeAt(0)), esperado);
});

test("23P01 y 40P01 al insertar una cita dan exactamente «Registro de cita ya agendado»", () => {
  for (const contexto of CONTEXTOS_QUE_INSERTAN_CITAS) {
    for (const code of ["23P01", "40P01"]) {
      const resultado = traducirError(errorDeBaseDeDatos(code), contexto);
      assert.equal(resultado.ok, false, `${contexto}/${code}`);
      assert.equal(resultado.codigo, "DOBLE_RESERVA", `${contexto}/${code}`);
      assert.equal(resultado.mensaje, "Registro de cita ya agendado", `${contexto}/${code}`);
    }
  }
});

test("la doble reserva se traduce igual con o sin `constraint` en el error", () => {
  // `23P01` real (citas_sin_cruce_medico), `23P01` sin restricción informada y `40P01` simulado en PL/pgSQL: nunca trae `constraint`.
  const conRestriccion = traducirError(errorDeBaseDeDatos("23P01", { constraint: "citas_sin_cruce_medico" }), "agendar");
  const delPaciente = traducirError(errorDeBaseDeDatos("23P01", { constraint: "citas_sin_cruce_paciente" }), "agendar");
  const sinRestriccion = traducirError(errorDeBaseDeDatos("23P01"), "agendar");
  const deadlock = traducirError(errorDeBaseDeDatos("40P01"), "agendar");
  for (const r of [conRestriccion, delPaciente, sinRestriccion, deadlock]) {
    assert.deepEqual(r, { ok: false, mensaje: MENSAJE_DOBLE_RESERVA, codigo: "DOBLE_RESERVA" });
  }
});

test("23P01 en bloqueos y en disponibilidades da su propio mensaje de solape, no el de doble reserva", () => {
  const bloqueo = traducirError(errorDeBaseDeDatos("23P01", { constraint: "bloqueos_agenda_medico_id_rango_excl" }), "bloqueo");
  assert.equal(bloqueo.codigo, "SOLAPE");
  assert.equal(bloqueo.mensaje, "Ya existe una ausencia registrada que se cruza con ese periodo");
  assert.equal(bloqueo.mensaje, MENSAJE_SOLAPE_BLOQUEO);
  assert.notEqual(bloqueo.mensaje, MENSAJE_DOBLE_RESERVA);

  const disponibilidad = traducirError(errorDeBaseDeDatos("23P01", { constraint: "disponibilidades_sin_solape" }), "disponibilidad");
  assert.equal(disponibilidad.codigo, "SOLAPE");
  assert.equal(disponibilidad.mensaje, "Este horario se cruza con otro ya definido para el médico");
  assert.equal(disponibilidad.mensaje, MENSAJE_SOLAPE_DISPONIBILIDAD);
  assert.notEqual(disponibilidad.mensaje, MENSAJE_DOBLE_RESERVA);
});

test("un 40P01 fuera de una inserción de citas no se disfraza de doble reserva", () => {
  const { registros, registrar } = espia();
  for (const contexto of CONTEXTOS_ERROR.filter((c) => !CONTEXTOS_QUE_INSERTAN_CITAS.includes(c))) {
    for (const code of ["23P01", "40P01"]) {
      // 23P01 es solape en disponibilidad y bloqueo; en el resto de contextos tampoco es doble reserva.
      const resultado = traducirError(errorDeBaseDeDatos(code), contexto, registrar);
      assert.notEqual(resultado.mensaje, MENSAJE_DOBLE_RESERVA, `${contexto}/${code}`);
      assert.notEqual(resultado.codigo, "DOBLE_RESERVA", `${contexto}/${code}`);
    }
  }
  // Los que no son solape caen en el genérico y quedan registrados.
  assert.equal(traducirError(errorDeBaseDeDatos("40P01"), "bloqueo", registrar).codigo, "ERROR_INTERNO");
  assert.ok(registros.length > 0);
});

test("P0001 es la ventana de cancelación y el mensaje de reprogramar lo dice", () => {
  const cancelar = traducirError(errorDeBaseDeDatos("P0001"), "cancelar");
  assert.equal(cancelar.codigo, "CANCELACION_TARDIA");
  assert.equal(cancelar.mensaje, "No es posible cancelar con menos de 1 hora de anticipación");
  assert.equal(cancelar.mensaje, MENSAJE_CANCELACION_TARDIA);

  const reprogramar = traducirError(errorDeBaseDeDatos("P0001"), "reprogramar");
  assert.equal(reprogramar.codigo, "CANCELACION_TARDIA");
  assert.equal(reprogramar.mensaje, "No es posible reprogramar con menos de 1 hora de anticipación");
  assert.equal(reprogramar.mensaje, MENSAJE_REPROGRAMACION_TARDIA);

  // La reasignación también cancela la original: mismo código.
  assert.equal(traducirError(errorDeBaseDeDatos("P0001"), "reasignar").codigo, "CANCELACION_TARDIA");
});

test("UC001 a UC004 mapean a su código y mensaje", () => {
  assert.deepEqual(traducirError(errorDeBaseDeDatos("UC001"), "agendar"), {
    ok: false,
    codigo: "HORARIO_NO_DISPONIBLE",
    mensaje: "El horario elegido ya no está disponible. Elija otro horario.",
  });
  assert.deepEqual(traducirError(errorDeBaseDeDatos("UC002"), "reprogramar"), {
    ok: false,
    codigo: "CITA_NO_VIGENTE",
    mensaje: "La cita ya no está vigente",
  });
  assert.deepEqual(traducirError(errorDeBaseDeDatos("UC003"), "reasignar"), {
    ok: false,
    codigo: "REASIGNACION_INVALIDA",
    mensaje: "Esta reasignación no corresponde a la baja registrada",
  });
  assert.equal(traducirError(errorDeBaseDeDatos("UC004"), "confirmar").codigo, "TRANSICION_INVALIDA");
});

test("UC004 da el mensaje propio de cada acción", () => {
  const confirmar = traducirError(errorDeBaseDeDatos("UC004"), "confirmar");
  const noAsistio = traducirError(errorDeBaseDeDatos("UC004"), "no_asistio");
  const atendida = traducirError(errorDeBaseDeDatos("UC004"), "atendida");
  assert.equal(confirmar.mensaje, "Solo se puede confirmar una cita reservada que aún no terminó");
  assert.equal(noAsistio.mensaje, "Solo se puede marcar «No asistió» una cita confirmada cuya hora ya empezó");
  assert.equal(atendida.mensaje, "Solo se puede marcar «Atendida» una cita confirmada cuya hora ya empezó");
  assert.equal(new Set([confirmar.mensaje, noAsistio.mensaje, atendida.mensaje]).size, 3);
  assert.deepEqual(
    [confirmar.mensaje, noAsistio.mensaje, atendida.mensaje],
    [MENSAJE_TRANSICION.confirmar, MENSAJE_TRANSICION.no_asistio, MENSAJE_TRANSICION.atendida],
  );
});

test("UC004 fuera de una transición no inventa un mensaje: cae en el genérico", () => {
  const { registros, registrar } = espia();
  const resultado = traducirError(errorDeBaseDeDatos("UC004"), "agendar", registrar);
  assert.equal(resultado.codigo, "ERROR_INTERNO");
  assert.equal(registros.length, 1);
});

test("42501 mapea a NO_AUTORIZADO en cualquier contexto", () => {
  for (const contexto of CONTEXTOS_ERROR) {
    const resultado = traducirError(errorDeBaseDeDatos("42501"), contexto);
    assert.deepEqual(resultado, {
      ok: false,
      codigo: "NO_AUTORIZADO",
      mensaje: "No tiene permiso para realizar esta operación",
    });
  }
});

test("23505 es documento duplicado al registrar un paciente", () => {
  const resultado = traducirError(errorDeBaseDeDatos("23505", { constraint: "pacientes_documento_unico" }), "registrar_paciente");
  assert.deepEqual(resultado, {
    ok: false,
    codigo: "DOCUMENTO_DUPLICADO",
    mensaje: "Ya existe un paciente con ese documento",
  });
  // En otro contexto, un 23505 no es un documento duplicado.
  const { registrar } = espia();
  assert.equal(traducirError(errorDeBaseDeDatos("23505"), "agendar", registrar).codigo, "ERROR_INTERNO");
});

test("un error desconocido da el mensaje genérico, sin texto de Postgres, y se registra solo con acción y SQLSTATE", () => {
  const { registros, registrar } = espia();
  const textoDePostgres = 'relation "public.pacientes" does not exist: paciente 99000001 Quispe';
  const resultado = traducirError(errorDeBaseDeDatos("42P01", { message: textoDePostgres }), "agendar", registrar);
  assert.deepEqual(resultado, {
    ok: false,
    codigo: "ERROR_INTERNO",
    mensaje: "No se pudo completar la operación. Intente nuevamente.",
  });
  assert.ok(!resultado.mensaje.includes("relation") && !resultado.mensaje.includes("pacientes"));
  assert.deepEqual(registros, [{ contexto: "agendar", sqlstate: "42P01", clase: "NeonDbError" }]);
  assert.ok(!JSON.stringify(registros).includes("99000001"), "el registro no lleva datos del paciente ni el texto del error");
});

test("lo que no es un error de la base de datos también da el genérico", () => {
  const { registros, registrar } = espia();
  for (const raro of [new Error("boom"), "texto", null, undefined, 42, { code: 23505 }, { code: "ECONNRESET" }]) {
    const resultado = traducirError(raro, "cancelar", registrar);
    assert.equal(resultado.codigo, "ERROR_INTERNO");
    assert.equal(resultado.mensaje, "No se pudo completar la operación. Intente nuevamente.");
  }
  assert.equal(registros.length, 7);
  assert.equal(registros[0]?.sqlstate, null);
});

test("el SQLSTATE también se lee de `cause` si el error viene envuelto", () => {
  const envuelto = new Error("fallo al reservar", { cause: errorDeBaseDeDatos("23P01") });
  assert.equal(sqlstateDe(envuelto), "23P01");
  assert.equal(traducirError(envuelto, "agendar").mensaje, MENSAJE_DOBLE_RESERVA);
  assert.equal(sqlstateDe(new Error("sin código")), null);
  assert.equal(sqlstateDe({ code: "ECONNRESET" }), null);
});

test("ningún mensaje al usuario contiene texto de Postgres, sea cual sea el código o el contexto", () => {
  const codigos = ["23P01", "40P01", "P0001", "UC001", "UC002", "UC003", "UC004", "42501", "23505", "42P01", "22003"];
  const textoDePostgres = 'conflicting key value violates exclusion constraint "citas_sin_cruce_medico"';
  const { registrar } = espia();
  for (const contexto of CONTEXTOS_ERROR) {
    for (const code of codigos) {
      const resultado = traducirError(errorDeBaseDeDatos(code, { message: textoDePostgres }), contexto, registrar);
      assert.ok(!/exclusion|constraint|violates|citas_sin_cruce|relation|Key \(/i.test(resultado.mensaje), `${contexto}/${code}`);
    }
  }
});
