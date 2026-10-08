# Pruebas de base de datos (pgTAP y concurrencia)

Cómo se prueban el esquema, las políticas RLS y las reglas que viven en la base de datos (H2). Las
pruebas E2E del navegador están en [pruebas-e2e.md](pruebas-e2e.md). El porqué del mecanismo de
autenticación de pruebas está en [spike-rls-h2.md](spike-rls-h2.md).

## Qué hay

| Qué | Dónde | Para qué |
|---|---|---|
| pgTAP | `tests/pgtap/NN_<área>.test.sql` | RLS activada, prueba negativa por política, `GRANT`, triggers y `CHECK`/`EXCLUDE` |
| Ayudas pgTAP | `tests/pgtap/_ayudas.sql` | `tests.autenticar_como(identidad)`, `tests.sub()`, `tests.volver_a_dueno()` |
| Runner pgTAP | `scripts/ejecutar-pgtap.ts` | Genera los tokens, abre la conexión y corre cada archivo en una transacción que se revierte |
| Concurrencia | `tests/concurrencia/*.test.ts` | Lo que pgTAP no puede probar (varias sesiones a la vez): doble reserva |
| Integración | `tests/integracion/*.test.ts` | El SQL de la aplicación con los privilegios reales de un rol de servicio (p. ej. `sync_identidad`), en una transacción que se revierte |

## Cómo se ejecutan

Necesitan la URL **directa** (no la pooled) de un branch de desarrollo o efímero de Neon, con el
rol dueño. **Nunca production.**

```bash
# DATABASE_URL_PRUEBAS en el entorno o en .env.local (o DATABASE_URL como respaldo)
npm run test:pgtap                          # toda la suite pgTAP
node scripts/ejecutar-pgtap.ts citas        # solo los archivos cuyo nombre contiene "citas"
npm run test:concurrencia                   # pruebas de concurrencia
npm run test:integracion                    # integración de la aplicación con roles de servicio
ENV_FILE=ruta/otro.env npm run test:pgtap   # leer otro archivo de entorno
```

Si `DATABASE_URL_PRODUCCION` está definida y coincide con el destino, ambos runners se niegan a
correr. En CI las pruebas corren en el branch efímero del PR (`neon-branch-pr.yml`), después de
`migrate up`.

## Escribir una prueba pgTAP

- El archivo trae **solo el cuerpo pgTAP** (`select plan(n); ...; select * from finish();`). El runner
  pone el `begin`, instala `pgtap` y las ayudas dentro de la transacción y hace `rollback` al
  final: no queda nada en la base, ni siquiera la extensión.
- Los datos de prueba los crea el rol dueño (que ignora RLS) **antes** de autenticarse.
- Para ejercer una política: `select tests.autenticar_como('medico_a');`. Cambia a la identidad y al rol
  `authenticated`, igual que la aplicación. Se puede llamar varias veces en el mismo archivo.
- Para comprobar o preparar datos como dueño: `select tests.volver_a_dueno();` (la identidad de la
  sesión se conserva).
- Identidades disponibles: `administrativo`, `medico_a`, `medico_b`, `enfermera`, `paciente_a`,
  `paciente_b` y `sin_rol`. `tests.sub('medico_a')` da su `clerk_user_id` para sembrar `perfiles`.
- Las pruebas **no pueden asumir tablas vacías** (puede haber datos de demostración): siembran sus
  propios identificadores y afirman por id. Las negativas («este rol no ve ninguna fila») siguen
  siendo válidas con datos presentes.
- Toda tabla nueva de `public` necesita su prueba negativa: el rol equivocado **no** ve ni escribe el
  dato. `99_rls_en_todas_las_tablas.test.sql` falla si alguna tabla queda sin RLS.

## Límites conocidos

- Las pruebas usan un JWT firmado con una clave Ed25519 propia; no cubren la validación de la JWKS
  de Clerk que hace el proxy de Neon (eso lo cubre la E2E de `clienteAutenticado()`).
- Si la primera llamada a `auth.*` de una conexión ocurre dentro de una función con cláusula `SET`
  (como `rol_actual()`), se pierde la JWK de arranque. El runner carga la extensión antes con
  `select auth.user_id()`; si escribes un script propio, haz lo mismo.
- Un `auth.jwt_session_init` fallido deja la identidad anterior en la sesión: cada archivo usa su
  propia conexión y no reutiliza sesiones.
- `pg_session_jwt.jwk` solo llega al arrancar la conexión y el pooler lo rechaza: por eso la URL es
  directa.
