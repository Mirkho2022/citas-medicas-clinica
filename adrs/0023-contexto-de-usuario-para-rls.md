# ADR 0023: Contexto de usuario para RLS sin helpers de Supabase

## Estado

Aceptado — reemplaza el mecanismo de contexto de
[ADR-0003](0003-control-de-acceso-a-historias-clinicas.md) (la lógica de negocio de esa ADR —
`medico_tiene_paciente()`, las políticas de `atenciones`, la vigencia de
[ADR-0016](0016-vigencia-de-asignacion-paciente-medico.md) — sigue vigente sin cambios; solo cambia
cómo Postgres sabe quién está preguntando).

## Contexto

Todas las políticas RLS del diseño original leen `auth.jwt() ->> 'user_role'` y `auth.uid()` —
funciones que Supabase expone porque su capa PostgREST inyecta el JWT verificado en cada conexión.
Neon es Postgres puro: esas funciones no existen. Con Clerk como proveedor de identidad
([ADR-0022](0022-autenticacion-y-sesion-clerk.md)), hace falta un mecanismo propio para que cada
consulta a Postgres sepa qué usuario (y qué rol) la está haciendo — sin el cual **ninguna** política
RLS del sistema puede evaluarse, empezando por las de `atenciones`.

## Decisión

Variables de sesión de Postgres (`SET LOCAL`), pobladas en cada transacción a partir de la sesión
de Clerk ya verificada en el servidor, y leídas por las políticas RLS con `current_setting()` en
vez de `auth.jwt()`/`auth.uid()`:

```sql
-- Antes (Supabase):
using ((select auth.jwt() ->> 'user_role') = 'medico' and medico_id = (select auth.uid()) ...)

-- Ahora (Neon):
using (
  (select current_setting('app.current_user_role', true)) = 'medico'
  and public.medico_tiene_paciente(paciente_id)
)
```

Todo acceso a datos pasa por un único wrapper, `lib/db/with-user-context.ts` — el cliente crudo del
driver de Neon **no se exporta** desde ningún módulo compartido, así que es estructuralmente
imposible consultar la base de datos sin pasar por él:

```ts
export async function withUserContext<T>(
  callback: (tx: Transaction) => Promise<T>
): Promise<T> {
  const { userId, sessionClaims } = auth(); // Clerk
  return db.transaction(async (tx) => {
    const perfilId = await perfilIdParaUsuarioClerk(tx, userId);
    await tx.execute(sql`select set_config('app.current_user_id', ${perfilId}, true)`);
    await tx.execute(sql`select set_config('app.current_user_role', ${sessionClaims.rol}, true)`);
    return callback(tx);
  });
}
```

`set_config(..., true)` con el tercer argumento `true` (`is_local`) hace que el valor solo viva
dentro de la transacción actual — se descarta automáticamente al terminar, sin riesgo de que un
valor de una conexión reutilizada del pool se filtre a la siguiente consulta.

## Alternativas consideradas

- **`SET LOCAL` manual en cada Server Action, sin wrapper forzado** — mismo mecanismo de fondo, pero
  cada Server Action lo repite por su cuenta. Se descartó porque un desarrollador nuevo puede
  olvidarlo sin que nada lo impida — abriría un hueco de seguridad silencioso, exactamente el tipo
  de bug que RLS existe para prevenir. El wrapper único hace que la omisión sea imposible por
  estructura, no solo improbable por disciplina — mismo principio que ya usa el proyecto (ej. los
  datos demográficos del paciente no editables desde `atenciones` porque las columnas no existen
  ahí, no porque una validación lo impida).
- **Roles nativos de Postgres por tipo de usuario** (`CREATE ROLE administrativo`, `SET ROLE` según
  el usuario autenticado) — usa mecanismos más "nativos" de Postgres para el rol grueso, pero
  `medico_tiene_paciente()` necesita saber **qué médico específico** pregunta, no solo que es un
  médico — así que de todas formas haría falta una variable de sesión con el ID puntual. Se
  descartó porque agrega gestión de roles de Postgres (uno por tipo de usuario, más los permisos
  asociados) sin eliminar la necesidad del mecanismo elegido, solo lo complementa sin beneficio
  claro.

## Consecuencias

- Todas las políticas RLS ya escritas (`atenciones`, `antecedentes`, `citas`,
  `asignaciones_paciente_medico`, `notificaciones`) cambian solo la función que leen
  (`current_setting()` en vez de `auth.jwt()`/`auth.uid()`) — la lógica de negocio de cada política
  no se toca.
- El aislamiento de historias clínicas sigue siendo verdad aunque exista un bug en una Server
  Action, porque la autoridad sigue siendo RLS — el objetivo central de ADR-0003 no cambia, solo el
  mecanismo de transporte del contexto.
- **Trade-off:** a diferencia de Supabase (donde el contexto lo inyecta la capa PostgREST antes de
  que el código de aplicación pueda tocarlo), aquí el propio código de la aplicación es responsable
  de poblar el contexto correctamente en cada transacción. El wrapper único mitiga el riesgo de
  olvido, pero un bug **dentro** del wrapper mismo (ej. leer mal `sessionClaims.rol`) afecta a
  *todas* las consultas del sistema a la vez — este archivo (`lib/db/with-user-context.ts`) es el
  de mayor criticidad de seguridad de todo el proyecto y cualquier cambio sobre él merece revisión
  explícita, no solo un PR normal (mismo nivel de cuidado que ADR-0003 original).
