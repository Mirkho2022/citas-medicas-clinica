// Pruebas de lib/citas/cierre.ts (H3, tarea 6.5; design.md, D13). Ejecutar con: npm run test:agenda. Sin base de datos: el ejecutor es
// un doble. Lo que sí toca la base (la guarda de rol, el cierre real, la auditoría) está en pgTAP 64 y en tests/integracion/cierre.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MENSAJE_ERROR_INTERNO, MENSAJE_NO_AUTORIZADO } from "../../lib/acciones/resultado.ts";
import { cerrarCitasVencidas } from "../../lib/citas/cierre.ts";
import type { Ejecutor, Fila, Sentencia } from "../../lib/db/ejecutor.ts";

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

test("llama a la puerta del personal, sin parámetros, y devuelve cuántas citas cerró", async () => {
  const { ejecutar, llamadas } = ejecutorDe({ filas: [{ cerradas: 3 }] });
  const r = await cerrarCitasVencidas(ejecutar);
  assert.deepEqual(r, { ok: true, datos: { cerradas: 3 } });
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0]!.length, 1);
  assert.equal(llamadas[0]![0]!.texto, "select public.cerrar_citas_vencidas_como_personal() as cerradas");
  assert.deepEqual(llamadas[0]![0]!.parametros ?? [], []);
});

test("nunca llama a la función interna, que la aplicación no puede ejecutar", async () => {
  const { ejecutar, llamadas } = ejecutorDe({ filas: [{ cerradas: 0 }] });
  await cerrarCitasVencidas(ejecutar);
  assert.doesNotMatch(llamadas[0]![0]!.texto, /cerrar_citas_vencidas\(\)/);
});

test("un recuento como texto o ausente se normaliza a número", async () => {
  assert.deepEqual(await cerrarCitasVencidas(ejecutorDe({ filas: [{ cerradas: "2" }] }).ejecutar), { ok: true, datos: { cerradas: 2 } });
  assert.deepEqual(await cerrarCitasVencidas(ejecutorDe({ filas: [] }).ejecutar), { ok: true, datos: { cerradas: 0 } });
});

test("sin permiso (42501: paciente, enfermera o sesión sin rol) devuelve no autorizado, sin lanzar", async () => {
  const r = await cerrarCitasVencidas(ejecutorDe({ error: errorSql("42501") }).ejecutar);
  assert.deepEqual(r, { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_NO_AUTORIZADO });
});

test("cualquier otro error devuelve el mensaje genérico sin texto de Postgres y no lanza", async () => {
  const original = console.error;
  const registrados: unknown[] = [];
  console.error = (...datos: unknown[]) => void registrados.push(datos);
  try {
    const r = await cerrarCitasVencidas(ejecutorDe({ error: errorSql("57P01") }).ejecutar);
    assert.deepEqual(r, { ok: false, codigo: "ERROR_INTERNO", mensaje: MENSAJE_ERROR_INTERNO });
  } finally {
    console.error = original;
  }
  assert.doesNotMatch(JSON.stringify(registrados), /texto de postgres/);
});
