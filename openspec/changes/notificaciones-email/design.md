# Design

## Context

Motivación y alcance en [proposal.md](proposal.md); requisitos en `specs/`. Estado de partida, verificado en el repositorio
y en los documentos:

- **Esquema (H2, aplicado):** `notificaciones` (`cita_id`, `tipo`, `canal`, `destinatario`, `programada_para`, `estado`
  `pendiente|enviada|fallida`, `intentos`, `enviada_en`, `proveedor_id`, `error`, `unique (cita_id, tipo)`, índice parcial
  sobre pendientes y fallidas) con RLS: el administrativo lee; `authenticated` **no** tiene `INSERT` ni `UPDATE`; el rol
  `cron_notificaciones` (`NOLOGIN` hasta fijar contraseña por entorno) tiene `select, insert, update` sobre `notificaciones`
  y `select` sobre `citas`, con políticas propias, y `42501` en todo lo demás (prueba `51_notificaciones.test.sql`).
- **Lo que dicen los documentos:** TECH-DESIGN, «Notificaciones»: la Server Action inserta el recordatorio al crear la cita;
  el cron diario (ADR-0028, `0 13 * * *`) lo envía; la confirmación y la cancelación se envían síncronas en la acción y
  se registran ya resueltas (ADR-0017); reintento con tope de 3 (ADR-0008); vista de fallidas del administrativo (ADR-0018);
  plantillas sin contenido clínico; dominio con SPF, DKIM y DMARC. `lib/notificaciones/proveedor.ts` como interfaz.
- **H3 (`agenda-y-reserva`, en propuesta):** único punto de inserción de citas en funciones de base de datos
  (`reservar_cita()`, `reprogramar_cita()`, `reasignar_cita_por_baja()`), resultado tipado de las acciones y un punto de
  extensión **sin efecto** `lib/notificaciones/eventos-cita.ts` que H5 conecta. H4 (`portal-del-paciente`) y H7
  (`turnos-y-dashboard`, que enlaza a la vista de fallidas) se escriben en paralelo.
- **Código existente relevante:** `app/api/webhooks/clerk/route.ts` (patrón de Route Handler público con
  `eslint-disable` justificado y conexión de rol de servicio propia), `lib/identidad/sincronizar-perfil.ts` (tipo
  `EjecutarSql` para probar con `pg`), `lib/db/cliente-autenticado.ts` (`transaccionAutenticada`),
  `tests/integracion/` y `tests/concurrencia/` (patrones de prueba con rol real), `scripts/sembrar-datos-demo.ts` (correos
  `@demo.invalid`, no desactiva disparadores).
- **Hosting:** Vercel Hobby. Un cron al día, con precisión horaria (puede correr entre las 08:00 y las 08:59 de Lima), que
  solo se ejecuta contra el despliegue de producción y que envía `Authorization: Bearer $CRON_SECRET` si esa variable
  existe. Vercel no reintenta una invocación fallida y puede entregar un evento más de una vez (a verificar en la
  documentación vigente al implementar, tarea 7.4).

Los tres huecos que motivan el diseño (la regla de hora, la falta de un camino de escritura y la imposibilidad del cron de
armar el correo) están en el *Why* del proposal. Cada uno se resuelve en D1, D2 y D3.

## Goals / Non-Goals

**Goals:**
- Que un paciente reciba el recordatorio la mañana del día anterior, de forma verificable con pruebas, y nunca uno de una cita
  que ya no vale.
- Cero correos duplicados, incluso con ejecuciones simultáneas, sin transacciones abiertas durante la llamada a Resend (el
  driver HTTP de Neon no las permite).
- Que el rol del cron no gane ningún privilegio: el alcance de H2 queda intacto y se prueba.
- Que ningún correo, copia guardada ni registro lleve datos clínicos ni más datos personales de los necesarios.
- Que se pueda probar todo sin enviar un correo real, y que la entregabilidad real tenga un procedimiento manual explícito.

**Non-Goals:**
- Otros canales (WhatsApp, SMS), correos al médico o a la enfermera, reenvío manual desde la interfaz, analítica de apertura
  o de clics, plantillas editables por la clínica, preferencias de notificación del paciente.
- Cambiar la frecuencia del cron o el plan de Vercel (ADR-0028) ni reabrir el envío síncrono de ADR-0017.
- El flujo de reasignación por baja y las pantallas de agenda (H3), el portal (H4) y el dashboard (H7): H5 solo les entrega
  el aviso y la vista de detalle de fallidas.

## Decisions

### D1. `programada_para` es las 08:00 de Lima del día calendario anterior

Con la regla escrita (`inicio - 1 día`) y el cron diario de las 08:00, una cita de mañana a las 15:00 tiene `programada_para`
hoy a las 15:00. El cron de hoy a las 08:00 aún no la ve (`15:00 > 08:00`) y el de mañana a las 08:00 la envía **siete horas
antes de la cita, el mismo día**. Pasa con toda cita posterior a las 08:00, es decir, con casi todas, y una de las 08:30 se
recordaría media hora antes. Antes de ADR-0028 (cron horario) el desfase era de una hora; al pasar a un cron diario nadie
recalculó la regla.

Se fija `programada_para = (fecha de Lima de la cita - 1 día) a las 08:00 de Lima`:

```sql
(((c.inicio at time zone 'America/Lima')::date - 1) + time '08:00') at time zone 'America/Lima'
```

La fecha se toma **en Lima** (una cita del 01/03 a las 23:30 de Lima ya es 02/03 en UTC), Lima no tiene horario de verano
(UTC−5 fijo) y la hora 08:00 es la del cron: un test comprueba que `vercel.json` programa las 13:00 UTC y que la constante
coincide. Como Hobby puede correr el cron hasta ~59 min tarde, nunca corre antes de las 08:00, así que `programada_para <=
now()` es verdadero en la ejecución buscada. El adelanto resultante es de 23 a 34 horas según la hora de la cita; es
«el día anterior», que es lo que pide el PRD.

*Alternativas:* (a) **mantener `inicio - 1 día`**: es la letra de TECH-DESIGN y el criterio de aceptación, pero incumple la
intención y se demostró arriba. (b) **El cron elige `programada_para <= now() + 1 día`**: adelanta entre 24 y 48 h de forma
irregular (una cita del pasado mañana a las 07:00 se recordaría dos días antes). (c) **Volver al cron horario**: reabre
ADR-0028 y exige plan de pago. (d) **No guardar la hora y elegir por «citas cuyo día en Lima es mañana»**: equivale a la
elegida pero sin fila programada al reservar, lo que contradice el criterio «al crear una cita se crea una fila».

*Consecuencia documental:* cambian el criterio de aceptación de TECH-DESIGN («`programada_para = inicio - 1 día`») y el
texto de ADR-0017; se propone con ADR-0029 y notas fechadas (tarea 10.3), no se editan en silencio. Es la pregunta abierta 1.

### D2. Quién escribe `notificaciones`: un disparador y una función acotada, sin permisos nuevos de escritura

TECH-DESIGN dice que la Server Action inserta el recordatorio y registra confirmaciones y cancelaciones. Pero `authenticated`
no tiene `INSERT` (la prueba de H2 afirma que ni el administrativo puede) y el rol del cron no puede usarse en tráfico de
usuario (ADR-0020). Hace falta un camino acotado. Se eligen **dos**, uno por cada naturaleza de fila:

1. **Recordatorio → disparador `AFTER INSERT` sobre `citas`** (`SECURITY DEFINER`, `search_path` vacío). Corre en la misma
   transacción que la cita: si la cita falla por doble reserva, no queda fila; si se crea, la fila existe. Ninguna ruta de
   código (reserva del paciente, agendado del administrativo, `reasignar_cita_por_baja()`, importación de H8, siembra de
   demostración) puede olvidarlo. Llama a `programar_recordatorio_de_cita(uuid)` (interna, sin `EXECUTE` para nadie salvo
   el dueño y los disparadores), que es idempotente (`on conflict (cita_id, tipo) do nothing`), también se usa para
   rellenar las citas futuras que existan al migrar, y descarta citas no vigentes o pasadas.
2. **Confirmación, cancelación y reprogramación → `registrar_aviso_transaccional(...)`**, función `SECURITY DEFINER` que
   `authenticated` puede ejecutar, la llama la Server Action *después* de intentar el envío (ADR-0017). Por dentro:
   comprueba el rol (`administrativo`, o `paciente` dueño de la cita), restringe el `tipo` a los tres transaccionales y a
   la coherencia con el estado de la cita, toma el **destinatario de `pacientes.email`** (no de un parámetro), arma la copia
   del contenido, resuelve el estado (`enviada` o `fallida`), fija `intentos` (1, o 3 si el error es permanente) y hace
   `on conflict do nothing`. El llamador no puede inventar un `estado`, un `proveedor_id` arbitrario como «recordatorio
   enviado» ni suprimir el recordatorio de otra cita.

*Alternativas:* (a) **conceder `INSERT` a `authenticated` con una política**: el llamador fijaría `estado='enviada'` en un
`recordatorio_24h` y suprimiría el aviso real (la idempotencia lo trataría como ya enviado). (b) **Que la Server Action use el
rol del cron**: viola la regla no negociable de ADR-0020/CLAUDE.md. (c) **Una función para el recordatorio que cada acción
llame**: cada ruta de creación de citas (H3, H4, reasignación, H8) tendría que acordarse; un olvido es un recordatorio
perdido sin error. (d) **Que el cron cree las filas al barrer las citas de mañana**: necesita leer `pacientes` (el correo) y
amplía el rol del cron. (e) **Insertar también la confirmación por disparador y que la acción la actualice**: obligaría a
filas `pendiente` de confirmación que ADR-0017 prohíbe expresamente, y que se quedarían colgadas si la acción muere.

*Superficie de seguridad nueva* (por eso merece revisión aparte): el disparador y dos funciones leen `pacientes`, `medicos`,
`perfiles` y `especialidades` con privilegios del dueño; la función pública escribe `notificaciones`. Mitigaciones: `search_path`
vacío, `revoke execute ... from public` y concesión explícita, ninguna lectura de `atenciones`/`antecedentes`/`addendas`/
`historias_clinicas`/`asignaciones_paciente_medico`/`citas.motivo`, y pruebas pgTAP positivas y negativas por rol
(tareas 3.2, 3.3 y 4.2). Es la pregunta de ADR-0029.

### D3. Cada aviso guarda una copia mínima del contenido

El cron no lee `pacientes`, `perfiles`, `medicos` ni `especialidades`, y no debe empezar a hacerlo: las pruebas de H2 y
ADR-0020 afirman que no puede. Para que pueda armar el correo, `notificaciones` gana `contenido jsonb`, escrito por
`armar_contenido_aviso(cita)` (interna) en el momento de programar o registrar el aviso:

```json
{ "version": 1,
  "paciente": { "nombres": "María" },
  "cita": { "inicio": "2032-03-01T14:00:00Z", "fin": "2032-03-01T14:20:00Z",
            "medico_id": "…", "medico": "Ana Pérez", "especialidad": "Cardiología" },
  "nueva_cita": { "inicio": "…", "medico": "…", "especialidad": "…" } }   // solo en reprogramacion
```

Solo esos campos. **No** hay `citas.motivo` (texto libre del paciente que puede contener síntomas), documento, teléfono,
dirección, fecha de nacimiento ni sexo. Un esquema Zod `.strict()` (`lib/notificaciones/contenido.ts`) valida la copia al
leerla en el cron y en las plantillas, y una prueba pgTAP comprueba que el conjunto de claves producido por la base es
exactamente el permitido, con un `motivo` centinela que no puede aparecer. Solo el administrativo puede leerla (RLS de
`notificaciones`).

El nombre del médico y los horarios quedan fijados al momento de programar. Si el médico cambia de nombre, el correo lleva el
nombre de la reserva (desfase aceptado). Si cambian el `inicio` o el `medico_id` de la cita sin pasar por reprogramar, el
aviso **no se envía con datos viejos**: se omite (D6).

*Alternativas:* (a) **`GRANT select` del cron sobre `pacientes`/`medicos`/`perfiles`/`especialidades`**: amplía el rol más
sensible y contradice ADR-0020 y H2. (b) **Una función `SECURITY DEFINER` que el cron ejecute para leer datos vivos**: evita
la copia, pero entrega a quien tenga la credencial del cron el nombre y la especialidad de cualquier cita, no solo de los
avisos programados; la copia acota el alcance a lo ya programado. (c) **Una vista con `security_invoker`**: igual que (a).

### D4. Tipo nuevo `reprogramacion` y un solo correo

H2 dejó abierta la pregunta (ADR-0011 manda avisar la reprogramación; el `CHECK` solo admite tres tipos). Se reemplaza el
`CHECK` de `tipo` por cuatro valores (`recordatorio_24h`, `confirmacion_reserva`, `cancelacion`, `reprogramacion`) en una
migración nueva. Una reprogramación o reasignación por baja son **una cancelación más una cita nueva**; mandar los dos
correos que les corresponden por separado (el de cancelación y la confirmación de la cita nueva) confunde al paciente, y
más cuando la baja del médico es una mala noticia. Entonces: una fila `reprogramacion` sobre la cita **original**
(`unique (cita_id, tipo)`), con `nueva_cita` en la copia, y **sin** `confirmacion_reserva` para la cita nueva; la nueva solo
conserva su recordatorio (lo programa el disparador). Si la baja no tiene sustituto, la cita queda para contacto manual y no
hay correo automático (H3, ADR-0011 paso 6).

La función de registro acepta la cita nueva como parámetro y comprueba la relación `reprogramada_de` **en cualquiera de las
dos direcciones**, porque H3 todavía está fijando en qué fila apunta (su propuesta anota una nota en ADR-0011 sobre eso).

*Alternativa:* reutilizar `cancelacion` con una variante de plantilla. Funciona, pero el administrativo no distinguiría en la
vista de fallidas qué tipo de aviso no llegó, y se pierde la lectura directa del tipo en consultas. Se descarta por poco
ahorro (un `ALTER` de `CHECK`).

### D5. Reservar cada fila antes de enviarla; la idempotencia es de envío, no solo de fila

`unique (cita_id, tipo)` impide dos **filas**, no dos **envíos** de la misma fila: dos ejecuciones simultáneas leerían la misma
pendiente y la enviarían ambas. El driver HTTP de Neon no mantiene transacciones abiertas durante una llamada externa y las
sesiones no persisten (no sirven los `advisory locks`), así que la reserva es una sola sentencia atómica que **cuenta el
intento antes de enviar**:

```sql
with candidatas as (
  select n.id
  from public.notificaciones n
  join public.citas c on c.id = n.cita_id
  where n.estado in ('pendiente','fallida')
    and n.intentos < 3
    and n.programada_para <= now()
    and (n.ultimo_intento_en is null or n.ultimo_intento_en <= now() - interval '2 hours')
    and public.motivo_de_omision(n.tipo, n.contenido, c) is null      -- D6: solo vigentes
  order by n.programada_para, n.id
  limit 100
  for update of n skip locked
)
update public.notificaciones n
   set intentos = n.intentos + 1, ultimo_intento_en = now()
  from candidatas
 where n.id = candidatas.id
returning n.id, n.cita_id, n.tipo, n.destinatario, n.contenido, n.intentos;
```

Después, por cada fila: éxito → `estado='enviada'`, `enviada_en`, `proveedor_id`, `error=null`; fallo → `estado='fallida'`, `error`
(recortado), y `intentos=3` si el error es permanente. `ultimo_intento_en` es una columna nueva (única de `notificaciones` que
la tabla de H2 no tenía): hace de arrendamiento (una segunda ejecución no toma lo reservado hace menos de 2 h) y de espera
mínima entre reintentos (D7). Si la ejecución muere tras reservar, la fila queda `pendiente`/`fallida` con un intento
consumido y se retoma más tarde; una sentencia final cierra como `fallida` («sin resultado registrado») las `pendiente` con 3
intentos, para que no queden invisibles. Se procesa en páginas de 100 hasta un tope de 500 por ejecución.

Segunda defensa: **clave de idempotencia de Resend** `"{tipo}:{cita_id}"` en cada envío. Cubre el caso que la base no ve:
Resend aceptó el correo, pero la ejecución murió antes de registrar el resultado. Su ventana es limitada (24 h según la
documentación al momento de escribir esto; verificar en 5.2); pasada la ventana, un reintento podría duplicar. Riesgo
residual aceptado y documentado.

*Alternativas:* (a) **estado `enviando`** (`alter type`): más estados que limpiar y una prueba de enum de H2 que tocar, sin
ganar nada frente al arrendamiento. (b) **`advisory locks`**: no sobreviven entre peticiones HTTP. (c) **Una transacción larga
con `FOR UPDATE`**: el driver HTTP no la permite. (d) **Confiar solo en la clave de Resend**: es la segunda defensa, no la
primera; no deja huella en la base.

### D6. Vigencia por tipo de aviso: una sola función de decisión

Qué hace falta para que un aviso aún tenga sentido se decide en **un solo lugar**, `motivo_de_omision(tipo, contenido, cita)`
(`stable`, `SECURITY INVOKER`, no lee tablas: solo mira los datos que recibe; `execute` solo para `cron_notificaciones`).
Devuelve `null` si el aviso vale, o el motivo:

| Tipo | Vale si… | Motivo si no |
|---|---|---|
| `recordatorio_24h`, `confirmacion_reserva` | cita `reservada`/`confirmada` **e** `inicio > now()` **y** `inicio`/`medico_id` iguales a los de la copia | `cita ya ocurrida` · `cita cancelada` · `cita modificada` |
| `cancelacion`, `reprogramacion` | cita `cancelada` **e** `inicio > now()` | `cita ya ocurrida` · `cita no cancelada` |
| cualquiera | `contenido` presente | `sin contenido del aviso` |

El cron la usa dos veces: para **omitir** las pendientes vencidas que no valen (`estado='fallida'`, `error='<motivo>, aviso
omitido'`, sin llamar a Resend y sin consumir intentos) y para **reservar** solo las que valen. Es la guarda de ADR-0017
ampliada con el estado de la cita y la comparación con la copia: ADR-0017 solo miraba `inicio > now()`, lo que enviaría el
recordatorio de una cita cancelada.

Se respeta ADR-0017 al pie de la letra: el omitido queda `fallida` con el motivo en `error`, **con `intentos` por debajo de 3**,
así que no aparece en la vista de ADR-0018 (que exige 3 o más) y no se vuelve a reservar porque la misma función lo descarta
cada vez. Mezclar «omitida» con «fallida» es una impureza heredada; un estado `omitida` sería más limpio (pregunta abierta 8)
pero reabre un detalle de ADR-0017 y obliga a un `alter type`.

### D7. Reintentos: tope, espera y tres clases de error

- **Tope:** 3 intentos en total, el primero incluido (ADR-0008, criterio de aceptación de TECH-DESIGN). Al tercero deja de
  reintentarse y la vista de ADR-0018 lo muestra.
- **Espera mínima:** 2 horas desde `ultimo_intento_en`. Con un cron diario la cadencia efectiva es de un reintento por día
  (ADR-0028); las 2 horas existen para no quemar intentos en una caída corta de Resend si alguien relanza el cron a mano,
  y para no tomar lo reservado por una ejecución simultánea. Lo que falló en la tarde se reintenta a la mañana siguiente.
- **Clases** (en `lib/notificaciones/errores.ts`, aislada del SDK para probarla): *permanente* (400/422 de validación,
  dirección inválida o de dominio reservado `.invalid`/`.test`/`.example`) → `intentos=3` de inmediato, y la dirección
  reservada ni siquiera llama a la API; *transitorio* (429, 5xx, red, tiempo agotado) → consume un intento; *configuración*
  (401/403, dominio no verificado, sin clave, proveedor simulado en producción) → interrumpe la ejecución, devuelve los
  intentos de lo reservado (`intentos = intentos - 1`, `ultimo_intento_en = null`) y el endpoint responde 500. Así,
  corregida la clave, un relanzamiento manual desde el panel de Vercel envía todo ese mismo día. Los códigos exactos se
  verifican contra la documentación vigente de Resend en 5.2.
- **Aviso permanente = visible:** el error de dirección inválida es justo lo que el administrativo debe ver para llamar al
  paciente y corregir el correo (D12).

### D8. Proveedor de correo: interfaz, tres implementaciones, selección que falla cerrada

```ts
// lib/notificaciones/proveedor.ts (ADR-0017)
interface MensajeCorreo { para: string; asunto: string; html: string; texto: string; claveIdempotencia: string }
type ResultadoEnvio =
  | { ok: true; proveedorId: string }
  | { ok: false; clase: "permanente" | "transitorio" | "configuracion"; error: string };
interface ProveedorCorreo { enviar(m: MensajeCorreo): Promise<ResultadoEnvio>;
                            enviarLote(ms: MensajeCorreo[]): Promise<ResultadoEnvio[]> }
```

- **`ProveedorResend`:** `POST /emails` con `Idempotency-Key`, `AbortSignal.timeout` (5 s en acciones, 15 s en el cron),
  `enviarLote` sobre el endpoint de lotes (hasta 100 mensajes, que es el «lote de 100» de TECH-DESIGN y evita el límite de 2
  peticiones por segundo de la cuenta); si un lote falla por validación, reintenta mensaje por mensaje para aislar la
  dirección defectuosa y no hundir a las demás. Sin seguimiento de apertura ni de clics. Remitente de
  `NOTIFICACIONES_REMITENTE`.
- **`ProveedorSimulado`:** guarda los mensajes en memoria (una bandeja inspeccionable por las pruebas) y devuelve
  `proveedorId: "simulado-<uuid>"`. Es determinista y programable (`fallarProximo(clase)`); para E2E donde no se puede
  inyectar, falla según el dominio del destinatario (`@falla.invalid` permanente, `@transitorio.invalid` transitorio) sin
  banderas globales.
- **Selección** (`seleccionar-proveedor.ts`): `NOTIFICACIONES_PROVEEDOR` = `resend` | `simulado`; **por omisión `simulado`**,
  de modo que un preview, una prueba o un desarrollador sin clave jamás envían correo real. `resend` sin `RESEND_API_KEY`
  es un error de configuración. En `VERCEL_ENV=production` el simulado es un error de configuración: el cron se niega a
  correr y la acción registra el aviso como `fallida` por configuración, jamás como `enviada` (un correo fingido y marcado
  como enviado es peor que uno fallido, porque nadie lo ve).

*Alternativa:* `react-email` para las plantillas y el envío. No se necesita para cuatro correos de texto simple; suma
dependencias. Se reevalúa si la clínica pide diseño.

### D9. El endpoint del cron, la credencial y cómo se impide su mal uso

`app/api/cron/notificaciones/route.ts` (`GET`, `dynamic = "force-dynamic"`, `maxDuration` explícito):

1. **Secreto:** compara `Authorization: Bearer …` con `CRON_SECRET` en tiempo constante. Si `CRON_SECRET` no está definida
   → 500 «configuración» sin ejecutar nada (falla cerrado; no se acepta ni una cabecera vacía). Sin secreto correcto → 401 antes
   de abrir ninguna conexión. `eslint-disable-next-line @clerk/next/require-auth-protection` con la justificación «lo llama
   el programador de Vercel, no un usuario con sesión», igual que el webhook de Clerk. El middleware de Clerk no bloquea
   la ruta (no protege por matcher).
2. **Conexión:** `lib/db/cliente-cron.ts` crea `neon(DATABASE_CRON_URL)` (HTTP, URL **directa** del rol
   `cron_notificaciones`, cuya `LOGIN`/contraseña se fija por entorno como el resto de roles de servicio; secreto del
   servidor). Una regla `no-restricted-imports` de ESLint solo permite importarlo desde `app/api/cron/**` y
   `lib/notificaciones/cron/**`, y una prueba `node:test` recorre los imports del repositorio y falla si lo encuentra en
   otro sitio (la regla de lint se puede deshabilitar con un comentario; la prueba no). Esto convierte «nunca en el código que
   sirve tráfico de usuario» (CLAUDE.md) en algo verificable.
3. **Flujo** (`lib/notificaciones/cron/procesar.ts`, núcleo puro con `EjecutarSql`, proveedor y reloj inyectados, como
   `sincronizarPerfil`): comprobar proveedor (D8) → omitir pendientes que no valen (D6) → cerrar agotadas (D5) → mientras
   queden y no se llegue a 500: reservar una página (D5), armar los mensajes con las plantillas a partir de `contenido`,
   `enviarLote`, registrar el resultado de cada uno. Responde con un resumen en JSON sin datos personales (D16).
4. **`vercel.json`** con el único cron `0 13 * * *`. Se ejecuta solo en el despliegue de producción; en previews no corre, y para
   ejercitarlo allí se invoca a mano con el secreto. Hasta fijar `LOGIN` y `DATABASE_CRON_URL` tras migrar, la primera
   ejecución responde 500 visible en los registros de Vercel (la misma ventana que H2 documentó para el webhook).

*Alternativa:* Server Action o ruta con sesión de un usuario técnico. Descartada: mezcla identidad de usuario con un proceso
de servicio y obligaría a darle un rol de aplicación con alcance sobre `notificaciones`.

### D10. Plantillas: funciones TypeScript, sin dependencia, un solo formato de fecha

`lib/notificaciones/plantillas/` exporta una función por tipo (`confirmacion`, `recordatorio`, `cancelacion`,
`reprogramacion`) que recibe la copia `contenido` ya validada y devuelve `{ asunto, html, texto }`; un `base.ts` común pone
el marco, el pie (nombre de la clínica y contacto de la configuración) y escapa todo texto variable. Fechas y horas con los
auxiliares de formato que dejan H2b/H3 (`dd/MM/yyyy`, `HH:mm`, `America/Lima`; no se duplica el formateo). La hora límite de
cancelar es `inicio - 1 hora`, igual que el trigger de ADR-0012. Asuntos neutros (`Su cita del 14/10/2026`,
`Recordatorio de su cita del 14/10/2026`, `Su cita fue cancelada`, `Su cita fue reprogramada`): el asunto se ve en la pantalla
de bloqueo y en buzones compartidos y no lleva médico ni especialidad. Trato de usted (DESIGN.md). Pruebas: texto esperado,
escape, ausencia de cualquier cadena centinela clínica, zonas horarias del proceso (`TZ=UTC`, `TZ=Asia/Tokyo`) y que la
copia producida por la base se acepta como entrada.

El enlace es `{APP_URL}{RUTA_MIS_CITAS}`: ruta fija al portal (`/paciente/citas`, la ruta definitiva de «Mis citas» que fija
`portal-del-paciente` D1; mientras H4 no exista, la constante apunta a `/paciente`; pregunta abierta 3 resuelta), sin identificadores ni tokens. Cancelar exige iniciar sesión; no hay cancelación de un clic desde el correo
(sería un vector de cancelaciones no autorizadas, y la ventana de 1 hora es regla de negocio, no del correo).

### D11. Vista de fallidas: ruta, consulta y paginación

`app/administrativo/notificaciones/page.tsx` (la estructura real del repositorio es `app/administrativo/…`, no el grupo
`(personal)/dashboard/` de TECH-DESIGN; H7 enlaza a esta ruta desde `/administrativo/dashboard`). `auth.protect()` más
`exigirRol("administrativo")`; la consulta pasa por `transaccionAutenticada` (RLS manda). Lista `estado='fallida' and
intentos >= 3`, ordenada por `programada_para` ascendente (más antigua primero, como pide ADR-0018), con el paciente (nombre y
documento), `destinatario`, tipo legible, inicio de la cita en Lima, intentos y `error`. Se **pagina de 25 en 25** con el total
a la vista: ordenar por antigüedad y cortar a N ocultaría las recientes si se acumulan viejas. No hay acciones de reenvío
(ADR-0018) ni de «marcar revisada» (no está en el ADR; pregunta abierta 9: la lista solo crece). La consulta vive en
`lib/notificaciones/consultas.ts` (`listarNotificacionesFallidas`, `contarNotificacionesFallidas`) para que H7 reutilice el
conteo. Se agrega «Notificaciones» a `lib/ui/navegacion.ts` como disponible (o se enlaza desde la portada del administrativo
si la navegación aún no existe). Usa `Alerta`/`Table` de H2b si están; si no, marcado simple.

### D12. Corregir el correo del paciente rehabilita sus avisos

Un `AFTER UPDATE OF email` sobre `pacientes` (`SECURITY DEFINER`) actualiza `destinatario` en las notificaciones `pendiente` y
`fallida` de ese paciente, y para las `fallida` cuya cita es futura pone `intentos=0`, `ultimo_intento_en=null`, `error=null`.
Es el único camino de recuperación que ADR-0018 deja (sin reenvío manual): el administrativo ve «dirección inválida» en la
vista, corrige el correo en la ficha del paciente y el cron lo reenvía solo (D6 decide si todavía vale). Las `enviada` no se
tocan. Sin esto, la causa más común de fallo (un correo mal escrito) dejaría el aviso muerto y el recordatorio de las citas
futuras apuntando a la dirección vieja.

### D13. Supuestos sobre H3 y H4 (contratos que H5 necesita)

Se verifican contra el código real en la tarea 1.1; cualquier diferencia ajusta solo la tarea 6.2.

1. **Citas nuevas siempre nacen `reservada`** (portal, administrativo y reasignación por baja; la reasignación **nunca** hereda
   `confirmada`) y se insertan por el punto único de H3. El disparador de D2 no depende de por dónde: dispara en cualquier
   `INSERT`.
2. **Estados activos:** `reservada` y `confirmada` son equivalentes para avisos. `atendida`, `no_asistio` y `cancelada` no.
3. **Reprogramar y reasignar = cancelar la original y crear la nueva** en una transacción de base de datos, con
   `reprogramada_de` enlazando ambas (dirección no relevante, D4).
4. **Eventos de cita, ya confirmados:** H3 deja `lib/notificaciones/eventos-cita.ts` como punto de extensión sin efecto. H5 lo
   conecta con tres eventos emitidos **después** de confirmar la operación y **fuera** de la transacción:
   `cita_reservada {citaId}`, `cita_cancelada {citaId}` y `cita_reprogramada {citaId (la nueva), citaAnteriorId, motivo}` (este
   último también para la reasignación por baja, con `motivo: 'baja_medica'`). Los nombres y la forma los fija `EventoCita` en
   `agenda-y-reserva` (D10), que es el dueño del contrato; H5 se adapta a ellos. Los emiten las acciones de H3 (administrativo) y de H4 (reserva y cancelación del
   paciente). El manejador **nunca lanza** al llamador ni cambia el resultado tipado de la acción.
5. **H3 no escribe `notificaciones` ni envía correo**, y no usa la credencial del cron.
6. **H4**: la cancelación del paciente es un `UPDATE` de su propia cita con una política que añade H4; H5 solo necesita que
   emita el evento tras confirmar. El enlace de los correos apunta al portal que H4 construye.
7. **`lib/ui/navegacion.ts`** (H2b/H3) admite añadir un destino administrativo «Notificaciones».

### D14. Zona horaria y tiempo

Todo cálculo del negocio vive en SQL con `at time zone 'America/Lima'`; `timestamptz` en columnas; el formato visible usa la
misma zona en TypeScript. Lima no tiene horario de verano, de modo que `08:00` es siempre `13:00 UTC`. Las pruebas cubren: cita a
las 23:30 de Lima (otro día en UTC), cambio de mes y 29/02 bisiesto (2032), proceso en `TZ=UTC` y `TZ=Asia/Tokyo`.

### D15. Estrategia de pruebas sin correo real

| Capa | Qué prueba | Dónde |
|---|---|---|
| pgTAP (positivo y negativo por rol) | columnas y tipos; `programada_para` (Lima, bisiesto, borde de día); disparador y atomicidad; copia mínima (claves exactas, sin `motivo`); `motivo_de_omision` por tabla de casos; función de registro (quién puede, qué tipos, destinatario); corrección de correo; privilegios (`has_function_privilege`, `42501`); el cron no gana nada | `tests/pgtap/70–75_*` |
| Unitarias (`node --test`) | plantillas, contenido, clasificación de errores, selección de proveedor, secreto, `vercel.json`, imports de `cliente-cron` | `tests/notificaciones/` |
| Integración con el rol real | `procesar()` bajo `set local role cron_notificaciones` en una transacción que se revierte, con `ProveedorSimulado`: envío, omisión, reintento, tope, espera mínima, error permanente, error de configuración, dos ejecuciones | `tests/integracion/notificaciones-cron.test.ts` |
| Concurrencia | N ejecuciones simultáneas con `pg` independientes: cada aviso se envía una vez (20 rondas, como la doble reserva) | `tests/concurrencia/30_notificaciones.test.ts` |
| E2E (Playwright, proveedor simulado) | reserva → fila `confirmacion_reserva`; fallo programado no cambia el resultado de la acción; vista de fallidas por rol | `e2e/notificaciones-*.spec.ts` |
| Manual (no automatizable) | dominio verificado, llegada a bandeja en tres buzones, prueba de humo con un destinatario propio, revisión periódica del panel de Resend | `docs/pasos-manuales-h5.md` |

Numeración de archivos reservada para evitar choques con H3 y H7 (que usan otros rangos de `tests/pgtap/` y
`tests/concurrencia/`); se confirma al implementar. Las pruebas de H2 existentes que insertaban a mano el recordatorio
(`51_notificaciones.test.sql`) se adaptan al disparador (tarea 4.3). Cada propiedad se verifica **por mutación** al menos una
vez (debilitar la guarda y ver fallar la prueba), como hizo H2.

### D16. Operación, límites y observabilidad

Sin datos personales en registros ni en la respuesta del endpoint: solo conteos y motivos. El tope de 500 avisos por ejecución
y `maxDuration` evitan agotar la función; si se llega al tope, el resumen lo dice y lo restante se toma en la siguiente
ejecución (un día después: para el recordatorio puede significar «tarde»). No hay panel propio de métricas (analítica de BI
fuera de alcance): el seguimiento operativo es la vista de fallidas, los registros de Vercel y la revisión manual del panel de
Resend (riesgo P-7). El `README` operativo es `docs/pasos-manuales-h5.md`.

## Risks / Trade-offs

- **[Un cron diario, sin reintento de la plataforma: si una ejecución falla entera, los recordatorios de ese día salen tarde
  o no salen]** → los pendientes vencidos se recuperan en la siguiente (si la cita aún es futura); el 500 y el resumen quedan en
  los registros; se puede relanzar a mano desde el panel de Vercel. Aceptado en ADR-0028 para el MVP.
- **[Precisión horaria del cron de Hobby]** → el diseño no depende del minuto (D1); se verifica en la documentación vigente.
- **[El plan gratuito de Resend limita los envíos diarios y mensuales]** → con confirmación, recordatorio y cancelación por
  cita, una clínica mediana puede pasar del límite diario; los excedentes fallan como transitorios y se reintentan al día
  siguiente, que para un recordatorio ya es tarde. Verificar el límite vigente y compararlo con el volumen esperado antes de
  producción (pregunta abierta 4); es la misma clase de riesgo que P-9, no una decisión de este change.
- **[Superficie `SECURITY DEFINER` nueva que lee datos de personas]** → alcance acotado a nombres, horario, médico y especialidad;
  `search_path` vacío; sin `EXECUTE` para quien no corresponde; pruebas negativas; revisión con el agente `code-review`
  (tarea 10.2). No toca historias clínicas.
- **[Entregar un recordatorio duplicado si la ejecución muere tras enviar y antes de registrar, pasada la ventana de la clave de
  idempotencia]** → arrendamiento de 2 h, clave de Resend, y el reintento diario cae casi siempre dentro de la ventana.
- **[Datos desfasados en la copia (nombre del médico)]** → solo cambia si el médico se renombra entre reserva y envío; se
  omite si cambian el horario o el médico de la cita.
- **[Omitido = `fallida` (ADR-0017)]** → no se cuenta en la revisión (intentos < 3) y la guarda impide reintentarlo; pregunta 8.
- **[La lista de fallidas solo crece]** → paginación; marcar como revisada es una decisión de producto no tomada (pregunta 9).
- **[Demo en producción]** → `scripts/sembrar-datos-demo.ts` crea citas, y el disparador sus recordatorios con `@demo.invalid`; si
  el cron real corriera con esos datos, aparecerían como fallidas permanentes. Sembrar producción ya es una acción explícita
  (`datos-demo.md`); se agrega la advertencia ahí (tarea 10.4).
- **[Cambiar `51_notificaciones.test.sql` de H2]** → solo se ajusta el montaje de la prueba al disparador, sin debilitar ninguna
  aserción; se corre toda la suite antes y después.
- **[Rutas de creación de citas fuera del punto único de H3]** → irrelevante: el disparador cubre cualquier `INSERT`.
- **[Datos personales de identidad viajan a Resend (fuera de Perú)]** → no es dato clínico; se suma a la consulta legal ya
  abierta sobre Clerk (P-1, nota del 28/09); no bloquea H5 pero sí un uso con pacientes reales.

## Migration Plan

1. Rama de trabajo; grupos de tareas con commits locales por grupo (como H2).
2. **Migraciones nuevas, solo hacia adelante** (nada editado), aplicadas en este orden y probadas en el branch `dev`:
   `…_notificaciones-columnas-y-tipo.sql` (columnas `contenido` y `ultimo_intento_en`, nuevo `CHECK`),
   `…_avisos-al-crear-cita.sql` (funciones internas, `motivo_de_omision`, disparadores de cita y de correo, relleno de citas
   futuras existentes) y `…_registro-de-avisos-transaccionales.sql`. No hay tabla nueva: la RLS de `notificaciones` no cambia y
   `99_rls_en_todas_las_tablas` sigue verde.
3. PR: `neon-branch-pr.yml` crea el branch efímero, migra y corre pgTAP, concurrencia e integración (se añaden los archivos
   nuevos a esos pasos, sin pasos nuevos); `ci.yml` suma `test:notificaciones`.
4. **Antes o justo después del merge** (pasos manuales de `docs/pasos-manuales-h5.md`, con la misma ventana que documentó H2): fijar
   `LOGIN` y contraseña de `cron_notificaciones` en `production`; cargar en Vercel Production `DATABASE_CRON_URL`, `CRON_SECRET`,
   `RESEND_API_KEY`, `NOTIFICACIONES_PROVEEDOR=resend`, `NOTIFICACIONES_REMITENTE`, `APP_URL`; verificar el dominio en Resend;
   redesplegar (las variables se leen al arrancar). Hasta entonces el proveedor es el simulado, los avisos inmediatos se
   registran como fallidos por configuración y el cron responde 500: nada se finge como enviado.
5. **Verificación en producción:** relanzar el cron a mano desde Vercel con una cita propia de prueba; comprobar el correo, el
   registro en la base y que una segunda ejecución no duplica.
6. **Reversión:** no hay marcha atrás destructiva (ADR-0027). Para detener los envíos, quitar `CRON_SECRET` (el endpoint falla
   cerrado) o `NOTIFICACIONES_PROVEEDOR`; para corregir un defecto, una migración nueva. Prohibido restaurar el branch principal de
   Neon.

## Open Questions

Ninguna cambia la estructura de las capacidades ni las tareas; las 1 a 3 piden confirmación del cliente o de otro change y se
anotan para el reporte.

1. **«Un día antes» (D1).** ¿Confirma el cliente que significa «el día calendario anterior, por la mañana», y no «exactamente 24
   horas antes»? Lo segundo exige cron horario (reabre ADR-0028 y plan de pago). El diseño elegido es el único compatible con
   un cron diario; si el cliente exigiera 24 h exactas, se reabre ADR-0028.
2. **Remitente.** Nombre de la clínica, dominio de envío propio (hace falta uno verificable para SPF/DKIM/DMARC; en una demo sin
   dominio, Resend solo permite enviar a la dirección del dueño de la cuenta), dirección de respuesta y teléfono de contacto para
   el pie del correo.
3. **Ruta definitiva de «Mis citas»** en el portal (H4). Hoy `/paciente`; se cambia una constante.
4. **Límite diario y mensual del plan gratuito de Resend** frente al volumen esperado de la clínica.
5. **Periodicidad y umbrales de la revisión P-7.** Propuesta de partida: semanal los dos primeros meses y luego mensual; escalar
   al cliente si los rebotes superan ~4 % o las quejas ~0,08 % (cifras de referencia de la política de Resend, a confirmar).
6. **Seguimiento de apertura.** P-7 de TECH-DESIGN menciona la «tasa de entrega/apertura»; se deja **desactivado** por privacidad
   (un correo de una clínica que informa «abierto» es un dato sobre salud) y la revisión usa entregas, rebotes y quejas. Confirmar.
7. **Base legal del uso del correo del paciente para avisos** (Ley de Protección de Datos Personales, N.º 29733): sumarla a la
   consulta legal abierta (P-1, nota del 28/09). No bloquea el desarrollo.
8. **Estado `omitida`** en lugar de `fallida` con motivo (D6): más limpio, pero toca ADR-0017 y el tipo enumerado.
9. **«Marcar como revisada»** en la vista de fallidas: ADR-0018 no la prevé y la lista solo crece.
10. **Precisión y límites del cron de Hobby** y **ventana de la clave de idempotencia de Resend**: confirmar en la documentación
    vigente al implementar (tareas 5.2 y 7.4); no cambian el diseño, solo cifras de un comentario y de un documento.
