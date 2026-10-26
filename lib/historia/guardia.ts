import { redirect } from "next/navigation";
import { tieneMfaActivo } from "../auth/mfa.ts";
import { exigirRol } from "../auth/rol.ts";
import { exigirMedicoConMfa } from "./guardia-base.ts";

// Guardia de TODA página o ruta que sirva contenido clínico del médico: rol de médico y MFA activo, comprobados en el propio
// recurso (no en un filtro previo). Es defensa en profundidad y usabilidad; la autoridad sobre los datos es la RLS. Cada
// página la llama justo después de `await auth.protect()`.
export async function exigirPaginaMedico(): Promise<void> {
  await exigirMedicoConMfa({ exigirRol, tieneMfaActivo, redirigir: redirect });
}
