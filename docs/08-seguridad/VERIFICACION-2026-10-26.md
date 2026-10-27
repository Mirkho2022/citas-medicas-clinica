# Verificación de seguridad previa a la presentación — 2026-10-26

Complementa el [SECURITY-REPORT.md](SECURITY-REPORT.md) (pase del 2026-10-25 y revisión de los paneles del médico y la enfermera). No repite sus hallazgos: comprueba qué sigue en pie sobre `master` (commit `764770a`) y sobre producción (https://citas-medicas-clinica.vercel.app).

**Método:** solo lectura. Sondeos HTTP sin sesión contra producción, `npm audit --omit=dev` y lectura de `next.config.ts` y `package.json`. No se modificó código ni configuración, y no se probaron sesiones autenticadas contra producción.

## Resultado

Apto como **demostración con datos sintéticos**. No apto para datos clínicos reales (P-1 y SEC-11, ya documentados).

## Comprobado en producción

| Control | Resultado |
|---|---|
| `/medico`, `/enfermera`, `/medico/pacientes`, `/api/db-sesion` sin sesión | 307 a inicio de sesión de Clerk |
| `/guia-de-estilo` sin sesión | 307 a inicio de sesión (la galería no queda pública) |
| `/api/historias/x` sin sesión | 404 |
| `POST /api/webhooks/clerk` sin firma | 400 (la firma se exige) |
| `GET /api/salud` | 200 `{"estado":"ok"}`, solo estado, sin detalle |
| Cabeceras | `Strict-Transport-Security` (2 años, preload), `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` |
| `Cache-Control: private, no-store` | Configurado en `/medico/pacientes/*` y `/api/historias/*` (`next.config.ts`) |
| `npm audit --omit=dev` | `next` ya no figura (15.5.28) |

## Estado de los hallazgos anteriores

- **Cerrados y verificados:** SEC-01 (Next.js), SEC-04 en parte (cabeceras presentes), SEC-08, SEC-10 y SEC-14.
- **Siguen abiertos:** SEC-02 (titularidad del DNI, decisión del cliente), SEC-03 (falta retirar `DATABASE_URL` de Vercel, requiere autorización), SEC-05, SEC-06, SEC-07, SEC-09 (rotar secretos de pruebas si se comparte la transcripción), SEC-11 (guarda de datos reales), SEC-12, SEC-13 (`?q=` en «Mis pacientes»), SEC-15, SEC-16 y SEC-17.
- No se reevaluaron SEC-12 a SEC-17: no hay commits de seguridad posteriores a su registro.

## Novedades de esta verificación

**SEC-18 — `npm audit` marca 2 avisos «high» en dependencias (Media/Baja)**
- `zod` 3.25.76 (dependencia directa, `^3`): consumo de memoria al validar colecciones grandes muy acotadas (GHSA-mrhx-c7xc-m3w5). Es el mismo asunto de SEC-05. La corrección está en la 4.6.7, un salto mayor que exige probar todos los esquemas.
- `source-map-js` ≤ 1.2.1 (GHSA-68fv-2mgg-jv7q): llega solo por `@tailwindcss/postcss`, es decir, **en tiempo de compilación**, no en el servidor que atiende tráfico. `npm audit fix` lo resuelve sin salto mayor.
- **Estado: `source-map-js` corregido** con `npm audit fix` (solo subidas menores y parches; `typecheck`, `lint`, `build` y 343 pruebas de agenda y portal en verde). **`zod` queda abierto a propósito:** pasar a 4.x exige subir también `@hookform/resolvers` de la 3 a la 5 y revisar todos los esquemas de `lib/schemas/`, un cambio con riesgo de regresión que no conviene hacer a días de la presentación. Mitigación: el aviso requiere colecciones enormes dentro de un esquema acotado, y Vercel limita el tamaño del cuerpo de cada petición.

**SEC-19 — Cabecera `X-Powered-By` expuesta (Info)**
- La respuesta de producción incluye `x-powered-by`. Revela el framework sin aportar nada. **Estado: corregido** (`poweredByHeader: false` en `next.config.ts`; se verá en producción tras el despliegue del PR).

## Qué decir en la presentación

- El aislamiento de datos clínicos vive en la base (RLS con prueba negativa por tabla); la aplicación no lo reemplaza.
- Lo que falta para datos reales no es técnico: retención, firma electrónica y alojamiento fuera de Perú dependen del asesor legal (P-1).
- Los hallazgos abiertos están registrados con dueño y tipo de cambio, no ocultos.

## Fuera de alcance de esta verificación

Configuración interna de Clerk, Neon y Vercel; pruebas de intrusión con sesión; revisión nueva de código. El detalle de método y cobertura de la revisión completa está en el [SECURITY-REPORT.md](SECURITY-REPORT.md).
