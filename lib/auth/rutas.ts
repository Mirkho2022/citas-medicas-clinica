// Roles de la aplicación y el área a la que lleva cada uno. Sin dependencias de Clerk ni de Next: lo importan también las guardas
// que se prueban con dependencias inyectadas (`accion-paciente.ts`). `rol.ts` lo reexporta para el resto de la aplicación.
export type Rol = "administrativo" | "medico" | "enfermera" | "paciente";

const RUTA_POR_ROL: Record<Rol, string> = {
  administrativo: "/administrativo",
  medico: "/medico",
  enfermera: "/enfermera",
  paciente: "/paciente",
};

// Pantalla donde el paciente recién registrado completa sus datos (y espera a que su cuenta tenga rol).
export const RUTA_COMPLETAR_REGISTRO = "/completar-registro";

export function rutaParaRol(rol: Rol): string {
  return RUTA_POR_ROL[rol];
}
