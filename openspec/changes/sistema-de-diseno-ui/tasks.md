# Tasks

Convenciones de todo el change: sin cambios de base de datos, de RLS ni de lógica de negocio (no hay migraciones ni
pruebas pgTAP). Las pruebas de comportamiento de los componentes viven en `e2e/` contra la galería
(`/guia-de-estilo`); las de funciones puras, en `tests/tema/` con `node --test`. Cada grupo deja sus pruebas y su
documentación; el último solo integra. Las dependencias nuevas y la CLI de shadcn/ui (paquetes de terceros) se
instalan o ejecutan con la autorización del usuario.

## 1. Tokens: de DESIGN.md al tema (fuente única)

- [x] 1.1 Añadir a `docs/DESIGN.md` el grupo `shadows` en el front matter (`shadow-popover`, `shadow-dialog`,
      `focus-ring`, con los valores de la tabla «Elevation & Depth» y del anillo de foco) y su nota en «Cómo se usa»;
      verificar que el YAML sigue parseando, que los enlaces no se rompen y que las tres sombras coinciden con las del
      sistema de diseño publicado.
- [x] 1.2 Instalar `yaml` (desarrollo) y escribir `scripts/generar-tema.ts` (Node, eliminación de tipos) que lee el
      front matter de `docs/DESIGN.md` y escribe `app/tema.generado.css`: `@theme` con `--color-*`, `--font-display` y
      `--font-sans`, `--text-*` (con `--line-height`, `--font-weight` y `--letter-spacing`), `--space-*` (no `--spacing-*`: en Tailwind v4 redefiniría `max-w-md`, `w-lg`…; la escala de 4 px ya coincide con `p-1`…`p-12`), `--radius-*`,
      `--shadow-*`, y el bloque `:root` con las variables de shadcn/ui de D2; añadir `npm run tema`. Verificar que genera
      el archivo con los 22 colores, los 10 estilos de texto y las 3 sombras, y que ejecutarlo dos veces no produce
      ninguna diferencia (`git diff --exit-code app/tema.generado.css`).
- [x] 1.3 Pruebas del generador en `tests/tema/generar-tema.test.ts` (`npm run test:tema`): resuelve las referencias
      `{colors.x}`, rechaza una referencia rota, conserva el orden, convierte `lineHeight`/`letterSpacing`/`fontWeight`
      y avisa de una clave desconocida. Verificar que pasan y que fallan al cambiar a propósito un valor esperado.
- [ ] 1.4 Escribir `scripts/comprobar-tema.ts` y `npm run tema:comprobar`: (1) el CSS generado coincide con DESIGN.md,
      (2) ningún archivo bajo `app/` ni `components/` (salvo el CSS generado) tiene un color literal, con lista de
      excepciones comentada, y (3) el contraste WCAG de cada par de texto y fondo de los `components` de DESIGN.md y de
      una lista de pares adicionales (4,5:1 texto; 3:1 controles y foco). Verificar que pasa hoy y que falla en tres
      cambios temporales revertidos: editar DESIGN.md sin regenerar, añadir `#fff` en un archivo de `app/` y bajar el
      contraste de `ink-muted`.
- [ ] 1.5 Añadir `npm run tema:comprobar` y `npm run test:tema` al job `typecheck-lint-build` de
      `.github/workflows/ci.yml` (archivo con CRLF: conservarlos). Verificar en el PR que los pasos aparecen y pasan.

## 2. Base de interfaz: tipografía, tema claro y shadcn/ui

- [x] 2.1 Pedir autorización y ejecutar `npx shadcn@latest init` (Tailwind v4, React 19, alias `@/components` y
      `@/lib/utils`) en un commit propio; si no se autoriza, crear a mano `components.json`, `lib/utils.ts` y las
      dependencias equivalentes. Verificar que existen `components.json` y `lib/utils.ts`, que `npm run build` pasa y que
      se revisó el diff de `globals.css` y `package.json` antes de seguir.
- [ ] 2.2 Reescribir `app/globals.css`: importar `tema.generado.css`, eliminar el bloque `prefers-color-scheme: dark` y
      `font-family: Arial`, declarar `color-scheme: light`, fondo `canvas`, texto `ink` y la clase de cifras tabulares.
      En `app/layout.tsx` cargar Plus Jakarta Sans e Inter con `next/font/google` (variables `--font-jakarta` e
      `--font-inter`) y retirar Geist. Verificar con `npm run build` y con `e2e/tema.spec.ts`, que abre la portada con
      `colorScheme: "dark"` y comprueba que el fondo calculado es el de `canvas` (`rgb(244, 247, 247)`).
- [ ] 2.3 Añadir con la CLI (o a mano) los componentes `button`, `input`, `label`, `textarea`, `alert`, `badge`, `card` y
      `table` en `components/ui/`. Verificar que `npm run lint`, `npm run typecheck` y `npm run tema:comprobar` pasan
      (sin colores literales en lo generado) y anotar en `docs/pruebas-e2e.md` cómo regenerar `components/ui/`.

## 3. Datos de ejemplo, utilidades y galería

- [ ] 3.1 Crear `lib/ui/estados-cita.ts` (tipo `EstadoCita` = enum `estado_cita`; etiqueta, icono de lucide y tono de los
      cinco estados) y `lib/ui/formato.ts` con `date-fns` y `date-fns-tz` (`dd/MM/yyyy`, `HH:mm` y hora límite de
      cancelación una hora antes, siempre en `America/Lima`). Pruebas en `tests/tema/` (`npm run test:tema`): los cinco
      estados con su etiqueta, un estado desconocido lanza, y una cita a las 14:30 de Lima se formatea `14/10/2026` y
      `14:30` y su límite es `13:30` con el proceso en `TZ=UTC` y en `TZ=Asia/Tokyo`.
- [ ] 3.2 Crear `lib/ui/ejemplos.ts` con datos sintéticos (pacientes con DNI `99…`, citas en los cinco estados, horarios,
      atenciones firmadas) y `app/guia-de-estilo/page.tsx`: `auth.protect()`, `notFound()` si
      `VERCEL_ENV === "production"`, y secciones vacías por componente. Verificar con `e2e/galeria.spec.ts`: sin sesión
      redirige a iniciar sesión; con sesión de paciente responde 200; y una prueba de la regla `notFound` sobre la función
      que decide si la ruta se muestra (`tests/tema/`).
- [ ] 3.3 Documentar en `docs/pruebas-e2e.md` la galería, cómo se oculta en producción y cómo usarla para revisar un
      componente nuevo. Verificar que el documento enlaza a DESIGN.md y que no quedan enlaces rotos.

## 4. Componentes del sistema de diseño

- [ ] 4.1 `InsigniaEstado` y `Alerta` (tonos aviso, error, información y éxito; error con `role="alert"`, el resto con
      `role="status"` o `note`) en `components/clinica/`, mostrados en la galería. Verificar en `e2e/componentes.spec.ts`
      que cada estado lleva etiqueta, icono (`svg` con `aria-hidden`) y texto, que la alerta de error se anuncia como
      alerta y que `Registro de cita ya agendado` se muestra tal cual.
- [ ] 4.2 `Campo` (etiqueta encima, ayuda y error asociados con `aria-describedby`, `role="alert"` en el error, estado de
      solo lectura sin `disabled` y con «Solo lectura») y `CampoDocumento` (DNI o Carné de Extranjería, con el formato
      esperado como ayuda). Verificar en `e2e/componentes.spec.ts` que cada control tiene su etiqueta, que el error se
      asocia al campo, que el dato de solo lectura se puede seleccionar y no tiene el atributo `disabled`, y que las
      ayudas de DNI (8 dígitos) y de Carné de Extranjería se muestran.
- [ ] 4.3 `TarjetaCita` (servicio, médico, fecha y hora con `formato.ts`, `InsigniaEstado`, botón «Cancelar cita» solo
      mientras sea posible y «Puede cancelar hasta las HH:mm») y `SelectorHorario` (componente de cliente: disponible,
      elegido con `aria-pressed` y «No disponible» deshabilitado con texto, más la advertencia de cancelación con la hora
      límite). Verificar en `e2e/componentes.spec.ts`: elegir las 14:30 muestra «a las 13:30», un horario ocupado no se
      puede elegir y la tarjeta de una cita pasada no ofrece «Cancelar cita».
- [ ] 4.4 `TablaAgenda` (filas de 40 px, cifras tabulares, estado con `InsigniaEstado`, acciones solo en citas activas,
      desplazamiento horizontal dentro de su contenedor) y `AtencionFirmada` (sello «Firmada» con candado, ficha en solo
      lectura, «Agregar addenda» y ningún botón de editar). Verificar en `e2e/componentes.spec.ts` que la página no
      desborda a 390 px, que una fila cancelada no muestra «Reprogramar» y que la atención firmada no tiene ningún botón
      de editar.

## 5. Estructuras de pantalla y navegación

- [ ] 5.1 Crear `lib/ui/navegacion.ts` (destinos tipados por rol con `ruta`, `etiqueta`, `icono` y `disponible`) y los
      envoltorios `PortalLayout` (una columna de hasta 640 px, navegación inferior de tres destinos) y `ConsolaLayout`
      (barra lateral de 240 px, contenido de hasta 1280 px) con `UserButton` de Clerk. Los destinos de hitos futuros se
      muestran deshabilitados con «Próximamente». Verificar con `npm run typecheck` y en la galería.
- [ ] 5.2 Añadir `layout.tsx` en `app/paciente/`, `app/administrativo/`, `app/medico/` y `app/enfermera/` y reemplazar el
      relleno de cada página por su contenido de bienvenida, **conservando** `auth.protect()`, `exigirRol(...)` y los
      encabezados «Portal del paciente», «Panel administrativo», etc. Verificar que las E2E de `roles.spec.ts` y
      `db.spec.ts` siguen pasando sin cambios y, en `e2e/estructuras.spec.ts`, que a 390 px el portal no desborda y
      muestra tres destinos, y que un usuario de un rol que abre el área de otro sigue sin ver su contenido.
- [ ] 5.3 Revisar la portada pública `/` (`app/page.tsx`) con el mismo sistema (marca, enlaces con foco visible). Verificar
      que se ve con el tema claro y que sus dos enlaces siguen llevando a `/iniciar-sesion` y `/registro`.

## 6. Clerk con la marca y en español

- [ ] 6.1 Instalar `@clerk/localizations` (versión compatible con `@clerk/nextjs` 7; anotar la variante de español
      elegida) y configurar en `ClerkProvider` la localización y `appearance.variables` con los tokens (`colorPrimary`,
      `colorText`, `colorBackground`, `borderRadius`, `fontFamily`) y el tema claro. Verificar con `npm run build` y
      abriendo `/iniciar-sesion` y `/registro` en español y con el verde de marca.
- [ ] 6.2 Reemplazar en `e2e/helpers.ts` y en las E2E los selectores por texto en inglés por selectores estables de Clerk
      (`input[name=…]`, `button[type=submit]`, clases `cl-…`) y centrar las páginas de `iniciar-sesion`, `registro` y
      `configurar-mfa` con el mismo fondo y marca. Verificar que toda la suite E2E de H1 y H2 pasa contra una build de
      producción local y que no queda ningún selector con texto de un idioma concreto.
- [ ] 6.3 Actualizar `docs/pruebas-e2e.md` y `docs/verificacion-h1.md` donde nombren los textos en inglés de Clerk.
      Verificar con una búsqueda de «Continue» y «Enter verification code» en `docs/` y `e2e/` que no queda ninguna
      mención desactualizada.

## 7. Accesibilidad comprobada

- [ ] 7.1 Instalar `@axe-core/playwright` (desarrollo) y escribir `e2e/accesibilidad.spec.ts`: axe con las etiquetas
      `wcag2a`, `wcag2aa`, `wcag21a` y `wcag21aa` sobre la galería y sobre `/paciente` y `/administrativo` (cuentas de
      prueba de H1; la de administrativo con TOTP), que falla ante cualquier violación. Verificar que pasa y que se pone
      en rojo cuando se quita a propósito la etiqueta de un campo en un cambio temporal revertido.
- [ ] 7.2 Corregir las violaciones que axe encuentre en componentes y estructuras. Verificar que la prueba de 7.1 queda en
      verde y que cada corrección tiene su explicación en el mensaje del commit.
- [ ] 7.3 Documentar en `docs/pruebas-e2e.md` la lista de revisión manual que axe no cubre (recorrido con teclado, lector
      de pantalla, 200 % de zoom, objetivos táctiles) y ejecutarla una vez sobre el preview anotando el resultado en el
      PR; las pantallas de Clerk se revisan a mano y los hallazgos de su propio marcado se anotan ahí. Verificar que el
      documento tiene la lista y que el PR trae el resultado de cada ítem.

## 8. Documentación y coherencia

- [ ] 8.1 Actualizar `CLAUDE.md` (estado y convención «la UI sigue `docs/DESIGN.md`; un cambio de color o tipografía se
      hace allí y se regenera con `npm run tema`»), la fila de UI y la de accesibilidad de TECH-DESIGN, una fila **H2b**
      en el plan por hitos y la fila de pruebas (axe), y una nota fechada en ADR-0004 que enlaza DESIGN.md. Verificar con
      una búsqueda que los cuatro textos dicen lo mismo y que ningún enlace relativo se rompe.
- [ ] 8.2 Corregir en `openspec/config.yaml` la línea obsoleta «sin código de aplicación aún» y añadir H2b a la hoja de
      ruta del contexto. Verificar con `openspec validate sistema-de-diseno-ui --strict` y con una lectura de que
      `context` no contradice el estado real.

## 9. Verificación integral en el PR

- [ ] 9.1 Ejecutar en limpio `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:tema`,
      `npm run tema:comprobar` y la suite E2E completa; verificar que todo pasa y que el PR trae el cuadro de cada
      requisito de la spec con la prueba que lo cubre.
- [ ] 9.2 Revisar visualmente en el preview de Vercel la galería, las cuatro áreas y las pantallas de autenticación a 390 px
      y a 1280 px, y mostrar las capturas al usuario; verificar que el usuario da su visto bueno o lista los ajustes (que se
      hacen antes del merge).
- [ ] 9.3 Tras el merge, comprobar que el despliegue de producción está en estado READY y que `/iniciar-sesion` se ve en
      español y con la marca; verificar con la URL pública. La carga de datos de demostración y cualquier pantalla con datos
      reales **no** forman parte de este change.
