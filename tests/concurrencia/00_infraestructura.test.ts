// Verifica la propia técnica de concurrencia antes de usarla sobre las tablas (tarea 5.2): dos
// clientes independientes son dos sesiones distintas y un cliente realmente espera al otro.
import assert from "node:assert/strict";
import { test } from "node:test";
import { conVariosClientes } from "./_conexion.ts";

test("dos clientes son dos sesiones de base de datos distintas", async () => {
  await conVariosClientes(2, async ([a, b]) => {
    const pidA = (await a.query("select pg_backend_pid() as pid")).rows[0].pid;
    const pidB = (await b.query("select pg_backend_pid() as pid")).rows[0].pid;
    assert.notEqual(pidA, pidB);
  });
});

test("un cliente espera al otro mientras éste conserva un bloqueo", async () => {
  await conVariosClientes(2, async ([a, b]) => {
    const clave = 4_2024_1008; // clave arbitraria de bloqueo consultivo, solo para esta prueba
    await a.query("begin");
    await a.query("select pg_advisory_xact_lock($1)", [clave]);

    let b_obtuvo_el_bloqueo = false;
    const esperaB = (async () => {
      await b.query("begin");
      await b.query("select pg_advisory_xact_lock($1)", [clave]);
      b_obtuvo_el_bloqueo = true;
      await b.query("commit");
    })();

    await new Promise((r) => setTimeout(r, 500));
    assert.equal(b_obtuvo_el_bloqueo, false, "B no debe avanzar mientras A conserva el bloqueo");

    await a.query("commit");
    await esperaB;
    assert.equal(b_obtuvo_el_bloqueo, true, "B avanza en cuanto A libera el bloqueo");
  });
});
