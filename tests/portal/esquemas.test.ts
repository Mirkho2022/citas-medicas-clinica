// Pruebas de lib/schemas/paciente-portal.ts (H4, tarea 3.1; specs/registro-del-paciente). Ejecutar con: npm run test:portal
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  crearPacientePortalSchema,
  MENSAJE_FECHA_NACIMIENTO_PORTAL,
  MENSAJE_TELEFONO,
} from "../../lib/schemas/paciente-portal.ts";
import { MENSAJE_CE, MENSAJE_DNI } from "../../lib/schemas/documento.ts";

// «Hoy» en Lima es el 20/10/2026 (15:00 UTC = 10:00 en Lima).
const schema = crearPacientePortalSchema(() => new Date("2026-10-20T15:00:00Z"));

const base = {
  tipo_documento: "DNI",
  numero_documento: "72345678",
  nombres: "Ana María",
  apellidos: "Quispe Rojas",
  fecha_nacimiento: "1985-03-12",
  sexo: "F",
};

function errores(entrada: unknown): Record<string, string> {
  const r = schema.safeParse(entrada);
  if (r.success) return {};
  const campos: Record<string, string> = {};
  for (const problema of r.error.issues) campos[problema.path.join(".")] ??= problema.message;
  return campos;
}

test("un registro completo es válido y devuelve los datos normalizados", () => {
  const r = schema.safeParse({ ...base, telefono: "987654321", direccion: "Av. Lima 123" });
  assert.equal(r.success, true);
  assert.deepEqual(r.data, { ...base, telefono: "987654321", direccion: "Av. Lima 123" });
});

test("el teléfono y la dirección son opcionales", () => {
  for (const vacio of [undefined, "", "   ", null]) {
    const r = schema.safeParse({ ...base, telefono: vacio, direccion: vacio });
    assert.equal(r.success, true, `valor ${JSON.stringify(vacio)}`);
    assert.equal(r.data?.telefono, undefined);
    assert.equal(r.data?.direccion, undefined);
  }
});

const casosDocumento: { nombre: string; tipo: string; numero: string; valido: boolean; guardado?: string; mensaje?: string }[] = [
  { nombre: "DNI de 7 dígitos", tipo: "DNI", numero: "1234567", valido: false, mensaje: MENSAJE_DNI },
  { nombre: "DNI de 8 dígitos", tipo: "DNI", numero: "12345678", valido: true, guardado: "12345678" },
  { nombre: "DNI de 9 dígitos", tipo: "DNI", numero: "123456789", valido: false, mensaje: MENSAJE_DNI },
  { nombre: "DNI con una letra", tipo: "DNI", numero: "1234567A", valido: false, mensaje: MENSAJE_DNI },
  { nombre: "DNI con espacios en los extremos", tipo: "DNI", numero: " 12345678 ", valido: true, guardado: "12345678" },
  { nombre: "DNI vacío", tipo: "DNI", numero: "", valido: false, mensaje: MENSAJE_DNI },
  { nombre: "CE de 8 caracteres", tipo: "CE", numero: "AB123456", valido: false, mensaje: MENSAJE_CE },
  { nombre: "CE de 9 caracteres en minúsculas", tipo: "CE", numero: "ce1234567", valido: true, guardado: "CE1234567" },
  { nombre: "CE de 12 caracteres", tipo: "CE", numero: "AB1234567890", valido: true, guardado: "AB1234567890" },
  { nombre: "CE de 13 caracteres", tipo: "CE", numero: "AB12345678901", valido: false, mensaje: MENSAJE_CE },
  { nombre: "CE con un símbolo", tipo: "CE", numero: "AB-1234567", valido: false, mensaje: MENSAJE_CE },
  { nombre: "un número de 8 dígitos no es un CE", tipo: "CE", numero: "12345678", valido: false, mensaje: MENSAJE_CE },
];
for (const caso of casosDocumento) {
  test(`documento: ${caso.nombre}`, () => {
    const r = schema.safeParse({ ...base, tipo_documento: caso.tipo, numero_documento: caso.numero });
    assert.equal(r.success, caso.valido);
    if (caso.valido) assert.equal(r.data?.numero_documento, caso.guardado);
    else assert.equal(errores({ ...base, tipo_documento: caso.tipo, numero_documento: caso.numero }).numero_documento, caso.mensaje);
  });
}

test("el tipo de documento es obligatorio y debe ser DNI o CE", () => {
  for (const tipo of ["", "PASAPORTE", undefined, null]) {
    assert.ok(errores({ ...base, tipo_documento: tipo }).tipo_documento, `tipo ${JSON.stringify(tipo)}`);
  }
});

test("los campos vacíos o solo con espacios fallan, cada uno con su mensaje, todos en el mismo envío", () => {
  const e = errores({ ...base, nombres: "  ", apellidos: "", fecha_nacimiento: "", sexo: "" });
  assert.equal(e.nombres, "Ingrese sus nombres");
  assert.equal(e.apellidos, "Ingrese sus apellidos");
  assert.equal(e.fecha_nacimiento, "Ingrese su fecha de nacimiento");
  assert.equal(e.sexo, "Seleccione una opción");
});

test("los nombres se recortan y tienen un largo máximo", () => {
  assert.equal(schema.parse({ ...base, nombres: "  Ana  " }).nombres, "Ana");
  assert.ok(errores({ ...base, nombres: "a".repeat(121) }).nombres);
});

const casosFecha: { nombre: string; fecha: string; valida: boolean }[] = [
  { nombre: "hoy", fecha: "2026-10-20", valida: true },
  { nombre: "mañana", fecha: "2026-10-21", valida: false },
  { nombre: "hace exactamente 120 años", fecha: "1906-10-20", valida: true },
  { nombre: "un día más de 120 años", fecha: "1906-10-19", valida: false },
  { nombre: "una fecha que no existe", fecha: "2000-02-30", valida: false },
  { nombre: "texto", fecha: "ayer", valida: false },
];
for (const caso of casosFecha) {
  test(`fecha de nacimiento: ${caso.nombre}`, () => {
    const e = errores({ ...base, fecha_nacimiento: caso.fecha });
    if (caso.valida) assert.equal(e.fecha_nacimiento, undefined);
    else assert.equal(e.fecha_nacimiento, MENSAJE_FECHA_NACIMIENTO_PORTAL);
  });
}

test("la fecha de nacimiento usa el día de Lima, no el de UTC", () => {
  // 03:00 UTC del 21/10 sigue siendo el 20/10 en Lima (22:00): nacer «el 21» es una fecha futura.
  const tarde = crearPacientePortalSchema(() => new Date("2026-10-21T03:00:00Z"));
  assert.equal(tarde.safeParse({ ...base, fecha_nacimiento: "2026-10-21" }).success, false);
  assert.equal(tarde.safeParse({ ...base, fecha_nacimiento: "2026-10-20" }).success, true);
});

const casosTelefono: { nombre: string; valor: string; valido: boolean; guardado?: string }[] = [
  { nombre: "7 dígitos", valor: "1234567", valido: true, guardado: "1234567" },
  { nombre: "6 dígitos", valor: "123456", valido: false },
  { nombre: "15 dígitos", valor: "123456789012345", valido: true, guardado: "123456789012345" },
  { nombre: "16 dígitos", valor: "1234567890123456", valido: false },
  { nombre: "con «+» y espacios", valor: "+51 987 654 321", valido: true, guardado: "51987654321" },
  { nombre: "con letras", valor: "98765432a", valido: false },
  { nombre: "con guiones", valor: "987-654-321", valido: false },
];
for (const caso of casosTelefono) {
  test(`teléfono: ${caso.nombre}`, () => {
    const r = schema.safeParse({ ...base, telefono: caso.valor });
    assert.equal(r.success, caso.valido);
    if (caso.valido) assert.equal(r.data?.telefono, caso.guardado);
    else assert.equal(errores({ ...base, telefono: caso.valor }).telefono, MENSAJE_TELEFONO);
  });
}

test("las claves desconocidas (rol, perfil_id, email, id) se descartan", () => {
  const r = schema.parse({
    ...base,
    rol: "administrativo",
    perfil_id: "00000000-0000-4000-8000-000000000001",
    paciente_id: "00000000-0000-4000-8000-000000000002",
    email: "otro@demo.invalid",
    id: "x",
  });
  assert.deepEqual(Object.keys(r).sort(), ["apellidos", "fecha_nacimiento", "nombres", "numero_documento", "sexo", "tipo_documento"]);
});

test("una entrada que no es un objeto se rechaza", () => {
  for (const entrada of [null, "texto", 42, []]) {
    assert.equal(schema.safeParse(entrada).success, false, JSON.stringify(entrada));
  }
});
