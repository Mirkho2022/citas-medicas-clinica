# ADR 0003: Modelo de control de acceso a historias clínicas (RLS + rol en JWT)

## Estado

Aceptado — es la decisión que más directamente responde al riesgo principal del proyecto;
cualquier cambio futuro sobre ella merece revisión explícita, no solo un PR normal.

## Contexto

El PRD prohíbe que un médico acceda a historias de pacientes que no tiene a cargo, y prohíbe por
completo el acceso del administrativo y del paciente al contenido clínico. [CLAUDE.md](../../CLAUDE.md)
exige que ese aislamiento se aplique **en la base de datos**, no solo en la capa de aplicación.
Hace falta definir cómo la base de datos sabe, fila por fila, qué médico tiene a cargo a qué
paciente, sin pagar el costo de una subconsulta a `perfiles` en cada fila evaluada.

## Decisión

- El rol de cada usuario se inyecta en el JWT mediante un *custom access token hook* de Supabase
  Auth (`custom_access_token_hook`), leído como `auth.jwt() ->> 'user_role'` en cada política RLS.
- "Paciente a cargo" de un médico se resuelve con la función `security definer`
  `medico_tiene_paciente(paciente_id)`, que es verdadera si existe una asignación vigente en
  `asignaciones_paciente_medico` **o** una cita confirmada/atendida entre ese médico y ese
  paciente.
- RLS se activa en todas las tablas de `public`, sin excepción; el administrativo y el paciente no
  tienen ninguna política de `select` sobre `atenciones`.
- Un trigger (`bloquear_cambio_de_rol`) impide que cualquier rol distinto de administrativo
  modifique la columna `rol` de `perfiles`, cerrando la vía de escalada de privilegios que RLS por
  sí solo no cubre (RLS no tiene granularidad por columna).
- Toda lectura de una historia clínica se registra en `accesos_historia` desde la Server Action que
  la abre, para poder auditar un incidente después de ocurrido.
- Las cuentas de personal no se auto-registran: las crea un administrativo por invitación: el
  registro público solo puede producir rol `paciente`.

## Consecuencias

- El aislamiento por médico a cargo se cumple aunque exista un bug en la capa de aplicación,
  porque la autoridad real es la política RLS, no un `if` en una Server Action.
- Queda un rastro auditable de quién leyó qué historia y cuándo, lo que hace verificable la
  afirmación "un médico no accede a historias que no tiene a cargo" tras un incidente.
- **Trade-off:** un cambio de rol de un usuario no surte efecto hasta que su token se refresca; si
  se degrada o desactiva a alguien (por ejemplo, un médico que deja la clínica), hay que revocar
  sus sesiones activas explícitamente (`auth.admin.signOut`) — actualizar solo la fila en
  `perfiles` no basta y deja una ventana de acceso indebido si se omite ese paso.

**Nota (2026-09-23):** la definición de "paciente a cargo" de `medico_tiene_paciente()` descrita
arriba incluía una rama directa sobre `citas` sin expiración, que otorgaba acceso permanente a
partir de una sola cita confirmada/atendida. Se corrigió en
[ADR-0016](0016-vigencia-de-asignacion-paciente-medico.md): la función ya no tiene esa rama;
depende únicamente de `asignaciones_paciente_medico`, que ahora vence a los 6 meses salvo
asignación manual explícita.

**Nota (2026-09-28):** el mecanismo de contexto (`auth.jwt()`/`auth.uid()` de Supabase) que las
políticas RLS de esta ADR usan para leer el rol y el usuario actual ya no aplica tras el cambio de
base de datos a Neon — reemplazado en [ADR-0023](0023-contexto-de-usuario-para-rls.md). La lógica
de negocio de esta ADR (aislamiento por médico a cargo, auditoría de lecturas, bloqueo de escalada
de rol) sigue vigente sin cambios; solo cambia cómo Postgres recibe esa información en cada
consulta.
