// Pruebas de lib/auth/accion-personal.ts (H3, tarea 7.4; design.md, D7). Ejecutar con: npm run test:agenda
// La guarda se prueba con dependencias inyectadas: sin Clerk, sin red y sin base de datos.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Rol } from "../../lib/auth/rol.ts";
import {
  exigirPersonal,
  MENSAJE_MFA_REQUERIDO,
  MENSAJE_SESION_REQUERIDA,
  type DependenciasPersonal,
  type RolPersonal,
} from "../../lib/auth/accion-personal.ts";
import { MENSAJE_NO_AUTORIZADO } from "../../lib/acciones/resultado.ts";

// Dependencias de prueba. `llamadasMfa` cuenta cuántas veces se consultó el MFA.
function entorno(opciones: { usuarioId?: string | null; rol: Rol | null; mfa?: boolean }) {
  const estado = { llamadasMfa: 0, registrados: [] as string[] };
  const dependencias: DependenciasPersonal = {
    obtenerSesion: async () => ({ usuarioId: opciones.usuarioId === undefined ? "user_1" : opciones.usuarioId, rol: opciones.rol }),
    tieneMfa: async () => {
      estado.llamadasMfa++;
      return opciones.mfa ?? true;
    },
    registrar: (clase) => void estado.registrados.push(clase),
  };
  return { dependencias, estado };
}

const ROLES_PERSONAL: RolPersonal[] = ["administrativo", "medico"];

test("sin sesión se rechaza, indica que debe iniciar sesión y no consulta el MFA", async () => {
  for (const requerido of ROLES_PERSONAL) {
    for (const usuarioId of [null, ""]) {
      const { dependencias, estado } = entorno({ usuarioId, rol: "administrativo" });
      const r = await exigirPersonal(requerido, dependencias);
      assert.deepEqual(r, { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_SESION_REQUERIDA });
      assert.equal(estado.llamadasMfa, 0);
    }
  }
  assert.equal(MENSAJE_SESION_REQUERIDA, "Debe iniciar sesión para realizar esta operación");
});

test("paciente, enfermera y sesión sin rol se rechazan en cualquier operación del personal", async () => {
  for (const requerido of ROLES_PERSONAL) {
    for (const rol of ["paciente", "enfermera", null] as const) {
      const { dependencias, estado } = entorno({ rol, mfa: true });
      const r = await exigirPersonal(requerido, dependencias);
      assert.deepEqual(r, { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_NO_AUTORIZADO }, `${rol} / ${requerido}`);
      assert.equal(estado.llamadasMfa, 0, "no se consulta el MFA de quien no tiene el rol");
    }
  }
});

test("un médico es rechazado donde se exige administrativo", async () => {
  const { dependencias } = entorno({ rol: "medico", mfa: true });
  assert.deepEqual(await exigirPersonal("administrativo", dependencias), {
    ok: false,
    codigo: "NO_AUTORIZADO",
    mensaje: MENSAJE_NO_AUTORIZADO,
  });
});

test("un administrativo es rechazado donde se exige médico", async () => {
  const { dependencias } = entorno({ rol: "administrativo", mfa: true });
  assert.deepEqual(await exigirPersonal("medico", dependencias), {
    ok: false,
    codigo: "NO_AUTORIZADO",
    mensaje: MENSAJE_NO_AUTORIZADO,
  });
});

test("el personal sin MFA se rechaza y se le indica que configure el segundo factor", async () => {
  for (const rol of ROLES_PERSONAL) {
    const { dependencias, estado } = entorno({ rol, mfa: false });
    const r = await exigirPersonal(rol, dependencias);
    assert.deepEqual(r, { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_MFA_REQUERIDO });
    assert.equal(estado.llamadasMfa, 1);
  }
  assert.notEqual(MENSAJE_MFA_REQUERIDO, MENSAJE_NO_AUTORIZADO, "el mensaje de MFA es propio");
  assert.match(MENSAJE_MFA_REQUERIDO, /segundo factor/);
});

test("el rol correcto con MFA pasa y devuelve usuario y rol", async () => {
  for (const rol of ROLES_PERSONAL) {
    const { dependencias, estado } = entorno({ usuarioId: "user_abc", rol, mfa: true });
    const r = await exigirPersonal(rol, dependencias);
    assert.deepEqual(r, { ok: true, datos: { usuarioId: "user_abc", rol } });
    assert.equal(estado.llamadasMfa, 1);
  }
});

test("si Clerk falla la guarda rechaza con el mensaje genérico, sin lanzar y sin registrar el texto del error", async () => {
  const registrados: string[] = [];
  const dependencias: DependenciasPersonal = {
    obtenerSesion: async () => {
      throw new Error("clerk: secreto-interno-123");
    },
    tieneMfa: async () => true,
    registrar: (clase) => void registrados.push(clase),
  };
  const r = await exigirPersonal("administrativo", dependencias);
  assert.deepEqual(r, {
    ok: false,
    codigo: "ERROR_INTERNO",
    mensaje: "No se pudo completar la operación. Intente nuevamente.",
  });
  assert.deepEqual(registrados, ["Error"]);

  // Si lo que falla es la consulta del MFA, tampoco deja pasar.
  const sinMfa: DependenciasPersonal = {
    obtenerSesion: async () => ({ usuarioId: "user_1", rol: "administrativo" }),
    tieneMfa: async () => {
      throw new Error("red caída");
    },
    registrar: () => {},
  };
  assert.equal((await exigirPersonal("administrativo", sinMfa)).ok, false);
});

test("el fallo se devuelve tal cual desde una acción: `if (!guarda.ok) return guarda`", async () => {
  async function accion(dependencias: DependenciasPersonal) {
    const guarda = await exigirPersonal("administrativo", dependencias);
    if (!guarda.ok) return guarda;
    return { ok: true as const, datos: guarda.datos.usuarioId };
  }
  const { dependencias } = entorno({ rol: "paciente" });
  const r = await accion(dependencias);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.codigo, "NO_AUTORIZADO");
});
