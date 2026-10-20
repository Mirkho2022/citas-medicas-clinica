// Pruebas de lib/schemas/* (H3, tarea 7.3). Ejecutar con: npm run test:agenda
// Cubren los escenarios de specs/identificacion-de-pacientes y los de datos incoherentes de specs/disponibilidad-y-slots.
// Los esquemas validan antes de consultar la base de datos: aquí no hay base de datos.
import assert from "node:assert/strict";
import { test } from "node:test";
import { falloPorValidacion } from "../../lib/acciones/resultado.ts";
import { bloqueoSchema, disponibilidadSchema } from "../../lib/schemas/agenda.ts";
import { citaIdSchema, citaNuevaSchema, reprogramarCitaSchema } from "../../lib/schemas/cita.ts";
import {
  documentoSchema,
  MENSAJE_CE,
  MENSAJE_DNI,
  MENSAJE_TIPO_DOCUMENTO,
  normalizarDocumento,
} from "../../lib/schemas/documento.ts";
import { crearPacienteSchema, pacienteSchema } from "../../lib/schemas/paciente.ts";

// Mensaje por campo de un esquema rechazado (el primero de cada campo), o `null` si se aceptó.
function errores(resultado: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }) {
  if (resultado.success) return null;
  return falloPorValidacion(resultado.error!).campos ?? {};
}

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";

// ---------------------------------------------------------------------------------------------------------------------
// Documento: DNI y Carné de Extranjería
// ---------------------------------------------------------------------------------------------------------------------

test("DNI válido: 8 dígitos", () => {
  const r = documentoSchema.safeParse({ tipo_documento: "DNI", numero_documento: "12345678" });
  assert.ok(r.success);
  assert.deepEqual(r.data, { tipo_documento: "DNI", numero_documento: "12345678" });
});

test("DNI con menos o más dígitos, o con letras: «El DNI debe tener 8 dígitos»", () => {
  for (const numero of ["1234567", "123456789", "1234567A", "", "1234 5678", "12345678.", "１２３４５６７８"]) {
    const r = documentoSchema.safeParse({ tipo_documento: "DNI", numero_documento: numero });
    assert.deepEqual(errores(r), { numero_documento: "El DNI debe tener 8 dígitos" }, `«${numero}»`);
  }
  assert.equal(MENSAJE_DNI, "El DNI debe tener 8 dígitos");
});

test("DNI: los espacios al inicio y al final se descartan", () => {
  const r = documentoSchema.safeParse({ tipo_documento: "DNI", numero_documento: "  12345678 " });
  assert.ok(r.success);
  assert.equal(r.data.numero_documento, "12345678");
});

test("Carné de Extranjería válido: 9 y 12 caracteres", () => {
  for (const numero of ["CE0000001", "AB1234567890", "123456789"]) {
    const r = documentoSchema.safeParse({ tipo_documento: "CE", numero_documento: numero });
    assert.ok(r.success, numero);
    assert.equal(r.data.numero_documento, numero);
  }
});

test("Carné de Extranjería fuera de rango o con símbolos: mensaje del formato esperado", () => {
  const esperado = "El Carné de Extranjería debe tener entre 9 y 12 caracteres, solo letras y números";
  for (const numero of ["CE000001", "AB12345678901", "CE-000001", "CE 000001", "CE00000ñ1", ""]) {
    const r = documentoSchema.safeParse({ tipo_documento: "CE", numero_documento: numero });
    assert.deepEqual(errores(r), { numero_documento: esperado }, `«${numero}»`);
  }
  assert.equal(MENSAJE_CE, esperado);
});

test("Normalización: `ce0000001 ` en minúsculas y con un espacio al final se guarda como CE0000001", () => {
  const r = documentoSchema.safeParse({ tipo_documento: "CE", numero_documento: "ce0000001 " });
  assert.ok(r.success);
  assert.equal(r.data.numero_documento, "CE0000001");
  assert.equal(normalizarDocumento("CE", " ab1234567890"), "AB1234567890");
  assert.equal(normalizarDocumento("DNI", "ab123456"), null);
});

test("Carné de Extranjería: el formato se valida sobre lo escrito, no sobre el texto ya en mayúsculas", () => {
  // `ß` pasa a `SS`, `ﬁ` a `FI` e `ı` a `I` al poner en mayúsculas: no pueden completar un número ni guardar letras que
  // la persona no escribió (dos entradas distintas chocarían en la misma clave única).
  for (const numero of ["ßABCDEFG", "ﬁABCDEFGH", "ıABCDEFGH"]) {
    const r = documentoSchema.safeParse({ tipo_documento: "CE", numero_documento: numero });
    assert.deepEqual(errores(r), { numero_documento: MENSAJE_CE }, numero);
  }
  assert.equal(normalizarDocumento("CE", "ßABCDEFG"), null);
});

test("Un número de 8 dígitos solo es válido como DNI", () => {
  assert.ok(documentoSchema.safeParse({ tipo_documento: "DNI", numero_documento: "12345678" }).success);
  const r = documentoSchema.safeParse({ tipo_documento: "CE", numero_documento: "12345678" });
  assert.deepEqual(errores(r), { numero_documento: MENSAJE_CE });
});

test("un tipo de documento ausente o desconocido se rechaza en su propio campo", () => {
  for (const tipo of ["", "PASAPORTE", "dni", null, undefined]) {
    const r = documentoSchema.safeParse({ tipo_documento: tipo, numero_documento: "12345678" });
    assert.deepEqual(errores(r), { tipo_documento: MENSAJE_TIPO_DOCUMENTO }, String(tipo));
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Paciente
// ---------------------------------------------------------------------------------------------------------------------

const PACIENTE_VALIDO = {
  tipo_documento: "DNI",
  numero_documento: "99000001",
  nombres: "  Rosa María ",
  apellidos: "Quispe Rojas",
  fecha_nacimiento: "1985-03-12",
  sexo: "F",
  email: " rosa.quispe@demo.invalid ",
  telefono: "987654321",
  direccion: "Av. Los Olivos 123",
};

test("registro de un paciente con todos los datos válidos", () => {
  const r = pacienteSchema.safeParse(PACIENTE_VALIDO);
  assert.ok(r.success, JSON.stringify(r.success ? null : r.error.issues));
  assert.deepEqual(r.data, {
    tipo_documento: "DNI",
    numero_documento: "99000001",
    nombres: "Rosa María",
    apellidos: "Quispe Rojas",
    fecha_nacimiento: "1985-03-12",
    sexo: "F",
    email: "rosa.quispe@demo.invalid",
    telefono: "987654321",
    direccion: "Av. Los Olivos 123",
  });
});

test("el teléfono y la dirección son opcionales: vacíos o ausentes quedan sin valor", () => {
  const sinOpcionales = { ...PACIENTE_VALIDO, telefono: "  ", direccion: "" };
  const r = pacienteSchema.safeParse(sinOpcionales);
  assert.ok(r.success);
  assert.equal(r.data.telefono, undefined);
  assert.equal(r.data.direccion, undefined);
  const ausentes: Record<string, unknown> = { ...PACIENTE_VALIDO };
  delete ausentes.telefono;
  delete ausentes.direccion;
  assert.ok(pacienteSchema.safeParse(ausentes).success);
});

test("el teléfono con un valor que no es texto se rechaza con un mensaje en español", () => {
  for (const valor of [5, {}]) {
    assert.deepEqual(errores(pacienteSchema.safeParse({ ...PACIENTE_VALIDO, telefono: valor })), {
      telefono: "El valor no es válido",
    });
  }
});

test("el paciente con Carné de Extranjería se guarda con el número normalizado", () => {
  const r = pacienteSchema.safeParse({ ...PACIENTE_VALIDO, tipo_documento: "CE", numero_documento: "ce0000001 " });
  assert.ok(r.success);
  assert.equal(r.data.numero_documento, "CE0000001");
});

test("datos inválidos: un mensaje por campo", () => {
  const casos: [string, Record<string, unknown>, Record<string, string>][] = [
    ["falta el nombre", { nombres: "   " }, { nombres: "Ingrese los nombres" }],
    ["faltan los apellidos", { apellidos: null }, { apellidos: "Ingrese los apellidos" }],
    ["falta el correo", { email: "" }, { email: "Ingrese el correo electrónico" }],
    ["correo no válido", { email: "rosa@" }, { email: "Ingrese un correo electrónico válido" }],
    ["correo sin arroba", { email: "rosa.quispe.demo.invalid" }, { email: "Ingrese un correo electrónico válido" }],
    ["sexo fuera de M, F o X", { sexo: "Z" }, { sexo: "Seleccione el sexo (M, F o X)" }],
    ["sexo vacío", { sexo: "" }, { sexo: "Seleccione el sexo (M, F o X)" }],
    ["falta la fecha de nacimiento", { fecha_nacimiento: "" }, { fecha_nacimiento: "Ingrese la fecha de nacimiento" }],
    ["fecha de nacimiento inexistente", { fecha_nacimiento: "1985-02-30" }, { fecha_nacimiento: "Ingrese una fecha de nacimiento válida" }],
    ["fecha de nacimiento futura", { fecha_nacimiento: "2999-01-01" }, { fecha_nacimiento: "La fecha de nacimiento no puede ser futura" }],
    ["DNI de 7 dígitos", { numero_documento: "9900000" }, { numero_documento: "El DNI debe tener 8 dígitos" }],
  ];
  for (const [nombre, cambio, esperado] of casos) {
    const r = pacienteSchema.safeParse({ ...PACIENTE_VALIDO, ...cambio });
    assert.deepEqual(errores(r), esperado, nombre);
  }
});

test("el sexo acepta M, F y X", () => {
  for (const sexo of ["M", "F", "X"]) assert.ok(pacienteSchema.safeParse({ ...PACIENTE_VALIDO, sexo }).success, sexo);
});

test("«no futura» se mide con el día de Lima, no con el del servidor", () => {
  // 02:00 UTC del 15/10/2026 = 21:00 del 14/10 en Lima: el 15/10 todavía es futuro, el 14/10 es hoy.
  const esquema = crearPacienteSchema(() => new Date("2026-10-15T02:00:00Z"));
  assert.ok(esquema.safeParse({ ...PACIENTE_VALIDO, fecha_nacimiento: "2026-10-14" }).success);
  assert.deepEqual(errores(esquema.safeParse({ ...PACIENTE_VALIDO, fecha_nacimiento: "2026-10-15" })), {
    fecha_nacimiento: "La fecha de nacimiento no puede ser futura",
  });
  // Pasada la medianoche de Lima (05:00 UTC) el 15/10 ya es hoy.
  const alDiaSiguiente = crearPacienteSchema(() => new Date("2026-10-15T05:00:00Z"));
  assert.ok(alDiaSiguiente.safeParse({ ...PACIENTE_VALIDO, fecha_nacimiento: "2026-10-15" }).success);
});

test("un formulario vacío reporta todos los campos obligatorios a la vez", () => {
  const vacio = Object.fromEntries(Object.keys(PACIENTE_VALIDO).map((clave) => [clave, ""]));
  const campos = errores(pacienteSchema.safeParse(vacio));
  assert.deepEqual(Object.keys(campos ?? {}).sort(), [
    "apellidos",
    "email",
    "fecha_nacimiento",
    "nombres",
    "sexo",
    "tipo_documento",
  ]);
});

test("el error de documento aparece junto a los de otros campos, en el mismo envío", () => {
  const campos = errores(
    pacienteSchema.safeParse({ ...PACIENTE_VALIDO, numero_documento: "1234", sexo: "Z", email: "x" }),
  );
  assert.deepEqual(Object.keys(campos ?? {}).sort(), ["email", "numero_documento", "sexo"]);
});

test("falloPorValidacion convierte el rechazo en DATOS_INVALIDOS con el mensaje por campo", () => {
  const r = pacienteSchema.safeParse({ ...PACIENTE_VALIDO, numero_documento: "1234567" });
  assert.ok(!r.success);
  assert.deepEqual(falloPorValidacion(r.error), {
    ok: false,
    codigo: "DATOS_INVALIDOS",
    mensaje: "El DNI debe tener 8 dígitos",
    campos: { numero_documento: "El DNI debe tener 8 dígitos" },
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Cita
// ---------------------------------------------------------------------------------------------------------------------

const CITA_VALIDA = {
  paciente_id: UUID_A,
  medico_id: UUID_B,
  inicio: "2026-10-14T19:30:00.000Z",
  fin: "2026-10-14T19:50:00.000Z",
  motivo: " Control ",
};

test("cita nueva: identificadores e instantes ISO, motivo opcional recortado", () => {
  const r = citaNuevaSchema.safeParse(CITA_VALIDA);
  assert.ok(r.success);
  assert.deepEqual(r.data, { ...CITA_VALIDA, motivo: "Control" });
  const sinMotivo = citaNuevaSchema.safeParse({ ...CITA_VALIDA, motivo: "" });
  assert.ok(sinMotivo.success);
  assert.equal(sinMotivo.data.motivo, undefined);
});

test("los instantes con desfase se normalizan a UTC: 14:30 con -05:00 es 19:30Z", () => {
  const r = citaNuevaSchema.safeParse({
    ...CITA_VALIDA,
    inicio: "2026-10-14T14:30:00-05:00",
    fin: "2026-10-14T14:50:00-05:00",
  });
  assert.ok(r.success);
  assert.equal(r.data.inicio, "2026-10-14T19:30:00.000Z");
  assert.equal(r.data.fin, "2026-10-14T19:50:00.000Z");
});

test("un instante sin zona se rechaza: el horario viaja como instante, no como texto local", () => {
  const r = citaNuevaSchema.safeParse({ ...CITA_VALIDA, inicio: "2026-10-14T14:30:00" });
  assert.deepEqual(errores(r), { inicio: "El horario elegido no es válido" });
  assert.deepEqual(
    errores(citaNuevaSchema.safeParse({ ...CITA_VALIDA, inicio: "mañana a las 3" })),
    { inicio: "El horario elegido no es válido" },
  );
});

test("un desfase horario imposible se rechaza con su mensaje y no lanza una excepción", () => {
  for (const desfase of ["+99:99", "+24:00", "+00:60", "+05:99"]) {
    const entrada = { ...CITA_VALIDA, inicio: `2026-10-14T19:30:00${desfase}` };
    assert.doesNotThrow(() => citaNuevaSchema.safeParse(entrada), desfase);
    assert.deepEqual(errores(citaNuevaSchema.safeParse(entrada)), { inicio: "El horario elegido no es válido" }, desfase);
  }
});

test("cita sin paciente, sin médico o sin horario: un mensaje por campo", () => {
  const r = citaNuevaSchema.safeParse({ paciente_id: "", medico_id: null, inicio: "", fin: undefined, motivo: "" });
  assert.deepEqual(errores(r), {
    paciente_id: "Seleccione un paciente",
    medico_id: "Seleccione un médico",
    inicio: "Seleccione un horario",
    fin: "Seleccione un horario",
  });
});

test("un identificador que no es uuid se rechaza", () => {
  assert.deepEqual(errores(citaNuevaSchema.safeParse({ ...CITA_VALIDA, paciente_id: "99000001" })), {
    paciente_id: "Seleccione un paciente",
  });
});

test("el fin debe ser posterior al inicio", () => {
  for (const fin of ["2026-10-14T19:30:00.000Z", "2026-10-14T19:00:00.000Z"]) {
    assert.deepEqual(errores(citaNuevaSchema.safeParse({ ...CITA_VALIDA, fin })), {
      fin: "El horario de fin debe ser posterior al de inicio",
    });
  }
});

test("reprogramar pide la cita original y el nuevo horario", () => {
  const horario: Record<string, unknown> = { ...CITA_VALIDA };
  delete horario.paciente_id;
  const r = reprogramarCitaSchema.safeParse({ cita_id: UUID_C, ...horario });
  assert.ok(r.success);
  assert.equal(r.data.cita_id, UUID_C);
  assert.deepEqual(errores(reprogramarCitaSchema.safeParse(horario)), { cita_id: "Seleccione una cita" });
});

test("la entrada de una transición (cancelar, confirmar, No asistió, Atendida) es solo el identificador de la cita", () => {
  const r = citaIdSchema.safeParse({ cita_id: UUID_C, estado: "atendida", medico_id: UUID_B });
  assert.ok(r.success);
  assert.deepEqual(r.data, { cita_id: UUID_C }, "no deja pasar otros campos, como un estado");
  assert.deepEqual(errores(citaIdSchema.safeParse({ cita_id: "no-es-uuid" })), { cita_id: "Seleccione una cita" });
  assert.deepEqual(errores(citaIdSchema.safeParse({})), { cita_id: "Seleccione una cita" });
});

// ---------------------------------------------------------------------------------------------------------------------
// Disponibilidad
// ---------------------------------------------------------------------------------------------------------------------

// Lo que entrega un formulario: todo texto.
const DISPONIBILIDAD_VALIDA = {
  medico_id: UUID_B,
  dia_semana: "1",
  hora_inicio: "08:00",
  hora_fin: "12:00",
  duracion_slot_min: "20",
  vigente_desde: "",
  vigente_hasta: "",
};

test("alta de «lunes 08:00–12:00, slots de 20 minutos»", () => {
  const r = disponibilidadSchema.safeParse(DISPONIBILIDAD_VALIDA);
  assert.ok(r.success, JSON.stringify(r.success ? null : r.error.issues));
  assert.deepEqual(r.data, {
    medico_id: UUID_B,
    dia_semana: 1,
    hora_inicio: "08:00",
    hora_fin: "12:00",
    duracion_slot_min: 20,
    vigente_desde: undefined,
    vigente_hasta: undefined,
  });
});

test("sin duración la disponibilidad usa 20 minutos; sin vigencia usa la de la base de datos", () => {
  const r = disponibilidadSchema.safeParse({ ...DISPONIBILIDAD_VALIDA, duracion_slot_min: "" });
  assert.ok(r.success);
  assert.equal(r.data.duracion_slot_min, 20);
  assert.equal(r.data.vigente_desde, undefined);
});

test("el domingo (0) es válido y un día vacío no se confunde con 0", () => {
  const domingo = disponibilidadSchema.safeParse({ ...DISPONIBILIDAD_VALIDA, dia_semana: "0" });
  assert.ok(domingo.success);
  assert.equal(domingo.data.dia_semana, 0);
  assert.deepEqual(errores(disponibilidadSchema.safeParse({ ...DISPONIBILIDAD_VALIDA, dia_semana: "" })), {
    dia_semana: "Seleccione el día de la semana",
  });
});

test("datos incoherentes: día fuera de 0 a 6", () => {
  for (const dia of ["7", "-1", "1.5", "lunes", 9, 7.2]) {
    const campos = errores(disponibilidadSchema.safeParse({ ...DISPONIBILIDAD_VALIDA, dia_semana: dia }));
    assert.ok(campos?.dia_semana, `día ${dia}`);
    assert.deepEqual(Object.keys(campos ?? {}), ["dia_semana"], `día ${dia}`);
  }
});

test("datos incoherentes: fin igual o anterior al inicio", () => {
  for (const [inicio, fin] of [
    ["08:00", "08:00"],
    ["12:00", "08:00"],
    ["23:59", "00:00"],
  ] as const) {
    const r = disponibilidadSchema.safeParse({ ...DISPONIBILIDAD_VALIDA, hora_inicio: inicio, hora_fin: fin });
    assert.deepEqual(errores(r), { hora_fin: "La hora de fin debe ser posterior a la hora de inicio" }, `${inicio}-${fin}`);
  }
});

test("datos incoherentes: duración igual o menor que cero", () => {
  for (const duracion of ["0", "-20", 0, -5]) {
    const r = disponibilidadSchema.safeParse({ ...DISPONIBILIDAD_VALIDA, duracion_slot_min: duracion });
    assert.deepEqual(errores(r), { duracion_slot_min: "La duración del horario debe ser mayor que cero" }, String(duracion));
  }
  assert.deepEqual(errores(disponibilidadSchema.safeParse({ ...DISPONIBILIDAD_VALIDA, duracion_slot_min: "veinte" })), {
    duracion_slot_min: "La duración del horario debe ser un número entero de minutos",
  });
});

test("las horas aceptan HH:mm y HH:mm:00 (como devuelve Postgres) y rechazan lo demás", () => {
  const r = disponibilidadSchema.safeParse({ ...DISPONIBILIDAD_VALIDA, hora_inicio: "08:00:00", hora_fin: "12:00:00" });
  assert.ok(r.success);
  assert.equal(r.data.hora_inicio, "08:00");
  assert.equal(r.data.hora_fin, "12:00");
  assert.deepEqual(errores(disponibilidadSchema.safeParse({ ...DISPONIBILIDAD_VALIDA, hora_inicio: "25:00" })), {
    hora_inicio: "La hora de inicio no es válida (use HH:mm)",
  });
  assert.deepEqual(errores(disponibilidadSchema.safeParse({ ...DISPONIBILIDAD_VALIDA, hora_fin: "" })), {
    hora_fin: "Ingrese la hora de fin",
  });
});

test("la vigencia: fechas reales, y el fin no puede ser anterior al inicio", () => {
  const conVigencia = disponibilidadSchema.safeParse({
    ...DISPONIBILIDAD_VALIDA,
    vigente_desde: "2026-10-19",
    vigente_hasta: "2026-10-19",
  });
  assert.ok(conVigencia.success);
  assert.deepEqual(
    errores(disponibilidadSchema.safeParse({ ...DISPONIBILIDAD_VALIDA, vigente_desde: "2026-10-20", vigente_hasta: "2026-10-19" })),
    { vigente_hasta: "La fecha de fin no puede ser anterior a la de inicio" },
  );
  assert.deepEqual(errores(disponibilidadSchema.safeParse({ ...DISPONIBILIDAD_VALIDA, vigente_desde: "2026-02-30" })), {
    vigente_desde: "La fecha de inicio no es válida (use AAAA-MM-DD)",
  });
});

test("una disponibilidad vacía reporta todos los campos obligatorios a la vez", () => {
  const campos = errores(
    disponibilidadSchema.safeParse({ medico_id: "", dia_semana: "", hora_inicio: "", hora_fin: "", duracion_slot_min: "" }),
  );
  assert.deepEqual(Object.keys(campos ?? {}).sort(), ["dia_semana", "hora_fin", "hora_inicio", "medico_id"]);
});

// ---------------------------------------------------------------------------------------------------------------------
// Bloqueo de agenda
// ---------------------------------------------------------------------------------------------------------------------

const BLOQUEO_VALIDO = {
  medico_id: UUID_B,
  inicio: "2026-10-20T08:00",
  fin: "2026-10-24T18:00",
  motivo: "  Licencia ",
};

test("el bloqueo del 20/10/2026 08:00 al 24/10/2026 18:00 se interpreta como hora de Lima", () => {
  const r = bloqueoSchema.safeParse(BLOQUEO_VALIDO);
  assert.ok(r.success, JSON.stringify(r.success ? null : r.error.issues));
  // Lima es UTC-5: 08:00 → 13:00Z y 18:00 → 23:00Z, sin importar la zona del proceso.
  assert.deepEqual(r.data, {
    medico_id: UUID_B,
    inicio: "2026-10-20T13:00:00.000Z",
    fin: "2026-10-24T23:00:00.000Z",
    motivo: "Licencia",
  });
});

test("el bloqueo acepta segundos en el campo datetime-local", () => {
  const r = bloqueoSchema.safeParse({ ...BLOQUEO_VALIDO, inicio: "2026-10-20T08:00:00" });
  assert.ok(r.success);
  assert.equal(r.data.inicio, "2026-10-20T13:00:00.000Z");
});

test("bloqueo con fin igual o anterior al inicio: se rechaza y dice qué corregir", () => {
  for (const fin of ["2026-10-20T08:00", "2026-10-19T08:00"]) {
    assert.deepEqual(errores(bloqueoSchema.safeParse({ ...BLOQUEO_VALIDO, fin })), {
      fin: "La fecha y hora de fin deben ser posteriores a las de inicio",
    });
  }
});

test("bloqueo sin fecha de fin o con el motivo vacío o solo espacios", () => {
  assert.deepEqual(errores(bloqueoSchema.safeParse({ ...BLOQUEO_VALIDO, fin: "" })), {
    fin: "Ingrese la fecha y hora de fin",
  });
  assert.deepEqual(errores(bloqueoSchema.safeParse({ ...BLOQUEO_VALIDO, fin: undefined })), {
    fin: "Ingrese la fecha y hora de fin",
  });
  for (const motivo of ["", "   ", null]) {
    assert.deepEqual(errores(bloqueoSchema.safeParse({ ...BLOQUEO_VALIDO, motivo })), {
      motivo: "Ingrese el motivo de la ausencia",
    });
  }
});

test("bloqueo con una fecha inexistente o mal escrita", () => {
  assert.deepEqual(errores(bloqueoSchema.safeParse({ ...BLOQUEO_VALIDO, inicio: "2026-02-30T08:00" })), {
    inicio: "La fecha y hora de inicio no son válidas",
  });
  assert.deepEqual(errores(bloqueoSchema.safeParse({ ...BLOQUEO_VALIDO, inicio: "20/10/2026 08:00" })), {
    inicio: "La fecha y hora de inicio no son válidas",
  });
  assert.deepEqual(errores(bloqueoSchema.safeParse({ ...BLOQUEO_VALIDO, inicio: "2026-10-20T24:00" })), {
    inicio: "La fecha y hora de inicio no son válidas",
  });
});
