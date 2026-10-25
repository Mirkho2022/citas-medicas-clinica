# Arquitectura y contexto de usuario para RLS

Cómo llega la identidad del usuario hasta Postgres. Es la pieza central de seguridad del sistema: la aplicación **no** decide quién ve qué
fila, lo decide la base de datos. Decisiones: [ADR-0020](../03-arquitectura/adrs/0020-arquitectura-de-componentes-y-hosting-vercel.md),
[ADR-0022](../03-arquitectura/adrs/0022-autenticacion-y-sesion-clerk.md) y [ADR-0023](../03-arquitectura/adrs/0023-contexto-de-usuario-para-rls.md).
Código: [`lib/db/cliente-autenticado.ts`](../../lib/db/cliente-autenticado.ts) y [`app/api/webhooks/clerk/route.ts`](../../app/api/webhooks/clerk/route.ts).

## Componentes

```mermaid
flowchart LR
    U[Usuario<br/>paciente · administrativo · médico · enfermera] -->|HTTPS| V[Next.js 15 en Vercel<br/>Server Components y Server Actions]
    U -->|sesión| C[Clerk<br/>autenticación, MFA, rol en publicMetadata]
    C -->|webhook user.created / user.updated<br/>firma Svix| V
    V -->|rol sync_identidad<br/>solo escribe perfiles| N[(Neon Postgres)]
    V -->|HTTP + JWT de Clerk<br/>rol authenticator| N
    V --> R[Upstash Redis<br/>límite de peticiones]
    V --> B[Vercel BotID<br/>anti-bots]
    G[GitHub Actions<br/>migraciones y pruebas] -->|rol dueño, solo CI| N
```

## Una consulta autenticada, de punta a punta

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant V as Next.js (Server Action o página)
    participant C as Clerk
    participant N as Neon (pg_session_jwt)
    participant P as Postgres + RLS

    U->>V: petición con la cookie de sesión
    V->>C: auth() y getToken()
    C-->>V: JWT firmado (sub, rol, email)
    V->>N: transacción HTTP con authToken, rol authenticator
    N->>N: valida el JWT contra la JWKS de Clerk
    N->>P: set local role authenticated (primera sentencia)
    P->>P: las políticas RLS usan auth.user_id(), rol_actual() y paciente_actual()
    P-->>V: solo las filas que ese usuario puede ver
    V-->>U: respuesta
```

## Por qué es seguro

- `authenticator` no tiene privilegios sobre ninguna tabla: si una consulta olvidara `set local role authenticated`, falla cerrada.
- Solo HTTP, una sesión por petición: ninguna conexión reutilizada puede conservar la identidad de otro usuario.
- El rol sale de `publicMetadata` (el usuario no puede escribirlo); el correo, del claim que valida Neon, nunca de un parámetro.
- Cada tabla del esquema `public` tiene RLS activada y su prueba negativa en pgTAP (`tests/pgtap/99_rls_en_todas_las_tablas.test.sql`).
