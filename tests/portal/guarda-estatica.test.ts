// Guarda estática del aislamiento del paciente (H4, tarea 8.1; specs/aislamiento-del-paciente). Ejecutar con: npm run test:portal
//
// El portal del paciente no tiene ninguna ruta hacia contenido clínico o administrativo: ni una consulta a esas tablas ni un campo
// con el que una acción acepte la identidad desde el cliente. Esta prueba recorre el código del portal y falla si alguno de los dos
// aparece. NO sustituye a la RLS (pgTAP 72 prueba lo que la base de datos le niega al rol): es la red que atrapa un descuido ANTES
// de que llegue a la base de datos, y cubre el código que se escriba en los grupos 6 y 7.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const RAIZ = process.cwd();

// Directorios del portal del paciente. Los que aún no existen (p. ej. `lib/seguridad/` hasta el grupo 4) se omiten.
const DIRECTORIOS = ["app/completar-registro", "app/paciente", "lib/portal", "lib/seguridad"];
// Esquemas de entrada del portal que viven fuera de esos directorios.
const ESQUEMAS_EXTRA = ["lib/schemas/paciente-portal.ts"];

// Tablas que el rol paciente nunca debe nombrar (clínicas y administrativas).
const TABLAS_PROHIBIDAS = [
  "historias_clinicas",
  "atenciones",
  "addendas",
  "antecedentes",
  "accesos_historia",
  "notificaciones",
  "auditoria",
  "bloqueos_agenda",
  "asignaciones_paciente_medico",
  "turnos_enfermeria",
];

// Campos con los que una acción NO puede aceptar la identidad: salen de la sesión, nunca del envío.
const CAMPOS_DE_IDENTIDAD = ["paciente_id", "perfil_id", "rol"];

function archivos(directorio: string): string[] {
  const ruta = join(RAIZ, directorio);
  if (!existsSync(ruta)) return [];
  const encontrados: string[] = [];
  for (const nombre of readdirSync(ruta)) {
    const completa = join(ruta, nombre);
    if (statSync(completa).isDirectory()) encontrados.push(...archivos(relative(RAIZ, completa)));
    else if (/\.(ts|tsx)$/.test(nombre)) encontrados.push(completa);
  }
  return encontrados;
}

const enAlcance = [...DIRECTORIOS.flatMap(archivos), ...ESQUEMAS_EXTRA.map((e) => join(RAIZ, e)).filter(existsSync)];

// El código sin comentarios: una tabla nombrada en un comentario explicativo no es una consulta.
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function tablasProhibidasEn(texto: string): string[] {
  const codigo = sinComentarios(texto);
  return TABLAS_PROHIBIDAS.filter((tabla) => new RegExp(`\\b${tabla}\\b`).test(codigo));
}

// Un campo de identidad como clave de un objeto (`paciente_id: z…`, `rol: z…`) en un archivo que define esquemas Zod.
export function camposDeIdentidadEnEsquemas(texto: string): string[] {
  const codigo = sinComentarios(texto);
  if (!/\bz\.object\(/.test(codigo)) return [];
  return CAMPOS_DE_IDENTIDAD.filter((campo) => new RegExp(`^\\s*"?${campo}"?\\s*:`, "m").test(codigo));
}

test("la guarda tiene archivos que revisar", () => {
  assert.ok(enAlcance.length >= 8, `solo se encontraron ${enAlcance.length} archivos del portal`);
});

test("ningún archivo del portal nombra una tabla clínica o administrativa", () => {
  const infracciones = enAlcance.flatMap((archivo) => tablasProhibidasEn(readFileSync(archivo, "utf8")).map((t) => `${relative(RAIZ, archivo)}: ${t}`));
  assert.deepEqual(infracciones, []);
});

test("ningún esquema de entrada del portal acepta paciente_id, perfil_id ni rol", () => {
  const infracciones = enAlcance.flatMap((archivo) =>
    camposDeIdentidadEnEsquemas(readFileSync(archivo, "utf8")).map((c) => `${relative(RAIZ, archivo)}: ${c}`),
  );
  assert.deepEqual(infracciones, []);
});

// La guarda no es vacía: se prueba a sí misma con el código que debe atrapar.
test("la guarda detecta una consulta a una tabla clínica", () => {
  assert.deepEqual(tablasProhibidasEn("const f = await sql`select * from public.atenciones`"), ["atenciones"]);
  assert.deepEqual(tablasProhibidasEn("select 1 from historias_clinicas h join auditoria a on true").sort(), ["auditoria", "historias_clinicas"]);
});

test("la guarda no se confunde con una tabla nombrada solo en un comentario", () => {
  assert.deepEqual(tablasProhibidasEn("// la carpeta de historias_clinicas queda fuera\nconst x = 1;\n/* atenciones */"), []);
});

test("la guarda detecta un esquema que acepta la identidad desde el cliente", () => {
  const malo = "const s = z.object({\n  nombres: z.string(),\n  paciente_id: z.string().uuid(),\n  rol: z.string(),\n});";
  assert.deepEqual(camposDeIdentidadEnEsquemas(malo), ["paciente_id", "rol"]);
  assert.deepEqual(camposDeIdentidadEnEsquemas("const s = z.object({ nombres: z.string() });"), []);
  // Un archivo sin esquemas Zod (p. ej. una consulta que devuelve `paciente_id`) no cuenta.
  assert.deepEqual(camposDeIdentidadEnEsquemas("const fila = { paciente_id: 'x' };"), []);
});
