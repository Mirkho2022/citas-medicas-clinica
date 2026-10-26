// Pruebas de lib/turnos/operaciones.ts y lib/turnos/casos-de-uso.ts con un ejecutor doble (H7, tarea 4.1; design.md, D6).
// Ejecutar con: npm run test:turnos-dashboard. Sin Clerk, sin Next, sin red y sin base de datos. Lo que sí toca la base de datos (la
// escritura condicional, la RLS de cada rol, el `unique`) está en tests/integracion/turnos-enfermeria.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MENSAJE_ERROR_INTERNO, MENSAJE_NO_AUTORIZADO, fallo, exito, type ResultadoAccion } from "../../lib/acciones/resultado.ts";
import type { SesionPersonal } from "../../lib/auth/accion-personal.ts";
import type { Ejecutor, Fila, Sentencia } from "../../lib/db/ejecutor.ts";
import { casoActualizarTurno, casoAsignarTurno, casoQuitarTurno, RUTAS_TURNOS, type EntornoTurnos } from "../../lib/turnos/casos-de-uso.ts";
import {
  MENSAJE_ENFERMERA_DE_BAJA,
  MENSAJE_FECHA_ANTERIOR,
  MENSAJE_MEDICO_DE_BAJA,
  MENSAJE_SIN_PERMISO_TURNOS,
  MENSAJE_TURNO_DUPLICADO,
  MENSAJE_TURNO_NO_EXISTE,
  MENSAJE_TURNO_PASADO,
} from "../../lib/turnos/errores.ts";
import { actualizarTurno, asignarTurno, quitarTurno } from "../../lib/turnos/operaciones.ts";

const ENFERMERA = "11111111-1111-4111-8111-111111111111";
const MEDICO = "22222222-2222-4222-8222-222222222222";
const ESPECIALIDAD = "33333333-3333-4333-8333-333333333333";
const TURNO = "44444444-4444-4444-8444-444444444444";
const HOY = "2026-10-14";

// Doble del ejecutor: devuelve `[estado, escritura]` (las dos sentencias de cada operación) o lanza `error`.
function ejecutorDe(opciones: { estado?: Fila; filas?: Fila[]; error?: unknown } = {}) {
  const llamadas: Sentencia[][] = [];
  const ejecutar: Ejecutor = async (sentencias) => {
    llamadas.push([...sentencias]);
    if (opciones.error !== undefined) throw opciones.error;
    return [[opciones.estado ?? {}], opciones.filas ?? []];
  };
  return { ejecutar, llamadas };
}

const estado = (extra: Fila = {}): Fila => ({ hoy: HOY, rol: "administrativo", enfermera_activa: true, medico_activo: true, fecha: "2026-10-20", ...extra });
const errorSql = (code: string) => Object.assign(new Error("texto de postgres en inglés"), { code });
const nuevo = { enfermera_id: ENFERMERA, fecha: "2026-10-20", turno: "manana", medico_id: MEDICO };

test("asignar: manda la lectura del estado y la escritura condicional en una sola llamada, con los datos por parámetros", async () => {
  const { ejecutar, llamadas } = ejecutorDe({ estado: estado(), filas: [{ id: TURNO }] });
  const r = await asignarTurno(ejecutar, nuevo);
  assert.deepEqual(r, { ok: true, datos: { id: TURNO } });
  assert.equal(llamadas.length, 1);
  const [lectura, escritura] = llamadas[0]!;
  assert.match(lectura!.texto, /public\.hoy_lima\(\)/);
  assert.match(escritura!.texto, /insert into public\.turnos_enfermeria/);
  // Las condiciones de fecha y de personal activo viven dentro de la escritura misma (no hay carrera entre leer y escribir).
  assert.match(escritura!.texto, /\$3::date >= public\.hoy_lima\(\)/);
  assert.match(escritura!.texto, /e\.activo/);
  assert.match(escritura!.texto, /m\.activo/);
  assert.deepEqual(escritura!.parametros, [ENFERMERA, MEDICO, "2026-10-20", "manana", null]);
  // Ningún dato del usuario se pega en el texto SQL.
  assert.ok(!escritura!.texto.includes(ENFERMERA) && !escritura!.texto.includes("2026-10-20"));
});

test("asignar a un servicio manda el servicio y ningún médico", async () => {
  const { ejecutar, llamadas } = ejecutorDe({ estado: estado(), filas: [{ id: TURNO }] });
  const r = await asignarTurno(ejecutar, { enfermera_id: ENFERMERA, fecha: "2026-10-20", turno: "tarde", especialidad_id: ESPECIALIDAD });
  assert.equal(r.ok, true);
  assert.deepEqual(llamadas[0]![1]!.parametros, [ENFERMERA, null, "2026-10-20", "tarde", ESPECIALIDAD]);
});

test("una entrada inválida se rechaza SIN consultar la base de datos", async () => {
  for (const entrada of [{}, null, { ...nuevo, medico_id: undefined }, { ...nuevo, especialidad_id: ESPECIALIDAD }, { ...nuevo, fecha: "2026-02-30" }, { ...nuevo, turno: "madrugada" }]) {
    for (const operacion of [asignarTurno]) {
      const { ejecutar, llamadas } = ejecutorDe();
      const r = await operacion(ejecutar, entrada);
      assert.equal(r.ok === false && r.codigo, "DATOS_INVALIDOS", JSON.stringify(entrada));
      assert.equal(llamadas.length, 0);
    }
  }
  for (const funcion of [actualizarTurno, quitarTurno]) {
    for (const entrada of [{}, { id: "no-es-uuid" }, null]) {
      const { ejecutar, llamadas } = ejecutorDe();
      const r = await funcion(ejecutar, entrada);
      assert.equal(r.ok === false && r.codigo, "DATOS_INVALIDOS");
      assert.equal(llamadas.length, 0);
    }
  }
});

test("asignar: el choque de turnos (23505) da el mensaje de la spec y no el error de Postgres", async () => {
  const { ejecutar } = ejecutorDe({ error: errorSql("23505") });
  const r = await asignarTurno(ejecutar, nuevo);
  assert.deepEqual(r, { ok: false, codigo: "SOLAPE", mensaje: MENSAJE_TURNO_DUPLICADO });
});

test("asignar: cualquier otro error se traduce y nunca escapa", async () => {
  const { ejecutar } = ejecutorDe({ error: Object.assign(new Error("password authentication failed for user x"), { code: "28P01" }) });
  const registrado: string[] = [];
  const consola = console.error;
  console.error = (...partes: unknown[]) => registrado.push(partes.join(" "));
  try {
    const r = await asignarTurno(ejecutar, nuevo);
    assert.deepEqual(r, { ok: false, codigo: "ERROR_INTERNO", mensaje: MENSAJE_ERROR_INTERNO });
  } finally {
    console.error = consola;
  }
  assert.doesNotMatch(registrado.join("\n"), /password/, "el registro no lleva el texto de la base de datos");
});

test("asignar sin fila: da el mensaje de fecha pasada, de enfermera de baja o de médico de baja según lo leído", async () => {
  const sinFila = (extra: Fila) => ejecutorDe({ estado: estado(extra), filas: [] }).ejecutar;
  assert.equal((await asignarTurno(sinFila({}), { ...nuevo, fecha: "2026-10-13" }) as { mensaje: string }).mensaje, MENSAJE_FECHA_ANTERIOR);
  assert.equal((await asignarTurno(sinFila({ enfermera_activa: false }), nuevo) as { mensaje: string }).mensaje, MENSAJE_ENFERMERA_DE_BAJA);
  assert.equal((await asignarTurno(sinFila({ medico_activo: false }), nuevo) as { mensaje: string }).mensaje, MENSAJE_MEDICO_DE_BAJA);
  // Un servicio no tiene médico que comprobar: aunque `medico_activo` venga nulo, no se reclama.
  const servicio = { enfermera_id: ENFERMERA, fecha: "2026-10-13", turno: "tarde", especialidad_id: ESPECIALIDAD };
  assert.equal((await asignarTurno(sinFila({ medico_activo: null }), servicio) as { mensaje: string }).mensaje, MENSAJE_FECHA_ANTERIOR);
});

test("sin fila y sin explicación (carrera inesperada): mensaje genérico, nunca un éxito", async () => {
  const r = await asignarTurno(ejecutorDe({ estado: estado(), filas: [] }).ejecutar, nuevo);
  assert.deepEqual(r, { ok: false, codigo: "ERROR_INTERNO", mensaje: MENSAJE_ERROR_INTERNO });
});

test("un rol que no es administrativo recibe «No tiene permiso para gestionar turnos» aunque la escritura no afecte filas", async () => {
  for (const rol of ["enfermera", "medico", "paciente", null]) {
    const e = ejecutorDe({ estado: estado({ rol }), filas: [] }).ejecutar;
    const esperado = { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_SIN_PERMISO_TURNOS };
    assert.deepEqual(await asignarTurno(e, nuevo), esperado, String(rol));
    assert.deepEqual(await actualizarTurno(e, { id: TURNO, turno: "tarde", medico_id: MEDICO }), esperado, String(rol));
    assert.deepEqual(await quitarTurno(e, { id: TURNO }), esperado, String(rol));
  }
});

test("un 42501 de la RLS también es «No tiene permiso para gestionar turnos»", async () => {
  const e = ejecutorDe({ error: errorSql("42501") }).ejecutar;
  const esperado = { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_SIN_PERMISO_TURNOS };
  assert.deepEqual(await asignarTurno(e, nuevo), esperado);
  assert.deepEqual(await actualizarTurno(e, { id: TURNO, turno: "tarde", medico_id: MEDICO }), esperado);
  assert.deepEqual(await quitarTurno(e, { id: TURNO }), esperado);
});

test("modificar: actualiza por id con las mismas condiciones y sin tocar la enfermera ni la fecha", async () => {
  const { ejecutar, llamadas } = ejecutorDe({ estado: estado(), filas: [{ id: TURNO }] });
  const r = await actualizarTurno(ejecutar, { id: TURNO, turno: "noche", especialidad_id: ESPECIALIDAD });
  assert.deepEqual(r, { ok: true, datos: { id: TURNO } });
  const escritura = llamadas[0]![1]!;
  assert.match(escritura.texto, /update public\.turnos_enfermeria t/);
  assert.match(escritura.texto, /set turno = \$3::public\.tipo_turno, medico_id = \$2::uuid, especialidad_id = \$4::uuid/);
  assert.doesNotMatch(escritura.texto, /enfermera_id =|fecha =/, "no se cambia la enfermera ni la fecha");
  assert.match(escritura.texto, /t\.fecha >= public\.hoy_lima\(\)/);
  assert.deepEqual(escritura.parametros, [TURNO, null, "noche", ESPECIALIDAD]);
});

test("modificar: choque de franja (23505), turno que ya no existe y turno pasado", async () => {
  const entrada = { id: TURNO, turno: "tarde", medico_id: MEDICO };
  assert.deepEqual(await actualizarTurno(ejecutorDe({ error: errorSql("23505") }).ejecutar, entrada), {
    ok: false, codigo: "SOLAPE", mensaje: MENSAJE_TURNO_DUPLICADO,
  });
  assert.deepEqual(await actualizarTurno(ejecutorDe({ estado: estado({ fecha: null }), filas: [] }).ejecutar, entrada), {
    ok: false, codigo: "DATOS_INVALIDOS", mensaje: MENSAJE_TURNO_NO_EXISTE,
  });
  const pasado = await actualizarTurno(ejecutorDe({ estado: estado({ fecha: "2026-10-13" }), filas: [] }).ejecutar, entrada);
  assert.equal(pasado.ok === false && pasado.mensaje, MENSAJE_TURNO_PASADO);
  const baja = await actualizarTurno(ejecutorDe({ estado: estado({ medico_activo: false }), filas: [] }).ejecutar, entrada);
  assert.equal(baja.ok === false && baja.mensaje, MENSAJE_MEDICO_DE_BAJA);
});

test("quitar: borra por id solo de hoy en adelante; pasado y ya quitado dan su mensaje", async () => {
  const { ejecutar, llamadas } = ejecutorDe({ estado: estado(), filas: [{ id: TURNO }] });
  assert.deepEqual(await quitarTurno(ejecutar, { id: TURNO }), { ok: true, datos: undefined });
  assert.match(llamadas[0]![1]!.texto, /delete from public\.turnos_enfermeria where id = \$1::uuid and fecha >= public\.hoy_lima\(\)/);
  assert.deepEqual(llamadas[0]![1]!.parametros, [TURNO]);

  const pasado = await quitarTurno(ejecutorDe({ estado: estado({ fecha: "2026-10-13" }), filas: [] }).ejecutar, { id: TURNO });
  assert.equal(pasado.ok === false && pasado.mensaje, MENSAJE_TURNO_PASADO);
  const yaQuitado = await quitarTurno(ejecutorDe({ estado: estado({ fecha: null }), filas: [] }).ejecutar, { id: TURNO });
  assert.equal(yaQuitado.ok === false && yaQuitado.mensaje, MENSAJE_TURNO_NO_EXISTE);
  // Quitar no depende de si el personal sigue activo.
  const deBaja = await quitarTurno(ejecutorDe({ estado: estado({ enfermera_activa: false }), filas: [{ id: TURNO }] }).ejecutar, { id: TURNO });
  assert.equal(deBaja.ok, true);
});

// ---- Casos de uso: guarda → operación → refresco ----
function entornoDe(guarda: ResultadoAccion<SesionPersonal>, opciones: Parameters<typeof ejecutorDe>[0] = {}) {
  const { ejecutar, llamadas } = ejecutorDe(opciones);
  const refrescos: Array<readonly string[]> = [];
  const roles: string[] = [];
  const entorno: EntornoTurnos = {
    guarda: async (rol) => (roles.push(rol), guarda),
    ejecutar,
    refrescar: (rutas) => refrescos.push(rutas),
  };
  return { entorno, llamadas, refrescos, roles };
}
const sesion = exito<SesionPersonal>({ usuarioId: "user_1", rol: "administrativo" });

test("casos de uso: la guarda se pide para el administrativo y, si falla, no se ejecuta ninguna consulta ni se refresca", async () => {
  const guardaFallida = fallo("NO_AUTORIZADO", MENSAJE_NO_AUTORIZADO);
  for (const caso of [
    (e: EntornoTurnos) => casoAsignarTurno(e, nuevo),
    (e: EntornoTurnos) => casoActualizarTurno(e, { id: TURNO, turno: "tarde", medico_id: MEDICO }),
    (e: EntornoTurnos) => casoQuitarTurno(e, { id: TURNO }),
  ]) {
    const { entorno, llamadas, refrescos, roles } = entornoDe(guardaFallida);
    assert.deepEqual(await caso(entorno), guardaFallida);
    assert.deepEqual(roles, ["administrativo"]);
    assert.equal(llamadas.length, 0);
    assert.equal(refrescos.length, 0);
  }
});

test("casos de uso: un éxito refresca la semana del administrativo y la pantalla de la enfermera; un fallo no", async () => {
  const ok = entornoDe(sesion, { estado: estado(), filas: [{ id: TURNO }] });
  assert.equal((await casoAsignarTurno(ok.entorno, nuevo)).ok, true);
  assert.deepEqual(ok.refrescos, [RUTAS_TURNOS]);
  assert.deepEqual([...RUTAS_TURNOS], ["/administrativo/turnos", "/enfermera"]);

  const choque = entornoDe(sesion, { error: errorSql("23505") });
  assert.equal((await casoAsignarTurno(choque.entorno, nuevo)).ok, false);
  assert.equal(choque.refrescos.length, 0);

  const quitar = entornoDe(sesion, { estado: estado(), filas: [{ id: TURNO }] });
  assert.equal((await casoQuitarTurno(quitar.entorno, { id: TURNO })).ok, true);
  assert.equal(quitar.refrescos.length, 1);
});
