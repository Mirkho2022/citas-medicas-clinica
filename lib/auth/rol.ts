import { auth } from "@clerk/nextjs/server";

export type Rol = "administrativo" | "medico" | "enfermera" | "paciente";

const RUTA_POR_ROL: Record<Rol, string> = {
  administrativo: "/administrativo",
  medico: "/medico",
  enfermera: "/enfermera",
  paciente: "/paciente",
};

export async function obtenerRolSesion(): Promise<Rol | null> {
  const { sessionClaims } = await auth();
  return sessionClaims?.publicMetadata?.rol ?? null;
}

export function rutaParaRol(rol: Rol): string {
  return RUTA_POR_ROL[rol];
}
