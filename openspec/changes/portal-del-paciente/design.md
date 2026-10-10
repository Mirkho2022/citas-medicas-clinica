# Design

## Context

Motivación y alcance en [proposal.md](proposal.md); requisitos en `specs/` (seis capabilities). Estado de partida,
verificado en el repositorio y en los changes hermanos:

- **Portal:** `/paciente` es una página de relleno de H1 (`auth.protect()` + `exigirRol("paciente")`). H2b
  (`sistema-de-diseno-ui`) añade el layout del portal (una columna de 640 px, navegación inferior de 3 destinos con
  `disponible` en `lib/ui/navegacion.ts`), `TarjetaCita`, `SelectorHorario`, `Campo`/`CampoDocumento`, `Alerta`,
  `InsigniaEstado` y `lib/ui/formato.ts` (Lima). `/registro` es el `<SignUp />` de Clerk; hoy
  `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/` y la portada `/` solo redirige si ya hay claim `rol`.
- **Cuenta recién creada:** el webhook `user.created` fija `publicMetadata.rol = "paciente"` y `sync_identidad` inserta
  `perfiles` (H2), ambos de forma asíncrona; el token de sesión sigue sin claim `rol` hasta que se refresca. Un
  recién registrado cae hoy en la portada de visitantes **estando con sesión**. El token solo lleva
  `publicMetadata.rol`; no lleva el correo.
- **Base de datos (H2, ya aplicada):** `pacientes` — el paciente solo hace `SELECT` de su propia fila; `INSERT`/`UPDATE`
  son solo del administrativo. `citas` — el paciente hace `SELECT` de las suyas e `INSERT` (a su nombre, `origen =
  'portal'`, `inicio > now()`); **sin `UPDATE`** (la migración `politicas-citas` lo difirió a este change).
  `validar_cancelacion()` (ventana de 1 h, `SECURITY DEFINER`, mide contra `OLD.inicio`). `especialidades`, `medicos`,
  `disponibilidades` y los perfiles de médicos son legibles por el paciente; `bloqueos_agenda` no. `crear_historia_clinica()`
  abre una carpeta vacía por cada paciente nuevo. No existe ninguna tabla que este change deba crear.
- **Aplicación:** `transaccionAutenticada()` (HTTP, un token y un rol por petición), `middleware.ts` es `clerkMiddleware()`
  sin lógica de autorización (decisión de H1: la protección va por página con `auth.protect()`, exigida por la regla de
  ESLint de Clerk), y las rutas públicas están listadas explícitamente en esa regla.
- **H3 (`agenda-y-reserva`)**, en paralelo, ya publicó su `design.md`: es dueño de `slots_disponibles()` (`SECURITY DEFINER`),
  `reservar_cita()`, `cancelarCita`, el traductor de `SQLSTATE` (`traducirError`), `ResultadoAccion` y el esquema Zod de
  documento, y su sección «Contratos hacia H4, H5 y H7» le encarga a H4 reservar solo con `reservar_cita()`, añadir la
  política de `UPDATE` del paciente para cancelar y hablar de usted en el aviso de cancelación. H4 los consume; no los duplica.
- **Deriva de documentación detectada:** TECH-DESIGN lista las rutas del portal como `(paciente)/portal/citas…` y el
  registro con «Turnstile», pero el área real desde H1 es `/paciente` y ADR-0026 reemplazó Turnstile por BotID. Este change
  sigue el código y los ADR; la corrección del texto de TECH-DESIGN es un cambio sugerido (tarea 10.2).

## Goals / Non-Goals

**Goals:**
- Que un paciente, solo y desde el teléfono, se registre, reserve y cancele, con el mínimo de pasos y sin que un error
  suyo lo deje atascado (cuenta en preparación, sesión vencida, horario tomado, doble clic).
- Que todo límite de acceso del paciente lo imponga la base de datos (RLS, restricciones, disparadores) y que el código del
  portal solo sea una comodidad; que los controles de borde sean defensa adicional, no la barrera.
- Que la usabilidad y la accesibilidad sean comprobables (axe, pasos máximos, reflujo, protocolo con personas mayores) y que
  la autogestión quede registrada para medir el 75 %.

**Non-Goals:**
- No se reimplementa lógica de agenda, de slots ni de reserva: es de H3. No se envían correos (H5). No hay reprogramación,
  edición de datos del paciente, representante de menores, lista de espera ni analítica.
- No se resuelve P-1 ni el consentimiento de datos personales (pregunta abierta Q3).

## Contratos de H3 que H4 consume

Confirmados contra `openspec/changes/agenda-y-reserva/design.md` (D3-D7, D10 y «Contratos hacia H4, H5 y H7»); H3 aún no está
aplicado, así que la tarea 1.1 los vuelve a verificar contra el código real **antes** de escribir el de H4. Si algo difiere, se
ajusta la capa fina de H4 o se pide el cambio a H3; no se duplica lógica de agenda.

| # | Contrato de H3 | Uso en H4 |
|---|---|---|
| C1 | `slots_disponibles(medico, fecha)`: `SECURITY DEFINER`, `search_path` vacío, `EXECUTE` a `authenticated`; devuelve solo `(inicio, fin)` de slots libres (sin citas ni bloqueos ajenos, sin pasados) y vacío si el rol no es administrativo ni paciente. **Es por un solo día**: la búsqueda en rango es de H4 (D6) | Horarios y días |
| C2 | `reservar_cita(paciente, medico, inicio, fin, motivo)` → `uuid`, `SECURITY INVOKER`: único punto de inserción; para un paciente la política de H2 fuerza `paciente_actual()` y `origen = 'portal'`; valida `inicio > now()` y que `[inicio, fin)` coincida exactamente con un slot; fija `creada_por = perfil_actual()` | Reserva |
| C3 | `cancelarCita` (en `lib/citas/`) es un solo `UPDATE … WHERE estado IN ('reservada','confirmada') RETURNING id` bajo la identidad del usuario; cero filas ⇒ `CITA_NO_VIGENTE` | Cancelación |
| C4 | `ResultadoAccion<T> = { ok: true; datos } \| { ok: false; mensaje; codigo; campos? }` (`lib/acciones/resultado.ts`) y `traducirError(error, contexto)` (`lib/citas/errores.ts`): `23P01`/`40P01` → `MENSAJE_DOBLE_RESERVA` = `Registro de cita ya agendado` (`DOBLE_RESERVA`); `P0001` → `CANCELACION_TARDIA`; `UC001` → `HORARIO_NO_DISPONIBLE`; `UC002` → `CITA_NO_VIGENTE`; `42501` → `NO_AUTORIZADO`; otro → `ERROR_INTERNO` | Todas las acciones |
| C5 | `lib/schemas/documento.ts`: DNI de 8 dígitos y Carné de Extranjería de 9 a 12 alfanuméricos, normalizado a mayúsculas | Registro del paciente |
| C6 | `notificarEventoCita(evento)` en `lib/notificaciones/eventos-cita.ts` (sin efecto hasta H5): se llama después del commit, dentro de `try/catch`, sin cambiar el resultado de la acción | Reserva y cancelación del portal lo invocan igual |
| C7 | `lib/fechas/lima.ts` (fecha ⇄ instante, inicio y fin del día de Lima, «hoy en Lima») y `lib/ui/formato.ts` de H2b para presentar | Días, horarios y textos |

Lo que H4 **no** recibe de H3 y por eso construye: la política de `UPDATE` del paciente en `citas` y su disparador (D4),
la búsqueda en rango y el «próximo horario» (D6), `accion-paciente.ts` (espejo de `accion-personal.ts`, que es solo de
personal con MFA) y el código de resultado `SESION_VENCIDA` (si la unión `CodigoError` de H3 está cerrada, H4 lo añade en su
envoltorio). H5 enlaza sus correos a «Mis citas»: la ruta definitiva es `/paciente/citas` (D1) y H5 solo cambia su constante
`RUTA_MIS_CITAS`.

## Decisions

### D1. Rutas: el registro fuera de `/paciente`, el resto dentro

```
app/
  completar-registro/   page.tsx + formulario (cliente) + espera-cuenta (cliente) + acciones.ts   (sin navegación inferior)
  paciente/
    page.tsx            Inicio: próxima cita + «Reservar cita»
    citas/page.tsx      Mis citas (próximas / anteriores) + cancelar
    citas/nueva/page.tsx  Reservar: un paso por pantalla, estado en la URL
```

`/completar-registro` queda fuera de `/paciente` porque el layout del portal (H2b) trae la navegación inferior de tres
destinos, que no tiene sentido antes de tener ficha, y H2b descartó mover rutas con grupos `(…)`. `<SignUp />` y
`NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` apuntan a `/completar-registro`. Las páginas de `/paciente/**` llaman
`auth.protect()`, `exigirRol("paciente")` y un nuevo `exigirPacienteRegistrado()` que redirige a `/completar-registro` si la
cuenta no tiene ficha (usabilidad, no seguridad: la autoridad es RLS). `app/page.tsx` pasa a redirigir a `/completar-registro`
a quien tiene sesión pero aún no tiene rol, en lugar de mostrarle la portada de visitantes; `/completar-registro` nunca
redirige de vuelta a `/`, así que no hay bucle. En `lib/ui/navegacion.ts` se activa `disponible` para «Mis citas» (`/paciente/citas`, la ruta definitiva que H5 enlaza en sus
correos) y «Reservar». *Alternativa:* una ruta `/registro/completar`, descartada porque `/registro/*` pertenece al enrutado de Clerk
(`[[...registro]]`) y se pisaría con sus pasos internos.

### D2. Registro en dos pasos y espera del rol

Paso 1: la cuenta (Clerk, ya existe). Paso 2: `/completar-registro`.

- La página de servidor decide con `obtenerRolSesion()` y la consulta `paciente_actual()`: con rol distinto de `paciente`
  redirige a su área; con ficha vinculada redirige a `/paciente`; con rol `paciente` y sin ficha muestra el formulario; **sin
  rol, o con rol pero sin fila en `perfiles` todavía, muestra `EsperarCuenta`**.
- `EsperarCuenta` (cliente) refresca la sesión cada 2 s hasta 30 s (`session.reload()` / `getToken({ skipCache: true })`,
  API exacta a confirmar en la tarea 5.2) y llama `router.refresh()`; mientras tanto muestra «Estamos preparando su cuenta…»
  en una región `aria-live="polite"`. Pasados 30 s ofrece «Reintentar» y un texto de contacto. No redirige nunca a `/`.
- *Por qué esperar el token y no leer el rol de la API de Clerk:* aunque `currentUser().publicMetadata.rol` aparezca antes,
  Neon decide con el JWT; hasta que el token lleve el claim, RLS niega todo. La espera del token es la señal correcta.
- El formulario (`react-hook-form` + `zodResolver`, esquema compartido en `lib/schemas/paciente-portal.ts` que **compone** el
  esquema de documento de H3): selector DNI/CE con `CampoDocumento`, nombres y apellidos prellenados con los de `perfiles`,
  fecha de nacimiento, sexo (M, F, X; «Otro o prefiero no indicarlo»), teléfono (7 a 15 dígitos, opcional) y dirección
  (opcional). El correo se muestra de solo lectura (etiqueta «Solo lectura»). El número de documento viaja por POST y
  nunca por la URL.

### D3. Vinculación con `pacientes` mediante una función `SECURITY DEFINER` — **propuesta sujeta a ADR**

El paciente no puede insertar ni ver una ficha sin cuenta, así que ninguna política puede resolver el alta y la
vinculación; se necesita una función. Una migración añade:

- `public.correo_actual()` (`SECURITY DEFINER`, `search_path` vacío): `auth.session() ->> 'email'` en minúsculas. El correo sale
  del **token que Neon valida**, no del formulario ni de un parámetro de la aplicación. Requiere añadir el claim `email`
  (`{{user.primary_email_address}}`) a la plantilla del JWT de Clerk (paso manual, Q2).
- `public.registrar_paciente_portal(tipo, numero, nombres, apellidos, fecha_nacimiento, sexo, telefono, direccion)` → `(paciente_id,
  vinculado)`, `SECURITY DEFINER`, `search_path` vacío, `EXECUTE` revocado a `PUBLIC` y concedido solo a `authenticated`:
  1. Exige `rol_actual() = 'paciente'` (si no, `42501`), `perfil_actual()` no nulo y `paciente_actual()` nulo (si no,
     `PA001` «cuenta ya registrada»), y `correo_actual()` no nulo.
  2. Busca `(tipo, numero)` con bloqueo de fila. **No existe** → inserta la ficha con `perfil_id = perfil_actual()` y
     `email = correo_actual()`. **Existe, sin cuenta, y el correo y la fecha de nacimiento coinciden** → fija `perfil_id` y no
     toca ningún otro dato. **Cualquier otro caso** (datos que no coinciden, ficha de otra cuenta, choque de la restricción
     única en una carrera) → `PA002`, que la aplicación muestra siempre con el mismo texto genérico.
  3. El `CHECK` de formato de `pacientes` y la unicidad `(tipo_documento, numero_documento)` y `perfil_id` quedan como
     respaldo de la validación Zod.

**Por qué verificar correo y fecha de nacimiento.** TECH-DESIGN dice solo «se vincula por `(tipo_documento,
numero_documento)`». Pero el DNI no es secreto: vincular solo por documento deja que cualquier persona con una cuenta
reclame la ficha de otra y vea sus citas (médico, servicio, fechas), un daño de privacidad. Y la mayoría de los pacientes en
el arranque ya existirá como ficha sin cuenta (carga de Excel, ADR-0019), así que la vinculación no es un caso raro. La
combinación **correo verificado de la cuenta + fecha de nacimiento** exige poseer el buzón que la clínica registró y conocer un
dato adicional.
*Alternativas:* (a) solo documento (literal de TECH-DESIGN): descartada por lo anterior. (b) solo documento + fecha de
nacimiento: la fecha es fácil de conocer o adivinar. (c) vinculación solo por el administrativo: elimina el autoservicio
justo para los pacientes que ya existen. (d) código enviado por la clínica o por correo a la dirección de la ficha: más
piezas (H5) y el mismo riesgo de correo erróneo. **Riesgo residual aceptado:** el mensaje genérico no puede ocultar del todo
que un documento existe (un documento nuevo se registra con éxito y uno existente con datos distintos no), pero revelar
«existe» a quien ya tiene una cuenta verificada, pasó BotID y respeta los límites es un costo menor que el de la opción (a).

Esto es una **decisión de arquitectura de seguridad nueva**: la tarea 1.2 la formaliza como ADR (con la skill
`architecture`) y, mientras no esté aprobada, la migración de esta función no se aplica. Si la respuesta fuera otra, cambian
esta función, la spec `registro-del-paciente` y las pruebas 70, no el resto del change.

### D4. Cancelación del paciente: política de `UPDATE` + disparador de columnas, no una función que esquive RLS

```sql
create policy "paciente cancela su cita" on public.citas for update to authenticated
using      ((select public.rol_actual()) = 'paciente' and paciente_id = (select public.paciente_actual())
             and estado in ('reservada', 'confirmada'))
with check ((select public.rol_actual()) = 'paciente' and paciente_id = (select public.paciente_actual())
             and estado = 'cancelada');
```

RLS no filtra por columna, y `authenticated` es un rol compartido por los cuatro roles de aplicación, así que tampoco sirve
un privilegio de columna. Por eso un disparador `BEFORE UPDATE` **`SECURITY INVOKER`** (`citas_proteger_columnas_paciente`)
compara `to_jsonb(NEW) - '{estado,cancelada_en,cancelada_por}'` con el de `OLD` cuando `rol_actual() = 'paciente'` y lanza
`42501` si difieren. Su nombre ordena antes de `citas_validar_cancelacion`, de modo que corre primero; `validar_cancelacion()`
sigue siendo quien aplica la ventana y quien fija `cancelada_en` y `cancelada_por = perfil_actual()`. Sin la política, un
`UPDATE` del paciente afecta cero filas; sin el disparador, podría mover la cita de médico u horario.
*Alternativa:* `cancelar_cita_propia()` como `SECURITY DEFINER`. Es más corta, pero el dueño tiene `BYPASSRLS`: la autoridad
pasaría del motor al código de la función, contra el invariante del proyecto y sin la prueba negativa «cero filas» por política.

### D5. Capa de aplicación del portal

```
lib/auth/accion-paciente.ts    envoltorio de acciones: auth.protect, rol paciente, ficha vinculada, límite de peticiones
lib/portal/consultas.ts        lecturas con transaccionAutenticada (especialidades, médicos, días, horarios, mis citas)
lib/portal/{registro,reserva,cancelacion}.ts   orquestación; llaman a lib/citas (H3) y a la función de D3
lib/portal/mensajes.ts         todos los textos del portal (usted); reexporta la constante de doble reserva de H3
lib/schemas/paciente-portal.ts
lib/seguridad/{antibots,limites}.ts
app/**/acciones.ts             Server Actions finas
```

Las acciones son un envoltorio de `accion-paciente.ts` (espejo de `accion-personal.ts` de H3: **devuelve** un `ResultadoAccion` de
fallo `NO_AUTORIZADO` en vez de redirigir, porque una Server Action es un `POST` invocable sin pasar por la página) y devuelven
el resultado tipado de C4, con `campos` para los formularios. Reutilizan las funciones de acceso a datos de `lib/citas/` y
`traducirError`, **no** las Server Actions del administrativo (protegidas por `exigirPersonal`). Tras confirmar una reserva o una
cancelación llaman a `notificarEventoCita` (C6) para que H5 avise también las citas del portal. **Ninguna acepta un identificador de paciente,
perfil o rol**: los esquemas Zod descartan claves desconocidas y la identidad sale de la sesión (`paciente_actual()` dentro
de la base). Ninguna excepción cruda llega al cliente (ADR-0006/0008). Las consultas y acciones del portal no mencionan
tablas clínicas; una prueba estática lo vigila (D11). Los textos del portal viven en `mensajes.ts` para que el trato de usted
y el texto exacto de doble reserva se prueben en un solo sitio.

### D6. Búsqueda de disponibilidad

Todo con una sola transacción HTTP por pantalla, bajo la identidad del paciente:

- **Especialidades** con al menos un médico activo; **médicos** activos de una especialidad (nombre desde `perfiles`, ya
  legible para el paciente) con su próximo horario.
- **Días** (30 días desde `hoy_lima()`; H3 deja explícitamente fuera la búsqueda en rango y solo ofrece el cálculo por día): `generate_series(hoy, hoy + 29) d` con `LEFT JOIN LATERAL slots_disponibles(medico, d)`,
  agrupado por día — una consulta, sin función nueva. **Horarios** del día: `slots_disponibles(medico, dia)`.
- **Citas propias** del día (RLS las filtra): los horarios que se cruzan con una cita vigente del paciente se pintan «No
  disponible» (`SelectorHorario`); es una ayuda de interfaz, la defensa real es `citas_sin_cruce_paciente`.
- **Rendimiento:** TECH-DESIGN fija p95 < 500 ms para la búsqueda de slots. La tarea 6.2 lo mide con los datos de demostración;
  si no se cumple, se reduce el horizonte a 14 días o se pide a H3 una función agregada. El horizonte (30 días) es un parámetro
  de interfaz, no una regla de negocio (Q4).
- Opción «Ya sé con qué médico» salta a `medico=` con su especialidad deducida. No se ofrece «cualquier médico»: obligaría a
  decidir una regla de asignación entre médicos que nadie ha pedido y añade una decisión más a quien ya duda.

### D7. Reserva: un paso por pantalla con el estado en la URL

`/paciente/citas/nueva?especialidad=…&medico=…&dia=2026-10-14&hora=<instante UTC ISO>`. El servidor decide el paso por los
parámetros presentes (ninguno → especialidad; … ; `hora` → confirmar). Cada paso es una navegación por enlace: el botón
«atrás» funciona, un recargo no pierde el avance, y una sesión vencida conserva la selección (la URL no lleva datos del
paciente, solo identificadores de médico/especialidad y el instante). Un pequeño componente de cliente mueve el foco al
`<h1 tabIndex={-1}>` del paso al llegar. El último paso es un formulario con el resumen (médico, especialidad, fecha y hora en
Lima), la `Alerta` de advertencia («Podrá cancelar esta cita hasta 1 hora antes, a las HH:mm.»; si la cita empieza en menos
de 1 hora, el texto de que ya no podrá cancelarla desde el portal) y el botón primario «Confirmar cita» (48 px, «Reservando…»
y deshabilitado mientras envía). Al confirmar, el servidor **no confía en el cliente para el fin ni para el paciente**: busca en
`slots_disponibles(medico, dia)` el slot cuyo `inicio` es el instante recibido, toma de ahí el `fin` y llama a `reservar_cita(
(select paciente_actual()), medico, inicio, fin, null)`; si el slot ya no existe devuelve `HORARIO_NO_DISPONIBLE` sin intentar el
`INSERT`. **No hay campo de motivo:** `citas.motivo` es texto libre que el administrativo lee, y
el administrativo no debe ver contenido clínico (ADR-0003); el médico recoge el motivo en la consulta.

### D8. Doble reserva, reintento idempotente y sesión vencida

`reservarCitaPortal()` llama a `reservar_cita()` (C2). Ante `codigo = DOBLE_RESERVA` consulta, bajo RLS, si el propio paciente
ya tiene una cita vigente con ese médico en ese inicio: si existe, devuelve éxito con esa cita (doble clic o reintento por mala
conexión); si no, devuelve `Registro de cita ya agendado` y la página vuelve a pintar los horarios con ese instante como «No
disponible». El texto va solo en un elemento de la alerta; la guía «Elija otro horario» va en otro. Si `transaccionAutenticada`
lanza `SesionRequerida`, la acción devuelve `codigo: SESION_VENCIDA` y la interfaz ofrece volver a iniciar sesión con
`redirect_url` a la misma confirmación. La cancelación llama a `cancelarCita` de H3 (C3); ante `CANCELACION_TARDIA` muestra el
texto del portal («Ya no es posible cancelar esta cita porque falta menos de 1 hora. Si no puede asistir, avise a la clínica.»,
en usted, en lugar del mensaje de la consola) y ante `CITA_NO_VIGENTE` (cero filas: ajena, inexistente o ya cancelada) consulta,
bajo RLS, la cita: si no la ve responde «No encontramos esa cita» (idéntico para ajena e inexistente, sin revelar nada); si la ve
y ya está `cancelada` responde que ya lo está. Tras el éxito llama a `notificarEventoCita` (C6).

### D9. Controles de borde (ADR-0026)

- **Anti-bots:** Vercel BotID en `/completar-registro` y en `/paciente/citas/nueva` (`withBotId` en `next.config.ts`,
  `initBotId` con esas rutas protegidas y `checkBotId()` al inicio de las dos Server Actions); una solicitud clasificada como bot
  se rechaza antes de tocar la base de datos. La API exacta se confirma contra la documentación vigente al implementar (tarea
  4.1). Aplica en producción y en previews; para las E2E contra el preview se documenta un modo de excepción acotado a ese
  entorno (Q6). No se aplica a búsqueda ni cancelación, que es el alcance que fija el ADR.
- **Límite de peticiones:** `@upstash/ratelimit` (ventana deslizante) con una tabla única en `lib/seguridad/limites.ts`:
  rutas de autenticación 5 intentos / 15 min por IP (el valor del ADR); registro de datos 5 / 15 min; reserva 10 / 10 min;
  cancelación 10 / 10 min; búsqueda 60 / 1 min; lecturas de las páginas de autenticación 60 / 1 min por IP. Todo menos el primero son **valores
  propuestos**, no del ADR. Las acciones limitan por usuario autenticado y, además, por IP. La IP sale de la cabecera que
  Vercel establece (`x-forwarded-for`/`x-real-ip`), nunca de un valor enviado por el cliente (se verifica en la tarea 4.3).
  Respuesta: `429`, texto en español con los minutos de espera y `Retry-After`.
- **Salvedad sobre las rutas de Clerk:** los componentes de Clerk envían las credenciales a la API de Clerk, no a nuestro
  origen; el middleware solo ve lo que llega a la aplicación (cargas de página y retornos). Por eso el límite de 5 intentos
  se aplica a las peticiones **que no son lecturas** hacia esas rutas y, junto con la protección contra bots y el bloqueo de cuenta de
  la propia consola de Clerk, forma la defensa de credenciales; contar cargas de página con 5 / 15 min bloquearía a una
  sala de espera que comparte la misma IP. Esta lectura del ADR se somete a revisión humana (Q5).
- **Fallo abierto:** si Redis no responde, la acción continúa y se registra el fallo sin datos personales; las barreras reales
  (RLS, `EXCLUDE`, disparadores) no dependen de este componente. *Alternativa:* fallar cerrado — descartada: tumbaría el portal
  completo por una dependencia de defensa en profundidad.
- *Descartado por ADR-0026:* Vercel Firewall, Arcjet y hCaptcha/reCAPTCHA; no se reabre.

### D10. Autogestión medible

`origen = 'portal'` lo impone la política de `INSERT` de H2; `creada_por` lo fija `reservar_cita()` (C2); `cancelada_por` lo
fija `validar_cancelacion()`. La métrica del PRD se define como **(reservas con `origen = 'portal'` + cancelaciones cuyo
`cancelada_por` es un perfil de rol `paciente`) / (todas las reservas + todas las cancelaciones)**. Las consultas se dejan
documentadas y se comprueban con datos de demostración; no se construye pantalla ni vista nueva (el dashboard no es analítico).

### D11. Estrategia de pruebas

- **pgTAP** (`tests/pgtap/70_portal_registro.test.sql`, `71_portal_cancelacion.test.sql`): sin tablas nuevas, pero cada
  política y función nueva trae su caso negativo. El runner `scripts/ejecutar-pgtap.ts` agrega el claim `email` a los tokens
  de prueba. Cobertura clave: alta con documento nuevo; vinculación con correo y fecha correctos; rechazo por correo, por
  fecha, por ficha ajena y por carrera; rol equivocado y sin sesión; `EXECUTE` revocado a `PUBLIC`; el paciente no lee la
  carpeta clínica recién creada; cancelar la cita propia, no la ajena (cero filas), no mover horario/médico/paciente, no
  poner `confirmada`/`atendida`; ventana a 61 min sí, a 59 min no, también para el paciente.
- **`node:test`** (`tests/portal/`): esquemas Zod de DNI/CE por tabla de casos, textos (trato de usted, constante exacta), guarda
  estática que falla si el código del portal nombra una tabla clínica o administrativa, el limitador con un almacén simulado
  (incluido el fallo abierto) y la orquestación de reserva/cancelación con resultados simulados de H3 (idempotencia, sesión vencida).
- **E2E (Playwright)** `e2e/portal-*.spec.ts`: registro con cuenta nueva `+clerk_test`; vinculación con una ficha sembrada por
  el dueño; recorrido de reserva contando pasos; doble reserva real con **dos contextos de navegador** y dos pacientes; cancelación
  dentro y fuera de ventana; intento sobre una cita ajena; rutas de personal; axe sobre cada pantalla y estado; reflujo a 320 px.
  Usan DNI generados del rango `98…` (los de demostración son `99…`); en un branch efímero no queda residuo.
- **Manual:** lector de pantalla (NVDA/VoiceOver), zoom 200 %, teclado y la prueba de usabilidad con personas de 60 años o más.

## Risks / Trade-offs

- **[Secuestro o enumeración al vincular una ficha]** → correo verificado + fecha de nacimiento, mensaje genérico, BotID y límites;
  residuo aceptado y documentado (D3); ADR antes de aplicar.
- **[Claim `email` ausente o sin verificar]** → la función falla cerrada (`PA004`) y la E2E lo detecta; paso manual en Clerk en
  desarrollo **y** producción antes de desplegar (instancias distintas); verificar que el correo es obligatorio y verificado en el alta.
- **[Espera del rol indefinida si el webhook falla]** → tope de 30 s, «Reintentar» y mensaje de contacto; Svix reintenta el webhook.
- **[BotID trata las E2E como bots o no está en el plan Hobby]** → verificar plan y modo en la tarea 4.1; excepción acotada al
  entorno de pruebas y desactivada en producción (Q6).
- **[Una sala de espera comparte IP]** → el 5 / 15 min no cuenta lecturas; las acciones limitan por usuario (D9).
- **[`slots_disponibles` × 30 días × médicos lento]** → medir (6.2), reducir el horizonte o pedir una función agregada a H3.
- **[Acaparar horarios]** → hoy solo lo frena el límite de reservas y el no solape propio; un tope de citas vigentes es una
  decisión de negocio (Q4).
- **[Contratos de H3 todavía en diseño]** → tarea 1.1 de confirmación y tabla de supuestos explícita; cambios pequeños, no estructurales.
- **[Cita pasada que sigue `reservada`]** (nadie la cerró como atendida o no asistió) → aparece en «Anteriores» con su estado real; el
  cierre de citas es de H7.
- **[Promesa de correo]** → el portal no menciona correos de confirmación hasta que H5 los envíe; H5 ajusta los textos.
- **[Sesión vencida con formulario largo]** → la selección vive en la URL y el registro conserva sus campos en el cliente mientras la sesión
  se renueva.

## Migration Plan

1. Antes de desplegar: en **Clerk** (desarrollo y producción) añadir el claim `email` a la plantilla del JWT, exigir correo
   verificado en el alta, apuntar el redirect del alta a `/completar-registro` y revisar la protección contra bots y el bloqueo
   de cuenta; en **Vercel** activar BotID y conectar Upstash (variables en Production y Preview); crear la segunda cuenta de paciente de pruebas.
   Pasos documentados en `docs/pasos-manuales-h4.md` (tarea 1.3).
2. Rama de trabajo con commits locales por grupo de tareas (como en H2). Migraciones nuevas creadas con `npm run migrate create`
   después de las de H3 (el orden lo da la marca de tiempo); nunca se edita una ya aplicada.
3. PR: el workflow crea el branch efímero de Neon, aplica las migraciones y corre pgTAP y concurrencia; las E2E corren contra el preview.
4. Merge a `master`: `migrar-produccion.yml` aplica las dos migraciones (aditivas, sin tablas) y Vercel despliega.
5. **Reversión:** no hay marcha atrás destructiva. Un defecto de base de datos se corrige con una migración nueva; un defecto de
   la aplicación se revierte con el rollback de Vercel. Las funciones y la política son inertes sin la interfaz, y quitar `disponible` de
   «Mis citas» y «Reservar» en `navegacion.ts` oculta el portal sin tocar la base.

## Open Questions

Las que cambian el diseño o las tareas se señalan: no se pudieron preguntar al usuario durante esta planificación.

- **Q1 (cambia D3 y el grupo 2).** ¿Se aprueba «correo verificado + fecha de nacimiento» como verificación al vincular una ficha
  existente (ADR de la tarea 1.2)? Alternativa: solo vinculación asistida por el administrativo.
- **Q2 (cambia D3).** ¿Se puede añadir el claim `email` a la plantilla del JWT de Clerk? Si no, el correo tendría que pasarlo la
  aplicación a la función, que lo aceptaría sin poder verificarlo.
- **Q3 (bloquea abrir el portal a pacientes reales, no la construcción).** ¿El alta debe pedir aceptación de una política de
  privacidad o consentimiento de datos personales (Ley N.° 29733, a confirmar con el asesor legal)? Se une a la consulta legal de
  P-1 sobre datos de identidad en Clerk.
- **Q4.** Parámetros de negocio no fijados por el PRD: horizonte de reserva (aquí 30 días), anticipación mínima y tope de citas
  vigentes por paciente.
- **Q5.** Lectura del límite 5 / 15 min de ADR-0026 con los componentes de Clerk (D9); posible nota fechada en el ADR.
- **Q6.** ¿BotID (modo básico) está disponible en el plan Hobby y cómo se trata el tráfico de las E2E en el preview?
- **Q7.** Datos de contacto de la clínica (teléfono o dirección) que puedan mostrarse en los mensajes «avise a la clínica».
- **Q8.** Pacientes menores de edad o sin correo propio: el PRD supone correo propio; hoy los agenda el administrativo fuera del portal.
- **Q9.** Cuando el correo o la fecha de una ficha existente no coinciden, ¿qué herramienta tiene el administrativo para corregirlos
  (H3 solo promete registrar y buscar pacientes)? Sin ella el paciente queda atascado.
