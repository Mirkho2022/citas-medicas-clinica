# Tasks

## 1. Scaffold e infraestructura base

- [x] 1.1 Crear el proyecto Next.js 15 (App Router) + TypeScript con lint y typecheck
      configurados; verificar con `npm run build` y `npm run lint` sin errores.
- [x] 1.2 Crear el proyecto en Vercel enlazado al repositorio y desplegar el scaffold inicial;
      verificar que la URL de producción responde 200 en `/`.
- [x] 1.3 Crear el proyecto en Neon (sin tablas) para desarrollo, con `DATABASE_URL` configurada
      en local y en Vercel; verificar conectando desde `next dev`.

## 2. Conexión a Neon

- [x] 2.1 Implementar un Route Handler de salud que ejecute `SELECT 1` contra Neon vía
      `@neondatabase/serverless`; verificar que responde 200 en local y en el deployment de
      Vercel.

## 3. Autenticación y roles (Clerk)

- [ ] 3.1 Instalar y configurar `@clerk/nextjs` (middleware, claves de entorno); verificar que
      una cuenta de prueba puede iniciar sesión (spec `autenticacion-roles`, escenario "Inicio de
      sesión exitoso").
- [ ] 3.2 Configurar el JWT template de Clerk para exponer `publicMetadata.rol` en
      `sessionClaims`; verificar leyendo el claim desde un Server Component o Route Handler de
      prueba (escenario "Rol disponible en la sesión").
- [ ] 3.3 Crear las cuatro páginas de destino mínimas (`/administrativo`, `/medico`,
      `/enfermera`, `/paciente`) y la redirección por rol tras el login; verificar contra el
      escenario "Inicio de sesión exitoso" con una cuenta de prueba por rol.
- [ ] 3.4 Bloquear el acceso a las áreas protegidas para usuarios sin sesión con `auth.protect()`
      a nivel de recurso en cada página (no vía middleware/`createRouteMatcher`, deprecado por
      Clerk — ver design.md), más la regla de lint `@clerk/eslint-plugin` que falla si una página
      nueva queda sin protección; verificar contra el escenario "Acceso denegado sin sesión".
- [ ] 3.5 Verificar credenciales inválidas: confirmar que un intento de login con credenciales
      incorrectas no establece sesión (escenario "Credenciales inválidas").
- [ ] 3.6 Exigir MFA a los roles `administrativo`, `medico` y `enfermera` (dirigir a
      configurarlo antes de dar acceso a su área) y confirmar que `paciente` no lo requiere;
      verificar con una cuenta de personal sin MFA configurado y una de paciente (escenarios
      "Personal sin MFA es dirigido a configurarlo" y "Paciente no requiere MFA").

## 4. Registro público con rol forzado a paciente

- [x] 4.1 Implementar la ruta `/registro` de autorregistro, que solo puede producir cuentas de
      paciente; verificar contra el escenario "Registro público asigna rol paciente".
- [x] 4.2 Implementar el webhook `user.created` de Clerk que fija `publicMetadata.rol =
      'paciente'` del lado del servidor tras un alta pública, sin escribir en Postgres (ver
      design.md - Decisions); verificar contra el escenario "Intento de manipular el rol en el
      registro" enviando un rol distinto en el payload de registro y confirmando que la cuenta
      queda con `paciente`.

## 5. Personal por invitación y revocación de acceso

- [ ] 5.1 Implementar el mecanismo de invitación (Server Action o script administrativo) que crea
      cuentas de rol `administrativo`, `medico` o `enfermera` vía la API de invitaciones de
      Clerk; verificar creando una cuenta de prueba de cada rol y confirmando el rol asignado
      (escenario "Invitación crea la cuenta con el rol correcto").
- [ ] 5.2 Confirmar que no existe ninguna ruta de autorregistro capaz de producir esos tres
      roles; verificar contra el escenario "No existe autorregistro de personal" (revisión de
      rutas públicas + intento manual de registro solicitando cada rol).
- [ ] 5.3 Implementar la revocación de acceso (baneo + invalidación de sesión vía la API de
      Clerk); verificar contra los escenarios "Revocación invalida la sesión activa" y "Usuario
      revocado no puede volver a iniciar sesión".

## 6. Pipeline de CI

- [x] 6.1 Configurar el workflow de GitHub Actions para pull requests: typecheck → lint → build;
      verificar que corre en un PR de prueba y falla si se introduce un error de tipos
      deliberado.
- [ ] 6.2 Agregar el paso de branch efímero de Neon por PR con `node-pg-migrate up` (sin
      migraciones todavía) y su destrucción al cerrar el PR; verificar que el branch se crea y se
      destruye correctamente en un PR de prueba.
- [ ] 6.3 Configurar el workflow de merge a `main`: `node-pg-migrate up` contra el branch
      principal de Neon seguido del deploy de producción de Vercel; verificar con un merge de
      prueba.
- [ ] 6.4 Agregar una prueba Playwright mínima del flujo de autenticación y redirección por rol
      (login → aterriza en el área de su rol); verificar que corre en CI contra el preview de
      Vercel de un PR de prueba.
