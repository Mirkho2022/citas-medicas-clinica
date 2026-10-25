// Alta y vinculación del paciente que se registra solo (openspec/changes/portal-del-paciente/specs/registro-del-paciente; design.md,
// D3 y D5; ADR-0037). Recibe un `Ejecutor` (lib/db/ejecutor.ts) para poder probarse sin Clerk y sin red.
//
// Valida con Zod ANTES de tocar la base de datos y llama a `public.registrar_paciente_portal`, que decide si crea la ficha o vincula
// la existente. La identidad (perfil, rol y correo) sale del token que valida Neon: este módulo no recibe ningún identificador de
// paciente, de perfil ni de rol, y el esquema descarta cualquier clave que lo intente.
//
// Todos los rechazos de la vinculación (`PA002`) producen EXACTAMENTE el mismo resultado, sin revelar si el documento existe ni qué
// dato no coincidió. Nunca se escribe en un registro (log) el documento, el correo ni los nombres.
import { exito, fallo, falloPorValidacion, MENSAJE_ERROR_INTERNO, MENSAJE_NO_AUTORIZADO, type ResultadoAccion } from "../acciones/resultado.ts";
import { consultar, type Ejecutor } from "../db/ejecutor.ts";
import { pacientePortalSchema } from "../schemas/paciente-portal.ts";
import {
  MENSAJE_CUENTA_YA_REGISTRADA,
  MENSAJE_REGISTRO_RECHAZADO,
  MENSAJE_REVISAR_DOCUMENTO,
  MENSAJE_SESION_NO_CONFIRMADA,
} from "./mensajes.ts";

export interface RegistroCompletado {
  pacienteId: string;
  // `true` si se vinculó la ficha que la clínica ya tenía; `false` si se creó una nueva.
  vinculado: boolean;
}

// Texto del error de la base de datos → clase para el registro (log). Nunca el texto: puede traer datos del paciente.
export type RegistrarClase = (clase: string) => void;

function registrarPorDefecto(clase: string): void {
  console.error(`[completarRegistro] error inesperado (clase=${clase})`);
}

export async function registrarPacientePortal(
  ejecutar: Ejecutor,
  entrada: unknown,
  registrar: RegistrarClase = registrarPorDefecto,
): Promise<ResultadoAccion<RegistroCompletado>> {
  const validada = pacientePortalSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);
  const p = validada.data;

  try {
    const filas = await consultar(
      ejecutar,
      `select paciente_id, vinculado
         from public.registrar_paciente_portal($1::public.tipo_documento, $2, $3, $4, $5::date, $6, $7, $8)`,
      [p.tipo_documento, p.numero_documento, p.nombres, p.apellidos, p.fecha_nacimiento, p.sexo, p.telefono ?? null, p.direccion ?? null],
    );
    const fila = filas[0];
    if (!fila) return fallo("ERROR_INTERNO", MENSAJE_ERROR_INTERNO);
    return exito({ pacienteId: String(fila.paciente_id), vinculado: fila.vinculado === true });
  } catch (error) {
    return traducirErrorRegistro(error, registrar);
  }
}

// Traduce el error de Postgres (por SQLSTATE, `error.code`; nunca por su texto, que viene en inglés y puede traer datos).
export function traducirErrorRegistro(error: unknown, registrar: RegistrarClase = registrarPorDefecto) {
  const codigo = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  switch (codigo) {
    case "PA001":
      return fallo("CUENTA_YA_REGISTRADA", MENSAJE_CUENTA_YA_REGISTRADA);
    case "PA002":
      // Siempre el mismo resultado: ficha de otra cuenta, datos que no coinciden o carrera por el mismo documento.
      return fallo("REGISTRO_RECHAZADO", MENSAJE_REGISTRO_RECHAZADO);
    case "PA003":
    case "PA004":
      // La cuenta aún no está lista o el token no trae correo: volver a ingresar renueva la sesión.
      return fallo("NO_AUTORIZADO", MENSAJE_SESION_NO_CONFIRMADA);
    case "42501":
      return fallo("NO_AUTORIZADO", MENSAJE_NO_AUTORIZADO);
    case "23514": // el CHECK de formato del documento (segunda barrera tras Zod)
      return fallo("DATOS_INVALIDOS", MENSAJE_REVISAR_DOCUMENTO, { numero_documento: MENSAJE_REVISAR_DOCUMENTO });
    case "23505": // carrera por la unicidad: se ve igual que cualquier otro rechazo de vinculación
      return fallo("REGISTRO_RECHAZADO", MENSAJE_REGISTRO_RECHAZADO);
    default:
      registrar(error instanceof Error ? error.name : typeof error);
      return fallo("ERROR_INTERNO", MENSAJE_ERROR_INTERNO);
  }
}
