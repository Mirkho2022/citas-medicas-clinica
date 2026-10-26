"use server";

// Server Actions del registro y la firma de atenciones (specs/registro-de-atencion y firma-y-addendas). Delgadas: `auth.protect()`
// (lo exige la regla de ESLint de Clerk, en el cuerpo de cada acción) y el entorno real; la guarda de rol y MFA, la validación Zod
// del servidor, la consulta con la identidad del usuario y la traducción de errores están en `lib/atencion/`, donde se prueban con
// un entorno inyectado. La autoridad real sobre los datos es la RLS de la base de datos: ninguna acción recibe ids de médico ni de
// perfil (el médico sale de la sesión) y todas se rechazan con `.strict()` si traen claves ajenas.
import { auth } from "@clerk/nextjs/server";
import { entradaDeFormulario } from "@/lib/acciones/entrada";
import {
  casoActualizarBorrador,
  casoAgregarAddenda,
  casoFirmarAtencion,
  casoRegistrarAtencion,
} from "@/lib/atencion/casos-de-uso";
import { entornoAtencion } from "@/lib/atencion/entorno-real";
import type { AddendaGuardada, AtencionGuardada, ResultadoAtencion } from "@/lib/atencion/repositorio";

export async function registrarAtencion(entrada: unknown): Promise<ResultadoAtencion<AtencionGuardada>> {
  await auth.protect();
  return casoRegistrarAtencion(entornoAtencion, entradaDeFormulario(entrada));
}

export async function actualizarBorrador(entrada: unknown): Promise<ResultadoAtencion<AtencionGuardada>> {
  await auth.protect();
  return casoActualizarBorrador(entornoAtencion, entradaDeFormulario(entrada));
}

export async function firmarAtencion(entrada: unknown): Promise<ResultadoAtencion<AtencionGuardada>> {
  await auth.protect();
  return casoFirmarAtencion(entornoAtencion, entradaDeFormulario(entrada));
}

export async function agregarAddenda(entrada: unknown): Promise<ResultadoAtencion<AddendaGuardada>> {
  await auth.protect();
  return casoAgregarAddenda(entornoAtencion, entradaDeFormulario(entrada));
}
