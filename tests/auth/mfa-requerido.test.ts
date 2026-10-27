import assert from "node:assert/strict";
import { test } from "node:test";
import { mfaExigidoPara } from "../../lib/auth/mfa-requerido.ts";
import { exigirPersonal } from "../../lib/auth/accion-personal.ts";

test("sin configuración, el MFA se exige a todo el personal", () => {
  for (const rol of ["administrativo", "medico", "enfermera"] as const) {
    assert.equal(mfaExigidoPara(rol, undefined), true);
    assert.equal(mfaExigidoPara(rol, "  "), true);
  }
});

test("MFA_ROLES_EXIGIDOS=medico relaja al administrativo y a la enfermera", () => {
  assert.equal(mfaExigidoPara("medico", "medico"), true);
  assert.equal(mfaExigidoPara("administrativo", "medico"), false);
  assert.equal(mfaExigidoPara("enfermera", "medico"), false);
});

test("el médico nunca se relaja, diga lo que diga el entorno", () => {
  assert.equal(mfaExigidoPara("medico", "administrativo"), true);
  assert.equal(mfaExigidoPara("medico", "ninguno"), true);
});

test("la guarda del administrativo acepta una cuenta sin MFA solo cuando el entorno lo relaja", async () => {
  const dependencias = {
    obtenerSesion: async () => ({ usuarioId: "u1", rol: "administrativo" as const }),
    tieneMfa: async () => false,
  };
  const anterior = process.env.MFA_ROLES_EXIGIDOS;
  try {
    delete process.env.MFA_ROLES_EXIGIDOS;
    assert.equal((await exigirPersonal("administrativo", dependencias)).ok, false);
    process.env.MFA_ROLES_EXIGIDOS = "medico";
    assert.equal((await exigirPersonal("administrativo", dependencias)).ok, true);
    const medico = { ...dependencias, obtenerSesion: async () => ({ usuarioId: "u2", rol: "medico" as const }) };
    assert.equal((await exigirPersonal("medico", medico)).ok, false);
  } finally {
    if (anterior === undefined) delete process.env.MFA_ROLES_EXIGIDOS;
    else process.env.MFA_ROLES_EXIGIDOS = anterior;
  }
});
