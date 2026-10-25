// Pruebas de lib/portal/cancelacion.ts (H4, tarea 7.2; specs/mis-citas-y-cancelacion). Ejecutar con: npm run test:portal
// El ejecutor se inyecta: sin Clerk, sin red y sin base de datos. La política, el disparador y la ventana de 1 hora se prueban aparte
// (pgTAP 71 e integración).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Ejecutor, Fila, Sentencia } from "../../lib/db/ejecutor.ts";
import { cancelarMiCita, type EventoCancelacionPortal } from "../../lib/portal/cancelacion.ts";
import {
  MENSAJE_CANCELACION_TARDIA,
  MENSAJE_CITA_NO_CANCELABLE,
  MENSAJE_CITA_NO_ENCONTRADA,
  MENSAJE_CITA_YA_CANCELADA,
  MENSAJE_SESION_VENCIDA,
} from "../../lib/portal/mensajes.ts";

const CITA = "33333333-3333-4333-8333-333333333333";

const errorPg = (code: string) => Object.assign(new Error("texto de la base de datos"), { code });

interface Escenario {
  // Filas que devuelve el `UPDATE … returning id` (vacío = cero filas) o el error que lanza.
  actualizar?: Fila[] | { error: unknown };
  // Estado de la cita que ve el paciente después de un cero filas; `null` = no la ve (ajena o inexistente).
  estadoVisible?: string | null;
}

function ejecutorSimulado(e: Escenario = {}) {
  const llamadas: Sentencia[] = [];
  const ejecutar: Ejecutor = async (sentencias) => {
    const respuestas: Fila[][] = [];
    for (const s of sentencias) {
      llamadas.push(s);
      if (/^\s*update public\.citas set estado = 'cancelada'/.test(s.texto)) {
        const r = e.actualizar ?? [{ id: CITA }];
        if (!Array.isArray(r)) throw r.error;
        respuestas.push(r);
      } else if (/select c\.estado::text as estado from public\.citas/.test(s.texto)) {
        respuestas.push(e.estadoVisible == null ? [] : [{ estado: e.estadoVisible }]);
      } else {
        throw new Error(`consulta inesperada: ${s.texto}`);
      }
    }
    return respuestas;
  };
  return { ejecutar, llamadas };
}

test("cancelar una cita propia con tiempo la deja cancelada y avisa con solo el identificador", async () => {
  const eventos: EventoCancelacionPortal[] = [];
  const { ejecutar, llamadas } = ejecutorSimulado();
  const r = await cancelarMiCita(ejecutar, { cita_id: CITA }, { emitir: (e) => void eventos.push(e) });
  assert.deepEqual(r, { ok: true, datos: { id: CITA } });
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0]!.parametros, [CITA]);
  assert.deepEqual(eventos, [{ tipo: "cita_cancelada", citaId: CITA }]);
});

test("la solicitud no puede cambiar nada más que el estado: la sentencia solo pone «cancelada»", async () => {
  const { ejecutar, llamadas } = ejecutorSimulado();
  await cancelarMiCita(ejecutar, { cita_id: CITA, medico_id: "otro", inicio: "2030-01-01T00:00:00Z", estado: "atendida", paciente_id: "otro" });
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0]!.parametros, [CITA], "solo el identificador de la cita llega a la base de datos");
  assert.match(llamadas[0]!.texto, /set estado = 'cancelada'/);
  assert.doesNotMatch(llamadas[0]!.texto, /medico_id\s*=\s*\$|inicio\s*=\s*\$|paciente_id\s*=\s*\$/);
});

test("menos de 1 hora (P0001) da el texto del portal, en usted, y no emite ningún evento", async () => {
  const eventos: EventoCancelacionPortal[] = [];
  const { ejecutar } = ejecutorSimulado({ actualizar: { error: errorPg("P0001") } });
  const r = await cancelarMiCita(ejecutar, { cita_id: CITA }, { emitir: (e) => void eventos.push(e) });
  assert.deepEqual(r, { ok: false, codigo: "CANCELACION_TARDIA", mensaje: MENSAJE_CANCELACION_TARDIA });
  assert.equal(
    MENSAJE_CANCELACION_TARDIA,
    "Ya no es posible cancelar esta cita porque falta menos de 1 hora. Si no puede asistir, avise a la clínica.",
  );
  assert.deepEqual(eventos, []);
});

test("una cita ajena y una inexistente dan exactamente el mismo mensaje y el mismo código", async () => {
  const ajena = ejecutorSimulado({ actualizar: [], estadoVisible: null }); // la RLS no deja ver ni actualizar la ajena
  const inexistente = ejecutorSimulado({ actualizar: [], estadoVisible: null });
  const a = await cancelarMiCita(ajena.ejecutar, { cita_id: CITA });
  const b = await cancelarMiCita(inexistente.ejecutar, { cita_id: "55555555-5555-4555-8555-555555555555" });
  assert.deepEqual(a, { ok: false, codigo: "CITA_NO_VIGENTE", mensaje: MENSAJE_CITA_NO_ENCONTRADA });
  assert.deepEqual(a, b);
  assert.ok(MENSAJE_CITA_NO_ENCONTRADA.startsWith("No encontramos esa cita"));
});

test("un identificador que no es un uuid se trata como una cita que no existe, sin tocar la base de datos", async () => {
  const { ejecutar, llamadas } = ejecutorSimulado();
  const r = await cancelarMiCita(ejecutar, { cita_id: "no-es-un-uuid" });
  assert.deepEqual(r, { ok: false, codigo: "CITA_NO_VIGENTE", mensaje: MENSAJE_CITA_NO_ENCONTRADA });
  assert.equal(llamadas.length, 0);
});

test("el doble envío: la segunda vez dice que la cita ya está cancelada, no un error confuso", async () => {
  const { ejecutar } = ejecutorSimulado({ actualizar: [], estadoVisible: "cancelada" });
  const r = await cancelarMiCita(ejecutar, { cita_id: CITA });
  assert.deepEqual(r, { ok: false, codigo: "CITA_NO_VIGENTE", mensaje: MENSAJE_CITA_YA_CANCELADA });
  assert.ok(MENSAJE_CITA_YA_CANCELADA.startsWith("Esa cita ya está cancelada"));
});

test("una cita propia atendida o «No asistió» no se puede cancelar y se dice con claridad", async () => {
  for (const estado of ["atendida", "no_asistio"]) {
    const { ejecutar } = ejecutorSimulado({ actualizar: [], estadoVisible: estado });
    const r = await cancelarMiCita(ejecutar, { cita_id: CITA });
    assert.deepEqual(r, { ok: false, codigo: "CITA_NO_VIGENTE", mensaje: MENSAJE_CITA_NO_CANCELABLE }, estado);
  }
});

test("un fallo del notificador no cambia el resultado de la cancelación", async () => {
  const { ejecutar } = ejecutorSimulado();
  const r = await cancelarMiCita(
    ejecutar,
    { cita_id: CITA },
    {
      emitir: () => {
        throw new Error("el notificador se cayó");
      },
    },
  );
  assert.deepEqual(r, { ok: true, datos: { id: CITA } });
});

test("una sesión vencida al consultar el estado de la cita se informa como tal", async () => {
  const vencida = Object.assign(new Error("Se requiere una sesión autenticada"), { name: "SesionRequerida" });
  const { ejecutar } = ejecutorSimulado({ actualizar: [] });
  const original = ejecutar;
  const conFallo: Ejecutor = async (sentencias) => {
    if (sentencias.some((s) => /select c\.estado::text/.test(s.texto))) throw vencida;
    return original(sentencias);
  };
  const r = await cancelarMiCita(conFallo, { cita_id: CITA });
  assert.deepEqual(r, { ok: false, codigo: "SESION_VENCIDA", mensaje: MENSAJE_SESION_VENCIDA });
});

test("un error inesperado de la base de datos devuelve el mensaje genérico, sin su texto", async () => {
  const original = console.error;
  console.error = () => undefined;
  try {
    const { ejecutar } = ejecutorSimulado({ actualizar: { error: errorPg("XX000") } });
    const r = await cancelarMiCita(ejecutar, { cita_id: CITA });
    assert.equal(!r.ok && r.codigo, "ERROR_INTERNO");
    assert.ok(!JSON.stringify(r).includes("texto de la base de datos"));
  } finally {
    console.error = original;
  }
});
