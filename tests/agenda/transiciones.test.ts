// Pruebas de lib/citas/transiciones.ts y de los casos de uso que las componen (H3, tareas 10.4 y 10.5; design.md, D13).
// Ejecutar con: npm run test:agenda. Sin Clerk, sin Next, sin red y sin base de datos: el ejecutor y el entorno son dobles y la
// guarda real (`exigirPersonal`) corre con dependencias inyectadas. Lo que sí toca la base de datos (el disparador de
// transiciones y la función `marcar_cita_atendida`, con la RLS de cada rol) está en tests/integracion/transiciones.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MENSAJE_ERROR_INTERNO, MENSAJE_NO_AUTORIZADO } from "../../lib/acciones/resultado.ts";
import { exigirPersonal, MENSAJE_MFA_REQUERIDO, MENSAJE_SESION_REQUERIDA, type DependenciasPersonal } from "../../lib/auth/accion-personal.ts";
import type { Rol } from "../../lib/auth/rol.ts";
import {
  casoConfirmarCita,
  casoMarcarAtendida,
  casoMarcarNoAsistio,
  RUTAS_AGENDA,
  RUTAS_JORNADA_MEDICO,
  type Entorno,
} from "../../lib/citas/casos-de-uso.ts";
import { MENSAJE_CITA_NO_VIGENTE, MENSAJE_TRANSICION } from "../../lib/citas/errores.ts";
import { confirmarCita, marcarAtendida, marcarNoAsistio } from "../../lib/citas/transiciones.ts";
import type { Ejecutor, Fila, Sentencia } from "../../lib/db/ejecutor.ts";

const CITA = "44444444-4444-4444-8444-444444444444";

function ejecutorDe(opciones: { filas?: Fila[]; error?: unknown } = {}) {
  const llamadas: Sentencia[][] = [];
  const ejecutar: Ejecutor = async (sentencias) => {
    llamadas.push([...sentencias]);
    if (opciones.error !== undefined) throw opciones.error;
    return [opciones.filas ?? []];
  };
  return { ejecutar, llamadas };
}

const errorSql = (code: string) => Object.assign(new Error("texto de postgres en inglés"), { code });

test("confirmar y «No asistió» actualizan SOLO por id, sin filtrar por estado, para que el disparador decida", async () => {
  for (const [funcion, estado] of [[confirmarCita, "confirmada"], [marcarNoAsistio, "no_asistio"]] as const) {
    const { ejecutar, llamadas } = ejecutorDe({ filas: [{ estado }] });
    const r = await funcion(ejecutar, { cita_id: CITA });
    assert.deepEqual(r, { ok: true, datos: { estado } });
    assert.equal(llamadas.length, 1);
    const { texto, parametros } = llamadas[0]![0]!;
    assert.match(texto, /update public\.citas set estado = \$2 where id = \$1 returning estado/);
    // Sin `and estado …` en el WHERE: una transición inválida debe llegar al disparador (UC004) y no parecer «inexistente».
    assert.equal(/ where (.*?) returning/.exec(texto)?.[1], "id = $1");
    assert.deepEqual(parametros, [CITA, estado]);
  }
});

test("un identificador ausente o que no es uuid se rechaza sin consultar la base de datos", async () => {
  for (const entrada of [{}, { cita_id: "" }, { cita_id: "no-es-uuid" }, null, undefined]) {
    for (const funcion of [confirmarCita, marcarNoAsistio, marcarAtendida]) {
      const { ejecutar, llamadas } = ejecutorDe();
      const r = await funcion(ejecutar, entrada);
      assert.equal(r.ok === false && r.codigo, "DATOS_INVALIDOS", JSON.stringify(entrada));
      assert.equal(llamadas.length, 0);
    }
  }
});

test("cero filas (cita inexistente o invisible para el rol) es «La cita ya no está vigente»", async () => {
  for (const funcion of [confirmarCita, marcarNoAsistio]) {
    const { ejecutar } = ejecutorDe({ filas: [] });
    const r = await funcion(ejecutar, { cita_id: CITA });
    assert.deepEqual(r, { ok: false, codigo: "CITA_NO_VIGENTE", mensaje: MENSAJE_CITA_NO_VIGENTE });
  }
});

test("UC004 da el mensaje propio de cada acción y UC002, el de cita no vigente", async () => {
  const uc004 = ejecutorDe({ error: errorSql("UC004") });
  const confirmar = await confirmarCita(uc004.ejecutar, { cita_id: CITA });
  const noAsistio = await marcarNoAsistio(uc004.ejecutar, { cita_id: CITA });
  const atendida = await marcarAtendida(uc004.ejecutar, { cita_id: CITA });
  assert.deepEqual(confirmar, { ok: false, codigo: "TRANSICION_INVALIDA", mensaje: MENSAJE_TRANSICION.confirmar });
  assert.deepEqual(noAsistio, { ok: false, codigo: "TRANSICION_INVALIDA", mensaje: MENSAJE_TRANSICION.no_asistio });
  assert.deepEqual(atendida, { ok: false, codigo: "TRANSICION_INVALIDA", mensaje: MENSAJE_TRANSICION.atendida });
  assert.equal(new Set([confirmar, noAsistio, atendida].map((r) => r.ok === false && r.mensaje)).size, 3, "tres mensajes distintos");

  const uc002 = ejecutorDe({ error: errorSql("UC002") });
  const r = await marcarAtendida(uc002.ejecutar, { cita_id: CITA });
  assert.deepEqual(r, { ok: false, codigo: "CITA_NO_VIGENTE", mensaje: MENSAJE_CITA_NO_VIGENTE });
});

test("sin permiso (42501) devuelve no autorizado y cualquier otro error, el mensaje genérico sin texto de Postgres", async () => {
  const sinPermiso = ejecutorDe({ error: errorSql("42501") });
  for (const funcion of [confirmarCita, marcarNoAsistio, marcarAtendida]) {
    const r = await funcion(sinPermiso.ejecutar, { cita_id: CITA });
    assert.deepEqual(r, { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_NO_AUTORIZADO });
  }

  const original = console.error;
  const registrados: unknown[] = [];
  console.error = (...datos: unknown[]) => void registrados.push(datos);
  try {
    const caida = ejecutorDe({ error: errorSql("57P01") });
    const r = await confirmarCita(caida.ejecutar, { cita_id: CITA });
    assert.deepEqual(r, { ok: false, codigo: "ERROR_INTERNO", mensaje: MENSAJE_ERROR_INTERNO });
  } finally {
    console.error = original;
  }
  assert.doesNotMatch(JSON.stringify(registrados), /texto de postgres/);
});

test("marcar «Atendida» llama a la función de la base de datos y no escribe en `citas` por su cuenta", async () => {
  const { ejecutar, llamadas } = ejecutorDe({ filas: [{}] });
  const r = await marcarAtendida(ejecutar, { cita_id: CITA });
  assert.deepEqual(r, { ok: true, datos: undefined });
  assert.equal(llamadas[0]!.length, 1);
  assert.equal(llamadas[0]![0]!.texto, "select public.marcar_cita_atendida($1)");
  assert.deepEqual(llamadas[0]![0]!.parametros, [CITA]);
});

// ---- Casos de uso: guarda real (`exigirPersonal`) con dependencias inyectadas ----
function entornoDe(opciones: { rol: Rol | null; usuarioId?: string | null; mfa?: boolean; filas?: Fila[]; error?: unknown }) {
  const dependencias: DependenciasPersonal = {
    obtenerSesion: async () => ({ usuarioId: opciones.usuarioId === undefined ? "user_1" : opciones.usuarioId, rol: opciones.rol }),
    tieneMfa: async () => opciones.mfa ?? true,
    registrar: () => undefined,
  };
  const { ejecutar, llamadas } = ejecutorDe({ filas: opciones.filas, error: opciones.error });
  const refrescadas: (readonly string[])[] = [];
  const emitidos: unknown[] = [];
  const entorno: Entorno = {
    guarda: (rol) => exigirPersonal(rol, dependencias),
    ejecutar,
    refrescar: (rutas) => void refrescadas.push(rutas),
    emitir: (evento) => void emitidos.push(evento),
  };
  return { entorno, llamadas, refrescadas, emitidos };
}

test("un administrativo que intenta marcar «Atendida» es rechazado y no ejecuta ninguna consulta", async () => {
  const { entorno, llamadas, refrescadas } = entornoDe({ rol: "administrativo" });
  const r = await casoMarcarAtendida(entorno, { cita_id: CITA });
  assert.deepEqual(r, { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_NO_AUTORIZADO });
  assert.equal(llamadas.length, 0);
  assert.equal(refrescadas.length, 0);
});

test("un médico no confirma ni marca «No asistió»: solo el administrativo", async () => {
  for (const caso of [casoConfirmarCita, casoMarcarNoAsistio]) {
    const { entorno, llamadas } = entornoDe({ rol: "medico" });
    const r = await caso(entorno, { cita_id: CITA });
    assert.equal(r.ok === false && r.codigo, "NO_AUTORIZADO");
    assert.equal(llamadas.length, 0);
  }
});

test("paciente, enfermera, sin sesión y personal sin MFA son rechazados por la guarda en las tres acciones", async () => {
  const rechazos = [
    { rol: "paciente" as const, mensaje: MENSAJE_NO_AUTORIZADO },
    { rol: "enfermera" as const, mensaje: MENSAJE_NO_AUTORIZADO },
    { rol: "administrativo" as const, usuarioId: null, mensaje: MENSAJE_SESION_REQUERIDA },
    { rol: "administrativo" as const, mfa: false, mensaje: MENSAJE_MFA_REQUERIDO },
  ];
  for (const { mensaje, ...opciones } of rechazos) {
    for (const caso of [casoConfirmarCita, casoMarcarNoAsistio, casoMarcarAtendida]) {
      const { entorno, llamadas } = entornoDe(opciones);
      const r = await caso(entorno, { cita_id: CITA });
      assert.equal(r.ok === false && r.codigo, "NO_AUTORIZADO");
      assert.equal(llamadas.length, 0);
      if (opciones.rol === "paciente" || opciones.rol === "enfermera") assert.equal(r.ok === false && r.mensaje, mensaje);
    }
  }
});

test("con el rol correcto la operación sale, refresca las pantallas y no emite ningún evento de cita", async () => {
  const confirmada = entornoDe({ rol: "administrativo", filas: [{ estado: "confirmada" }] });
  assert.deepEqual(await casoConfirmarCita(confirmada.entorno, { cita_id: CITA }), { ok: true, datos: { estado: "confirmada" } });
  assert.deepEqual(confirmada.refrescadas, [RUTAS_AGENDA]);

  const atendida = entornoDe({ rol: "medico", filas: [{}] });
  assert.deepEqual(await casoMarcarAtendida(atendida.entorno, { cita_id: CITA }), { ok: true, datos: undefined });
  assert.deepEqual(atendida.refrescadas, [RUTAS_JORNADA_MEDICO]);

  // Confirmar, «No asistió» y «Atendida» no emiten eventos (design.md, D10 y D13).
  assert.deepEqual(confirmada.emitidos, []);
  assert.deepEqual(atendida.emitidos, []);
});

test("si la operación falla no se refrescan las pantallas", async () => {
  const { entorno, refrescadas } = entornoDe({ rol: "administrativo", error: errorSql("UC004") });
  const r = await casoConfirmarCita(entorno, { cita_id: CITA });
  assert.equal(r.ok === false && r.codigo, "TRANSICION_INVALIDA");
  assert.equal(refrescadas.length, 0);
});
