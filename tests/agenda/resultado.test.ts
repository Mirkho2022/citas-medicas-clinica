// Pruebas de lib/acciones/resultado.ts (H3, tarea 7.1; design.md, D6). Ejecutar con: npm run test:agenda
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exito,
  fallo,
  falloPorValidacion,
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_AUTORIZADO,
  type ResultadoAccion,
} from "../../lib/acciones/resultado.ts";

test("exito lleva los datos y fallo lleva mensaje y código", () => {
  assert.deepEqual(exito({ id: "x" }), { ok: true, datos: { id: "x" } });
  assert.deepEqual(exito(), { ok: true, datos: undefined });
  assert.deepEqual(fallo("DOBLE_RESERVA", "Registro de cita ya agendado"), {
    ok: false,
    mensaje: "Registro de cita ya agendado",
    codigo: "DOBLE_RESERVA",
  });
});

test("el resultado se estrecha por `ok`: la interfaz decide por código, no por texto", () => {
  const resultado: ResultadoAccion<{ id: string }> = fallo("SOLAPE", "Ya existe una ausencia");
  if (resultado.ok) {
    assert.fail("era un fallo");
  } else {
    assert.equal(resultado.codigo, "SOLAPE");
    assert.equal(resultado.campos, undefined);
  }
});

test("falloPorValidacion deja un mensaje por campo (el primero) y el primero como mensaje general", () => {
  const resultado = falloPorValidacion({
    issues: [
      { path: ["numero_documento"], message: "El DNI debe tener 8 dígitos" },
      { path: ["numero_documento"], message: "otro mensaje del mismo campo" },
      { path: ["email"], message: "Ingrese un correo válido" },
      { path: [], message: "Revise el formulario" },
    ],
  });
  assert.deepEqual(resultado, {
    ok: false,
    codigo: "DATOS_INVALIDOS",
    mensaje: "El DNI debe tener 8 dígitos",
    campos: {
      numero_documento: "El DNI debe tener 8 dígitos",
      email: "Ingrese un correo válido",
      _: "Revise el formulario",
    },
  });
});

test("los mensajes genéricos son los de design.md, D5", () => {
  assert.equal(MENSAJE_NO_AUTORIZADO, "No tiene permiso para realizar esta operación");
  assert.equal(MENSAJE_ERROR_INTERNO, "No se pudo completar la operación. Intente nuevamente.");
});
