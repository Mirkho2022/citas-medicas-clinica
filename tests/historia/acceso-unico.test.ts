// Verificación automática del «único punto de acceso a las tablas clínicas» (openspec/changes/historias-clinicas,
// specs/auditoria-de-accesos-clinicos, «Un único punto de acceso a las tablas clínicas»; design.md D2): ningún archivo de
// `app/`, `lib/` o `components/` fuera de los módulos de acceso clínico contiene SQL contra atenciones, addendas, antecedentes,
// historias clínicas, adjuntos, asignaciones paciente-médico o accesos. Excluye migraciones, scripts, pruebas y E2E (que están
// fuera de esas tres carpetas).
//
// MÓDULOS PERMITIDOS: `lib/historia/` (lectura, este change) y `lib/atencion/` (registro y firma de atenciones, que construye otro
// grupo del mismo change en paralelo). Cuando el registro se integre en `lib/historia/`, `lib/atencion/` sale de esta lista.
// Ejecutar con: npm run test:historia.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";

const RAIZ = process.cwd();
const CARPETAS_REVISADAS = ["app", "lib", "components"];
const MODULOS_PERMITIDOS = ["lib/historia/", "lib/atencion/"];
const EXTENSIONES = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".sql"];

const TABLAS = [
  "atenciones",
  "addendas",
  "antecedentes",
  "historias_clinicas",
  "adjuntos_historia",
  "asignaciones_paciente_medico",
  "accesos_historia",
];
const LISTA = TABLAS.join("|");
// `public.<tabla>` en cualquier lugar, o una cláusula SQL que nombra la tabla (con o sin esquema).
const PATRON_SQL = new RegExp(
  `\\bpublic\\.(?:${LISTA})\\b|\\b(?:from|join|into|update|delete\\s+from|truncate(?:\\s+table)?)\\s+(?:public\\.)?(?:${LISTA})\\b`,
  "i",
);

// Devuelve el texto que delata una consulta clínica, o `null`. Exportada para probar el detector mismo.
export function consultaClinicaEn(contenido: string): string | null {
  return PATRON_SQL.exec(contenido)?.[0] ?? null;
}

function archivos(carpeta: string): string[] {
  const resultado: string[] = [];
  for (const nombre of readdirSync(carpeta)) {
    if (nombre === "node_modules" || nombre === ".next") continue;
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) resultado.push(...archivos(ruta));
    else if (EXTENSIONES.some((e) => nombre.endsWith(e))) resultado.push(ruta);
  }
  return resultado;
}

test("el detector reconoce consultas a las tablas clínicas", () => {
  assert.ok(consultaClinicaEn("select * from public.atenciones where id = $1"));
  assert.ok(consultaClinicaEn("select * from atenciones"));
  assert.ok(consultaClinicaEn("insert into accesos_historia (actor_id) values ($1)"));
  assert.ok(consultaClinicaEn("UPDATE public.antecedentes set vigente = false"));
  assert.ok(consultaClinicaEn("select 1 from pacientes p join historias_clinicas h on h.paciente_id = p.id"));
  assert.ok(consultaClinicaEn("delete from asignaciones_paciente_medico"));
  assert.ok(consultaClinicaEn("select 1 from public.ADDENDAS"));
});

test("el detector no se confunde con otras tablas ni con prosa", () => {
  assert.equal(consultaClinicaEn("select * from public.citas where estado = 'atendida'"), null);
  assert.equal(consultaClinicaEn("select * from public.pacientes"), null);
  assert.equal(consultaClinicaEn("// la atención queda firmada y las atenciones no se editan"), null);
  assert.equal(consultaClinicaEn("select * from atenciones_futuras"), null);
});

test("ningún archivo de app/, lib/ o components/ fuera de los módulos de acceso clínico consulta las tablas clínicas", () => {
  const infractores: string[] = [];
  for (const carpeta of CARPETAS_REVISADAS) {
    for (const ruta of archivos(join(RAIZ, carpeta))) {
      const relativa = relative(RAIZ, ruta).split(sep).join("/");
      if (MODULOS_PERMITIDOS.some((modulo) => relativa.startsWith(modulo))) continue;
      const coincidencia = consultaClinicaEn(readFileSync(ruta, "utf8"));
      if (coincidencia) infractores.push(`${relativa}  (contiene «${coincidencia}»)`);
    }
  }
  assert.deepEqual(
    infractores,
    [],
    `Todo el SQL clínico debe vivir en lib/historia/. Archivos que consultan las tablas clínicas:\n${infractores.join("\n")}`,
  );
});
