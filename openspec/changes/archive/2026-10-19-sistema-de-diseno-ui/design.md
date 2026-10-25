# Design

## Context

Motivación y alcance en [proposal.md](proposal.md); requisitos en `specs/sistema-de-diseno-ui/`. Estado de partida,
verificado en el repositorio:

- Next.js 15.5 (App Router, Turbopack), React 19, Tailwind CSS **v4** vía `@tailwindcss/postcss` (sin
  `tailwind.config`), `react-hook-form` y Zod ya instalados. **No** hay shadcn/ui, `components/` ni `components.json`.
- `app/globals.css` conserva la plantilla de Next: variables `--background`/`--foreground`, bloque
  `prefers-color-scheme: dark` y `font-family: Arial`. `app/layout.tsx` carga Geist y envuelve todo en `ClerkProvider`
  sin `appearance` ni localización (los formularios de Clerk salen en inglés y con el tema por defecto).
- Las áreas `/paciente`, `/administrativo`, `/medico` y `/enfermera` son páginas de relleno
  (`<main className="flex min-h-screen items-center justify-center p-8"><h1 className="text-xl font-medium">…`); cada una
  hace `auth.protect()` y `exigirRol(...)`. La regla de ESLint `@clerk/next/require-auth-protection` protege
  `app/*/**` y exige esa llamada en cualquier ruta nueva.
- Las E2E de H1 (`e2e/`) buscan los encabezados «Portal del paciente» y «Panel administrativo» y los botones de Clerk
  por su texto en inglés («Continue», «Enter verification code»).
- `docs/02-diseno/DESIGN.md` (formato Google DESIGN.md, alpha) ya trae los tokens en YAML, las reglas en prosa y la tabla de
  correspondencia con las variables de shadcn/ui. La vista previa y las pantallas están en dos artefactos publicados
  (sistema de diseño y lienzo); son referencia visual, **no** fuente de verdad: la fuente es el archivo del repositorio.

## Goals / Non-Goals

**Goals:**
- Una sola fuente de verdad para los tokens (DESIGN.md) y una forma mecánica de llevarlos al código y de comprobar que no
  se separan.
- Componentes y estructuras de pantalla que los hitos H3–H7 usen sin tocar colores ni tamaños.
- Accesibilidad comprobada por máquina (contraste y revisión automática), no solo declarada.
- Cero cambios de comportamiento de negocio, de acceso ni de datos.

**Non-Goals:**
- Pantallas con datos reales, formularios con Server Actions, calendario completo o cualquier lógica de H3–H7.
- Modo oscuro, ilustraciones, gráficos analíticos, internacionalización a otros idiomas.
- Reemplazar la validación (Zod) ni el flujo de autenticación: solo se cambia su apariencia y su idioma.

## Decisions

### D1. Los tokens se generan desde DESIGN.md con un script del repositorio

`scripts/generar-tema.ts` lee el front matter YAML de `docs/02-diseno/DESIGN.md` y escribe `app/tema.generado.css` (bloque `@theme`
de Tailwind v4: `--color-*`, `--font-*`, `--text-*` con su altura de línea, peso y tracking, `--spacing-*`, `--radius-*` y
`--shadow-*`). `app/globals.css` lo importa. El archivo generado **se commitea**, de modo que el build no depende del
script; `npm run tema` lo regenera y `npm run tema:comprobar` falla si DESIGN.md y el CSS difieren.

- Las tres sombras (menú, diálogo y anillo de foco) hoy solo están en la prosa de DESIGN.md; la tarea 1.1 las añade como
  un grupo `shadows` en el front matter (el formato alpha no lo define; se conserva como clave desconocida, igual que ya
  hace el sistema de diseño publicado), para que también se generen y se comprueben.
- *Alternativas:* (a) `npx @google/design.md export --format css-tailwind`: es la ruta oficial, pero descarga un paquete
  alpha en cada ejecución (cadena de suministro y red en CI) y no cubre las sombras; se puede adoptar cuando el formato
  sea estable. (b) Copiar los valores a mano: se desalinean en el primer cambio. (c) Leer los tokens del sistema de diseño
  publicado: vive fuera del repositorio.

### D2. Variables de shadcn/ui como capa de correspondencia, definida en el mismo script

shadcn/ui espera nombres semánticos (`--background`, `--primary`, `--ring`…). El script emite también el bloque `:root`
con la **tabla de correspondencia de DESIGN.md** (`--background`→`canvas`, `--foreground`→`ink`, `--card`/`--popover`→
`surface`, `--primary`/`--primary-foreground`→`primary`/`on-primary`, `--secondary`→`primary-soft`/`primary-text`,
`--muted`→`surface-muted`/`ink-muted`, `--accent`→`primary-soft`, `--destructive`→`error`, `--border`→`border`,
`--input`→`border-control`, `--ring`→`primary`, `--radius`→`rounded.md`) más los `*-foreground` que shadcn pide y la tabla no
nombra (`card`, `popover`, `accent` y `destructive`). Así los componentes de shadcn/ui se ven con la marca sin editarlos.

### D3. shadcn/ui inicializado con su CLI, componentes mínimos y selectores nativos

Se inicializa con `npx shadcn@latest init` (Tailwind v4, React 19, alias `@/components`, `@/lib/utils`) y se añaden solo
`button`, `input`, `label`, `textarea`, `alert`, `badge`, `card` y `table`. Ejecutar la CLI descarga y corre un paquete
de terceros: en la aplicación se pide la autorización explícita del usuario antes (tarea 2.1) y, si no se concede, se
copian a mano los mismos archivos. Los **selectores son `<select>` nativos con estilo**: accesibles por defecto, cómodos
en móvil (el lienzo aprobado los usa) y sin el peso de un primitivo de Radix.
*Alternativa:* construir todo sin shadcn/ui. Se descarta porque ADR-0004 lo decide y porque su base (foco, roles ARIA)
ayuda a cumplir WCAG.

### D4. Dos carpetas de componentes y un único mapa de estados de cita

`components/ui/` guarda lo que genera shadcn/ui (se puede regenerar). `components/clinica/` guarda los componentes del
dominio con los nombres de DESIGN.md: `InsigniaEstado`, `Alerta`, `Campo`, `TarjetaCita`, `SelectorHorario`,
`TablaAgenda`, `AtencionFirmada`, más los envoltorios de pantalla (`PortalLayout`, `ConsolaLayout`, `NavegacionInferior`,
`BarraLateral`). Los estados salen de **un solo mapa** en `lib/ui/estados-cita.ts` con el tipo `EstadoCita` igual al enum
`estado_cita` de la base (`reservada`, `confirmada`, `atendida`, `cancelada`, `no_asistio`): etiqueta, icono (lucide) y tono
por estado. Un valor fuera del mapa es un error de tipos y, en ejecución, lanza una excepción en desarrollo en vez de
pintar un color arbitrario. Solo `SelectorHorario` es componente de cliente (mantiene el horario elegido); el resto son
componentes de servidor.

### D5. Tipografía con `next/font/google` y variables CSS que consume el tema

`Plus_Jakarta_Sans` (600 y 700) e `Inter` (400 y 600) con `display: "swap"` y `subsets: ["latin"]`, expuestas como
`--font-jakarta` e `--font-inter`; el tema generado define `--font-display` y `--font-sans` con esas variables y una pila
de respaldo del sistema. next/font aloja los archivos con la propia aplicación (sin pedir nada a Google en el navegador).
Se retira Geist. Cifras tabulares con `font-variant-numeric: tabular-nums` en las clases de tablas, horas y documentos.

### D6. Solo tema claro

Se elimina el bloque `prefers-color-scheme: dark` de `globals.css`, se declara `color-scheme: light` en `:root` y se pasa
el mismo ajuste a Clerk (`appearance`). No hay selector de tema.

### D7. Clerk con `appearance` y localización en español; E2E por atributos estables

`ClerkProvider` recibe `localization` (paquete `@clerk/localizations`, español de España/Latinoamérica según
disponibilidad: se elige la variante que exista y se anota en la tarea 5.1) y `appearance.variables` con los tokens
(`colorPrimary`, `colorText`, `colorBackground`, `borderRadius`, `fontFamily`). Las E2E dejan de buscar texto en inglés y
pasan a elementos estables de Clerk (`input[name=…]`, `button[type=submit]`, clases `cl-…` documentadas), de modo que un
cambio de idioma o de redacción no las rompe. Se añade `UserButton` al encabezado de las estructuras para cerrar sesión.
*Riesgo conocido:* la versión del paquete de localización debe ser compatible con `@clerk/nextjs` 7; se verifica al
instalar (tarea 5.1).

### D8. Estructuras de pantalla como `layout.tsx` de cada área, con navegación declarativa

Cada área gana su `layout.tsx` sin mover rutas: `app/paciente/layout.tsx` (portal) y `app/administrativo/`, `app/medico/`
y `app/enfermera/layout.tsx` (consola, con distinto menú). El menú sale de `lib/ui/navegacion.ts`, una lista tipada por
rol con `ruta`, `etiqueta`, `icono` y `disponible`. Hoy solo existen las portadas de cada área, así que los destinos de
hitos futuros (`Mis citas`, `Reservar`, `Pacientes`…) se muestran **deshabilitados con la etiqueta «Próximamente»** hasta
que su hito cambie `disponible` a `true`; esto evita enlaces a rutas que responden 404. Las páginas siguen llamando a
`auth.protect()` y `exigirRol(...)`: los layouts son solo presentación y no sustituyen esa protección.
*Alternativa:* grupos de rutas `(portal)`/`(consola)`. Obligaría a mover archivos y a revisar la regla de ESLint de Clerk
sin ganar nada ahora.

### D9. Galería `/guia-de-estilo` protegida y ausente en producción

`app/guia-de-estilo/page.tsx` llama a `auth.protect()` (lo exige la regla de ESLint) y devuelve `notFound()` cuando
`process.env.VERCEL_ENV === "production"`. Muestra cada componente en todos sus estados con datos de `lib/ui/ejemplos.ts`
(sintéticos, DNI `99…`). Sirve para revisión visual y como objetivo de las pruebas de accesibilidad. En local con
`next start` es visible (no hay `VERCEL_ENV`); es el comportamiento deseado para las E2E locales.

### D10. Tres comprobaciones automáticas en un solo comando

`npm run tema:comprobar` ejecuta (1) que `app/tema.generado.css` coincide con DESIGN.md, (2) que ningún archivo bajo
`app/` ni `components/` (salvo el CSS generado) declara un color literal (`#rrggbb`, `rgb(`, `hsl(`), con una lista de
excepciones explícita y comentada, y (3) el **contraste WCAG** de cada par de texto y fondo de los `components` de
DESIGN.md más una lista de pares adicionales (4,5:1 texto, 3:1 controles y foco). Usa Node 24 con eliminación de tipos
como el resto de `scripts/` y la librería `yaml` (desarrollo). Se agrega como paso del job `typecheck-lint-build` de
`ci.yml`.

### D11. Accesibilidad en E2E con `@axe-core/playwright`

`e2e/accesibilidad.spec.ts` ejecuta axe con las etiquetas `wcag2a`, `wcag2aa`, `wcag21a` y `wcag21aa` sobre la galería y las
páginas de `/paciente` y `/administrativo` con las cuentas de prueba de H1 (la de administrativo con TOTP), y falla ante
cualquier violación. Las pantallas de Clerk (`/iniciar-sesion`, `/registro`) quedan fuera del recuento obligatorio porque
su marcado no es nuestro: se revisan una vez a mano y los hallazgos propios de Clerk se anotan en `docs/07-testing/pruebas-e2e.md`.
axe no mide todo (por ejemplo, el orden lógico del foco): el recorrido con teclado y la prueba con lector de pantalla
quedan como tareas de revisión manual.

## Risks / Trade-offs

- [El script de generación y DESIGN.md se desincronizan cuando el formato cambie] → `tema:comprobar` falla en CI; el
  script solo lee las claves que usa y avisa de cualquier otra desconocida.
- [`shadcn init` altera `globals.css`, `package.json` y crea archivos] → se ejecuta en un commit propio y se revisa su
  diff antes de aplicar los tokens; si la CLI no se autoriza, se copian los componentes a mano.
- [El paquete de localización de Clerk no coincide con `@clerk/nextjs` 7 o sus textos difieren de lo esperado] → las E2E
  no dependen del texto (D7) y se prueba primero en el preview de la rama.
- [Cambiar la apariencia de Clerk afecta producción al instante] → es solo CSS y texto; el flujo y los requisitos de
  `autenticacion-roles` no cambian y las E2E de inicio de sesión corren en el preview antes de mergear.
- [axe da falsos negativos de contraste en superficies con transparencias] → el contraste de los tokens ya se verifica por
  cálculo (D10); axe complementa, no sustituye.
- [El menú deshabilitado «Próximamente» confunde si se publica antes de H3/H4] → el área del paciente no tiene usuarios
  reales todavía (P-1 y H4 pendientes); la lista `disponible` se actualiza en el mismo PR que cada hito.
- [Tres fuentes visuales (DESIGN.md, el sistema publicado y el lienzo) pueden divergir] → DESIGN.md manda y es lo único
  que el código lee; los artefactos se actualizan a mano cuando cambie.

## Migration Plan

1. Rama de trabajo por grupos de tareas, con commits locales por grupo (como en H2).
2. Preview de Vercel por PR: ahí se revisan visualmente la galería y las páginas y corren las E2E (incluida la nueva de
   accesibilidad) antes de mergear.
3. Despliegue a producción con el merge; no hay migraciones de base de datos ni variables de entorno nuevas.
4. Reversión: revertir el commit de merge; no hay estado persistente que deshacer.
