// Guardas de las acciones de pacientes y de horarios (H3, tareas 8.1 y 9.1; specs/gestion-de-citas, «Solo el administrativo opera la
// agenda del panel»). Cada caso de uso se prueba con la guarda REAL (`exigirPersonal`) y dependencias inyectadas: un médico, una
// enfermera, un paciente, una sesión sin rol o sin sesión y un administrativo sin MFA son rechazados SIN ejecutar ninguna
// consulta ni refrescar pantallas; el administrativo con MFA ejecuta. Si alguien quitara la guarda de una acción, estas pruebas
// fallan (la regla de ESLint de Clerk solo comprueba `auth.protect()`, no el rol). Ejecutar con: npm run test:agenda.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MENSAJE_NO_AUTORIZADO } from "../../lib/acciones/resultado.ts";
import {
  exigirPersonal,
  MENSAJE_MFA_REQUERIDO,
  MENSAJE_SESION_REQUERIDA,
  type DependenciasPersonal,
} from "../../lib/auth/accion-personal.ts";
import type { Rol } from "../../lib/auth/rol.ts";
import {
  casoActualizarBloqueo,
  casoBuscarPacientes,
  casoCrearBloqueo,
  casoEliminarBloqueo,
  casoEliminarDisponibilidad,
  casoGuardarDisponibilidad,
  casoRegistrarPaciente,
  RUTAS_PACIENTES,
  rutasHorarios,
  type Entorno,
} from "../../lib/citas/casos-de-uso.ts";
import type { Ejecutor, Fila, Sentencia } from "../../lib/db/ejecutor.ts";

const MEDICO = "11111111-1111-4111-8111-111111111111";
const TRAMO = "22222222-2222-4222-8222-222222222222";

// Entradas VÁLIDAS de cada acción: si la guarda dejara pasar a un rol que no corresponde, llegarían a la base de datos.
const PACIENTE_NUEVO = {
  tipo_documento: "DNI",
  numero_documento: "99000101",
  nombres: "Rosa",
  apellidos: "Quispe Rojas",
  fecha_nacimiento: "1990-05-17",
  sexo: "F",
  email: "rosa@demo.invalid",
};
const TRAMO_NUEVO = { medico_id: MEDICO, dia_semana: "1", hora_inicio: "08:00", hora_fin: "12:00" };
const BLOQUEO_NUEVO = { medico_id: MEDICO, inicio: "2026-10-20T08:00", fin: "2026-10-24T18:00", motivo: "Licencia" };

type Caso = (entorno: Entorno, entrada: unknown) => Promise<unknown>;
const CASOS: { nombre: string; caso: Caso; entrada: unknown; respuestas: Fila[][] }[] = [
  { nombre: "buscarPacientes", caso: casoBuscarPacientes, entrada: { termino: "quis" }, respuestas: [[]] },
  { nombre: "registrarPaciente", caso: casoRegistrarPaciente, entrada: PACIENTE_NUEVO, respuestas: [[{ id: TRAMO }]] },
  { nombre: "guardarDisponibilidad", caso: casoGuardarDisponibilidad, entrada: TRAMO_NUEVO, respuestas: [[{ id: TRAMO }]] },
  { nombre: "eliminarDisponibilidad", caso: casoEliminarDisponibilidad, entrada: { id: TRAMO, medico_id: MEDICO }, respuestas: [[{ id: TRAMO }], [], []] },
  { nombre: "crearBloqueo", caso: casoCrearBloqueo, entrada: BLOQUEO_NUEVO, respuestas: [[{ id: TRAMO }], [{ n: 0 }]] },
  { nombre: "actualizarBloqueo", caso: casoActualizarBloqueo, entrada: { ...BLOQUEO_NUEVO, id: TRAMO }, respuestas: [[{ id: TRAMO }], [{ n: 0 }]] },
  { nombre: "eliminarBloqueo", caso: casoEliminarBloqueo, entrada: { id: TRAMO, medico_id: MEDICO }, respuestas: [[{ id: TRAMO }]] },
];

function entornoDe(opciones: { rol: Rol | null; usuarioId?: string | null; mfa?: boolean; respuestas: Fila[][] }) {
  const dependencias: DependenciasPersonal = {
    obtenerSesion: async () => ({ usuarioId: opciones.usuarioId === undefined ? "user_1" : opciones.usuarioId, rol: opciones.rol }),
    tieneMfa: async () => opciones.mfa ?? true,
    registrar: () => undefined,
  };
  const llamadas: Sentencia[][] = [];
  const ejecutar: Ejecutor = async (sentencias) => {
    llamadas.push([...sentencias]);
    return sentencias.map((_, i) => opciones.respuestas[i] ?? []);
  };
  const refrescadas: (readonly string[])[] = [];
  const entorno: Entorno = {
    guarda: (rol) => exigirPersonal(rol, dependencias),
    ejecutar,
    refrescar: (rutas) => void refrescadas.push(rutas),
    emitir: () => undefined,
  };
  return { entorno, llamadas, refrescadas };
}

test("un médico, una enfermera, un paciente y una sesión sin rol no operan pacientes ni horarios: la guarda los rechaza sin consultar", async () => {
  for (const { nombre, caso, entrada, respuestas } of CASOS) {
    for (const rol of ["medico", "enfermera", "paciente", null] as const) {
      const { entorno, llamadas, refrescadas } = entornoDe({ rol, respuestas });
      const r = (await caso(entorno, entrada)) as { ok: boolean; codigo?: string; mensaje?: string };
      assert.equal(r.ok, false, `${nombre} como ${rol}`);
      assert.equal(r.codigo, "NO_AUTORIZADO", `${nombre} como ${rol}`);
      assert.equal(r.mensaje, MENSAJE_NO_AUTORIZADO);
      assert.equal(llamadas.length, 0, `${nombre} como ${rol}: no debe tocar la base de datos`);
      assert.equal(refrescadas.length, 0);
    }
  }
});

test("sin sesión y un administrativo sin segundo factor (MFA) tampoco operan, y el mensaje lo dice", async () => {
  for (const { nombre, caso, entrada, respuestas } of CASOS) {
    const sinSesion = entornoDe({ rol: "administrativo", usuarioId: null, respuestas });
    const r1 = (await caso(sinSesion.entorno, entrada)) as { ok: boolean; mensaje?: string };
    assert.equal(r1.ok, false, `${nombre} sin sesión`);
    assert.equal(r1.mensaje, MENSAJE_SESION_REQUERIDA);
    assert.equal(sinSesion.llamadas.length, 0);

    const sinMfa = entornoDe({ rol: "administrativo", mfa: false, respuestas });
    const r2 = (await caso(sinMfa.entorno, entrada)) as { ok: boolean; mensaje?: string };
    assert.equal(r2.ok, false, `${nombre} sin MFA`);
    assert.equal(r2.mensaje, MENSAJE_MFA_REQUERIDO);
    assert.equal(sinMfa.llamadas.length, 0);
  }
});

test("el administrativo con MFA ejecuta las siete operaciones y las pantallas se refrescan solo cuando cambian datos", async () => {
  for (const { nombre, caso, entrada, respuestas } of CASOS) {
    const { entorno, llamadas, refrescadas } = entornoDe({ rol: "administrativo", respuestas });
    const r = (await caso(entorno, entrada)) as { ok: boolean; mensaje?: string };
    assert.equal(r.ok, true, `${nombre}: ${r.mensaje}`);
    assert.ok(llamadas.length >= 1, `${nombre} consulta la base de datos`);
    // La búsqueda no cambia nada: no refresca. El resto sí.
    assert.equal(refrescadas.length, nombre === "buscarPacientes" ? 0 : 1, nombre);
  }
});

test("el alta de un paciente refresca la lista de pacientes", async () => {
  const { entorno, refrescadas } = entornoDe({ rol: "administrativo", respuestas: [[{ id: TRAMO }]] });
  await casoRegistrarPaciente(entorno, PACIENTE_NUEVO);
  assert.deepEqual(refrescadas, [RUTAS_PACIENTES]);
});

test("las rutas de horarios incluyen la del médico solo si su identificador tiene forma de uuid (nunca texto del cliente)", () => {
  assert.deepEqual(rutasHorarios({ medico_id: MEDICO }), ["/administrativo/horarios", `/administrativo/horarios/${MEDICO}`, "/administrativo/agenda"]);
  assert.deepEqual(rutasHorarios({ medico_id: `  ${MEDICO} ` }), ["/administrativo/horarios", `/administrativo/horarios/${MEDICO}`, "/administrativo/agenda"]);
  for (const entrada of [{ medico_id: "../../admin" }, { medico_id: "" }, { medico_id: 7 }, {}, null, undefined, "texto"]) {
    assert.deepEqual(rutasHorarios(entrada), ["/administrativo/horarios", "/administrativo/agenda"], JSON.stringify(entrada));
  }
});

test("una operación fallida (datos inválidos) no refresca las pantallas", async () => {
  const { entorno, llamadas, refrescadas } = entornoDe({ rol: "administrativo", respuestas: [] });
  const r = (await casoRegistrarPaciente(entorno, { ...PACIENTE_NUEVO, email: "no-es-correo" })) as { ok: boolean };
  assert.equal(r.ok, false);
  assert.equal(llamadas.length, 0);
  assert.equal(refrescadas.length, 0);
});
