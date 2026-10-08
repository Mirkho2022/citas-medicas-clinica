# Barrido de coherencia entre documentos (tarea 10.2)

Contraste de PRD, TECH-DESIGN, ADR, CLAUDE.md y `openspec/config.yaml` entre sí y con lo que H2 construyó y
verificó. Hecho el 2026-10-08. El PRD no necesitó cambios (no afirma nada que H2 contradiga), así que no se editó.

## Hallazgos y resolución

| # | Documento | Hallazgo | Resolución |
|---|---|---|---|
| 1 | TECH-DESIGN | Decía que la app usa el rol `app_user`; en Neon el tráfico entra como `authenticator` + `authenticated` | Corregido (arquitectura, diagrama, seguridad) |
| 2 | TECH-DESIGN | Las políticas leían `auth.session() ->> 'rol'`; el rol viaja en `publicMetadata.rol` y `authenticated` no puede leer `auth.*` | Corregido: `public.rol_actual()` (`SECURITY DEFINER`) |
| 3 | TECH-DESIGN, ADR-0021 | Pedían `pgcrypto` para `gen_random_uuid()`, nativa desde PostgreSQL 13 | Corregido: no se instala |
| 4 | TECH-DESIGN | Índice redundante sobre `perfiles.clerk_user_id` (ya lo da el `UNIQUE`) | Corregido |
| 5 | TECH-DESIGN, ADR-0015 | `length(btrim(x)) > 0` deja pasar campos con solo tabuladores o saltos de línea | Corregido: `texto_con_contenido()` |
| 6 | TECH-DESIGN | `atenciones.paciente_id` denormalizado sin garantía de coincidir con la historia | Corregido: clave foránea compuesta |
| 7 | TECH-DESIGN, ADR-0016 | `current_date` depende del `TimeZone` del servidor (UTC); el negocio es `America/Lima` | Corregido: `hoy_lima()` |
| 8 | TECH-DESIGN, ADR-0016 | `extender_asignacion_por_cita()` usaba `old is null` en un disparador de INSERT y podía duplicar | Corregido: `TG_OP`, fechas de Lima, índice único parcial |
| 9 | TECH-DESIGN, ADR-0012 | `validar_cancelacion()` no era `SECURITY DEFINER` (la excepción dependía del rol) y medía contra `NEW.inicio` | Corregido: `SECURITY DEFINER` y `OLD.inicio` |
| 10 | TECH-DESIGN | `bloquear_cambio_de_rol()` bloqueaba al webhook de sincronización | Corregido: `SECURITY INVOKER`, `current_user`, protege también `activo` |
| 11 | TECH-DESIGN | Política `for all` del administrativo sobre `asignaciones_paciente_medico` contradice el append-only de ADR-0016 | Corregido: solo `SELECT` e `INSERT` |
| 12 | TECH-DESIGN | La auditoría podía volcar contenido clínico al administrativo | Corregido: las tablas clínicas se auditan sin contenido |
| 13 | TECH-DESIGN, ADR-0020 | Decían que `cron_notificaciones` «no pasa por RLS»; sí pasa y tiene políticas propias | TECH-DESIGN corregido; ADR-0020: **nota de revisión pendiente** |
| 14 | ADR-0020 | Menciona `app_user` y no menciona `sync_identidad` | **Nota de revisión pendiente** (texto de la decisión sin tocar) |
| 15 | ADR-0012, ADR-0015 | SQL con `user_role`, `auth.uid()` y `auth.jwt()` de Supabase | Corregido al SQL implementado, con nota |
| 16 | ADR-0013 | Adjuntos «en Supabase Storage» (ADR-0024 los pasó a Vercel Blob) | Corregido |
| 17 | ADR-0014 | Ruta `supabase/migrations/…` | Corregido: `migrations/…` (`node-pg-migrate`) |
| 18 | ADR-0023 | Ejemplo con `authenticated` como rol de conexión y claim de primer nivel; verificación «pendiente» | Nota de ejecución del spike |
| 19 | ADR-0003 | Revocación con `auth.admin.signOut` de Supabase | Nota de implementación (API de Clerk) |
| 20 | TECH-DESIGN | Stack de pruebas listaba Vitest, que aún no se usa | Ajustado a pgTAP, `node:test` y Playwright |
| 21 | CLAUDE.md | «Todavía no hay código de aplicación» | Corregido al estado real |
| 22 | `docs/verificacion-h1.md`, `.claude/agents/code-review.md` | Enlazaban el change de H1 por su ruta anterior (roto al archivarlo) | Corregido a la ruta archivada |
| 23 | CLAUDE.md, TECH-DESIGN, `openspec/config.yaml` | Nada decía que los datos de demostración sintéticos son admisibles aunque P-1 siga abierta | Registrado en los tres |
| 24 | TECH-DESIGN, ADR-0005, ADR-0008, spec de agenda | Mapeaban solo `23P01` a «Registro de cita ya agendado»; en reservas simultáneas el motor puede abortar una con `40P01` (deadlock) | Corregido: se mapean los dos códigos; ADR-0005 y ADR-0008 con nota fechada |

## Pendientes que no se resuelven aquí

- **ADR-0020** (`app_user`, `sync_identidad`, cron con RLS): requiere revisión humana; la propuesta está en la nota al final
  del propio ADR.
- **`notificaciones.tipo`:** ADR-0011 manda encolar una notificación de «reprogramación», pero el `CHECK` de TECH-DESIGN solo
  admite tres tipos. Lo decide H5 (design.md de H2, preguntas abiertas).

## Menciones que se dejan (históricas y correctas)

ADR-0020, 0021, 0022, 0024, 0026 y 0027 nombran Supabase y Cloudflare porque explican qué reemplazan; ADR-0003 ya lleva
notas de 2026-09-23 y 2026-09-28. `docs/verificacion-h1.md` menciona el CAPTCHA de Cloudflare de Clerk, un hecho.

## Invariantes verificados entre documentos

- **Cuatro roles** (`administrativo`, `medico`, `enfermera`, `paciente`) en PRD, TECH-DESIGN, CLAUDE.md y specs.
- **Mensaje exacto** `Registro de cita ya agendado`: PRD, TECH-DESIGN, ADR-0005, CLAUDE.md, `openspec/config.yaml` y specs.
- **Ventana de 1 h para todos los roles** (ADR-0012) y **6 meses de vigencia** (ADR-0016): consistentes.
- **Tabla de ADR de TECH-DESIGN:** 23 ADR en la tabla, 23 archivos en `docs/adrs/`, sin faltantes ni sobrantes.
- **Enlaces relativos:** 186 comprobados; 1 roto (el de la fila 22), corregido.
