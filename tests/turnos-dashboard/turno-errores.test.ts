// Pruebas de lib/turnos/errores.ts (H7, tarea 3.2; design.md, D6). Ejecutar con: npm run test:turnos-dashboard
import assert from "node:assert/strict";
import { test } from "node:test";
import { MENSAJE_ERROR_INTERNO } from "../../lib/acciones/resultado.ts";
import {
  MENSAJE_ENFERMERA_DE_BAJA,
  MENSAJE_ENFERMERA_INEXISTENTE,
  MENSAJE_FECHA_ANTERIOR,
  MENSAJE_MEDICO_DE_BAJA,
  MENSAJE_MEDICO_INEXISTENTE,
  MENSAJE_REFERENCIA_INEXISTENTE,
  MENSAJE_SERVICIO_INEXISTENTE,
  MENSAJE_SIN_PERMISO_TURNOS,
  MENSAJE_TURNO_DUPLICADO,
  MENSAJE_TURNO_NO_EXISTE,
  MENSAJE_TURNO_PASADO,
  SIN_FILA_AFECTADA,
  traducirErrorTurno,
  validarContraEstado,
  type ErrorInesperadoTurno,
} from "../../lib/turnos/errores.ts";

const errorSql = (code: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error("texto de postgres en inglés"), { code, ...extra });

test("los mensajes de la spec son exactamente los de D6", () => {
  assert.equal(MENSAJE_TURNO_DUPLICADO, "La enfermera ya tiene un turno asignado en esa fecha y franja");
  assert.equal(MENSAJE_SIN_PERMISO_TURNOS, "No tiene permiso para gestionar turnos de enfermería");
  assert.equal(MENSAJE_TURNO_NO_EXISTE, "El turno ya no existe. Actualice la pantalla");
  assert.equal(MENSAJE_FECHA_ANTERIOR, "La fecha del turno no puede ser anterior a hoy");
  assert.equal(MENSAJE_TURNO_PASADO, "Los turnos de fechas pasadas no se modifican");
  assert.equal(MENSAJE_ENFERMERA_DE_BAJA, "La enfermera está dada de baja");
  assert.equal(MENSAJE_MEDICO_DE_BAJA, "El médico está dado de baja");
});

test("23505 (unique enfermera, fecha y franja) es el choque de turnos", () => {
  assert.deepEqual(traducirErrorTurno(errorSql("23505")), { ok: false, codigo: "SOLAPE", mensaje: MENSAJE_TURNO_DUPLICADO });
});

test("23514 (check de médico o servicio) pide indicar uno", () => {
  const r = traducirErrorTurno(errorSql("23514"));
  assert.equal(r.codigo, "DATOS_INVALIDOS");
  assert.equal(r.mensaje, "Indique el médico o el servicio con el que trabajará la enfermera");
  assert.deepEqual(r.campos, { _: r.mensaje });
});

test("23503 (clave foránea) nombra el campo según la restricción que informa la base de datos", () => {
  const casos: Array<[string | undefined, string, string | null]> = [
    ["turnos_enfermeria_enfermera_id_fkey", MENSAJE_ENFERMERA_INEXISTENTE, "enfermera_id"],
    ["turnos_enfermeria_medico_id_fkey", MENSAJE_MEDICO_INEXISTENTE, "medico_id"],
    ["turnos_enfermeria_especialidad_id_fkey", MENSAJE_SERVICIO_INEXISTENTE, "especialidad_id"],
    [undefined, MENSAJE_REFERENCIA_INEXISTENTE, null],
    ["otra_restriccion", MENSAJE_REFERENCIA_INEXISTENTE, null],
  ];
  for (const [constraint, mensaje, campo] of casos) {
    const r = traducirErrorTurno(errorSql("23503", constraint ? { constraint } : {}));
    assert.equal(r.codigo, "DATOS_INVALIDOS");
    assert.equal(r.mensaje, mensaje);
    assert.deepEqual(r.campos, campo ? { [campo]: mensaje } : undefined);
  }
});

test("el SQLSTATE también se reconoce dentro de `cause`", () => {
  const envuelto = Object.assign(new Error("envoltorio"), { cause: errorSql("23505") });
  assert.equal(traducirErrorTurno(envuelto).mensaje, MENSAJE_TURNO_DUPLICADO);
});

test("42501 (RLS) es «sin permiso para gestionar turnos»", () => {
  assert.deepEqual(traducirErrorTurno(errorSql("42501")), {
    ok: false,
    codigo: "NO_AUTORIZADO",
    mensaje: "No tiene permiso para gestionar turnos de enfermería",
  });
});

test("«ninguna fila afectada» es que el turno ya no existe", () => {
  assert.deepEqual(traducirErrorTurno(SIN_FILA_AFECTADA), {
    ok: false,
    codigo: "DATOS_INVALIDOS",
    mensaje: "El turno ya no existe. Actualice la pantalla",
  });
});

test("un error desconocido se registra sin texto de la base de datos y devuelve el mensaje genérico", () => {
  const registros: ErrorInesperadoTurno[] = [];
  for (const error of [errorSql("XX000"), new Error("ECONNRESET con datos de Elena Quispe"), "texto", null]) {
    const r = traducirErrorTurno(error, (info) => registros.push(info));
    assert.deepEqual(r, { ok: false, codigo: "ERROR_INTERNO", mensaje: MENSAJE_ERROR_INTERNO });
    assert.doesNotMatch(JSON.stringify(r), /Elena|postgres/);
  }
  assert.equal(registros.length, 4);
  assert.deepEqual(registros[0], { sqlstate: "XX000", clase: "Error" });
  assert.ok(registros.every((info) => !JSON.stringify(info).includes("Elena")), "el registro lleva clase y SQLSTATE, nunca el texto");
});

// ---- validarContraEstado ----
const HOY = "2026-10-14";
const base = { hoy: HOY, fecha: "2026-10-20", enfermeraActiva: true as boolean | null, medicoActivo: true as boolean | null | undefined };

test("sin problemas: devuelve null para asignar, modificar y quitar", () => {
  for (const operacion of ["asignar", "modificar", "quitar"] as const) {
    assert.equal(validarContraEstado({ ...base, operacion }), null);
  }
  assert.equal(validarContraEstado({ ...base, operacion: "asignar", medicoActivo: undefined }), null, "un turno de servicio no tiene médico que comprobar");
});

test("hoy en Lima todavía es hoy: la fecha de hoy se acepta y la de ayer no", () => {
  assert.equal(validarContraEstado({ ...base, operacion: "asignar", fecha: HOY }), null);
  assert.equal(validarContraEstado({ ...base, operacion: "modificar", fecha: HOY }), null);
  assert.equal(validarContraEstado({ ...base, operacion: "quitar", fecha: HOY }), null);
  const ayer = "2026-10-13";
  assert.equal(validarContraEstado({ ...base, operacion: "asignar", fecha: ayer })?.mensaje, MENSAJE_FECHA_ANTERIOR);
  assert.equal(validarContraEstado({ ...base, operacion: "modificar", fecha: ayer })?.mensaje, MENSAJE_TURNO_PASADO);
  assert.equal(validarContraEstado({ ...base, operacion: "quitar", fecha: ayer })?.mensaje, MENSAJE_TURNO_PASADO);
});

test("fecha pasada: el campo de la fecha lleva el mensaje al asignar, y modificar o quitar no apuntan a un campo", () => {
  assert.deepEqual(validarContraEstado({ ...base, operacion: "asignar", fecha: "2026-01-01" })?.campos, { fecha: MENSAJE_FECHA_ANTERIOR });
  assert.equal(validarContraEstado({ ...base, operacion: "modificar", fecha: "2026-01-01" })?.campos, undefined);
});

test("enfermera de baja o inexistente", () => {
  const baja = validarContraEstado({ ...base, operacion: "asignar", enfermeraActiva: false });
  assert.deepEqual(baja, { ok: false, codigo: "DATOS_INVALIDOS", mensaje: MENSAJE_ENFERMERA_DE_BAJA, campos: { enfermera_id: MENSAJE_ENFERMERA_DE_BAJA } });
  assert.equal(validarContraEstado({ ...base, operacion: "modificar", enfermeraActiva: false })?.mensaje, MENSAJE_ENFERMERA_DE_BAJA);
  assert.equal(validarContraEstado({ ...base, operacion: "asignar", enfermeraActiva: null })?.mensaje, MENSAJE_ENFERMERA_INEXISTENTE);
});

test("médico de baja o inexistente", () => {
  const baja = validarContraEstado({ ...base, operacion: "asignar", medicoActivo: false });
  assert.deepEqual(baja, { ok: false, codigo: "DATOS_INVALIDOS", mensaje: MENSAJE_MEDICO_DE_BAJA, campos: { medico_id: MENSAJE_MEDICO_DE_BAJA } });
  assert.equal(validarContraEstado({ ...base, operacion: "modificar", medicoActivo: null })?.mensaje, MENSAJE_MEDICO_INEXISTENTE);
});

test("orden de los problemas: fecha, enfermera y médico", () => {
  const todo = { ...base, enfermeraActiva: false, medicoActivo: false };
  assert.equal(validarContraEstado({ ...todo, operacion: "asignar", fecha: "2020-01-01" })?.mensaje, MENSAJE_FECHA_ANTERIOR);
  assert.equal(validarContraEstado({ ...todo, operacion: "asignar" })?.mensaje, MENSAJE_ENFERMERA_DE_BAJA);
  assert.equal(validarContraEstado({ ...todo, operacion: "asignar", enfermeraActiva: true })?.mensaje, MENSAJE_MEDICO_DE_BAJA);
});

test("quitar un turno no depende de si el personal sigue activo: es justo la razón para quitarlo", () => {
  assert.equal(validarContraEstado({ ...base, operacion: "quitar", enfermeraActiva: false, medicoActivo: false }), null);
});
