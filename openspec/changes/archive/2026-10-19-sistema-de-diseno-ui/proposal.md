# Proposal

## Why

H3, H4, H6 y H7 construyen pantallas reales (agenda, portal del paciente, historia clínica, turnos), pero hoy la
aplicación tiene páginas de relleno sin estilo (`Portal del paciente` en una línea de texto), tipografía Geist por
defecto, un modo oscuro heredado de la plantilla y formularios de Clerk en inglés y sin la marca. El sistema de diseño
ya está aprobado ([docs/02-diseno/DESIGN.md](../../../../docs/02-diseno/DESIGN.md), con su vista previa y las cuatro pantallas clave
publicadas), así que conviene convertirlo en código **una sola vez**, antes de que cada hito invente sus propios
colores, botones y estados.

La métrica de éxito del PRD (75 % de las citas hechas por el propio paciente) depende de una interfaz que un adulto
mayor use sin ayuda; el contraste, el tamaño y la claridad no pueden quedar a criterio de cada pantalla.

## What Changes

- **Tema como código:** los tokens de `docs/02-diseno/DESIGN.md` (colores, tipografía, espaciado, radios, sombras) pasan a un
  tema de Tailwind CSS v4 en `app/globals.css`, generado por un script del repositorio a partir del front matter de
  DESIGN.md (así hay una sola fuente de verdad y no se transcribe a mano).
- **Tipografía:** Plus Jakarta Sans (títulos) e Inter (cuerpo y tablas) con `next/font/google`, en lugar de Geist. Se
  elimina el modo oscuro heredado (`prefers-color-scheme`), que DESIGN.md deja fuera de esta versión.
- **shadcn/ui** inicializado y configurado con esos tokens, y los **componentes base** de DESIGN.md: Botón, Campo,
  InsigniaEstado, Alerta, TarjetaCita, SelectorHorario, TablaAgenda y AtencionFirmada, todos con datos de ejemplo
  sintéticos y sin acceso a datos.
- **Estructuras de pantalla:** layout del portal del paciente (una columna, navegación inferior de 3 destinos) y de la
  consola del personal (barra lateral de 240 px), aplicados a las páginas de `/paciente`, `/administrativo`,
  `/medico` y `/enfermera`, que mantienen sus encabezados actuales (las E2E de H1 los buscan).
- **Clerk con la marca y en español:** `appearance` con los tokens y localización `esES` en el inicio de sesión, el
  registro y la configuración de MFA. **BREAKING (solo pruebas):** los selectores de las E2E que hoy buscan textos en
  inglés («Continue», «Enter verification code») se actualizan.
- **Galería de componentes** (`/guia-de-estilo`, protegida y oculta en producción) para revisar y probar la
  accesibilidad de cada componente en el preview.
- **Verificación de accesibilidad:** pruebas con `@axe-core/playwright` (WCAG 2.1 AA) sobre la galería y las páginas
  de H1, más un script que comprueba el contraste de los pares de DESIGN.md.
- **Coherencia documental:** CLAUDE.md, TECH-DESIGN (fila de UI, accesibilidad y plan por hitos) y una nota fechada en
  ADR-0004 enlazan DESIGN.md como fuente de los tokens; se corrige la línea obsoleta «sin código de aplicación aún» de
  `openspec/config.yaml`.

## Capabilities

### New Capabilities
- `sistema-de-diseno-ui`: la interfaz de la aplicación aplica el sistema de diseño aprobado (tokens, tipografía,
  estados de cita, componentes y estructuras de pantalla), en español, sin modo oscuro y con accesibilidad WCAG 2.1 AA
  comprobada automáticamente.

### Modified Capabilities
<!-- Ninguna: `autenticacion-roles` describe quién puede entrar, no cómo se ve; este change no altera esos requisitos. -->

## Impact

- **Hito:** H2b, una fila nueva en el plan de TECH-DESIGN entre H2 y H3 (fuera de la secuencia H1–H8 original,
  justificada porque H3, H4, H6 y H7 construyen pantallas y necesitan la base visual; depende de H1 y no de H2).
- **Código:** `app/globals.css`, `app/layout.tsx`, páginas de las cuatro áreas, `components/` (nuevo, shadcn/ui),
  `lib/utils.ts` (utilidad `cn` de shadcn), `scripts/generar-tema.ts`, ruta `app/guia-de-estilo/`, `e2e/` (selectores y
  pruebas de accesibilidad).
- **Dependencias nuevas:** `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` y los primitivos de
  Radix que traiga cada componente de shadcn/ui; `date-fns` y `date-fns-tz` (formato `America/Lima`, ya previstos en
  TECH-DESIGN); `@clerk/localizations` (español); `@axe-core/playwright` y `yaml` (solo desarrollo). Tailwind v4 y
  `react-hook-form` ya están.
- **Sin cambios** en base de datos, RLS, historias clínicas ni lógica de negocio. `AtencionFirmada` es un componente
  visual con datos sintéticos: **no** toca el acceso a historias clínicas y no depende de la decisión legal P-1; no
  muestra datos clínicos reales.
- **ADR:** no requiere una ADR nueva; implementa [ADR-0004](../../../../docs/03-arquitectura/adrs/0004-stack-de-frontend-y-validacion.md)
  (Tailwind + shadcn/ui). La elección de generar el tema desde DESIGN.md se razona en `design.md`.
- **Fuera de alcance:** modo oscuro, ilustraciones, gráficos analíticos y cualquier pantalla con datos reales (las
  construyen H3–H7 sobre esta base).
