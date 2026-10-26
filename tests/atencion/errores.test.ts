// Traductor de errores del registro y la firma (design.md, D10): cada fila de la tabla tiene su prueba y ningún mensaje contiene
// texto de la base de datos.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MENSAJE_ADDENDA_INMUTABLE,
  MENSAJE_ATENCION_FIRMADA,
  MENSAJE_CAMPOS_INVALIDOS,
  MENSAJE_CITA_CON_ATENCION,
  MENSAJE_CITA_INVALIDA,
  MENSAJE_CONFIGURACION,
  MENSAJE_DEMOSTRACION,
  MENSAJE_DIAGNOSTICO_INVALIDO,
  MENSAJE_SIN_ACCESO,
  traducirErrorAtencion,
  type ErrorInesperadoAtencion,
} from "../../lib/atencion/errores.ts";
import { MENSAJE_ERROR_INTERNO } from "../../lib/acciones/resultado.ts";

const error = (code: string, message = "texto interno de postgres con datos") => Object.assign(new Error(message), { code });

describe("traducirErrorAtencion", () => {
  it("HC001: diagnóstico inexistente o repetido", () => {
    const f = traducirErrorAtencion(error("HC001"), "registrar");
    assert.equal(f.mensaje, MENSAJE_DIAGNOSTICO_INVALIDO);
    assert.equal(f.causa, "diagnostico");
    assert.deepEqual(f.campos, { diagnosticos: MENSAJE_DIAGNOSTICO_INVALIDO });
  });

  it("HC002: modo demostración", () => {
    assert.equal(traducirErrorAtencion(error("HC002"), "registrar").mensaje, MENSAJE_DEMOSTRACION);
  });

  it("HC003: la cita no corresponde", () => {
    const f = traducirErrorAtencion(error("HC003"), "registrar");
    assert.equal(f.mensaje, MENSAJE_CITA_INVALIDA);
    assert.equal(f.causa, "cita_invalida");
  });

  it("HC004: configuración inconsistente", () => {
    assert.equal(traducirErrorAtencion(error("HC004"), "registrar").mensaje, MENSAJE_CONFIGURACION);
  });

  it("42501 con «Atención firmada»: ya está firmada, use una addenda", () => {
    const f = traducirErrorAtencion(error("42501", "Atención firmada: use una addenda para corregir"), "actualizar");
    assert.equal(f.mensaje, MENSAJE_ATENCION_FIRMADA);
    assert.equal(f.causa, "firmada");
    assert.equal(f.codigo, "NO_AUTORIZADO");
  });

  it("42501 de addendas: mensaje de la regla, sin detalle interno", () => {
    const f = traducirErrorAtencion(error("42501", "Las addendas no se modifican ni se eliminan: registre una nueva"), "addenda");
    assert.equal(f.mensaje, MENSAJE_ADDENDA_INMUTABLE);
  });

  it("42501 (RLS, privilegio o firmar_atencion): sin acceso, sin confirmar existencia", () => {
    for (const texto of ["new row violates row-level security policy for table \"atenciones\"", "permission denied for table atenciones", "No tiene acceso a esta atención"]) {
      const f = traducirErrorAtencion(error("42501", texto), "firmar");
      assert.equal(f.mensaje, MENSAJE_SIN_ACCESO, texto);
      assert.equal(f.causa, "sin_acceso");
    }
  });

  it("23505 al registrar: ya existe una atención para esa cita", () => {
    const f = traducirErrorAtencion(error("23505"), "registrar");
    assert.equal(f.mensaje, MENSAJE_CITA_CON_ATENCION);
    assert.equal(f.causa, "cita_con_atencion");
    assert.deepEqual(f.campos, { cita_id: MENSAJE_CITA_CON_ATENCION });
  });

  it("23514: campos vacíos o inválidos", () => {
    const f = traducirErrorAtencion(error("23514"), "registrar");
    assert.equal(f.mensaje, MENSAJE_CAMPOS_INVALIDOS);
    assert.equal(f.codigo, "DATOS_INVALIDOS");
  });

  it("otros: mensaje genérico y se registra solo contexto, SQLSTATE y clase", () => {
    const registrados: ErrorInesperadoAtencion[] = [];
    for (const e of [error("XX000"), new Error("sin código"), "cadena", null]) {
      const f = traducirErrorAtencion(e, "actualizar", (info) => registrados.push(info));
      assert.equal(f.mensaje, MENSAJE_ERROR_INTERNO);
      assert.equal(f.codigo, "ERROR_INTERNO");
    }
    // 23505 fuera de `registrar` no es el caso de la cita: también es genérico.
    assert.equal(traducirErrorAtencion(error("23505"), "firmar", (info) => registrados.push(info)).mensaje, MENSAJE_ERROR_INTERNO);
    assert.ok(registrados.length >= 5);
    for (const info of registrados) assert.deepEqual(Object.keys(info).sort(), ["clase", "contexto", "sqlstate"]);
  });

  it("ningún mensaje devuelto contiene texto de la base ni contenido clínico", () => {
    const secreto = "anamnesis del paciente Juan Pérez";
    for (const code of ["HC001", "HC002", "HC003", "HC004", "42501", "23505", "23514", "XX000"]) {
      const f = traducirErrorAtencion(error(code, secreto), "registrar", () => {});
      assert.ok(!f.mensaje.includes(secreto), code);
      assert.ok(!JSON.stringify(f).includes("Juan"), code);
    }
  });

  it("encuentra el SQLSTATE aunque el driver lo envuelva en `cause`", () => {
    const envuelto = new Error("fallo", { cause: error("HC003") });
    assert.equal(traducirErrorAtencion(envuelto, "registrar").mensaje, MENSAJE_CITA_INVALIDA);
  });
});
