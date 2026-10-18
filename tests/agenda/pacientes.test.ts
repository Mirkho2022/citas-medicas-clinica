// Pruebas de lib/citas/pacientes.ts y lib/acciones/entrada.ts (H3, tarea 8.1; specs/identificacion-de-pacientes).
// Ejecutar con: npm run test:agenda. El `Ejecutor` es un doble: sin Clerk, sin red y sin base de datos. Lo que sí toca la
// base de datos (la búsqueda y el alta como administrativo, con la RLS de cada rol) está en tests/integracion/pacientes.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { entradaDeFormulario } from "../../lib/acciones/entrada.ts";
import { MENSAJE_ERROR_INTERNO } from "../../lib/acciones/resultado.ts";
import type { Ejecutor, Fila, Sentencia } from "../../lib/db/ejecutor.ts";
import {
  buscarPacientes,
  escaparComodines,
  LIMITE_BUSQUEDA_PACIENTES,
  registrarPaciente,
  sentenciaBusqueda,
} from "../../lib/citas/pacientes.ts";
import { MENSAJE_DOCUMENTO_DUPLICADO } from "../../lib/citas/errores.ts";
import { MENSAJE_BUSQUEDA_VACIA } from "../../lib/schemas/paciente.ts";

// Ejecutor de prueba: registra las sentencias y responde con las filas dadas o lanza el error dado.
function ejecutorDe(respuesta: { filas?: Fila[]; error?: unknown } = {}) {
  const llamadas: Sentencia[][] = [];
  const ejecutar: Ejecutor = async (sentencias) => {
    llamadas.push([...sentencias]);
    if (respuesta.error !== undefined) throw respuesta.error;
    return [respuesta.filas ?? []];
  };
  return { ejecutar, llamadas };
}

const errorSql = (code: string) => Object.assign(new Error("texto de postgres en inglés"), { code });

const PACIENTE_VALIDO = {
  tipo_documento: "DNI",
  numero_documento: "99000101",
  nombres: "Rosa",
  apellidos: "Quispe Rojas",
  fecha_nacimiento: "1990-05-17",
  sexo: "F",
  email: "rosa@demo.invalid",
};

test("escaparComodines vuelve literales %, _ y la barra invertida", () => {
  assert.equal(escaparComodines("%"), "\\%");
  assert.equal(escaparComodines("_"), "\\_");
  assert.equal(escaparComodines("\\"), "\\\\");
  assert.equal(escaparComodines("50%_de\\x"), "50\\%\\_de\\\\x");
  assert.equal(escaparComodines("Quispe"), "Quispe");
  assert.equal(escaparComodines("Peña Núñez"), "Peña Núñez");
});

test("la sentencia de búsqueda compara el documento exacto y el inicio de los apellidos, con comodines escapados", () => {
  const { texto, parametros } = sentenciaBusqueda("quis%");
  // El documento se compara normalizado (mayúsculas); los apellidos por prefijo y con el texto literal.
  assert.deepEqual(parametros, ["QUIS%", "quis\\%%"]);
  assert.match(texto, /numero_documento = \$1 or apellidos ilike \$2 escape '\\'/);
  assert.match(texto, new RegExp(`limit ${LIMITE_BUSQUEDA_PACIENTES}\\s*$`));
  assert.equal(LIMITE_BUSQUEDA_PACIENTES, 20);
});

test("la búsqueda devuelve solo columnas de identificación y contacto, nunca datos clínicos", () => {
  const { texto } = sentenciaBusqueda("Quispe");
  const columnas = texto.slice(texto.indexOf("select") + 6, texto.indexOf("from public.pacientes"));
  for (const esperada of ["id", "tipo_documento", "numero_documento", "nombres", "apellidos", "fecha_nacimiento", "email", "telefono"]) {
    assert.match(columnas, new RegExp(`\\b${esperada}\\b`));
  }
  for (const clinica of ["direccion", "sexo", "historia", "diagnostico", "antecedente"]) {
    assert.doesNotMatch(texto, new RegExp(clinica, "i"));
  }
});

test("buscar con el texto vacío o de solo espacios se rechaza sin consultar la base de datos", async () => {
  for (const termino of ["", "   ", null, undefined]) {
    const { ejecutar, llamadas } = ejecutorDe();
    const r = await buscarPacientes(ejecutar, { termino });
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.codigo, "DATOS_INVALIDOS");
    assert.equal(r.ok === false && r.mensaje, MENSAJE_BUSQUEDA_VACIA);
    assert.equal(llamadas.length, 0);
  }
});

test("buscar un texto de más de 100 caracteres se rechaza sin consultar la base de datos", async () => {
  const { ejecutar, llamadas } = ejecutorDe();
  const r = await buscarPacientes(ejecutar, { termino: "a".repeat(101) });
  assert.equal(r.ok, false);
  assert.equal(llamadas.length, 0);
});

test("buscar recorta el texto, hace una sola consulta y devuelve las filas tal cual", async () => {
  const filas = [{ id: "1", apellidos: "Quispe" }];
  const { ejecutar, llamadas } = ejecutorDe({ filas });
  const r = await buscarPacientes(ejecutar, { termino: "  quis " });
  assert.deepEqual(r, { ok: true, datos: filas });
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0]!.length, 1);
  assert.deepEqual(llamadas[0]![0]!.parametros, ["QUIS", "quis%"]);
});

test("un error de la base de datos al buscar no escapa: 42501 es no autorizado y lo demás es genérico", async () => {
  const { ejecutar: sinPermiso } = ejecutorDe({ error: errorSql("42501") });
  const r1 = await buscarPacientes(sinPermiso, { termino: "Quispe" });
  assert.equal(r1.ok === false && r1.codigo, "NO_AUTORIZADO");

  const registrados: unknown[] = [];
  const original = console.error;
  console.error = (...datos: unknown[]) => void registrados.push(datos);
  try {
    const { ejecutar: caida } = ejecutorDe({ error: errorSql("57P01") });
    const r2 = await buscarPacientes(caida, { termino: "Quispe" });
    assert.deepEqual(r2, { ok: false, codigo: "ERROR_INTERNO", mensaje: MENSAJE_ERROR_INTERNO });
  } finally {
    console.error = original;
  }
  // Lo registrado nunca trae el texto de Postgres.
  assert.doesNotMatch(JSON.stringify(registrados), /texto de postgres/);
});

test("registrar con datos inválidos devuelve un mensaje por campo y no consulta la base de datos", async () => {
  const { ejecutar, llamadas } = ejecutorDe();
  const r = await registrarPaciente(ejecutar, { ...PACIENTE_VALIDO, numero_documento: "1234567", email: "no-es-correo", sexo: "Z" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.codigo, "DATOS_INVALIDOS");
  assert.equal(r.campos?.numero_documento, "El DNI debe tener 8 dígitos");
  assert.ok(r.campos?.email);
  assert.ok(r.campos?.sexo);
  assert.equal(llamadas.length, 0);
});

test("registrar normaliza el documento, envía todos los campos en orden y devuelve el id", async () => {
  const { ejecutar, llamadas } = ejecutorDe({ filas: [{ id: "paciente-1" }] });
  const r = await registrarPaciente(ejecutar, {
    ...PACIENTE_VALIDO,
    tipo_documento: "CE",
    numero_documento: " ab1234567 ",
    telefono: "999111222",
    direccion: "  ",
  });
  assert.deepEqual(r, { ok: true, datos: { id: "paciente-1" } });
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0]![0]!.parametros, [
    "CE",
    "AB1234567",
    "Rosa",
    "Quispe Rojas",
    "1990-05-17",
    "F",
    "rosa@demo.invalid",
    "999111222",
    null, // dirección vacía = sin dirección
  ]);
});

test("registrar un documento duplicado (23505) da el mensaje propio, cuelga del campo del documento y no es genérico", async () => {
  const { ejecutar } = ejecutorDe({ error: errorSql("23505") });
  const r = await registrarPaciente(ejecutar, PACIENTE_VALIDO);
  assert.deepEqual(r, {
    ok: false,
    codigo: "DOCUMENTO_DUPLICADO",
    mensaje: MENSAJE_DOCUMENTO_DUPLICADO,
    campos: { numero_documento: MENSAJE_DOCUMENTO_DUPLICADO },
  });
  assert.equal(MENSAJE_DOCUMENTO_DUPLICADO, "Ya existe un paciente con ese documento");
});

test("registrar sin permiso (42501) devuelve no autorizado", async () => {
  const { ejecutar } = ejecutorDe({ error: errorSql("42501") });
  const r = await registrarPaciente(ejecutar, PACIENTE_VALIDO);
  assert.equal(r.ok === false && r.codigo, "NO_AUTORIZADO");
});

test("entradaDeFormulario convierte un FormData en un objeto de textos y deja pasar lo demás", () => {
  const formulario = new FormData();
  formulario.set("termino", "Quispe");
  formulario.set("$ACTION_ID_abc", "interno");
  formulario.set("archivo", new Blob(["x"]), "x.txt");
  assert.deepEqual(entradaDeFormulario(formulario), { termino: "Quispe" });

  const objeto = { termino: "Quispe" };
  assert.equal(entradaDeFormulario(objeto), objeto);
  assert.equal(entradaDeFormulario(undefined), undefined);
  assert.equal(entradaDeFormulario(null), null);
});
