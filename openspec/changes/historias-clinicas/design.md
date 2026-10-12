# Design

## Context

Motivación y alcance en [proposal.md](proposal.md); requisitos en `specs/` (diez capacidades). Estado de partida,
verificado en el repositorio (no supuesto):

- **Base de datos (H2, ya migrada):** `historias_clinicas`, `atenciones`, `addendas`, `antecedentes`, `cie10`,
  `asignaciones_paciente_medico`, `accesos_historia` y `auditoria`, todas con RLS. El médico a cargo es la única fuente de
  acceso (`medico_tiene_paciente()`, fechas de Lima, `medicos.activo`); `proteger_atencion_firmada()`, `proteger_addenda()`
  y `proteger_antecedente()` hacen inmutable lo firmado; `registrar_auditoria()` audita las tablas clínicas **sin
  contenido**; `texto_con_contenido()` implementa «sin campos vacíos». `authenticated` recibe `GRANT` por columna: en
  `atenciones` puede actualizar `motivo_consulta`, `anamnesis`, `examen_fisico`, `diagnosticos`, `plan_tratamiento` y
  `firmada_en`. La prueba `47_estructura_historia` fija la lista exacta de columnas de las tablas clínicas.
- **Aplicación:** existen `lib/db/cliente-autenticado.ts` (`transaccionAutenticada()`: HTTP, un token y un rol por
  petición, una transacción), `lib/auth/{rol,mfa}.ts` y las páginas de área (`app/medico/page.tsx` hace `auth.protect()`,
  `exigirRol("medico")` y exige MFA). **No hay** `lib/historias/`, ni `@vercel/blob`, ni `date-fns`, ni componentes de UI
  (los trae H2b, `sistema-de-diseno-ui`, aún en 0/29 tareas). Zod 3, `react-hook-form` y `@hookform/resolvers` están
  instalados. La regla de ESLint `@clerk/next/require-auth-protection` cubre `app/*/**`, incluidas `app/api/**`.
- **Datos:** `cie10` está vacío salvo 12 códigos `DEMO` que siembra `scripts/sembrar-datos-demo.ts`. Los pacientes que crean las
  pruebas pgTAP y la siembra de demostración tienen todos correo `@demo.invalid`. Las pruebas pgTAP existentes insertan
  diagnósticos como `[{"cie10": "R51"}]`, a veces sin `descripcion` ni `tipo`, y como dueño insertan atenciones ya firmadas.
- **CI:** el branch efímero de Neon por PR **copia los datos de `production`** (el plan Free devuelve 412 con
  `schema-only`; nota en `neon-branch-pr.yml`). Con datos reales, cada PR y cada preview los heredaría.
- **Documentos:** TECH-DESIGN dibuja las rutas como `(personal)/pacientes/[id]/historia/`; el repositorio usa áreas
  (`app/medico`, `app/administrativo`), así que este change sigue las áreas reales (D8).
- **Especialidades (dato del usuario, 2026-10-10):** la clínica atiende Medicina general, Odontología, Fisioterapia,
  Psicología y Podología; no atiende Estética y Capilar. Pediatría, Cardiología y Ginecología de los datos de
  demostración de H2 son solo sintéticos. `especialidades` y `medicos.especialidad_id` ya existen; `atenciones` no
  tiene dónde guardar datos propios de una especialidad (D15).

## Goals / Non-Goals

**Goals:**
- Que el aislamiento por médico a cargo siga siendo impuesto por la base de datos en cada operación nueva, y que cada
  regla que dependa de «no confiar en el cliente» (hora de firma, diagnósticos, cita, modo de datos) se cumpla en la base.
- Que ninguna lectura de contenido clínico pueda omitir su registro de acceso (falla cerrada).
- Que mientras P-1 siga abierta el sistema **no pueda** recibir datos clínicos reales, sin impedir la demostración.
- Que el médico cargue una atención en pocos minutos, sin errores y sin perder lo escrito.
- Que una especialidad pueda aportar campos propios a la atención **sin tocar** la estructura de `atenciones`, sin
  debilitar «sin campos vacíos» ni la inmutabilidad de lo firmado (D15).

**Non-Goals:**
- Resolver P-1, P-5, P-10 o el hosting; declarar validez legal de la firma lógica; levantar el bloqueo de datos reales.
- Autoguardado de texto clínico en el servidor o en el navegador, impresión o exportación de la historia, recetas,
  órdenes de laboratorio, acceso del paciente a su historia, y migración de datos reales de papel (H8).
- Modificar agenda, portal, notificaciones o turnos, ni dar al médico permisos de `UPDATE` sobre `citas`.
- Pantalla para el indicador de digitalización (solo la función; presentación a decidir en H7/H8).
- Recetas y triaje (los pidió el usuario: serán changes propios), plantillas de Odontología, Fisioterapia, Psicología y
  Podología, y cualquier cambio de roles para profesionales que no son médicos (D15, «Cuestión abierta»).

## Decisions

### D1. Guarda contra datos clínicos reales (P-1): modo en la base de datos, variable que debe coincidir y aviso

Mecanismo en tres capas; la primera es la única que no depende de que alguien configure bien algo.

1. **Base de datos (autoridad).** Tabla `configuracion_clinica` de **una sola fila** (`id boolean primary key default true
   check (id)`), con `modo` (`demostracion` por defecto o `real`), `referencia_legal` y `cambiado_en`. Un `CHECK` exige
   `referencia_legal` con contenido cuando `modo = 'real'`. Nace con RLS activada, **sin `GRANT` ni política** para ningún
   rol de usuario: solo se cambia con una migración. La aplicación lo consulta con `public.modo_datos_clinicos()`
   (`SECURITY DEFINER`, `search_path` vacío, `EXECUTE` solo a `authenticated`). Un disparador `BEFORE INSERT`
   (`exigir_paciente_admisible()`, `SECURITY DEFINER`) en `atenciones`, `addendas` (por su atención), `antecedentes` y
   `adjuntos_historia` exige `modo = 'demostracion'` ⇔ paciente de demostración, donde **paciente de demostración =
   correo `ilike '%@demo.invalid'`** (dominio reservado por RFC 2606: ningún paciente real puede tenerlo; es el marcador
   que ya usan la siembra y toda la suite pgTAP). Falla con `SQLSTATE HC002`. Es **simétrico**: en modo `real` rechaza a los
   pacientes de demostración, de modo que el script de siembra no puede contaminar una base real. Solo se evalúa en
   `INSERT`: el contenido ya guardado no cambia de naturaleza.
2. **Aplicación (coherencia).** Variable `CLINICA_MODO_DATOS` (`demostracion` por defecto; ausente o inválida equivale a
   `demostracion`). **Todas** las transacciones del módulo empiezan con `select public.exigir_modo_clinico($modo_app)`, una
   función `SECURITY DEFINER` que lanza `HC004` si el modo de la base no coincide con el de la aplicación. Así «preview con
   variable de demostración apuntando a una base real» (o al revés) falla cerrado **dentro de la misma transacción**, sin
   un viaje extra ni una ventana entre comprobar y usar. La pantalla muestra «Módulo no disponible: configuración
   inconsistente».
3. **Interfaz (visibilidad).** `AvisoModoDemostracion` (`alert-warning` de DESIGN.md) en toda pantalla clínica mientras el
   modo sea `demostracion`: «Modo demostración: use solo datos ficticios. No ingrese datos de pacientes reales.»

**Puerta de revisión.** Una prueba pgTAP afirma que el modo de una base recién migrada es `demostracion`; la migración
futura que fije `real` la hará fallar y obligará a editarla de forma consciente, citando la referencia legal. Este change
**no** contiene ninguna migración que fije `real`.

**Condiciones para levantar el bloqueo (change posterior, no este).** (1) P-1 cerrada por escrito con asesor legal
(retención, firma lógica o certificada, hosting), con documento referenciable. (2) Si el alojamiento debe estar en Perú,
reabrir ADR-0020/0021 y mover la base antes. (3) P-5: proveedor de firma acorde con la respuesta. (4) P-10: Clerk Pro con
MFA en producción. (5) CI y previews sin copia de datos clínicos (branch `schema-only` o base sin datos; hoy 412 en Free).
(6) Retención de PITR/backups acorde con la norma (P-9). (7) **Una base nueva y limpia**: los datos clínicos no se pueden
borrar (por diseño), así que el modo `real` no se activa sobre la base que contiene datos de demostración. (8) La consulta
legal incluye los datos de identidad que aloja Clerk. (9) Revisión `code-review` y revisión de seguridad previas.

*Alternativas:* (a) Solo una variable de entorno: un error de configuración o un preview mal apuntado lo anula en silencio.
(b) Detectar «datos reales» por patrón de DNI (`99…`): un DNI real podría coincidir y el CE no tiene patrón fiable; el correo
reservado no puede ser real. (c) Una columna `pacientes.es_demo`: el administrativo (que edita `pacientes`) podría
cambiarla; el correo es un dato de identidad. (d) Bloquear a nivel de CI/despliegue: no protege ante una base mal apuntada.

### D2. Un único módulo de acceso a datos clínicos y lectura atómica con auditoría

Todo SQL contra `atenciones`, `addendas`, `antecedentes`, `historias_clinicas`, `adjuntos_historia`,
`asignaciones_paciente_medico` y `accesos_historia` vive en `lib/historias/` (repositorio por caso de uso). Una prueba
`node:test` (`tests/historias/acceso-unico.test.ts`) recorre `app/`, `lib/` y `components/` y falla si otro archivo contiene
SQL contra esas tablas (excluye `migrations/`, `scripts/`, `tests/`, `e2e/`).

Cada función que **entrega** contenido clínico arma **una sola transacción** con `transaccionAutenticada()`:

```
1. select public.exigir_modo_clinico($modo)           -- D1, falla cerrada si hay inconsistencia
2. insert into accesos_historia (...)                 -- la política exige médico a cargo y actor = perfil actual
3. select ... (ficha, antecedentes, atenciones, ...)  -- el contenido
```

Como la transacción es única, si el paso 2 falla (asignación vencida, perfil desactivado…) se revierte todo y el paso 3 no
devuelve nada: **no se muestra contenido sin su registro**. No se añade una condición «hay un acceso registrado» a las
políticas `SELECT` (lo bloquearía todo lo que no sea apertura, como listas y comprobaciones, y reescribe la política central
de H2). Los intentos denegados no dejan fila: RLS no les devuelve nada; el servidor solo registra el código SQLSTATE y la
operación, nunca el contenido (ver Preguntas abiertas).

Para distinguir en pantalla «no habilitada aún» de «no existe» sin filtrar información, si la transacción falla con
`42501`, una segunda consulta lee `pacientes` bajo RLS (el médico ya puede leer a los pacientes con los que tiene una cita
reservada o confirmada); con fila → aviso «la historia se habilita al confirmarse la cita»; sin fila → `notFound()`.

*Alternativas:* (a) condición en la política `SELECT` que exija un acceso registrado en la transacción actual: garantía aún
más fuerte, pero cambia las políticas de cuatro tablas de H2 y rompe consultas legítimas; se descarta, no se descarta
revisitarla tras la revisión de seguridad. (b) Registrar el acceso *después* de leer: permite una lectura sin rastro si
falla el segundo paso. (c) Disparador de lectura: PostgreSQL no tiene disparadores de `SELECT`.

### D3. Validación en tres capas, el servidor manda

Esquemas Zod 3 en `lib/schemas/historia-clinica.ts`, compartidos con el formulario (ADR-0004). Reglas: `texto con contenido`
= al menos un carácter que no sea espacio **ni invisible** (`\s`, `U+200B–U+200D`, `U+2060`, `U+FEFF`, `U+00AD`; el `CHECK`
de la base no cubre los invisibles, lo dice su propia migración), sin `U+0000` (Postgres no puede guardarlo), normalizado a
NFC y recortado solo en los extremos; límites iniciales (ajustables): motivo 500, anamnesis/examen/plan/addenda 5 000,
antecedente 1 000, motivo de asignación 300, nombre de adjunto 200 caracteres, 1–10 diagnósticos. El esquema de la atención
es `.strict()`: una clave ajena (por ejemplo `nombres`) rechaza la solicitud. El cliente envía de cada diagnóstico solo
`cie10` y `tipo`; la descripción la pone el servidor. Segunda capa: `CHECK` y disparadores de la base. Tercera: el mapeo de
errores (D10), que nunca deja pasar el error crudo. El esquema Zod devuelve `{ ok: false, mensaje, errores?: { campo: [...] } }`
(extensión compatible del tipo de ADR-0006).

### D4. CIE-10: carga versionada, validación en la base de datos y búsqueda sin extensiones

- **Carga (ADR-0014).** `scripts/preparar-cie10.ts` convierte la fuente oficial elegida en la tarea 0.4 (MINSA/SUSALUD
  primero, OMS ClaML de respaldo; nunca un mirror de terceros) a un CSV determinista en `datos/cie10/` con su `SHA-256`,
  versión, URL y fecha de obtención; y genera la migración `insert into public.cie10 … on conflict (codigo) do nothing` (con
  esos metadatos en el encabezado). La migración **precede** a la de validación: las pruebas pgTAP existentes usan `R51`
  y deben encontrarlo en el catálogo. Una actualización futura es otra migración, nunca editar esta.
- **Validación en la base (hueco de H2: «la forma exacta se define en H6»).** Disparador `BEFORE INSERT OR UPDATE OF
  diagnosticos` en `atenciones` (`SECURITY DEFINER`, no depende de que el rol vea el catálogo) que **reconstruye** el arreglo:
  cada entrada debe ser un objeto con `cie10` existente; `descripcion` se **sobrescribe** con la del catálogo (instantánea al
  firmar, inmune a cambios posteriores del catálogo); `tipo`, si viene, debe ser `presuntivo`, `definitivo` o `repetitivo`;
  se descartan claves ajenas; un código repetido falla con `HC001`. **Si `diagnosticos` no es un arreglo o está vacío, el
  disparador no actúa** y deja que el `CHECK` existente lo rechace con `23514`: así las pruebas de H2 (lista vacía, objeto en
  vez de lista, omitido) siguen pasando sin tocarse. `tipo` es opcional en la base (las pruebas existentes no lo envían) pero
  **obligatorio en Zod**. *Alternativas:* una tabla `atencion_diagnosticos` con `FOREIGN KEY` real a `cie10` — más limpia,
  pero reestructura `atenciones` y su `CHECK` de H2 y toda la política de la historia; `FOREIGN KEY` funcional sobre `jsonb`
  no existe en PostgreSQL.
- **Búsqueda.** `app/api/cie10/route.ts` (`auth.protect()`, rol médico, ≥ 2 caracteres, máximo 20): coincidencias de código
  primero, luego descripción con `translate(lower(x), 'áéíóúüñ', 'aeiouun')` aplicado a ambos lados. Sin `pg_trgm` ni
  `unaccent`: ~14 000 filas se recorren en milisegundos y evita sumar extensiones; la tarea 2.5 mide con `EXPLAIN ANALYZE` y,
  si no cabe en el presupuesto, recién entonces se añade un índice.

### D5. Sello del servidor y huella de la firma lógica (hueco de H2) + proveedor de firma (P-5)

`firmada_en` y `creado_en` los puede fijar el cliente (el `GRANT` de columnas incluye `firmada_en` y el `INSERT` admite
`creado_en`). Migración nueva:

- Columnas `atenciones.firma_metodo` (`'logica'`) y `atenciones.firma_huella` (`'v1:' ||` SHA-256 hex del `jsonb` canónico de
  identidad y contenido — `id`, `historia_id`, `paciente_id`, `cita_id`, `medico_id`, los cuatro textos, `diagnosticos`, `plantilla_id`, `datos_especialidad`,
  `firmada_en` — con `sha256()` nativo de PostgreSQL ≥ 11; no hace falta `pgcrypto`). Función `huella_atencion(uuid)`.
  `CHECK … NOT VALID` impone «firmada ⇒ método y huella» solo a filas nuevas (las firmadas antes, p. ej. datos de
  demostración, no se pueden actualizar para rellenar la huella).
- Disparadores (`BEFORE INSERT/UPDATE`, **solo si `current_user = 'authenticated'`**, mismo criterio que
  `bloquear_cambio_de_rol()`): `creado_en := now()` en `atenciones`, `addendas` y `antecedentes`; al pasar de sin firmar a
  firmada, `firmada_en := now()`. Para el dueño (siembra, migraciones) no se pisa nada, pero si la fila nace o queda firmada
  se calculan método y huella. Orden alfabético de disparadores: `atenciones_inmutables` va antes que el de sello, de modo
  que lo ya firmado sigue rechazándose antes de sellar.
- **Proveedor de firma.** `lib/firma/proveedor.ts` define `ProveedorFirma` (`metodo`, `firmar(atencion) → ConstanciaDeFirma`)
  y `lib/firma/firma-logica.ts` lo implementa sin servicio externo. `firmarAtencion` llama al proveedor y luego hace el
  `UPDATE`; un proveedor certificado posterior añadirá su evidencia con una migración propia (hoy `firma_metodo` no está en
  el `GRANT`). **No se declara validez legal** en pantalla ni documentos.
- **Guardar y firmar en un paso:** `crypto.randomUUID()` en el servidor como `id`, `INSERT` y `UPDATE … where id = $id and
  firmada_en is null` en la misma transacción (una CTE no vería la fila recién insertada). Con un proveedor externo futuro
  esta atomicidad habrá que rediseñarla.
- Se necesita una **ADR** (tarea 0.2) porque cambia lo que significa «firma lógica» frente a P-1/P-5; la ADR no decide P-1.

### D6. Endurecimientos de la base de datos hallados al auditar H2

| # | Hueco en H2 | Riesgo | Resolución |
|---|---|---|---|
| H1 | Sin tabla para los escaneos de respaldo (ADR-0013/0024) | La autoridad de acceso al archivo quedaría solo en una Server Action | Tabla `adjuntos_historia` con RLS (D7) |
| H2 | `diagnosticos` no se valida contra `cie10` y `cie10` está vacío | Códigos inventados o con errores de tipeo en el registro legal | D4 |
| H3 | `firmada_en` y `creado_en` los fija el cliente | Firma o atención con fecha falsa | D5 |
| H4 | `atenciones.cita_id` no comprueba médico ni paciente (la FK ignora RLS) | Atar una atención a la cita de otro, o «gastar» el `unique` de una cita ajena | Disparador `HC003`, `SECURITY DEFINER`, solo coherencia de identificadores |
| H5 | El rastro de lectura depende de que la aplicación lo escriba, y `accesos_historia` no distingue historia, atención o adjunto | Lecturas sin rastro; auditoría poco precisa | D2 y columnas `tipo_acceso` (`historia`/`atencion`/`adjunto`) y `adjunto_id` |
| H6 | `registrar_auditoria()` volcaría el nombre de archivo del adjunto (puede ser clínico) al administrativo | El administrativo leería contenido clínico por la auditoría | `create or replace` incluyendo `adjuntos_historia` entre las tablas sin contenido |
| H7 | El `INSERT` del administrativo en asignaciones admite `motivo` nulo o `cita:%` | Suplantar o bloquear la asignación automática de una cita; acceso sin trazabilidad | `alter policy`: motivo con contenido y sin prefijo `cita:` |
| H8 | `medico_tiene_paciente()` no mira `perfiles.activo` | Un perfil desactivado conserva acceso en la base hasta que expire su token | `create or replace` añadiendo `perfiles.activo`. **Cambia la función central de acceso: revisión explícita** |
| H9 | Un médico a cargo ve los **borradores** de otro médico (probado en `43_historias_rls`) | Un borrador incompleto puede leerse como definitivo | No se cambia (H2 lo decidió con prueba): la interfaz los muestra como «Borrador sin firmar» de su autor. Pregunta abierta |
| H10 | El administrativo no puede leer `historias_clinicas.numero` (dato no clínico) | H8 podría necesitarlo para cotejar carpetas de papel | Sin cambio; aviso a H8 |
| H11 | Las pruebas pgTAP dependen de que `R51` exista y de `columns_are` exacto | Romper la suite al cargar el catálogo o añadir columnas | Catálogo antes del disparador; `47` se actualiza a propósito |
| H12 | Los branches efímeros copian datos de `production` | Previews con datos clínicos reales | Condición para levantar el bloqueo (D1, punto 5) |
| H13 | `atenciones` es una nota genérica: no hay dónde guardar campos propios de una especialidad | Retrofitar después de firmar, de la huella y de las pruebas de RLS cuesta mucho más | D15: `plantillas_clinicas` y `datos_especialidad` |

### D7. Adjuntos: la fila RLS decide; subida directa a Blob; descarga por el servidor

- **Tabla `adjuntos_historia`:** `historia_id` + `paciente_id` con la misma clave compuesta que `atenciones`; `clave_blob`
  única y aleatoria (`historias/<uuid>.pdf`, sin nombre ni documento); `nombre_original` (con contenido), `tipo_mime`
  (`application/pdf`), `tamano_bytes` (> 0 y ≤ 25 MB, valor inicial), `subido_por` (médico), `vigente`, `motivo_anulacion`
  (obligatorio si no vigente), `creado_en`. RLS y políticas **idénticas a `atenciones`** (solo el médico a cargo; sin
  política para administrativo, paciente ni enfermera; sin `GRANT` a `cron_notificaciones`, `sync_identidad` ni `anonymous`).
  `UPDATE` solo de `vigente` y `motivo_anulacion` por privilegio de columna, y un disparador rechaza cualquier otro cambio y
  todo `DELETE`. Auditoría de escritura y disparador de modo (D1).
- **Consecuencia sobre ADR-0024:** la excepción «el control es la Server Action, no RLS» se estrecha: para obtener el archivo
  hay que leer antes su fila bajo RLS; quien no puede leerla no obtiene la `clave_blob`. La Server Action sigue siendo
  código que revisar con el mismo rigor, pero un olvido ya no abre el archivo.
- **Subida.** Los PDF escaneados superan los 4,5 MB que admite el cuerpo de una función, así que el navegador sube
  directamente a Blob con un permiso emitido por un Route Handler (`app/api/historias/adjuntos/subida/route.ts`) que, en el
  momento de emitirlo, comprueba sesión, rol, MFA, modo y médico a cargo, y restringe tipo (`application/pdf`), tamaño y
  nombre aleatorio. Luego la acción `registrarAdjunto` verifica en el servidor tamaño y tipo reales del objeto, lee los
  primeros bytes (`%PDF-`) e inserta la fila bajo RLS; un archivo rechazado se elimina de inmediato (nunca fue parte del
  registro). No se confía en el callback de fin de subida (no funciona en local).
- **Descarga.** Route Handler `app/medico/pacientes/[pacienteId]/adjuntos/[adjuntoId]/route.ts`: una transacción con
  modo → `insert` de acceso `adjunto` → `select clave_blob … where id = … and paciente_id = … and vigente`; solo con fila se
  entrega el archivo, con `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` y `Content-Disposition`.
- **Verificar antes de construir (tarea 0.3):** ADR-0024 supone Blob privado y URL firmada de unos minutos; el diseño sirve
  igual con URL firmada de corta duración o con entrega por streaming desde el Route Handler. Si el modo privado o la subida
  directa no existen como se supone, se detiene el grupo 9 y se consulta (reabre ADR-0024); el resto del change no depende de él.
- Huérfanos (subidos sin registrar), eliminación física y retención quedan a P-1; ver Preguntas abiertas.

### D8. Rutas, protección y cabeceras

| Ruta | Rol | Contenido |
|---|---|---|
| `app/medico/pacientes/page.tsx` | médico | Lista de pacientes a cargo y búsqueda |
| `app/medico/pacientes/[pacienteId]/page.tsx` | médico | Historia: ficha de solo lectura, antecedentes, atenciones, adjuntos |
| `.../atenciones/nueva/page.tsx`, `.../atenciones/[atencionId]/page.tsx` | médico | Formulario; detalle, edición de borrador y addendas |
| `.../adjuntos/[adjuntoId]/route.ts`, `app/api/historias/adjuntos/subida/route.ts`, `app/api/cie10/route.ts` | médico | Descarga, permiso de subida y búsqueda |
| `app/administrativo/asignaciones/`, `app/administrativo/accesos-historia/` | administrativo | Asignación manual y revisión de accesos |

Toda página y ruta repite `auth.protect()`, `exigirRol("medico")` y MFA mediante un único ayudante
(`lib/historias/guardia.ts`); el diseño de H1 prohíbe depender de un filtro previo. `next.config.ts` añade
`Cache-Control: private, no-store` a `/medico/pacientes/:path*` y `/api/historias/:path*`, las páginas son dinámicas, el
`<title>` es «Historia clínica» y la dirección usa solo el `uuid` del paciente. La navegación (`lib/ui/navegacion.ts`, H2b)
activa «Pacientes» del médico y «Asignaciones» y «Accesos a historias» del administrativo. Se propone actualizar la tabla de
rutas de TECH-DESIGN a las áreas reales.

### D9. Carga rápida (la métrica de 60 %)

Una pantalla con ficha y antecedentes vigentes al lado, barra fija con «Guardar borrador» y «Firmar atención» (un solo botón
primario por pantalla, DESIGN.md: «Firmar» es el primario, con diálogo de confirmación), motivo prellenado desde `citas.motivo`
(la cita se lee bajo la política «médico ve su agenda»), búsqueda de diagnósticos con combobox accesible (teclado, `role`,
`aria-activedescendant`, retraso de 200 ms, resultados anunciados), errores del servidor por campo sin vaciar lo escrito y
aviso al abandonar con cambios. **Decisión consciente:** no se autoguarda texto clínico en el navegador (`localStorage` en un
equipo compartido es una fuga) ni en el servidor (las columnas son `NOT NULL` con `CHECK`, un borrador parcial no cabe sin
debilitar H2). Costo: si la sesión caduca a mitad de una atención se pierde lo no guardado; mitiga que el formulario conserva
el estado en memoria mientras la pestaña viva y que «Guardar borrador» es un clic. Objetivo de validación: un médico carga
una atención típica en ≤ 3 minutos (valor inicial a confirmar en la prueba de usabilidad, tarea 11.3).

### D10. Server Actions y mapeo de errores

Acciones (todas validan con Zod y devuelven `{ ok: true, datos } | { ok: false, mensaje, errores? }`): `registrarAtencion`
(con `firmar` opcional), `actualizarBorrador`, `firmarAtencion`, `agregarAddenda`, `registrarAntecedente`,
`reemplazarAntecedente`, `marcarAntecedenteNoVigente`, `registrarAdjunto`, `anularAdjunto` y, del administrativo,
`asignarPacienteAMedico`. Las lecturas son funciones del repositorio, no acciones.

| Origen en la base | Mensaje al usuario (español) |
|---|---|
| `HC001` | «Revise los diagnósticos: hay un código que no existe en el catálogo CIE-10 o está repetido.» |
| `HC002` | «Modo demostración: solo se pueden registrar datos de pacientes ficticios.» |
| `HC003` | «La cita indicada no corresponde a este paciente y a este médico.» |
| `HC004` | «Módulo de historias clínicas no disponible: configuración inconsistente.» |
| `42501` con «Atención firmada» | «Esta atención ya está firmada. Para corregirla, agregue una addenda.» |
| `42501` con «addendas no se modifican» / «antecedentes no se…» | Mensaje de la regla, sin detalle interno |
| `42501` (RLS) | «No tiene acceso a esta historia clínica.» (sin confirmar existencia) |
| `23505` sobre `cita_id` | «Ya existe una atención registrada para esa cita.» |
| `23514` | «Hay campos vacíos o inválidos. Revise el formulario.» |
| otros | «No se pudo completar la operación. Intente de nuevo.» (se registra solo el código y la operación) |

`HC001`–`HC004` son SQLSTATE propios (cinco caracteres; no chocan con los estándar). Los mensajes de H2 que la aplicación
reconoce por texto ya están protegidos por las pruebas pgTAP que los afirman: cambiarlos las rompe.

### D11. Asignación manual (administrativo)

`asignarPacienteAMedico`: busca al paciente por documento (el administrativo lee `pacientes`), elige un médico **activo**, motivo
obligatorio, vencimiento opcional (≥ hoy en Lima) y muestra la advertencia «El médico podrá ver la historia clínica completa del
paciente». Es una vía de concesión de acceso clínico: cada alta queda en `auditoria` y el administrativo no obtiene contenido por
asignar. La política endurecida (H7) lo respalda aunque la acción falle.

### D12. «Diagnósticos activos» e indicador de digitalización

ADR-0013 habla de «antecedentes y diagnósticos activos» estructurados «en campos de `atenciones`»; ADR-0015 sacó los
antecedentes a su propia tabla, y no existe ninguna entidad de «diagnóstico activo» con estado (un diagnóstico vive dentro de
una atención firmada, que es inmutable). **Resolución para este change, sin crear una entidad nueva:**
- La historia **muestra** «Diagnósticos registrados» (los de las atenciones firmadas, del más reciente al más antiguo), no «activos».
- El indicador cuenta una historia como digitalizada si tiene **al menos un antecedente vigente o al menos una atención
  firmada** (que por `CHECK` siempre trae ≥ 1 diagnóstico). Un adjunto solo no digitaliza (ADR-0013).
- Una historia **migrada de papel** sin consulta nueva se digitaliza con antecedentes vigentes (los diagnósticos crónicos ya
  conocidos se registran como «personal patológico»). **No** se registra una atención ficticia de «apertura»: contaminaría el
  registro legal con una consulta que no ocurrió. La función `indicador_digitalizacion()` (`SECURITY DEFINER`, solo
  administrativo, devuelve `total_historias` y `historias_digitalizadas`; otros roles reciben `42501`) lo mide.
- Si la clínica quiere una *lista de problemas* con CIE-10 y estado resuelto para historias migradas, es un modelo nuevo
  (ADR propia, H8); no cambia las especificaciones de este change.

### D13. Las transiciones de la cita son de H3; la firma no las toca

**Decisión del usuario:** la recepción (administrativo) confirma la cita
(`reservada → confirmada`) y marca «no asistió» (`confirmada → no_asistio`); el médico marca «atendida»
(`confirmada → atendida`, solo el médico dueño de la cita, mediante una función acotada `SECURITY DEFINER` que cambia únicamente
el estado). **H3 (`agenda-y-reserva`) es dueña de las tres transiciones**; este change **no** añade políticas ni funciones
sobre `citas`.

- **Acceso del médico.** El acceso por cita nace cuando una cita entra a `confirmada` (ADR-0016), así que lo alimenta la
  confirmación de recepción. Mientras solo esté `reservada`, la historia muestra «aún no habilitada». La asignación manual
  (D11) queda como **vía de excepción** (interconsulta, cobertura, cita sin confirmar a tiempo), no como camino normal.
- **Relación entre firmar y «atendida»: la firma NO cambia el estado de la cita.** El médico marca la cita atendida con la
  acción de H3; este change solo ofrece, en la pantalla de una atención vinculada a una cita `confirmada`, un botón
  **secundario y aparte** «Marcar cita como atendida» que invoca esa acción (disponible antes o después de firmar, y también
  desde la agenda de H3). Un solo botón primario por pantalla («Firmar atención») y ningún «Firmar y marcar atendida».
  *Por qué lo más simple:* (a) firmar es irreversible (inmutable, con huella) y el cambio de estado es corregible y de otro
  módulo: acoplarlos haría que un fallo del segundo —o su atomicidad entre dos funciones de módulos distintos— condicione o
  deje a medias el acto legal; (b) la firma ya funciona sin que exista la acción de H3; (c) no hace falta ninguna política
  nueva ni una función de H6 que escriba en `citas`; (d) un médico puede firmar horas después de la consulta sin que eso
  decida el estado de la cita. *Si la acción de H3 falla* (cita ya cancelada, estado distinto, red), la UI muestra su mensaje
  propio y la atención sigue firmada; el médico reintenta. *Alternativa descartada:* «Firmar y marcar atendida» en dos pasos
  desacoplados desde un solo botón: aparenta atomicidad que no existe y duplica el botón primario.
- **Consecuencias de acceso.** Pasar la cita a `atendida` o `no_asistio` no revoca el acceso ya otorgado (ADR-0016): vence a
  los 6 meses. La atención solo puede vincularse a una cita del mismo médico y paciente (`HC003`); este change no exige un
  estado concreto de la cita para vincularla.
- **Riesgo operativo que persiste:** si la recepción no confirma, el médico no accede el día de la consulta; se mitiga con la
  asignación manual y con el aviso en pantalla (ver Riesgos). Coordinar con H3 el nombre y la firma de su acción (tarea 0.7).

### D14. Pruebas y verificación

- **pgTAP** nuevas (numeración sugerida): `48` CIE-10 y validación, `49` sello y huella, `54` adjuntos, `55` modo y
  `configuracion_clinica`, `56` tipo de acceso, `57` asignaciones manuales, `58` indicador, `62` plantillas y datos de especialidad, y una prueba de
  `medico_tiene_paciente()` con perfil inactivo. Cada una incluye el caso negativo de **cada** rol (administrativo, paciente,
  enfermera, otro médico, sin rol, `anonymous`, `cron_notificaciones`, `sync_identidad`) y `has_table_privilege` de lo que no se
  concede. No asumen tablas vacías. `47` se actualiza a propósito.
- **Verificación por mutación** (como en H2): para cada política o disparador nuevo se debilita temporalmente en un branch de
  desarrollo y se comprueba que alguna prueba negativa falla; se anota en el PR.
- **`node:test`**: esquemas Zod, mapeo de errores, modo, huella/proveedor de firma, búsqueda (normalización), orden de las
  sentencias del repositorio con un ejecutor simulado (primero modo, luego acceso, luego lectura) y el acceso único.
- **Concurrencia**: firma contra edición simultánea (el segundo `UPDATE` reevalúa la política y no encuentra fila).
- **E2E (Playwright, cuentas de H1 y datos de demostración):** médico abre historia propia y se ve su acceso en la pantalla del
  administrativo; historia ajena → 404; formulario con campos vacíos → errores y nada guardado; firmar → sin botón de editar y
  addenda posible; administrativo/paciente/enfermera → sin acceso; aviso de demostración visible. **axe** sobre las pantallas.
- Antes de cerrar: agente `code-review` sobre todo el diff (acceso a historias, RLS, migraciones, Server Actions, Route
  Handlers de adjuntos), con la lectura más estricta, y corrección de sus hallazgos.

### D15. Datos clínicos por especialidad: plantillas versionadas y `datos_especialidad` validados en la base

**Contexto.** La clínica atiende Medicina general, Odontología, Fisioterapia, Psicología y Podología (dato del usuario;
Estética y Capilar queda fuera) y `atenciones` es una nota genérica (motivo, anamnesis, examen físico, diagnósticos, plan).
Añadir campos después de la firma, la huella y las pruebas de RLS obliga a tocar políticas, disparadores y la prueba `47`
con datos ya firmados; prepararlo ahora cuesta una tabla y dos columnas. La decisión completa está en
[ADR-0029](../../../docs/adrs/0029-datos-clinicos-por-especialidad.md) (Aceptado el 2026-10-10).

**Decisión.**
- **Catálogo `plantillas_clinicas`** (tabla nueva, RLS activada): `id`, `especialidad_id` → `especialidades`, `version`
  (entero ≥ 1), `nombre`, `campos` (`jsonb`: arreglo de definiciones `{clave, etiqueta, tipo, obligatorio, …}` con `tipo` en
  `texto`, `entero`, `decimal`, `opcion`, `si_no` y `fecha`, y sus límites `min`, `max`, `largo_max`, `opciones` y `unidad`),
  `vigente` y `creado_en`; `unique (especialidad_id, version)`. **Una versión es una fila inmutable**: cambiar una plantilla
  es insertar la versión siguiente y marcar la anterior como no vigente. Lectura: solo el médico. Ningún rol de usuario
  inserta, actualiza ni borra: **se gestiona por migración**, revisada como el resto del SQL clínico. El administrativo, la
  enfermera, el paciente, `anonymous`, `cron_notificaciones` y `sync_identidad` no la leen.
- **Columnas nuevas en `atenciones`:** `plantilla_id uuid null references plantillas_clinicas(id)` y `datos_especialidad
  jsonb not null default '{}'` con `CHECK (jsonb_typeof(datos_especialidad) = 'object')`. No hace falta `plantilla_version`:
  la fila de la plantilla **es** la versión, así que `plantilla_id` fija la plantilla exacta con la que se llenó la
  atención. Las atenciones existentes quedan con `plantilla_id` nulo y `{}`. Ambas columnas se añaden a los `GRANT` de
  `INSERT` y `UPDATE` de `authenticated`.
- **Validación en la base (segunda barrera, como `diagnosticos`).** Disparador `atenciones_validar_datos_especialidad`
  (`BEFORE INSERT OR UPDATE OF plantilla_id, datos_especialidad`, `SECURITY DEFINER`, `search_path` vacío, SQLSTATE propio
  `HC005`). Con `plantilla_id` nulo exige `datos_especialidad = '{}'`. Con plantilla, esta debe existir, **estar vigente al
  insertar** (un borrador conserva su plantilla aunque luego aparezca otra versión) y ser **de la especialidad del médico
  autor**. **Reconstruye** el objeto con solo las claves definidas y exige cada campo obligatorio con contenido (mismo
  criterio que `texto_con_contenido()`), el tipo, el rango, el largo y la pertenencia a `opciones`; un valor de otro tipo se
  rechaza, no se convierte. Su nombre ordena después de `atenciones_inmutables`, así que una atención firmada se rechaza
  antes de validar.
- **Inmutabilidad y huella.** Los datos son parte de la fila: al firmar quedan inmutables sin código adicional, y
  `plantilla_id` y `datos_especialidad` entran en la huella canónica de D5 desde su primera versión (`v1`). **Por eso la
  migración de D15 va antes que `sello-y-huella-de-atenciones`** (Migration Plan): introducir los campos después obligaría a
  una huella `v2` y a dos algoritmos de verificación.
- **Aplicación.** `lib/schemas/plantilla.ts` construye el esquema Zod (`.strict()`) a partir de la definición de campos, con
  mensajes en español y la misma regla de texto con contenido de D3. `FormularioAtencion` dibuja los campos con `Campo` (H2b),
  con errores por campo y sin vaciar lo escrito. El servidor **vuelve a leer** la plantilla vigente de la especialidad del
  médico bajo RLS y valida contra ella, nunca contra lo que diga el cliente. Una especialidad sin plantilla registra la
  atención con los campos genéricos y `plantilla_id` nulo.
- **Primera plantilla: Medicina general**, por migración de datos idempotente. Campos propuestos de la primera consulta de la
  NTS 139, numeral 5.2.1 (a validar con el personal médico, tarea 0.6): `tiempo_enfermedad` (obligatorio),
  `funciones_biologicas`, `examenes_auxiliares`, `referencia` y `proxima_cita`. **Sin signos vitales ni receta**: pertenecen
  a los seguimientos de triaje y recetas, que no se construyen aquí.
- **Regla común: `exige_profesion` (PRD del 2026-10-11; ADR-0030 y ADR-0036).** `plantillas_clinicas` gana la columna
  `exige_profesion profesion_salud null` (el tipo `profesion_salud` es de H2c: `medico`, `odontologo`, `fisioterapeuta`,
  `psicologo`, `podologo`; nula = cualquier profesión). El **mismo disparador** `atenciones_validar_datos_especialidad` la aplica
  junto a la regla de especialidad: si la plantilla tiene `exige_profesion` y no coincide con `public.profesion_actual()`, rechaza
  con `HC005` y un mensaje propio («Esta plantilla solo la usa un profesional de la profesión que corresponde»). La profesión se
  lee **solo** con `profesion_actual()` (H2c, el único punto de lectura): nunca viene del cliente ni del token. Así las cuatro
  especialidades (Odontología, Fisioterapia, Psicología y Podología) **no** crean disparadores propios para «solo un X usa la
  plantilla de X»: la migración de cada plantilla fija el dato `exige_profesion` y la validación ya existe. *Alternativa
  descartada:* un disparador por especialidad (cuatro disparadores casi idénticos que mantener, probar con pgTAP y revisar, para
  una regla que solo cambia en un dato). La plantilla de Medicina general queda con `exige_profesion` nula (la regla de
  especialidad ya la limita a quien tiene esa especialidad) salvo que el personal médico pida otra cosa (tarea 0.6). La
  migración de 2.8 asume que `profesion_salud` existe: H2c va antes que cualquier migración de H3 a H7.

*Alternativas descartadas:* (a) **una tabla por especialidad** (`atencion_odontologia`…): tipado fuerte, pero una migración,
una política RLS, una prueba negativa por rol y un cambio en `47` por cada especialidad, y ver «todas las atenciones de un
paciente» obliga a unir tablas; (b) **EAV** (`atencion_campos(atencion_id, clave, valor)`): validación y consultas pesadas y
una tabla clínica más que blindar; (c) **`jsonb` sin plantilla**: sin catálogo no hay contrato que validar y cualquier clave
pasaría; (d) **JSON Schema completo en la base** (extensión `pg_jsonschema`): obliga a sumar una extensión a Neon y el
subconjunto de tipos de arriba cubre lo necesario.

**Cuestión abierta (no se resuelve aquí).** Odontología, Fisioterapia, Psicología y Podología las atienden profesionales
colegiados que **no son médicos**, y el esquema de H2 asume «médico» (`medicos`, `atenciones.medico_id`,
`medico_tiene_paciente()`, `asignaciones_paciente_medico` y el rol `medico`). Generalizar a «profesional de salud» toca el
esquema ya en producción y la regla de roles de `CLAUDE.md`: exige decisión explícita del usuario, actualizar el PRD con la
skill `generar-prd-conversacional` y revisión con `code-review`. D15 no lo prejuzga: `plantillas_clinicas` cuelga de
`especialidades`, no de `medicos`, y la regla «plantilla de la especialidad del autor» se reescribe cuando exista el
concepto de profesional.

**Actualización del 2026-10-11.** La [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (H2c,
`profesionales-de-la-salud`) generaliza «médico» a «profesional de la salud» con `profesion` y `colegiatura`: entonces
«especialidad del autor» se lee de `profesionales.especialidad_id`, la profesión sale de `profesion_actual()` y la regla
`exige_profesion` de arriba cubre «solo un X usa la plantilla de X». Este change no se reescribe; D16 lista lo que cambiaría.

### D16. Reconciliación con el PRD del 2026-10-11 (notas, sin rediseño)

Los changes `profesionales-de-la-salud` (H2c), `triaje-y-derivacion` (H6b), `recetas-medicas` (H6c),
`copia-de-historia-clinica` (H6d) y `mecanismos-clinicos-comunes` (H6i) tocan lo que este change entrega. Ninguno cambia sus
decisiones; esto es lo que conviene tener presente al implementarlo.

- **Nombres (ADR-0030).** Este change conserva `medico`. Al aplicar H2c cambiarían: `exigirRol("medico")` (→ `profesional`),
  `app/medico/pacientes/**` (→ `app/profesional/pacientes/**`), `atenciones.medico_id` (→ `profesional_id`),
  `asignarPacienteAMedico`, `medico_tiene_paciente()` (→ `profesional_tiene_paciente()`, tarea 3.4), la prueba
  `47_estructura_historia` (columnas), `asignaciones_paciente_medico` (→ `asignaciones_paciente_profesional`) y la regla de
  plantilla de D15, que leería `profesionales.especialidad_id`. H2c va antes en el orden de merge; si no, se renombra al integrar.
- **Historia compartida y Psicología aparte (ADR-0031).** El profesional a cargo de cualquier especialidad ve la historia
  compartida del paciente; la información de Psicología queda aparte y la implementa `especialidad-psicologia`. Este change no la
  separa: allí se ajustan la lectura y las políticas, con su prueba negativa.
- **Triaje.** El triaje que el profesional lee al abrir la historia lo define `triaje-y-derivacion`; se integra en `abrirHistoria`
  (D2) sin cambiar el orden de sentencias (modo → acceso → lectura) y con su propio registro de acceso.
- **Recetas.** El panel de medicamentos de la historia lo entrega `recetas-medicas` (vista `medicamentos_vigentes_del_paciente`,
  tipos de acceso `receta` y `medicamentos`). Las recetas no se guardan en `datos_especialidad`.
- **Copia de la historia.** `copia-de-historia-clinica` añade el tipo de acceso `copia` y clasifica toda tabla clínica; la
  pantalla de revisión de accesos (tarea 4.5) filtra por **actor** (quien accedió, no solo el médico) y muestra las filas `copia`.
- **Unión de valores de `accesos_historia.tipo_acceso`.** La migración de 4.1 crea la restricción con `historia`, `atencion` y
  `adjunto`, y otros changes la amplían: `copia` (H6d), `receta` y `medicamentos` (H6c), `plan_sesiones` e `instrumento` (H6i) y
  `psicologia` (la separación de Psicología, ADR-0031). **Regla:** cada change lee la restricción vigente de la base de datos al
  escribir su migración y la recrea con la **unión** de los valores vigentes más los suyos; nunca copia la lista de otro change ni
  quita un valor. La prueba `56_accesos_historia_tipo` se actualiza en cada ampliación (añade sus valores a los permitidos; no se
  duplica).

## Risks / Trade-offs

- [El marcador `@demo.invalid` lo escribe quien registra al paciente; un administrativo podría ponérselo a un paciente real] →
  Es una barrera contra el error, no contra el abuso; el cambio de correo de un paciente queda en `auditoria`. En modo `real`
  la regla simétrica obliga a corregirlo. Defensa en profundidad: revisión de `code-review` y de seguridad antes de producción.
- [Registrar el acceso en la misma transacción añade una escritura por lectura y `accesos_historia` crecerá] → Índice por
  paciente y fecha ya existe; volumen de clínica pequeña; no se deduplica para no perder rastro. Si molesta, se particiona
  después (migración nueva).
- [`medico_tiene_paciente()` es la función central y se reemplaza] → Misma firma, solo se añade una condición; toda la suite
  pgTAP de acceso corre completa y se verifica por mutación; revisión explícita.
- [Un huérfano de Blob (subido sin registrar) no es accesible pero ocupa espacio] → Su clave solo existe en el navegador de
  quien lo subió; no se borra automáticamente (retención sin definir); revisar la cuota del plan de Blob antes de H8.
- [Vercel Blob privado / subida directa puede no existir como lo supone ADR-0024] → Tarea 0.3 antes de escribir código; si falla,
  se detiene el grupo 9 y se consulta.
- [El disparador de diagnósticos reescribe el `jsonb`] → Es determinista, está probado con pgTAP e ignora vacíos/no arreglos
  para no pisar los `CHECK` de H2.
- [Sin autoguardado se pierde lo escrito si la sesión caduca] → Decisión consciente (D9); mitigaciones y medición en la prueba de usabilidad.
- [La recepción no confirma la cita y el médico no accede el día de la consulta] → D13: el acceso depende de la confirmación de recepción (H3); la asignación manual es la vía de excepción y la pantalla explica por qué la historia no está habilitada.
- [El botón «Marcar cita como atendida» llama a una acción de H3 cuyo nombre y contrato aún no existen] → La integración se limita a esa llamada y a mostrar su mensaje; se acuerda en la tarea 0.7 y, si H3 no la entrega, se omite el botón sin afectar la firma.
- [Los requisitos de este change solapan con `integridad-historia-clinica` y `aislamiento-por-rol-rls` del change de H2 aún no
  archivado] → Este change los refina (no los contradice). Al archivar, la guía de `config.yaml` exige comprobar que no se
  contradigan; si el solapamiento se vuelve un conflicto de nombres de requisito se renombra aquí.
- [El número de las ADR nuevas puede chocar con las de otros changes en paralelo] → Se asigna el siguiente libre al crearlas
  (la 0029 ya la ocupa la ADR de datos por especialidad; las demás, el siguiente libre); no se fijan en los textos.
- [Los datos de Clerk (identidad) y la región de Neon quedan fuera del bloqueo técnico] → Van en la consulta legal de P-1.
- [La definición de campos de una plantilla es un `jsonb` y su validador en SQL es código que mantener] → Subconjunto mínimo
  de tipos (D15), probado con pgTAP por tipo y por rol y revisado con `code-review`; una plantilla nueva es siempre una
  migración, nunca un dato que un usuario pueda editar.
- [Un médico podría necesitar la plantilla de otra especialidad (interconsulta, cobertura)] → La regla «plantilla de la
  especialidad del autor» es estricta a propósito; se relaja con una migración si el personal médico lo pide.
- [Los campos de la plantilla de Medicina general se proponen desde la NTS 139 sin validación clínica] → Tarea 0.6: validar
  con el personal médico antes de fijar la migración; sin acceso, queda como supuesto escrito.

## Migration Plan

1. Grupo 0: ADR, verificación de Blob, fuente CIE-10 y revisión con el personal médico; decisiones documentadas antes de código.
2. Migraciones nuevas en este orden (cada una con su prueba): modo de datos clínicos → carga de `cie10` → validación de
   diagnósticos → plantillas clínicas y datos de especialidad (D15; antes de la huella, que los cubre) → sello, huella y coherencia de cita → `medico_tiene_paciente()` con perfil activo → tipo de acceso →
   asignaciones manuales → `adjuntos_historia` → indicador. Nunca se edita una migración aplicada.
3. Suite pgTAP, concurrencia e integración completas en un branch de desarrollo; PR con branch efímero y los mismos pasos.
4. Aplicación: primero lógica y repositorio, luego pantallas cuando H2b esté aplicado.
5. Merge a `master`: `migrar-produccion.yml` aplica las migraciones; el modo queda en `demostracion` y `CLINICA_MODO_DATOS` se
   define como `demostracion` en Production y Preview de Vercel. Sembrar datos de demostración en producción sigue siendo una
   acción explícita del usuario.
6. **Rollback:** sin marcha atrás destructiva (ADR-0027). Un defecto se corrige con una migración nueva; está prohibido
   restaurar el branch principal de Neon. Las funciones de la aplicación se desactivan con `CLINICA_MODO_DATOS` distinto del
   modo de la base (falla cerrado).

## Open Questions

Ninguna cambia las especificaciones, el enfoque ni el desglose de tareas; se pueden responder durante la implementación.

- **Tipos de diagnóstico** (`presuntivo`/`definitivo`/`repetitivo`) y **categorías de antecedentes** (las cinco de ADR-0015,
  ¿falta p. ej. gineco-obstétrico?): confirmar con el personal médico (tarea 0.5). Un tipo nuevo es un `ALTER TYPE` o un ajuste
  del disparador, no un rediseño.
- **Quién escanea y sube los adjuntos:** el administrativo no puede ver contenido clínico, así que sube el médico; impacto en
  la velocidad de H8. ¿Se admiten imágenes además de PDF? Tamaño máximo y cuota del plan de Blob.
- **Intentos denegados** (un médico que prueba historias ajenas): hoy solo se registran en el log del servidor sin contenido.
  ¿Se quiere un registro en la base (requeriría una función `SECURITY DEFINER` que escriba aunque RLS lo niegue)?
- **Borradores de otro médico** (H9): ¿deben ser visibles para el resto de médicos a cargo? Cambiarlo requiere ajustar la
  política y la prueba `43`.
- **Retención, eliminación física de adjuntos anulados o huérfanos, derechos del paciente a copia de su historia, y
  conservación de huellas:** dependen de P-1 y se llevan a la consulta legal; el PRD hoy excluye el acceso del paciente.
- **Lista de problemas CIE-10 con estado** para historias migradas (D12) y **presentación del indicador** de digitalización (H7/H8).
- **Límites numéricos** de D3 y del adjunto, y si la categoría CIE-10 de 3 caracteres con subdivisiones puede elegirse.
- **Profesionales que no son médicos** (D15): Odontología, Fisioterapia, Psicología y Podología. ¿Se generaliza `medicos` a
  «profesional de salud» (con colegiatura y tipo)? Toca producción, la regla de roles y el PRD: decisión del usuario y del
  cliente antes de cualquier plantilla de esas especialidades.
  *Respondida el 2026-10-11:* la ADR-0030 (H2c) generaliza «médico» a «profesional de la salud»; ver D15 y D16.
- **Campos de la plantilla de Medicina general** y **qué otras plantillas** hacen falta (D15): validar con el personal médico
  (tarea 0.6). También, qué hacer en una interconsulta con la regla «plantilla de la especialidad del autor».
- **Recetas y triaje** (seguimientos pedidos por el usuario): cada uno es un change propio; el triaje amplía el permiso de la
  enfermera y reabre la regla de roles. Ver `proposal.md`, «Impact».
  *Respondida el 2026-10-11:* son los changes `recetas-medicas` (H6c) y `triaje-y-derivacion` (H6b); el PRD y la regla de roles ya se actualizaron.
