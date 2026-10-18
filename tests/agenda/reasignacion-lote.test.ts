// Reasignación por baja: eventos fila por fila y recuperación de una fila incierta (H3, tarea 11.2; specs/reasignacion-por-baja-
// medica). Cada fila es una transacción confirmada por separado, así que (a) su evento sale apenas se hace, antes de intentar la
// siguiente, y (b) si la respuesta de una fila se perdió después de confirmar, no se declara fallida sin comprobarlo. Sin Clerk,
// sin red y sin base de datos. Ejecutar con: npm run test:agenda.
import assert from "node:assert/strict";
import { test } from "node:test";
import { exigirPersonal, type DependenciasPersonal } from "../../lib/auth/accion-personal.ts";
import { casoReasignarPorBaja, RUTAS_BAJAS, type Entorno } from "../../lib/citas/casos-de-uso.ts";
import { reasignarPorBaja } from "../../lib/citas/reservas.ts";
import { MENSAJE_ERROR_INTERNO } from "../../lib/acciones/resultado.ts";
import type { Ejecutor, Fila, Sentencia } from "../../lib/db/ejecutor.ts";
import type { EventoCita } from "../../lib/notificaciones/eventos-cita.ts";

const BLOQUEO = "77777777-7777-4777-8777-777777777777";
const SUSTITUTO = "33333333-3333-4333-8333-333333333333";
const CITAS = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"];
const INICIO = "2026-10-14T19:30:00.000Z";
const FIN = "2026-10-14T19:50:00.000Z";
const fila = (cita: string) => ({ cita_id: cita, medico_id: SUSTITUTO, inicio: INICIO, fin: FIN });

const errorSql = (code: string) => Object.assign(new Error("texto de postgres en inglés"), { code });
const esReasignacion = (s: Sentencia) => s.texto.includes("reasignar_cita_por_baja");

// Silencia el registro de errores inesperados (`traducirError` lo escribe en `console.error`) mientras corre `fn`.
async function sinRegistro<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => undefined;
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

function entornoConBitacora(respuesta: (s: Sentencia, n: number) => Fila[]) {
  const bitacora: string[] = [];
  const dependencias: DependenciasPersonal = {
    obtenerSesion: async () => ({ usuarioId: "user_1", rol: "administrativo" }),
    tieneMfa: async () => true,
    registrar: () => undefined,
  };
  let n = 0;
  const ejecutar: Ejecutor = async (sentencias) =>
    sentencias.map((s) => {
      const filas = respuesta(s, n++);
      bitacora.push(esReasignacion(s) ? `base:${String(s.parametros![0]).slice(0, 2)}` : "base:comprobación");
      return filas;
    });
  const refrescadas: (readonly string[])[] = [];
  const entorno: Entorno = {
    guarda: (rol) => exigirPersonal(rol, dependencias),
    ejecutar,
    refrescar: (rutas) => void refrescadas.push(rutas),
    emitir: (evento: EventoCita) => void bitacora.push(`evento:${evento.tipo === "cita_reprogramada" ? `${evento.citaAnteriorId.slice(0, 2)}→${evento.citaId}` : evento.tipo}`),
  };
  return { entorno, bitacora, refrescadas };
}

test("el evento de cada fila sale apenas se hace, antes de intentar la siguiente", async () => {
  const { entorno, bitacora } = entornoConBitacora((s) => (esReasignacion(s) ? [{ id: `nueva-${String(s.parametros![0]).slice(0, 2)}` }] : []));
  await casoReasignarPorBaja(entorno, { bloqueo_id: BLOQUEO, reasignaciones: CITAS.map(fila) });
  assert.deepEqual(bitacora, [
    "base:aa", "evento:aa→nueva-aa",
    "base:bb", "evento:bb→nueva-bb",
    "base:cc", "evento:cc→nueva-cc",
  ]);
});

test("si el lote se corta a la mitad, las filas ya hechas conservan su evento", async () => {
  // La segunda fila lanza algo que no es de la base de datos (p. ej. se agota el tiempo): el lote sigue, pero lo que importa es que
  // el evento de la primera ya salió ANTES de ese fallo y no depende de que el lote termine.
  const { entorno, bitacora } = entornoConBitacora((s, n) => {
    if (n === 1) throw errorSql("57P01");
    return esReasignacion(s) ? [{ id: "nueva" }] : [];
  });
  await sinRegistro(() => casoReasignarPorBaja(entorno, { bloqueo_id: BLOQUEO, reasignaciones: CITAS.slice(0, 2).map(fila) }));
  assert.equal(bitacora[0], "base:aa");
  assert.equal(bitacora[1], "evento:aa→nueva", "el evento de la primera salió antes de tocar la segunda");
});

test("una fila cuya respuesta se perdió tras confirmar se recupera: queda hecha, con la cita nueva y su evento", async () => {
  const { ejecutar, llamadasDe } = ejecutorConRecuperacion({ comprobacion: [{ id: "nueva-recuperada" }] });
  const eventos: { citaId: string; id: string }[] = [];
  const r = await sinRegistro(() =>
    reasignarPorBaja(ejecutar, { bloqueo_id: BLOQUEO, reasignaciones: [fila(CITAS[0]!)] }, { alHacerseFila: (f) => void eventos.push(f) }),
  );
  assert.deepEqual(r, { ok: true, datos: { bloqueoId: BLOQUEO, filas: [{ ok: true, citaId: CITAS[0], id: "nueva-recuperada" }] } });
  assert.deepEqual(eventos, [{ citaId: CITAS[0]!, id: "nueva-recuperada" }]);
  // La comprobación busca una cita vigente que apunte a la original, con el MISMO médico y horario.
  const comprobacion = llamadasDe().find((s) => !esReasignacion(s))!;
  assert.match(comprobacion.texto, /reprogramada_de = \$1 and medico_id = \$2 and inicio = \$3 and estado in \('reservada', 'confirmada'\)/);
  assert.deepEqual(comprobacion.parametros, [CITAS[0], SUSTITUTO, INICIO]);
});

test("si la comprobación no encuentra la cita nueva, o falla ella misma, la fila queda como error genérico y sin evento", async () => {
  const comprobaciones: (Fila[] | "lanza")[] = [[], "lanza"];
  for (const comprobacion of comprobaciones) {
    const { ejecutar } = ejecutorConRecuperacion({ comprobacion });
    const eventos: unknown[] = [];
    const r = await sinRegistro(() =>
      reasignarPorBaja(ejecutar, { bloqueo_id: BLOQUEO, reasignaciones: [fila(CITAS[0]!)] }, { alHacerseFila: (f) => void eventos.push(f) }),
    );
    assert.deepEqual(r.ok && r.datos.filas, [{ ok: false, citaId: CITAS[0], codigo: "ERROR_INTERNO", mensaje: MENSAJE_ERROR_INTERNO }]);
    assert.equal(eventos.length, 0);
  }
});

test("un error CONOCIDO (reasignación inválida, doble reserva) no se «recupera»: no se hace ninguna comprobación", async () => {
  for (const code of ["UC003", "23P01", "42501", "UC002"]) {
    const { ejecutar, llamadasDe } = ejecutorConRecuperacion({ codigo: code, comprobacion: [{ id: "no-debe-usarse" }] });
    const r = await reasignarPorBaja(ejecutar, { bloqueo_id: BLOQUEO, reasignaciones: [fila(CITAS[0]!)] });
    assert.equal(r.ok && r.datos.filas[0]?.ok, false, code);
    assert.equal(llamadasDe().filter((s) => !esReasignacion(s)).length, 0, `${code}: sin comprobación`);
  }
});

test("un callback de eventos que lanza no cambia el resultado de la fila", async () => {
  const { ejecutar } = ejecutorConRecuperacion({ exito: [{ id: "nueva" }] });
  const r = await reasignarPorBaja(
    ejecutar,
    { bloqueo_id: BLOQUEO, reasignaciones: [fila(CITAS[0]!)] },
    {
      alHacerseFila: () => {
        throw new Error("falló el notificador");
      },
    },
  );
  assert.deepEqual(r.ok && r.datos.filas, [{ ok: true, citaId: CITAS[0], id: "nueva" }]);
});

test("la reasignación completa refresca la agenda y las bajas una sola vez", async () => {
  const { entorno, refrescadas } = entornoConBitacora((s) => (esReasignacion(s) ? [{ id: "nueva" }] : []));
  await casoReasignarPorBaja(entorno, { bloqueo_id: BLOQUEO, reasignaciones: CITAS.map(fila) });
  assert.deepEqual(refrescadas, [RUTAS_BAJAS]);
});

// Ejecutor de una sola fila: la reasignación responde `exito` o lanza `codigo` (por defecto, un error inesperado); la sentencia
// de comprobación responde `comprobacion` (o lanza si es «lanza»).
function ejecutorConRecuperacion(opciones: { exito?: Fila[]; codigo?: string; comprobacion?: Fila[] | "lanza" }) {
  const llamadas: Sentencia[] = [];
  const ejecutar: Ejecutor = async (sentencias) =>
    sentencias.map((s) => {
      llamadas.push(s);
      if (esReasignacion(s)) {
        if (opciones.exito) return opciones.exito;
        throw errorSql(opciones.codigo ?? "57P01");
      }
      if (opciones.comprobacion === "lanza") throw errorSql("57P01");
      return opciones.comprobacion ?? [];
    });
  return { ejecutar, llamadasDe: () => llamadas };
}
