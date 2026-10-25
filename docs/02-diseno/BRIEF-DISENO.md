# Brief de diseño de la interfaz (aprobado el 2026-10-18)

Registro de lo que se aprobó en la revisión visual: qué pantallas existen, para quién, cómo se comportan y cómo se mueven. Es el
puente entre el sistema de diseño ([DESIGN.md](DESIGN.md), que define *cómo se ve*) y las pantallas de los hitos H3 a H7
(que definen *qué hacen*, en `openspec/changes/`). Lo visual vive en el lienzo de [lienzo/](lienzo/); este documento explica
lo que el lienzo no puede decir.

## 1. Decisiones aprobadas

| Tema | Decisión | Quién |
|---|---|---|
| Aprobación de los diseños | La da el propietario del proyecto, solo | Propietario |
| Marca | No hay marca real: toda pantalla lleva la etiqueta **DEMO** junto al nombre «Citas Médicas». Se retira cuando exista la marca de la clínica | Propietario |
| Identidad visual | Sin cambios sobre [DESIGN.md](DESIGN.md): verde azulado `#0F766E`, Plus Jakarta Sans + Inter, tema claro único, «usted» | Aprobado |
| Movimiento | Se aprueba la propuesta de la sección 6 (no estaba en DESIGN.md) | Aprobado |
| Pantallas de referencia | Las nueve del lienzo (sección 3) | Aprobado |

Todo dato del lienzo es ficticio y sigue la convención de [datos-demo.md](../07-testing/datos-demo.md): documentos `99…`, correos
`@demo.invalid`, «ahora» fijo el 10/10/2026 a las 10:00 de Lima.

## 2. Contexto y superficies

El sistema reemplaza Excel, Google Forms y el papel de una clínica en Perú. Metas a 4–5 meses: 75 % de las citas reservadas o
canceladas por el propio paciente, 60 % de historias clínicas digitalizadas y espera ≤ 20 minutos
([CLAUDE.md](../../CLAUDE.md)). Un solo sistema con tres densidades:

| Superficie | Quién | Qué necesita | Densidad y formato |
|---|---|---|---|
| Portal del paciente | Paciente | Reservar y cancelar sin ayuda | Aireada, una tarea por pantalla, texto de 18 px, controles de 48 px, móvil 390 px, navegación inferior de 3 destinos |
| Consola del personal | Administrativo (y enfermera) | Mover la agenda rápido | Compacta, texto de 14 px, filas de 40 px, controles de 36 px, escritorio 1280 px, barra lateral de 240 px |
| Historia clínica | Médico | Cargar una atención en pocos minutos, sin errores | Media, texto de 16 px, ficha de solo lectura al lado, guardar siempre visible |

## 3. Pantallas aprobadas

El lienzo tiene tres láminas de fundamentos y seis pantallas; todas son interactivas. Cada pantalla se implementa con los
componentes de `components/clinica/` (llegan con H2b) y los tokens del tema; el CSS del lienzo (`clinica.css`) es
solo para la revisión y **no** se copia a la aplicación.

| Lámina | Qué demuestra | Se implementa en |
|---|---|---|
| 1 · Fundamentos (`Main`) | Paleta con contrastes, tipografías, esquinas, espaciado, sombras, foco, estados de cita | Ya en H2b ([DESIGN.md](DESIGN.md)) |
| 2 · Componentes (`Componentes`) | Botones y sus estados, campos con validación (DNI / Carné de Extranjería), alertas, insignias, selector de horario, navegación, esqueleto y estado vacío | H2b y los componentes nuevos de la sección 5 |
| 3 · Movimiento (`Movimiento`) | Laboratorio de transiciones con cámara lenta y «Reducir movimiento» | Sección 6 |
| Portal · Inicio | Próxima cita, acción principal «Reservar cita», navegación inferior | H4 (`portal-del-paciente`) |
| Portal · Reservar cita | Pasos especialidad → médico → fecha y horario; calendario como **hoja inferior**; resumen y advertencia de cancelación antes de reservar; choque «Registro de cita ya agendado»; éxito | H4 |
| Portal · Mis citas | Próximas y anteriores; cancelar con confirmación; «ya no puede cancelarla» cuando falta menos de 1 hora; aviso temporal | H4 |
| Consola · Agenda del día | Tabla con huecos libres intercalados; selector de fecha como **menú flotante**; confirmar, «No asistió», cancelar y agendar con diálogo; acciones según estado y hora | H3 (10.1 a 10.4) |
| Consola · Pacientes | Buscar por documento exacto o inicio de apellidos; registrar con errores por campo y documento duplicado | H3 (8.3) |
| Médico · Atención | Ficha de solo lectura, triaje, diagnóstico CIE-10, resumen de errores, atención firmada y addenda | H6 (el contenido clínico es **provisional** hasta diseñar el módulo) |

## 4. Reglas del dominio que las pantallas hacen visibles

- Al agendar se muestra, antes del botón de confirmar, la advertencia de que solo se puede cancelar hasta 1 hora antes, **con la
  hora límite** (cita a las 14:30, límite 13:30). Con menos de 1 hora de anticipación dice que esa cita ya no podrá cancelarse.
- La doble reserva se muestra con el texto exacto `Registro de cita ya agendado`, sin reformular.
- Cancelar siempre pide confirmación; con menos de 1 hora el botón queda deshabilitado **y explica por qué**.
- Antes de confirmar una reserva se ven médico, especialidad, fecha y hora (hora de Lima).
- Confirmar y «No asistió» las hace la recepción; «Atendida» la marca el médico. «No asistió» solo se ofrece si la hora ya empezó.
- Los datos que vienen del registro del paciente son de solo lectura (etiqueta «Solo lectura»). Una atención firmada no se edita:
  se corrige con una addenda.
- El documento es DNI (8 dígitos) o Carné de Extranjería (9 a 12 letras y números) y el campo muestra el formato esperado.
- Fechas `dd/MM/yyyy`, horas de 24 h, siempre en `America/Lima`. Todo en español, «usted» al paciente.
- El estado de una cita nunca va solo con color: lleva icono y texto.
- Un error dice qué pasó y cómo corregirlo, junto al campo y, en formularios largos, con un resumen enlazado arriba.

## 5. Componentes que el lienzo muestra y el sistema aún no tiene

Para crear en H3 y H4 (con `components/clinica/` y shadcn/ui; el diálogo con el elemento nativo `<dialog>`, decisión de H3):

1. **Selector de fecha** (calendario): menú flotante en escritorio y hoja inferior en móvil; domingos y días sin horarios
   deshabilitados, punto en los días con horarios, hoy con borde.
2. **Aviso temporal** (`role="status"`, no roba el foco).
3. **Control segmentado** (tipo de documento, sexo, filtros).
4. **Diálogo de confirmación** (cancelar, «No asistió», agendar).
5. **Esqueleto de carga** con la forma del contenido.
6. **Chip de diagnóstico** removible y lista de sugerencias CIE-10.
7. **Etiqueta DEMO** (provisional).

Detalles que el lienzo resolvió por rapidez y que DESIGN.md no cubría (resueltos el 2026-10-19 al fijar el movimiento):

- **Esqueleto:** se conserva el **brillo** del lienzo (decisión del propietario, 2026-10-19). DESIGN.md no prohíbe los
  gradientes con esas palabras, y el principio «solo `transform` y `opacity`» se mantiene porque el brillo es un degradado de
  tokens (`surface-muted` y `canvas`) que se desplaza con `transform`, en vez de animar `background-position` como hacía el
  lienzo. Se ve igual. Clase `.esqueleto` en `app/globals.css`; con «Reducir movimiento» queda el bloque fijo.
- **Aviso temporal:** fondo `ink` con texto `surface` (15,65:1), ya añadido a DESIGN.md como componente `toast`.
- «Próximamente» en la navegación de la consola para Horarios y Bajas médicas hasta que existan (sigue pendiente; se resuelve
  en H3 al construir esas rutas).

## 6. Movimiento aprobado

Principio: es una herramienta de trabajo, así que el movimiento es corto, responde de inmediato y solo explica un cambio de
estado. Solo se anima `transform` y `opacity`. Curvas: salida rápida `cubic-bezier(0.23, 1, 0.32, 1)` y cajón
`cubic-bezier(0.32, 0.72, 0, 1)`.

| Elemento | Entra | Sale | Curva | Propiedades |
|---|---|---|---|---|
| Pulsar botón, horario, día | 120 ms | 120 ms | salida rápida | escala 0,97 y color |
| Aviso temporal | 240 ms | 140 ms | salida rápida | traslación de 8 px y opacidad |
| Calendario flotante (escritorio) | 180 ms | 120 ms | salida rápida, origen en el campo | escala desde 0,96 y opacidad |
| Hoja inferior (móvil) | 320 ms | 220 ms | cajón | traslación vertical |
| Diálogo de confirmación | 220 ms | 140 ms | salida rápida, centrado | escala desde 0,96 y opacidad; velo 200 / 140 ms |
| Cambio de paso | 220 ms | — | salida rápida | traslación de 16 px y opacidad |
| Lista y esqueleto | 260 ms + 40 ms por fila (máximo 6) | — | salida rápida; brillo lineal de 1,4 s | traslación de 8 px y opacidad |

Reglas: nada dura más de 320 ms y salir es más rápido que entrar; las acciones repetidas con teclado no se animan; con
«Reducir movimiento» se eliminan desplazamientos y escalas y queda un fundido de 150 ms; las animaciones de cursor solo en
dispositivos con puntero; las transiciones son interrumpibles (no secuencias fijas).

Estado: **aprobado y fijado en el sistema (2026-10-19).** Las curvas y duraciones son el grupo `motion` de la cabecera de
[DESIGN.md](DESIGN.md) (con su sección «Motion»), `npm run tema` las expone como `--ease-*` y `--motion-*` en
`app/tema.generado.css`, `npm run tema:comprobar` falla si algo pasa de 320 ms o si salir no es más rápido que entrar, y
`app/globals.css` acota todo a un fundido de 150 ms con «Reducir movimiento» (y `tema:comprobar` también falla si un
`@keyframes` anima algo distinto de `transform` u `opacity`). **Lo que sigue pendiente** es aplicar el movimiento
en cada componente cuando se construya en H3 y H4 (la tabla de arriba dice con qué token).

## 7. Pendiente de diseñar

- Horarios del médico y plantilla semanal (H3, 9.2) y bajas médicas con reasignación (H3, 11.1).
- Turnos de enfermería y dashboard operativo (H7).
- Registro del paciente en el portal y recuperación de acceso (H4).
- Formularios clínicos completos: recetas, triaje y especialidades (H6).
- Correos de notificación (H5).
- Estados de error de red y de sesión expirada en todas las áreas.

## 8. Cómo se usa este material

El lienzo se creó en Claude Design; sus archivos fuente están en [lienzo/project/](lienzo/project/) con la misma estructura de
rutas del lienzo. Ver [README.md](README.md) para abrirlo, actualizarlo y qué pasa si se modifica.
