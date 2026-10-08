// Sincronización de perfiles (H2, tarea 8.3): el SQL real, ejecutado con los privilegios reales del rol
// `sync_identidad`, dentro de una transacción que se revierte (no deja datos). Spec: identidad-de-personas.
// Convención de entorno: DATABASE_URL_PRUEBAS (URL directa de un branch de pruebas), como tests/concurrencia.
import assert from "node:assert/strict";
import { test } from "node:test";
import type pg from "pg";
import { conectar } from "../concurrencia/_conexion.ts";
import {
  rolDesdeMetadata,
  sincronizarPerfil,
  type EjecutarSql,
} from "../../lib/identidad/sincronizar-perfil.ts";

// Adaptador de la plantilla SQL de la aplicación (neon) a un cliente `pg`.
function sobrePg(cliente: pg.Client): EjecutarSql {
  return (strings, ...params) => {
    let texto = strings[0];
    for (let i = 0; i < params.length; i++) texto += `$${i + 1}${strings[i + 1]}`;
    return cliente.query(texto, params as unknown[]);
  };
}

// Corre `fn` como el rol de sincronización dentro de una transacción que se revierte siempre.
async function comoSincronizacion(fn: (c: pg.Client, sql: EjecutarSql) => Promise<void>, rol = "sync_identidad") {
  const c = await conectar();
  try {
    await c.query("begin");
    await c.query("grant sync_identidad to current_user with set true");
    await c.query(`set local role ${rol}`);
    await fn(c, sobrePg(c));
  } finally {
    await c.query("rollback").catch(() => undefined);
    await c.end();
  }
}

const perfil = async (c: pg.Client, id: string) => {
  await c.query("reset role");
  const { rows } = await c.query(`select rol::text as rol, nombres, apellidos from public.perfiles where clerk_user_id = $1`, [id]);
  return rows;
};

test("un usuario nuevo sin rol nace paciente", async () => {
  await comoSincronizacion(async (c, sql) => {
    await sincronizarPerfil(sql, { clerkUserId: "user_int_1", rol: null, nombres: "Ana", apellidos: "Quispe" });
    assert.deepEqual(await perfil(c, "user_int_1"), [{ rol: "paciente", nombres: "Ana", apellidos: "Quispe" }]);
  });
});

test("un usuario invitado conserva el rol de la invitación", async () => {
  await comoSincronizacion(async (c, sql) => {
    await sincronizarPerfil(sql, { clerkUserId: "user_int_2", rol: "medico", nombres: "Mario", apellidos: "Vega" });
    assert.deepEqual(await perfil(c, "user_int_2"), [{ rol: "medico", nombres: "Mario", apellidos: "Vega" }]);
  });
});

test("el mismo evento dos veces deja un solo perfil con los mismos datos (idempotencia)", async () => {
  await comoSincronizacion(async (c, sql) => {
    const datos = { clerkUserId: "user_int_3", rol: "paciente" as const, nombres: "Luz", apellidos: "Rojas" };
    await sincronizarPerfil(sql, datos);
    await sincronizarPerfil(sql, datos);
    assert.deepEqual(await perfil(c, "user_int_3"), [{ rol: "paciente", nombres: "Luz", apellidos: "Rojas" }]);
  });
});

test("user.updated actualiza nombres y rol; sin rol en el evento conserva el existente", async () => {
  await comoSincronizacion(async (c, sql) => {
    await sincronizarPerfil(sql, { clerkUserId: "user_int_4", rol: "paciente", nombres: "Eva", apellidos: "Diaz" });
    await sincronizarPerfil(sql, { clerkUserId: "user_int_4", rol: "enfermera", nombres: "Eva María", apellidos: "Díaz" });
    assert.deepEqual(await perfil(c, "user_int_4"), [{ rol: "enfermera", nombres: "Eva María", apellidos: "Díaz" }]);
    await c.query("set local role sync_identidad");
    await sincronizarPerfil(sql, { clerkUserId: "user_int_4", rol: null, nombres: "Eva María", apellidos: "Díaz" });
    assert.deepEqual(await perfil(c, "user_int_4"), [{ rol: "enfermera", nombres: "Eva María", apellidos: "Díaz" }]);
  });
});

test("sin nombres en el evento no falla: guarda cadena vacía", async () => {
  await comoSincronizacion(async (c, sql) => {
    await sincronizarPerfil(sql, { clerkUserId: "user_int_5", rol: null, nombres: null, apellidos: undefined });
    assert.deepEqual(await perfil(c, "user_int_5"), [{ rol: "paciente", nombres: "", apellidos: "" }]);
  });
});

test("si la base rechaza la escritura, la función falla (el webhook responde 5xx y Clerk reintenta)", async () => {
  await comoSincronizacion(async (_c, sql) => {
    await assert.rejects(
      sincronizarPerfil(sql, { clerkUserId: "user_int_6", rol: null, nombres: "X", apellidos: "Y" }),
      (e: { code?: string }) => e.code === "42501",
    );
  }, "anonymous");
});

test("rolDesdeMetadata solo acepta los cuatro roles", () => {
  assert.equal(rolDesdeMetadata({ rol: "medico" }), "medico");
  assert.equal(rolDesdeMetadata({ rol: "administrativo" }), "administrativo");
  assert.equal(rolDesdeMetadata({ rol: "superadmin" }), null);
  assert.equal(rolDesdeMetadata({ rol: 7 }), null);
  assert.equal(rolDesdeMetadata({}), null);
  assert.equal(rolDesdeMetadata(null), null);
  assert.equal(rolDesdeMetadata(undefined), null);
});
