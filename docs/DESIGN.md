---
version: alpha
name: Clínica — Citas e Historias Clínicas
description: >-
  Sistema de diseño de la plataforma de citas médicas e historias clínicas electrónicas. Sereno y confiable para el
  paciente, denso y rápido para el personal. Una sola marca (verde azulado clínico) y colores semánticos para los
  estados de la cita.
colors:
  primary: "#0F766E"
  primary-dark: "#115E59"
  primary-soft: "#E6F4F1"
  primary-text: "#0B5C55"
  on-primary: "#FFFFFF"
  ink: "#14262B"
  ink-muted: "#4A5C63"
  canvas: "#F4F7F7"
  surface: "#FFFFFF"
  surface-muted: "#EAF0F0"
  border: "#CBD6D9"
  border-control: "#6F8087"
  success: "#146B32"
  success-soft: "#E3F4E8"
  warning: "#9A5B00"
  warning-soft: "#FFF3D6"
  error: "#B42318"
  error-soft: "#FDE8E6"
  info: "#1D4ED8"
  info-soft: "#E3EBFD"
  neutral-state: "#475467"
  neutral-state-soft: "#EAECF0"
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: 700
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: 700
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: 600
    lineHeight: 30px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: 600
    lineHeight: 26px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  label-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 600
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 6px
  md: 10px
  lg: 16px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
shadows:
  shadow-popover: "0 8px 24px rgb(20 38 43 / 12%)"
  shadow-dialog: "0 16px 40px rgb(20 38 43 / 18%)"
  focus-ring: "0 0 0 2px {colors.surface}, 0 0 0 4px {colors.primary}"
motion:
  ease-salida-rapida: "cubic-bezier(0.23, 1, 0.32, 1)"
  ease-cajon: "cubic-bezier(0.32, 0.72, 0, 1)"
  press: 120ms
  toast-in: 240ms
  toast-out: 140ms
  popover-in: 180ms
  popover-out: 120ms
  sheet-in: 320ms
  sheet-out: 220ms
  dialog-in: 220ms
  dialog-out: 140ms
  backdrop-in: 200ms
  backdrop-out: 140ms
  step-in: 220ms
  list-in: 260ms
  list-stagger: 40ms
  skeleton: 1400ms
  reduced: 150ms
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    height: 44px
    padding: 12px 20px
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary-text}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    height: 44px
    padding: 12px 20px
  button-destructive:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    height: 44px
    padding: 12px 20px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 44px
    padding: 10px 14px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 24px
  nav-item-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-text}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 8px 12px
  table-header:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label-md}"
    padding: 10px 16px
  badge-reservada:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.info}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 4px 10px
  badge-confirmada:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 4px 10px
  badge-atendida:
    backgroundColor: "{colors.neutral-state-soft}"
    textColor: "{colors.neutral-state}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 4px 10px
  badge-cancelada:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.error}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 4px 10px
  badge-no-asistio:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 4px 10px
  alert-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 16px
  alert-error:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.error}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 16px
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px 16px
---

## Overview

La plataforma reemplaza Excel, Google Forms y el papel de una clínica en Perú. Tiene tres usos muy distintos y el diseño
los atiende con **un solo sistema y dos densidades**:

| Superficie | Quién | Qué necesita | Densidad |
|---|---|---|---|
| **Portal del paciente** | Paciente | Reservar y cancelar su cita sin ayuda (meta: 75 % de las citas por el portal) | Aireada: una tarea por pantalla, texto de 18 px, controles de 48 px |
| **Consola del personal** | Administrativo, enfermera | Ver y mover la agenda rápido; tablas y filtros | Compacta: texto de 14 px, filas de 40 px, solo con puntero |
| **Historia clínica** | Médico | Cargar una atención en pocos minutos, sin errores | Media: formulario estructurado, acción de guardar siempre visible |

**Personalidad:** serena, clara y confiable. Un verde azulado clínico como única marca (transmite salud sin el rojo de
«alarma» ni el azul genérico de «banco»), neutros con un matiz verdoso muy suave y color solo cuando significa algo: el
estado de una cita, un aviso, un error. Sin ilustraciones decorativas en las pantallas de trabajo.

**Reglas que el diseño debe hacer visibles** (de [CLAUDE.md](../CLAUDE.md) y [PRD.md](PRD.md)):

- Al reservar se muestra la advertencia de que solo se puede cancelar hasta **1 hora antes** (`alert-warning`).
- El rechazo de doble reserva se muestra con el texto exacto `Registro de cita ya agendado` (`alert-error`).
- En la historia clínica, los datos que vienen del registro del paciente son **de solo lectura** y se ven como tales.
- Una atención firmada es inmutable y se ve como tal (etiqueta «Firmada» con candado; la corrección es una addenda).
- Fechas y horas siempre en `America/Lima`: `dd/MM/yyyy` y `HH:mm` de 24 horas (por ejemplo, `08/10/2026 14:30`).
- Todo texto de interfaz y mensaje de error en español. Al paciente se le habla de **usted**; en la consola del personal
  se usan frases cortas en infinitivo o imperativo («Reprogramar», «Guardar atención»).

## Colors

Una marca, neutros y cuatro colores semánticos. Los valores de la cabecera son normativos; esta tabla explica cuándo usarlos.
Todos los pares texto/fondo de abajo cumplen **WCAG 2.1 AA** (contraste calculado el 2026-10-08).

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `primary` | `#0F766E` | Acción principal (un solo botón primario por pantalla), enlaces, foco | 5,47 : 1 con blanco |
| `primary-dark` | `#115E59` | Hover y pulsado del botón primario | 7,58 : 1 con blanco |
| `primary-soft` | `#E6F4F1` | Fondo del ítem de navegación activo y de selecciones | — |
| `primary-text` | `#0B5C55` | Texto sobre `primary-soft` y botón secundario | 6,94 : 1 con `primary-soft` |
| `ink` | `#14262B` | Texto principal | 15,65 : 1 con blanco |
| `ink-muted` | `#4A5C63` | Texto secundario, ayudas, cabeceras de tabla | 6,99 : 1 con blanco |
| `canvas` | `#F4F7F7` | Fondo de página | — |
| `surface` | `#FFFFFF` | Tarjetas, formularios, tablas | — |
| `surface-muted` | `#EAF0F0` | Cabecera de tabla, zonas de solo lectura | — |
| `border` | `#CBD6D9` | Divisores y bordes **decorativos** | 1,48 : 1 (no basta para controles) |
| `border-control` | `#6F8087` | Borde de campos, casillas y selectores | 4,11 : 1 con blanco |
| `success` / `-soft` | `#146B32` / `#E3F4E8` | Confirmada, envío correcto | 5,78 : 1 |
| `warning` / `-soft` | `#9A5B00` / `#FFF3D6` | Avisos, «No asistió» | 4,92 : 1 |
| `error` / `-soft` | `#B42318` / `#FDE8E6` | Errores, cancelada, acciones destructivas | 5,59 : 1 |
| `info` / `-soft` | `#1D4ED8` / `#E3EBFD` | Reservada, mensajes informativos | 5,61 : 1 |
| `neutral-state` / `-soft` | `#475467` / `#EAECF0` | Atendida, estados neutros | 6,50 : 1 |

**Estados de cita** (coinciden con el tipo `estado_cita` de la base de datos):

| Estado | Color | Etiqueta | Icono |
|---|---|---|---|
| `reservada` | `info` | Reservada | reloj |
| `confirmada` | `success` | Confirmada | check |
| `atendida` | `neutral-state` | Atendida | check doble |
| `cancelada` | `error` | Cancelada | X |
| `no_asistio` | `warning` | No asistió | persona con signo de pausa |

El estado **nunca** se comunica solo con el color: siempre lleva etiqueta de texto e icono.

## Typography

Dos familias gratuitas, servidas con `next/font/google` (autoalojadas, sin pedir nada a un tercero al cargar la página),
con soporte completo del español (`á é í ó ú ü ñ ¿ ¡`):

- **Plus Jakarta Sans** (700/600): títulos. Geométrica y cálida, en la línea de las tipografías de One Medical (Ginto) y
  Clínica Internacional (General Sans).
- **Inter** (400/600): cuerpo, formularios y tablas. Es la más legible a tamaños pequeños y trae cifras tabulares, que
  alinean DNI, horas y códigos CIE-10.

| Token | Tamaño / interlineado | Uso |
|---|---|---|
| `display-lg` | 36 / 44 | Título de la pantalla de inicio del portal |
| `headline-lg` | 28 / 36 | Título de pantalla |
| `headline-md` | 22 / 30 | Título de sección |
| `title-md` | 18 / 26 | Título de tarjeta |
| `body-lg` | 18 / 28 | **Texto base del portal del paciente** |
| `body-md` | 16 / 24 | Texto base de formularios y de la historia clínica |
| `body-sm` | 14 / 20 | Tablas y consola del personal |
| `label-lg` | 16 semibold | Botones |
| `label-md` | 14 semibold | Etiquetas de campo, cabeceras de tabla, navegación |
| `label-sm` | 12 semibold | Insignias de estado (nunca texto corrido) |

- Cifras tabulares (`font-variant-numeric: tabular-nums`) en tablas, agenda, DNI y códigos.
- Largo de línea máximo de 70 caracteres en texto corrido. Sin texto en mayúsculas sostenidas ni cursivas largas.
- El navegador puede ampliar el texto hasta 200 % sin perder contenido ni funciones (por eso las medidas de la
  cabecera están en `px` solo como referencia; en Tailwind se usan `rem`).

## Layout

- **Base de 4 px**; escala `xs 4 · sm 8 · md 16 · lg 24 · xl 32 · 2xl 48`.
- **Portal del paciente:** una columna de hasta 640 px, centrada, con tarjetas apiladas; navegación inferior de 3 destinos en
  móvil (Inicio, Mis citas, Reservar). Se diseña primero para móvil.
- **Consola del personal:** barra lateral de 240 px (colapsable) + área de contenido de hasta 1280 px. Tablas con filas de
  40 px, filtros arriba, acciones masivas en una barra fija. Pensada para escritorio.
- **Historia clínica:** dos zonas: la ficha del paciente (solo lectura) a un lado o arriba y el formulario de la atención
  como contenido principal; la barra con «Guardar» queda fija al pie.
- **Puntos de quiebre:** `sm 640`, `md 768`, `lg 1024`, `xl 1280` (los de Tailwind).
- **Objetivos táctiles:** ≥ 44 × 44 px en el portal (48 px en la acción principal); la consola de escritorio puede bajar a
  36 px, nunca menos de 24 px (WCAG 2.2, 2.5.8).

## Elevation & Depth

Plano por defecto: la jerarquía la dan el color de fondo y el borde, no la sombra.

| Nivel | Uso | Tratamiento |
|---|---|---|
| 0 | Página | `canvas` |
| 1 | Tarjetas, tablas, formularios | `surface` con borde `border` de 1 px; sin sombra |
| 2 | Menús desplegables, selectores de fecha | `0 8px 24px rgb(20 38 43 / 12%)` |
| 3 | Diálogos | `0 16px 40px rgb(20 38 43 / 18%)` con velo `rgb(20 38 43 / 40%)` |

## Motion

Aprobado el 2026-10-18 en la revisión visual ([BRIEF-DISENO.md](diseno/BRIEF-DISENO.md), sección 6) y fijado aquí el
2026-10-19. Es una herramienta de trabajo: el movimiento es corto, responde de inmediato y solo explica un cambio de estado.
**Solo se animan `transform` y `opacity`.** Los valores de la cabecera (`motion`) son normativos; `npm run tema` los expone
como `--ease-*` (las curvas, que Tailwind usa como `ease-salida-rapida` y `ease-cajon`) y `--motion-*` (las duraciones).

| Elemento | Entra | Sale | Curva | Propiedades | Token |
|---|---|---|---|---|---|
| Pulsar botón, horario, día | 120 ms | 120 ms | salida rápida | escala 0,97 y color | `press` |
| Aviso temporal | 240 ms | 140 ms | salida rápida | traslación de 8 px y opacidad | `toast-in` / `toast-out` |
| Calendario flotante (escritorio) | 180 ms | 120 ms | salida rápida, origen en el campo | escala desde 0,96 y opacidad | `popover-in` / `popover-out` |
| Hoja inferior (móvil) | 320 ms | 220 ms | cajón | traslación vertical | `sheet-in` / `sheet-out` |
| Diálogo de confirmación | 220 ms | 140 ms | salida rápida, centrado | escala desde 0,96 y opacidad | `dialog-in` / `dialog-out` |
| Velo del diálogo | 200 ms | 140 ms | salida rápida | opacidad | `backdrop-in` / `backdrop-out` |
| Cambio de paso | 220 ms | — | salida rápida | traslación de 16 px y opacidad | `step-in` |
| Lista (al aparecer) | 260 ms + 40 ms por fila (máximo 6) | — | salida rápida | traslación de 8 px y opacidad | `list-in`, `list-stagger` |
| Esqueleto de carga | ciclo de 1,4 s | — | lineal | brillo que recorre el bloque (traslación) | `skeleton` |

Curvas: **salida rápida** `cubic-bezier(0.23, 1, 0.32, 1)` y **cajón** `cubic-bezier(0.32, 0.72, 0, 1)`.

- Nada dura más de **320 ms** (salvo el ciclo del esqueleto, que es un bucle) y **salir es más rápido que entrar**. Las dos
  reglas las comprueba `npm run tema:comprobar` (también en CI).
- Las acciones repetidas con teclado no se animan; las animaciones que siguen al cursor solo existen con puntero.
- Las transiciones son interrumpibles (se reorientan al estado nuevo), no secuencias fijas.
- **Reducir movimiento** (`prefers-reduced-motion`): se eliminan traslaciones y escalas y queda un fundido de `reduced`
  (150 ms). Los componentes aplican `transform` solo con `motion-safe:`; además, `app/globals.css` acota por defecto toda
  animación y transición a esos 150 ms y detiene los bucles.
- **Esqueleto de carga:** un bloque de `surface-muted` que un brillo lineal de `canvas` recorre de izquierda a derecha cada
  1,4 s (decisión del propietario, 2026-10-19). El brillo es un degradado entre tokens que se desplaza con `transform`: no se
  anima `background-position`, para mantener «solo `transform` y `opacity`». Con «Reducir movimiento» el brillo no se muestra y
  queda el bloque fijo. Se usa con la clase `.esqueleto` de `app/globals.css`; el redondeo lo pone cada uso, igual que la forma
  del contenido al que sustituye.
- `npm run tema:comprobar` también falla si un `@keyframes` de `app/` anima algo que no sea `transform` u `opacity`.

## Shapes

Esquinas redondeadas y amables, sin exagerar: `sm 6` (insignias de tabla, chips compactos), `md 10` (botones, campos,
alertas), `lg 16` (tarjetas, diálogos), `full` (insignias de estado y avatares). Las clínicas de referencia usan radios
grandes (16–36 px); aquí se mantienen en 16 px como máximo para que la consola del personal no parezca juguete.

Anillo de foco visible en todo elemento interactivo: 2 px de `primary` con 2 px de separación sobre el fondo; contraste ≥ 3 : 1.

## Components

La base es **shadcn/ui** sobre **Tailwind CSS v4** ([ADR-0004](adrs/0004-stack-de-frontend-y-validacion.md)); los tokens
de la cabecera se mapean a las variables de shadcn:

| Variable de shadcn/ui | Token |
|---|---|
| `--background` | `canvas` |
| `--foreground` | `ink` |
| `--card`, `--popover` | `surface` |
| `--primary` / `--primary-foreground` | `primary` / `on-primary` |
| `--secondary` / `--secondary-foreground` | `primary-soft` / `primary-text` |
| `--muted` / `--muted-foreground` | `surface-muted` / `ink-muted` |
| `--accent` | `primary-soft` |
| `--destructive` | `error` |
| `--border` | `border` |
| `--input` | `border-control` |
| `--ring` | `primary` |
| `--radius` | `rounded.md` |

Reglas de los componentes principales:

- **Botón:** un solo primario por pantalla. El secundario es blanco con borde `border-control` y texto `primary-text`.
  Destructivo (`error`) solo para cancelar una cita, y siempre con confirmación. Estado de carga con texto («Reservando…»),
  no solo un indicador giratorio; el botón se deshabilita mientras se envía para evitar doble reserva por doble clic.
- **Campo de formulario:** etiqueta visible **encima** (nunca solo `placeholder`), ayuda debajo en `ink-muted`, error debajo
  en `error` con icono y asociado al campo (`aria-describedby`). Borde `border-control`; el error cambia el borde a `error`.
  Los campos de solo lectura usan `surface-muted`, sin borde de control y con la etiqueta «Solo lectura».
- **Documento de identidad:** selector DNI / Carné de Extranjería; el campo valida el formato de cada uno y muestra el
  formato esperado como ayuda (DNI: 8 dígitos).
- **Insignia de estado:** `badge-<estado>` con etiqueta e icono (ver Colors).
- **Tabla (consola):** cabecera `table-header`, fila de 40 px, cifras tabulares, fila entera clicable además de un botón
  accesible por teclado, y estado vacío con una frase y la acción siguiente.
- **Selector de horario (portal):** botones de hora de 48 px en cuadrícula; el horario ocupado se ve deshabilitado **y** con
  texto «No disponible». Al elegir uno aparece la advertencia de cancelación de 1 hora antes de confirmar.
- **Alertas:** `alert-warning` (advertencia de cancelación), `alert-error` (rechazos, con `role="alert"`), siempre con icono
  y texto; las confirmaciones usan un aviso temporal (`toast`: fondo `ink`, texto `surface`, contraste 15,65 : 1) con
  `role="status"` que no roba el foco, y se mueve como indica «Motion».
- **Atención firmada:** bloque con etiqueta «Firmada» y candado, fecha y autor; sin botón de editar. «Agregar addenda» es
  la única acción de corrección.
- **Estados vacíos y de carga:** esqueletos con la forma del contenido (un brillo los recorre, ver «Motion»), no un indicador
  giratorio a pantalla completa.

## Do's and Don'ts

**Sí**
- Cumplir WCAG 2.1 AA: contraste, foco visible, navegación completa por teclado, etiquetas en todos los controles, y
  mensajes de error que dicen qué pasó y cómo corregirlo.
- Un solo botón primario por pantalla y la acción principal del portal («Reservar cita») siempre a un toque del inicio.
- Mostrar siempre el nombre del médico, el servicio, la fecha y la hora (en `America/Lima`) antes de confirmar una cita.
- Usar los textos y etiquetas del dominio en español: «cita», «historia clínica», «atención», «addenda», «turno».
- Probar el portal con lector de pantalla y a 200 % de zoom antes de darlo por terminado.

**No**
- No usar el color como único portador de significado (estado, error, disponibilidad).
- No ocultar la advertencia de cancelación ni acortar el mensaje `Registro de cita ya agendado`.
- No mostrar datos clínicos en notificaciones, títulos de pestaña, URLs ni mensajes de error.
- No usar modo oscuro como requisito de esta versión: queda fuera de alcance salvo que el cliente lo pida.
- No añadir gráficos, paneles analíticos ni ilustraciones decorativas en la consola: el dashboard es una vista operativa
  (agenda y estado), no un módulo de analítica ([CLAUDE.md](../CLAUDE.md), «Alcance»).
- No copiar de ninguna referencia su identidad (logotipo, ilustraciones, textos): solo se toman principios.

## Referencias de mercado

Medidas el 2026-10-08 sobre el CSS público de cada sitio (frecuencia de colores y tipografías declaradas); son una
aproximación para orientar el criterio, no una reproducción. Zocdoc y Pacífico Seguros bloquearon la lectura automática y no
se analizaron.

| Referencia | Qué se observó | Qué se toma | Qué no |
|---|---|---|---|
| [Doctoralia Perú](https://www.doctoralia.pe) (reserva de citas, mercado local) | Violeta `#6350a4` con acento verde azulado `#007c68`, neutros cálidos, elementos en píldora (radio 999 px) | Calidez, filtros en píldora, verde azulado como apoyo | El violeta como marca |
| [One Medical](https://www.onemedical.com) (atención primaria) | Verde azulado profundo `#004d49`/`#005450`, verde `#068466`, acentos lima y amarillo cálido, radios de 28–36 px, serif de títulos | El verde azulado como señal de salud y de confianza | Los radios enormes y la serif de títulos |
| [Clínica Internacional](https://www.clinicainternacional.com.pe) (clínica peruana) | Azul vivo `#295bff`, azul marino `#2b304e`, acento rosa, radios de 16–32 px, General Sans | El azul como código local de «información» | El azul como color de marca |
| [Linear](https://linear.app) (producto de trabajo denso) | Neutros fríos (`#e2e4e7`, `#2e2e32`), radios pequeños (5–6 px), acentos de color puntuales | Densidad y sobriedad para la consola del personal | Sus acentos rosa y cian |

Formato y fuentes del sistema: [especificación DESIGN.md de Google](https://github.com/google-labs-code/design.md) (alpha,
Apache 2.0) y su catálogo comunitario [getdesign.md](https://getdesign.md) (más de 550 diseños de sitios conocidos, casi todos
de software; sin referentes de salud).

## Cómo se usa este documento

1. Los tokens de la cabecera son la fuente de verdad. Los componentes nuevos se diseñan con ellos y con los textos de arriba.
2. Para generar el tema de Tailwind v4 (`@theme` en `app/globals.css`) y comprobar el contraste, la especificación ofrece
   `npx @google/design.md export --format css-tailwind docs/DESIGN.md` y `npx @google/design.md lint docs/DESIGN.md`.
3. Cualquier cambio de color o tipografía se hace aquí primero y se propaga al código con `npm run tema`; no al revés.
   Los grupos `shadows` (menú, diálogo y anillo de foco) y `motion` (curvas y duraciones) de la cabecera no están definidos
   por el formato alpha: el generador del tema los lee igualmente y `npm run tema:comprobar` falla si el CSS se separa de este
   archivo o si el movimiento rompe sus reglas (máximo 320 ms; salir más rápido que entrar).
4. Los valores `px` de la tipografía son de referencia; el código usa `rem` para respetar el tamaño de texto del usuario.
