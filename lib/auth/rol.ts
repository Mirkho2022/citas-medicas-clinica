import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { rutaParaRol, type Rol } from "./rutas.ts";

export { rutaParaRol, type Rol };

export async function obtenerRolSesion(): Promise<Rol | null> {
  const { sessionClaims } = await auth();
  return sessionClaims?.publicMetadata?.rol ?? null;
}

// Autorización por rol a nivel de página. `auth.protect()` solo prueba que hay
// sesión; esta función comprueba que la sesión sea del rol de la página. Un rol
// distinto va a su propia área; sin rol todavía (el webhook de alta no terminó) va
// a la raíz, que no redirige sin rol, así que no hay bucle.
export async function exigirRol(rolRequerido: Rol): Promise<void> {
  const rol = await obtenerRolSesion();
  if (rol !== rolRequerido) {
    redirect(rol ? rutaParaRol(rol) : "/");
  }
}
