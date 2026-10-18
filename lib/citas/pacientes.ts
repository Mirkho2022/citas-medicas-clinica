// Acceso a datos de pacientes para el administrativo (specs/identificacion-de-pacientes; design.md, D7).
//
// Cada función recibe un `Ejecutor` (lib/db/ejecutor.ts): valida la entrada con Zod ANTES de tocar la base de datos, ejecuta
// con la identidad del usuario (la RLS decide qué filas existen para el rol que llama) y traduce los errores de Postgres con
// `traducirError`. La guarda de rol y MFA (`exigirPersonal`) y `revalidatePath` viven en la Server Action
// (app/administrativo/pacientes/acciones.ts), no aquí.
import {
  exito,
  fallo,
  falloPorValidacion,
  type ResultadoAccion,
} from "../acciones/resultado.ts";
import { consultar, type Ejecutor } from "../db/ejecutor.ts";
import { busquedaPacienteSchema, pacienteSchema } from "../schemas/paciente.ts";
import { traducirError } from "./errores.ts";

// La búsqueda devuelve como máximo 20 pacientes (spec): más resultados piden afinar el texto, no paginar.
export const LIMITE_BUSQUEDA_PACIENTES = 20;

// Solo identificación y contacto: nunca datos clínicos (spec).
export interface PacienteEncontrado {
  id: string;
  tipo_documento: "DNI" | "CE";
  numero_documento: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  email: string;
  telefono: string | null;
}

// `like`/`ilike` dan significado especial a `%`, `_` y `\`: se escapan para que el texto de búsqueda sea literal (la
// consulta declara `escape '\'`). Sin esto, buscar `%` devolvería todos los pacientes.
export function escaparComodines(texto: string): string {
  return texto.replace(/[\\%_]/g, "\\$&");
}

// Sentencia de búsqueda. El número de documento coincide EXACTO (se guarda normalizado: sin espacios y, el Carné de
// Extranjería, en mayúsculas); los apellidos coinciden por su INICIO y sin distinguir mayúsculas. Un mismo texto se prueba
// como documento y como apellido porque un apellido de 9 a 12 letras tiene la forma de un Carné de Extranjería.
export function sentenciaBusqueda(termino: string) {
  return {
    texto: `select id, tipo_documento::text as tipo_documento, numero_documento, nombres, apellidos,
                   fecha_nacimiento::text as fecha_nacimiento, email::text as email, telefono
              from public.pacientes
             where numero_documento = $1 or apellidos ilike $2 escape '\\'
             order by apellidos, nombres
             limit ${LIMITE_BUSQUEDA_PACIENTES}`,
    parametros: [termino.toUpperCase(), `${escaparComodines(termino)}%`],
  };
}

export async function buscarPacientes(
  ejecutar: Ejecutor,
  entrada: unknown,
): Promise<ResultadoAccion<PacienteEncontrado[]>> {
  const validada = busquedaPacienteSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);

  const { texto, parametros } = sentenciaBusqueda(validada.data.termino);
  try {
    // Un rol que no es administrativo no recibe filas (RLS): el resultado vacío es el correcto, no un error.
    return exito((await consultar(ejecutar, texto, parametros)) as unknown as PacienteEncontrado[]);
  } catch (error) {
    return traducirError(error, "buscar_paciente");
  }
}

// Registra un paciente sin cuenta de portal. El documento duplicado lo detiene la restricción única de la base de datos (no
// un chequeo previo): dos altas simultáneas del mismo documento dejan una fila y la otra recibe `23505`. El mensaje cuelga
// del campo del documento para que la pantalla lo marque y ofrezca abrir al paciente existente.
export async function registrarPaciente(
  ejecutar: Ejecutor,
  entrada: unknown,
): Promise<ResultadoAccion<{ id: string }>> {
  const validada = pacienteSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);
  const p = validada.data;

  try {
    const filas = await consultar(
      ejecutar,
      `insert into public.pacientes
         (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, telefono, direccion)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id`,
      [p.tipo_documento, p.numero_documento, p.nombres, p.apellidos, p.fecha_nacimiento, p.sexo, p.email, p.telefono ?? null, p.direccion ?? null],
    );
    const id = filas[0]?.id;
    if (typeof id !== "string") return traducirError(new Error("alta sin id"), "registrar_paciente");
    return exito({ id });
  } catch (error) {
    const resultado = traducirError(error, "registrar_paciente");
    if (resultado.codigo === "DOCUMENTO_DUPLICADO") {
      return fallo(resultado.codigo, resultado.mensaje, { numero_documento: resultado.mensaje });
    }
    return resultado;
  }
}
