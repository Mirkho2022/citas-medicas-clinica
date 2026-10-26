// Búsqueda de diagnósticos en el catálogo CIE-10 para el selector del formulario (design.md, D4). Sin extensiones de Postgres:
// coincidencias de código primero y luego de descripción, sin distinguir mayúsculas ni tildes (`translate` en ambos lados).
// Mínimo 2 caracteres y máximo 20 resultados. El catálogo lo puede leer cualquier rol válido (política `cie10_lee_todo_rol`);
// la ruta que lo expone exige además rol médico y MFA.
import type { Ejecutor } from "../db/ejecutor.ts";
import { escaparComodines } from "../citas/pacientes.ts";

export const MINIMO_BUSQUEDA_CIE10 = 2;
export const MAXIMO_BUSQUEDA_CIE10 = 60;
export const LIMITE_RESULTADOS_CIE10 = 20;

export interface DiagnosticoCatalogo {
  codigo: string;
  descripcion: string;
}

// Texto de búsqueda normalizado (NFC, sin espacios en los extremos) o `null` si no cumple el mínimo o el máximo.
export function normalizarBusqueda(entrada: unknown): string | null {
  if (typeof entrada !== "string") return null;
  const texto = entrada.normalize("NFC").trim();
  const largo = Array.from(texto).length;
  if (largo < MINIMO_BUSQUEDA_CIE10 || largo > MAXIMO_BUSQUEDA_CIE10 || texto.includes("\u0000")) return null;
  return texto;
}

const SIN_TILDES = `translate(lower(%s), 'áéíóúüñ', 'aeiouun')`;

export function sentenciaBusquedaCie10(termino: string) {
  const comodin = escaparComodines(termino);
  return {
    texto: `select codigo, descripcion
              from public.cie10
             where codigo ilike $1 escape '\\'
                or ${SIN_TILDES.replace("%s", "descripcion")} like '%' || ${SIN_TILDES.replace("%s", "$2::text")} || '%' escape '\\'
             order by (codigo ilike $1 escape '\\') desc, codigo
             limit ${LIMITE_RESULTADOS_CIE10}`,
    parametros: [`${comodin}%`, comodin],
  };
}

export async function buscarDiagnosticos(ejecutar: Ejecutor, entrada: unknown): Promise<DiagnosticoCatalogo[]> {
  const termino = normalizarBusqueda(entrada);
  if (!termino) return [];
  const { texto, parametros } = sentenciaBusquedaCie10(termino);
  const [filas] = await ejecutar([{ texto, parametros }]);
  return (filas ?? []).map((f) => ({ codigo: String(f.codigo), descripcion: String(f.descripcion) }));
}
