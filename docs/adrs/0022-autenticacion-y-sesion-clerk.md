# ADR 0022: Autenticación y sesión: Clerk

## Estado

Aceptado — reemplaza las decisiones originales de autenticación (Supabase Auth) y de sesión
(`@supabase/ssr`) — ver `git log`, esos ADR ya no se mantienen como activos — a partir de un cambio
de stack decidido por el cliente.

## Contexto

Neon no trae autenticación integrada. El PRD exige, sin excepción: MFA obligatorio para todo rol
que no sea paciente, cuentas de personal creadas **solo por invitación** (nunca autorregistro), y
un rol de aplicación por usuario disponible para las políticas RLS
([ADR-0003](0003-control-de-acceso-a-historias-clinicas.md)). Con equipo reducido y 4-5 meses de
plazo — el mismo argumento que originalmente llevó a elegir Supabase en vez de construir Auth a
mano — hace falta decidir si se construye MFA/invitaciones desde cero o se adopta un proveedor que
ya lo resuelva.

## Decisión

**Clerk** como proveedor de autenticación y sesión (`@clerk/nextjs`).

- El rol de aplicación (`administrativo`, `medico`, `enfermera`, `paciente`) se guarda en
  `publicMetadata.rol` del usuario de Clerk y se expone en `sessionClaims` mediante un JWT template
  de Clerk configurado para incluirlo — es el equivalente funcional del *custom access token hook*
  de Supabase que ya no aplica.
- El registro público (`/registro`) solo puede producir `rol = 'paciente'`: un webhook de Clerk
  (`user.created`) fija ese valor server-side inmediatamente después del alta. Ninguna ruta de
  autorregistro puede escribir `publicMetadata.rol`; solo lo hace ese webhook y las Server Actions
  de administrativo que invitan personal (vía la API de invitaciones de Clerk).
- Sigue existiendo `perfiles` en Postgres (ya no espejo de `auth.users` de Supabase, ahora
  sincronizada desde Clerk vía los webhooks `user.created`/`user.updated`) — necesaria porque las
  políticas RLS y las llaves foráneas del esquema (`perfil_id` en `pacientes`/`medicos`/
  `enfermeras`) operan sobre IDs de Postgres, y para poder hacer *joins* SQL normales sin llamar a
  la API de Clerk en cada consulta.
- Sesión: cookies gestionadas por el middleware de `@clerk/nextjs`. Cada grupo de rutas sigue
  verificando el rol en servidor para redirigir (usabilidad, no seguridad — la autoridad real sigue
  siendo RLS, sin cambios respecto al principio del diseño original).
- Revocar acceso de un usuario (ej. un médico que deja la clínica): se usa la API de Clerk para
  banear/cerrar sesión (`clerkClient.users.banUser` + invalidar sesiones activas), reemplazando
  `auth.admin.signOut` de Supabase.

## Alternativas consideradas

- **Better-Auth** — autoalojado, sin costo recurrente ni proveedor externo de identidad, con plugin
  oficial de TOTP. Se descartó porque exige construir y mantener el flujo completo de invitación de
  personal y la integración de TOTP con más código propio, más superficie a mantener con equipo
  reducido, y es un proyecto más joven con menos casos de uso a gran escala en producción.
- **Auth.js (NextAuth v5)** — el más probado en producción y gratuito, con soporte de referencia
  para Next.js App Router. Se descartó porque no trae MFA/TOTP de fábrica — implementarlo a mano
  sobre su Credentials Provider es exactamente el trabajo que se busca evitar dado el requisito
  obligatorio de MFA para personal.
- **Neon Auth (Stack Auth)** — integración oficial de Neon, un solo proveedor para base de datos e
  identidad. Se descartó por ser la opción más nueva de las cuatro, con menor comunidad y sin
  madurez de MFA verificada a fondo para un requisito no negociable del PRD.

## Consecuencias

- MFA/TOTP para personal, invitaciones y gestión de sesión llegan resueltos sin construirlos desde
  cero — mismo beneficio que dio elegir Supabase originalmente, ahora aplicado solo a la pieza de
  identidad.
- El flujo de "el registro público solo produce rol paciente" se cumple por estructura (un webhook
  server-side, no un valor que el cliente pueda enviar), igual de robusto que el trigger
  `bloquear_cambio_de_rol` del diseño original.
- **Trade-off:** Clerk es un proveedor externo con costo recurrente por usuario activo, y los datos
  de identidad (nombre, email, teléfono — no historias clínicas) quedan alojados fuera de Perú por
  defecto. No es el mismo riesgo que P-1 (que es específicamente sobre datos clínicos), pero es un
  dato personal de pacientes peruanos alojado en un proveedor adicional a evaluar si en algún
  momento se exige residencia de datos más amplia que solo lo clínico.

## Nota de implementación (2026-10-25, H4 — para revisión humana)

El token de sesión de Clerk lleva ahora un segundo claim, `email` (plantilla de sesión: `"email": "{{user.primary_email_address}}"`, además de
`publicMetadata`). Neon lo valida con el resto del JWT y `public.correo_actual()` lo lee en minúsculas; es lo que permite que
`registrar_paciente_portal()` vincule una cuenta con una ficha existente solo si el **correo verificado** coincide ([ADR-0037](0037-verificacion-al-vincular-una-ficha-de-paciente.md)).
Sin el claim la función rechaza (`PA004`). Se exige correo verificado con código y nombre y apellido en el alta (docs/pasos-manuales-h4.md, pasos 1 y 2).
Comprobado de extremo a extremo por `e2e/db.spec.ts`, que lee `correo_actual()` por el token de cada paciente. No cambia la decisión de usar Clerk.

