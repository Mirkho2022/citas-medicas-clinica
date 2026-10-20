// Pruebas de lib/citas/reservas.ts, lib/citas/advertencia.ts y de los casos de uso de agendar, cancelar, reprogramar y
// reasignar (H3, tareas 10.2, 10.3 y 11.2; specs/gestion-de-citas y reasignacion-por-baja-medica). Ejecutar con: npm run
// test:agenda, también con TZ=UTC y TZ=Asia/Tokyo. Sin Clerk, sin Next, sin red y sin base de datos: el ejecutor y el entorno
// son dobles y la guarda real (`exigirPersonal`) corre con dependencias inyectadas. Lo que sí toca la base de datos (las
// funciones, la ventana de 1 hora, la doble reserva y la RLS de cada rol) está en tests/integracion/reservas.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MENSAJE_NO_AUTORIZADO } from "../../lib/acciones/resultado.ts";
import { exigirPersonal, type DependenciasPersonal } from "../../lib/auth/accion-personal.ts";
import type { Rol } from "../../lib/auth/rol.ts";
import { advertenciaCancelacion } from "../../lib/citas/advertencia.ts";
import {
  casoCancelarCita,
  casoReasignarPorBaja,
  casoReprogramarCita,
  casoReservarCita,
  RUTAS_AGENDA,
  RUTAS_BAJAS,
  type Entorno,
} from "../../lib/citas/casos-de-uso.ts";
import {
  MENSAJE_CANCELACION_TARDIA,
  MENSAJE_CITA_NO_VIGENTE,
  MENSAJE_DOBLE_RESERVA,
  MENSAJE_HORARIO_NO_DISPONIBLE,
  MENSAJE_REASIGNACION_INVALIDA,
  MENSAJE_REPROGRAMACION_TARDIA,
} from "../../lib/citas/errores.ts";
import { cancelarCita, reasignarPorBaja, reprogramarCita, reservarCita } from "../../lib/citas/reservas.ts";
import type { Ejecutor, Fila, Sentencia } from "../../lib/db/ejecutor.ts";
import type { EventoCita } from "../../lib/notificaciones/eventos-cita.ts";
import { MAXIMO_REASIGNACIONES_POR_ENVIO } from "../../lib/schemas/cita.ts";

const PACIENTE = "11111111-1111-4111-8111-111111111111";
const MEDICO = "22222222-2222-4222-8222-222222222222";
const SUSTITUTO = "33333333-3333-4333-8333-333333333333";
const CITA = "44444444-4444-4444-8444-444444444444";
const CITA_2 = "55555555-5555-4555-8555-555555555555";
const NUEVA = "66666666-6666-4666-8666-666666666666";
const BLOQUEO = "77777777-7777-4777-8777-777777777777";

const INICIO = "2026-10-14T19:30:00.000Z"; // 14:30 de Lima
const FIN = "2026-10-14T19:50:00.000Z";

// Ejecutor de prueba: responde sentencia por sentencia con la función `respuesta` (que puede lanzar).
function ejecutorDe(respuesta: (sentencia: Sentencia, n: number) => Fila[] | never = () => []) {
  const llamadas: Sentencia[] = [];
  const ejecutar: Ejecutor = async (sentencias) => {
    const resultados: Fila[][] = [];
    for (const sentencia of sentencias) {
      llamadas.push(sentencia);
      resultados.push(respuesta(sentencia, llamadas.length - 1));
    }
    return resultados;
  };
  return { ejecutar, llamadas };
}

const errorSql = (code: string) => Object.assign(new Error("texto de postgres en inglés"), { code });
const falla = (code: string) => () => {
  throw errorSql(code);
};

const RESERVA = { paciente_id: PACIENTE, medico_id: MEDICO, inicio: INICIO, fin: FIN };

// ---- Advertencia de la ventana de cancelación ----
test("la advertencia de una cita a las 14:30 dice que puede cancelarse hasta las 13:30 de Lima, con el texto exacto de la spec", () => {
  const ahora = new Date("2026-10-13T12:00:00.000Z");
  const a = advertenciaCancelacion(INICIO, ahora);
  assert.equal(a.texto, "Informe al paciente: la cita solo puede cancelarse hasta 1 hora antes, a las 13:30.");
  assert.equal(a.horaLimite, "13:30");
  assert.equal(a.sePuedeCancelar, true);
  // Acepta el instante como `Date` o como texto ISO.
  assert.deepEqual(advertenciaCancelacion(new Date(INICIO), ahora), a);
});

test("la advertencia de una cita que empieza en menos de 1 hora dice que ya no podrá cancelarse", () => {
  const dentroDe40Min = new Date(new Date(INICIO).getTime() - 40 * 60 * 1000);
  const a = advertenciaCancelacion(INICIO, dentroDe40Min);
  assert.equal(a.sePuedeCancelar, false);
  assert.match(a.texto, /no podrá cancelarse porque falta menos de 1 hora/);
  assert.doesNotMatch(a.texto, /a las \d{2}:\d{2}\./);
});

test("a exactamente 1 hora la cita todavía se puede cancelar; un milisegundo menos, ya no", () => {
  const inicio = new Date(INICIO).getTime();
  assert.equal(advertenciaCancelacion(INICIO, new Date(inicio - 60 * 60 * 1000)).sePuedeCancelar, true);
  assert.equal(advertenciaCancelacion(INICIO, new Date(inicio - 60 * 60 * 1000 + 1)).sePuedeCancelar, false);
});

test("la hora límite es la de Lima aunque el proceso corra en otra zona: la noche de Lima cruza la medianoche de UTC", () => {
  // 23:30 de Lima del 14/10 es 04:30Z del 15/10; la hora límite sigue siendo 22:30 de Lima.
  const noche = "2026-10-15T04:30:00.000Z";
  assert.equal(advertenciaCancelacion(noche, new Date("2026-10-14T12:00:00.000Z")).horaLimite, "22:30");
  // Una cita a las 00:30 de Lima: la hora límite (23:30) cae el día anterior.
  assert.equal(advertenciaCancelacion("2026-10-15T05:30:00.000Z", new Date("2026-10-14T12:00:00.000Z")).horaLimite, "23:30");
});

// ---- reservarCita ----
test("reservar sin paciente, sin médico o sin horario devuelve un mensaje por campo y no consulta la base de datos", async () => {
  for (const [entrada, campo] of [
    [{ medico_id: MEDICO, inicio: INICIO, fin: FIN }, "paciente_id"],
    [{ paciente_id: PACIENTE, inicio: INICIO, fin: FIN }, "medico_id"],
    [{ paciente_id: PACIENTE, medico_id: MEDICO, inicio: "", fin: "" }, "inicio"],
    [{ ...RESERVA, fin: INICIO }, "fin"],
  ] as const) {
    const { ejecutar, llamadas } = ejecutorDe();
    const r = await reservarCita(ejecutar, entrada);
    assert.equal(r.ok === false && r.codigo, "DATOS_INVALIDOS", campo);
    assert.ok(r.ok === false && r.campos?.[campo], `falta el mensaje de ${campo}`);
    assert.equal(llamadas.length, 0);
  }
});

test("reservar llama a reservar_cita con los instantes del servidor y el motivo opcional, y devuelve el id", async () => {
  const { ejecutar, llamadas } = ejecutorDe(() => [{ id: NUEVA }]);
  const r = await reservarCita(ejecutar, { ...RESERVA, motivo: "  Control " });
  assert.deepEqual(r, { ok: true, datos: { id: NUEVA } });
  assert.equal(llamadas[0]!.texto, "select public.reservar_cita($1, $2, $3, $4, $5) as id");
  assert.deepEqual(llamadas[0]!.parametros, [PACIENTE, MEDICO, INICIO, FIN, "Control"]);
});

test("la doble reserva, con 23P01 o con 40P01, da exactamente «Registro de cita ya agendado»", async () => {
  for (const codigo of ["23P01", "40P01"]) {
    const { ejecutar } = ejecutorDe(falla(codigo));
    for (const operacion of [
      () => reservarCita(ejecutar, RESERVA),
      () => reprogramarCita(ejecutar, { ...RESERVA, cita_id: CITA }),
    ]) {
      const r = await operacion();
      assert.deepEqual(r, { ok: false, codigo: "DOBLE_RESERVA", mensaje: "Registro de cita ya agendado" }, codigo);
    }
  }
  assert.equal(MENSAJE_DOBLE_RESERVA, "Registro de cita ya agendado");
});

test("un horario pasado o fuera de la agenda (UC001) y un rol sin permiso (42501) se traducen", async () => {
  const uc001 = await reservarCita(ejecutorDe(falla("UC001")).ejecutar, RESERVA);
  assert.deepEqual(uc001, { ok: false, codigo: "HORARIO_NO_DISPONIBLE", mensaje: MENSAJE_HORARIO_NO_DISPONIBLE });
  const sinPermiso = await reservarCita(ejecutorDe(falla("42501")).ejecutar, RESERVA);
  assert.deepEqual(sinPermiso, { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_NO_AUTORIZADO });
});

// ---- cancelarCita ----
test("cancelar es una sola sentencia que solo toca citas vigentes y devuelve el id", async () => {
  const { ejecutar, llamadas } = ejecutorDe(() => [{ id: CITA }]);
  assert.deepEqual(await cancelarCita(ejecutar, { cita_id: CITA }), { ok: true, datos: { id: CITA } });
  assert.equal(llamadas.length, 1);
  assert.match(llamadas[0]!.texto, /update public\.citas set estado = 'cancelada' where id = \$1 and estado in \('reservada', 'confirmada'\) returning id/);
  assert.deepEqual(llamadas[0]!.parametros, [CITA]);
});

test("cancelar una cita que no está vigente (cero filas) da «La cita ya no está vigente»", async () => {
  const r = await cancelarCita(ejecutorDe(() => []).ejecutar, { cita_id: CITA });
  assert.deepEqual(r, { ok: false, codigo: "CITA_NO_VIGENTE", mensaje: MENSAJE_CITA_NO_VIGENTE });
});

test("cancelar con menos de 1 hora (P0001) da el mensaje de la ventana, y reprogramar el suyo propio", async () => {
  const cancelar = await cancelarCita(ejecutorDe(falla("P0001")).ejecutar, { cita_id: CITA });
  assert.deepEqual(cancelar, { ok: false, codigo: "CANCELACION_TARDIA", mensaje: MENSAJE_CANCELACION_TARDIA });
  assert.equal(MENSAJE_CANCELACION_TARDIA, "No es posible cancelar con menos de 1 hora de anticipación");

  const reprogramar = await reprogramarCita(ejecutorDe(falla("P0001")).ejecutar, { ...RESERVA, cita_id: CITA });
  assert.deepEqual(reprogramar, { ok: false, codigo: "CANCELACION_TARDIA", mensaje: MENSAJE_REPROGRAMACION_TARDIA });
  assert.match(MENSAJE_REPROGRAMACION_TARDIA, /reprogramar/);
});

test("cancelar con un identificador inválido se rechaza sin consultar la base de datos", async () => {
  const { ejecutar, llamadas } = ejecutorDe();
  const r = await cancelarCita(ejecutar, { cita_id: "no-es-uuid" });
  assert.equal(r.ok === false && r.codigo, "DATOS_INVALIDOS");
  assert.equal(llamadas.length, 0);
});

// ---- reprogramarCita ----
test("reprogramar llama a reprogramar_cita con la cita original, el médico y el horario nuevos, y devuelve ambas citas", async () => {
  const { ejecutar, llamadas } = ejecutorDe(() => [{ id: NUEVA }]);
  const r = await reprogramarCita(ejecutar, { ...RESERVA, cita_id: CITA });
  assert.deepEqual(r, { ok: true, datos: { id: NUEVA, citaAnteriorId: CITA } });
  assert.equal(llamadas.length, 1, "una sola llamada: cancelar y crear ocurren dentro de la función, en una transacción");
  assert.equal(llamadas[0]!.texto, "select public.reprogramar_cita($1, $2, $3, $4, $5) as id");
  assert.deepEqual(llamadas[0]!.parametros, [CITA, MEDICO, INICIO, FIN, null]);
});

test("la reprogramación de una cita ya cancelada por otro (UC002) da «La cita ya no está vigente»", async () => {
  const r = await reprogramarCita(ejecutorDe(falla("UC002")).ejecutar, { ...RESERVA, cita_id: CITA });
  assert.deepEqual(r, { ok: false, codigo: "CITA_NO_VIGENTE", mensaje: MENSAJE_CITA_NO_VIGENTE });
});

// ---- reasignarPorBaja ----
const FILA = (cita: string, medico = SUSTITUTO) => ({ cita_id: cita, medico_id: medico, inicio: INICIO, fin: FIN });

test("reasignar hace una llamada por cita, en orden, con el bloqueo de la baja, y da un resultado por fila", async () => {
  const { ejecutar, llamadas } = ejecutorDe((_, n) => [{ id: `nueva-${n}` }]);
  const r = await reasignarPorBaja(ejecutar, { bloqueo_id: BLOQUEO, reasignaciones: [FILA(CITA), FILA(CITA_2)] });
  assert.deepEqual(r, {
    ok: true,
    datos: {
      bloqueoId: BLOQUEO,
      filas: [
        { ok: true, citaId: CITA, id: "nueva-0" },
        { ok: true, citaId: CITA_2, id: "nueva-1" },
      ],
    },
  });
  assert.equal(llamadas.length, 2);
  assert.equal(llamadas[0]!.texto, "select public.reasignar_cita_por_baja($1, $2, $3, $4, $5) as id");
  assert.deepEqual(llamadas[0]!.parametros, [CITA, BLOQUEO, SUSTITUTO, INICIO, FIN]);
  assert.deepEqual(llamadas[1]!.parametros, [CITA_2, BLOQUEO, SUSTITUTO, INICIO, FIN]);
});

test("tres filas con una fallida dejan dos reasignadas y la tercera, con su motivo (una fila no deshace las demás)", async () => {
  const { ejecutar, llamadas } = ejecutorDe((s) => {
    if (s.parametros![0] === CITA_2) throw errorSql("UC003");
    return [{ id: `nueva-${String(s.parametros![0]).slice(0, 2)}` }];
  });
  const TERCERA = "88888888-8888-4888-8888-888888888888";
  const r = await reasignarPorBaja(ejecutar, { bloqueo_id: BLOQUEO, reasignaciones: [FILA(CITA), FILA(CITA_2), FILA(TERCERA)] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(llamadas.length, 3, "se intentaron las tres");
  assert.deepEqual(r.datos.filas.map((f) => f.ok), [true, false, true]);
  assert.deepEqual(r.datos.filas[1], { ok: false, citaId: CITA_2, codigo: "REASIGNACION_INVALIDA", mensaje: MENSAJE_REASIGNACION_INVALIDA });
});

test("una fila con doble reserva o sin permiso se traduce y no detiene las siguientes", async () => {
  const codigos = ["23P01", "42501", null];
  const { ejecutar } = ejecutorDe((_, n) => {
    const codigo = codigos[n];
    if (codigo) throw errorSql(codigo);
    return [{ id: NUEVA }];
  });
  const r = await reasignarPorBaja(ejecutar, { bloqueo_id: BLOQUEO, reasignaciones: [FILA(CITA), FILA(CITA_2), FILA(NUEVA)] });
  assert.equal(r.ok && r.datos.filas[0]?.ok === false && r.datos.filas[0].codigo, "DOBLE_RESERVA");
  assert.equal(r.ok && r.datos.filas[0]?.ok === false && r.datos.filas[0].mensaje, "Registro de cita ya agendado");
  assert.equal(r.ok && r.datos.filas[1]?.ok === false && r.datos.filas[1].codigo, "NO_AUTORIZADO");
  assert.equal(r.ok && r.datos.filas[2]?.ok, true);
});

test("una fila inválida se marca como tal sin consultar la base de datos y las demás siguen", async () => {
  const { ejecutar, llamadas } = ejecutorDe(() => [{ id: NUEVA }]);
  const r = await reasignarPorBaja(ejecutar, {
    bloqueo_id: BLOQUEO,
    reasignaciones: [{ cita_id: CITA, medico_id: "", inicio: INICIO, fin: FIN }, FILA(CITA_2), null],
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(llamadas.length, 1, "solo la fila válida llega a la base de datos");
  assert.equal(r.datos.filas[0]?.ok === false && r.datos.filas[0].codigo, "DATOS_INVALIDOS");
  assert.equal(r.datos.filas[0]?.citaId, CITA);
  assert.equal(r.datos.filas[1]?.ok, true);
  assert.equal(r.datos.filas[2]?.ok === false && r.datos.filas[2].citaId, null);
});

test("reasignar sin baja, sin filas o con demasiadas filas se rechaza sin consultar la base de datos", async () => {
  for (const entrada of [
    { reasignaciones: [FILA(CITA)] },
    { bloqueo_id: BLOQUEO, reasignaciones: [] },
    { bloqueo_id: BLOQUEO },
    { bloqueo_id: BLOQUEO, reasignaciones: Array.from({ length: MAXIMO_REASIGNACIONES_POR_ENVIO + 1 }, () => FILA(CITA)) },
  ]) {
    const { ejecutar, llamadas } = ejecutorDe();
    const r = await reasignarPorBaja(ejecutar, entrada);
    assert.equal(r.ok === false && r.codigo, "DATOS_INVALIDOS", JSON.stringify(entrada).slice(0, 60));
    assert.equal(llamadas.length, 0);
  }
});

// ---- Casos de uso: guarda real, eventos tras el commit y refresco ----
function entornoDe(opciones: { rol: Rol | null; respuesta?: (s: Sentencia, n: number) => Fila[]; emitir?: (e: EventoCita) => Promise<void> | void }) {
  const dependencias: DependenciasPersonal = {
    obtenerSesion: async () => ({ usuarioId: "user_1", rol: opciones.rol }),
    tieneMfa: async () => true,
    registrar: () => undefined,
  };
  const { ejecutar, llamadas } = ejecutorDe(opciones.respuesta ?? (() => [{ id: NUEVA }]));
  const refrescadas: (readonly string[])[] = [];
  const emitidos: EventoCita[] = [];
  const entorno: Entorno = {
    guarda: (rol) => exigirPersonal(rol, dependencias),
    ejecutar,
    refrescar: (rutas) => void refrescadas.push(rutas),
    emitir: opciones.emitir ?? ((evento) => void emitidos.push(evento)),
  };
  return { entorno, llamadas, refrescadas, emitidos };
}

test("agendar emite UN cita_reservada tras el commit y refresca la agenda", async () => {
  const { entorno, refrescadas, emitidos } = entornoDe({ rol: "administrativo" });
  const r = await casoReservarCita(entorno, RESERVA);
  assert.deepEqual(r, { ok: true, datos: { id: NUEVA } });
  assert.deepEqual(emitidos, [{ tipo: "cita_reservada", citaId: NUEVA }]);
  assert.deepEqual(refrescadas, [RUTAS_AGENDA]);
});

test("cancelar emite cita_cancelada, y una cancelación rechazada no emite ni refresca", async () => {
  const bien = entornoDe({ rol: "administrativo", respuesta: () => [{ id: CITA }] });
  await casoCancelarCita(bien.entorno, { cita_id: CITA });
  assert.deepEqual(bien.emitidos, [{ tipo: "cita_cancelada", citaId: CITA }]);

  const tarde = entornoDe({ rol: "administrativo", respuesta: falla("P0001") });
  const r = await casoCancelarCita(tarde.entorno, { cita_id: CITA });
  assert.equal(r.ok === false && r.codigo, "CANCELACION_TARDIA");
  assert.deepEqual(tarde.emitidos, []);
  assert.deepEqual(tarde.refrescadas, []);
});

test("la reprogramación emite UN solo cita_reprogramada con la cita nueva, la original y el motivo", async () => {
  const { entorno, emitidos } = entornoDe({ rol: "administrativo" });
  await casoReprogramarCita(entorno, { ...RESERVA, cita_id: CITA });
  assert.deepEqual(emitidos, [{ tipo: "cita_reprogramada", citaId: NUEVA, citaAnteriorId: CITA, motivo: "reprogramacion" }]);
  assert.equal(emitidos.filter((e) => e.tipo === "cita_cancelada" || e.tipo === "cita_reservada").length, 0, "no se emiten una cancelación y una reserva además");
});

test("la reasignación emite un cita_reprogramada con motivo baja_medica por cada fila que se hizo, y solo por ellas", async () => {
  const { entorno, emitidos, refrescadas } = entornoDe({
    rol: "administrativo",
    respuesta: (s) => {
      if (s.parametros![0] === CITA_2) throw errorSql("UC003");
      return [{ id: `nueva-de-${s.parametros![0]}` }];
    },
  });
  await casoReasignarPorBaja(entorno, { bloqueo_id: BLOQUEO, reasignaciones: [FILA(CITA), FILA(CITA_2)] });
  assert.deepEqual(emitidos, [{ tipo: "cita_reprogramada", citaId: `nueva-de-${CITA}`, citaAnteriorId: CITA, motivo: "baja_medica" }]);
  assert.deepEqual(refrescadas, [RUTAS_BAJAS]);
});

test("un notificador que lanza (o rechaza) no cambia el resultado de una operación ya confirmada", async () => {
  for (const emitir of [
    () => {
      throw new Error("falló el notificador");
    },
    () => Promise.reject(new Error("falló el notificador")),
  ]) {
    const { entorno, refrescadas } = entornoDe({ rol: "administrativo", emitir });
    const r = await casoReservarCita(entorno, RESERVA);
    assert.deepEqual(r, { ok: true, datos: { id: NUEVA } });
    assert.deepEqual(refrescadas, [RUTAS_AGENDA]);
  }
});

test("el médico, la enfermera, el paciente y una sesión sin rol no operan la agenda: la guarda los rechaza sin consultar ni emitir", async () => {
  for (const rol of ["medico", "enfermera", "paciente", null] as const) {
    for (const caso of [
      (e: Entorno) => casoReservarCita(e, RESERVA),
      (e: Entorno) => casoCancelarCita(e, { cita_id: CITA }),
      (e: Entorno) => casoReprogramarCita(e, { ...RESERVA, cita_id: CITA }),
      (e: Entorno) => casoReasignarPorBaja(e, { bloqueo_id: BLOQUEO, reasignaciones: [FILA(CITA)] }),
    ]) {
      const { entorno, llamadas, emitidos, refrescadas } = entornoDe({ rol });
      const r = await caso(entorno);
      assert.equal(r.ok === false && r.codigo, "NO_AUTORIZADO", String(rol));
      assert.equal(llamadas.length, 0);
      assert.equal(emitidos.length, 0);
      assert.equal(refrescadas.length, 0);
    }
  }
});
