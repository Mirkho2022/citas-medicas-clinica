import type { Rol } from "./rol.ts";

// Qué roles del personal deben tener segundo factor (MFA). Por defecto, todos. `MFA_ROLES_EXIGIDOS` (lista separada por comas,
// por ejemplo «medico») permite relajarlo en una demostración para el administrativo y la enfermera. El médico NUNCA se relaja:
// es quien lee y firma historias clínicas, el riesgo principal del proyecto, así que ningún valor del entorno lo quita.
const ROLES_PERSONAL: readonly Rol[] = ["administrativo", "medico", "enfermera"];

export function mfaExigidoPara(rol: Rol, valor: string | undefined = process.env.MFA_ROLES_EXIGIDOS): boolean {
  if (rol === "medico") return true;
  if (!valor?.trim()) return ROLES_PERSONAL.includes(rol);
  const lista = valor.split(",").map((r) => r.trim());
  return lista.includes(rol);
}
