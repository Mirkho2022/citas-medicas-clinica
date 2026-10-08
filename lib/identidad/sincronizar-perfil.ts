// Sincronización de usuarios de Clerk con la tabla `perfiles` (H2, design.md D8). La usa el webhook de Clerk con la
// conexión del rol `sync_identidad` (DATABASE_SYNC_URL): un rol que solo puede leer, insertar y actualizar `perfiles`,
// sin acceso a datos clínicos ni de agenda.

export const ROLES = ["administrativo", "medico", "enfermera", "paciente"] as const;
export type RolUsuario = (typeof ROLES)[number];

// El rol viaja en publicMetadata.rol (lo fija el servidor: la invitación de personal o el propio webhook).
export function rolDesdeMetadata(metadata: unknown): RolUsuario | null {
  const rol = (metadata as { rol?: unknown } | null | undefined)?.rol;
  return typeof rol === "string" && (ROLES as readonly string[]).includes(rol)
    ? (rol as RolUsuario)
    : null;
}

// Cualquier ejecutor de plantillas SQL: `neon(url)` en producción y un adaptador sobre `pg` en las pruebas.
export type EjecutarSql = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => PromiseLike<unknown>;

export interface DatosPerfil {
  clerkUserId: string;
  // Rol válido de publicMetadata.rol, o nulo si no lo hay: un perfil nuevo nace `paciente` y uno existente conserva el suyo.
  rol: RolUsuario | null;
  nombres: string | null | undefined;
  apellidos: string | null | undefined;
}

// Idempotente: recibir el mismo evento dos veces deja un solo perfil con los mismos datos. Los nombres son
// NOT NULL en la tabla: si Clerk no los trae se guarda cadena vacía (el registro de Clerk debe exigirlos).
export async function sincronizarPerfil(sql: EjecutarSql, datos: DatosPerfil): Promise<void> {
  const nombres = datos.nombres?.trim() ?? "";
  const apellidos = datos.apellidos?.trim() ?? "";
  await sql`
    insert into public.perfiles (clerk_user_id, rol, nombres, apellidos)
    values (${datos.clerkUserId}, coalesce(${datos.rol}::public.rol_usuario, 'paciente'), ${nombres}, ${apellidos})
    on conflict (clerk_user_id) do update
      set nombres   = excluded.nombres,
          apellidos = excluded.apellidos,
          rol       = coalesce(${datos.rol}::public.rol_usuario, public.perfiles.rol)
  `;
}
