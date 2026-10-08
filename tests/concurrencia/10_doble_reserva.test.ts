// Doble reserva bajo concurrencia real (H2, tarea 5.2). Spec: integridad-de-agenda.
// pgTAP corre en una sola sesión y no puede demostrarlo: aquí hay sesiones independientes que
// confirman (commit) de verdad. Las filas de prueba se crean con marcas propias y se borran al
// terminar, y también al empezar por si una ejecución anterior se interrumpió. La auditoría (solo-agregar) conserva
// el rastro de estas filas: por eso corre contra un branch de pruebas, nunca contra production.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type pg from "pg";
import { conectar, conVariosClientes } from "./_conexion.ts";

const CLIENTES = 5;
const RONDAS = 20;
const SLOT_MS = 20 * 60 * 1000;
const BASE = Date.parse("2031-06-02T14:00:00Z"); // lejos en el futuro: no interfiere con la ventana de cancelación

let medicoId: string;
const pacienteIds: string[] = [];

async function limpiar(c: pg.Client): Promise<void> {
  await c.query(`delete from public.citas where paciente_id in (select id from public.pacientes where numero_documento like '7300%')`);
  // Desde H2 cada paciente tiene su historia clínica (se crea sola) y la clave foránea la protege.
  await c.query(`delete from public.historias_clinicas where paciente_id in (select id from public.pacientes where numero_documento like '7300%')`);
  await c.query(`delete from public.pacientes where numero_documento like '7300%'`);
  await c.query(`delete from public.medicos where cmp like 'CMP-CONC-%'`);
  await c.query(`delete from public.perfiles where clerk_user_id like 'user_conc_%'`);
  await c.query(`delete from public.especialidades where nombre = 'Esp concurrencia'`);
}

before(async () => {
  const c = await conectar();
  try {
    await limpiar(c);
    const esp = await c.query(`insert into public.especialidades (nombre) values ('Esp concurrencia') returning id`);
    const perfil = await c.query(
      `insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ('user_conc_medico', 'medico', 'Medico', 'Concurrencia') returning id`,
    );
    medicoId = (
      await c.query(`insert into public.medicos (perfil_id, cmp, especialidad_id) values ($1, 'CMP-CONC-0001', $2) returning id`, [
        perfil.rows[0].id,
        esp.rows[0].id,
      ])
    ).rows[0].id;
    for (let i = 0; i < CLIENTES; i++) {
      const p = await c.query(
        `insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
         values ('DNI', $1, 'Paciente', $2, '1990-01-01', 'F', $3) returning id`,
        [`7300000${i}`, `Concurrencia${i}`, `conc${i}@demo.invalid`],
      );
      pacienteIds.push(p.rows[0].id);
    }
  } finally {
    await c.end();
  }
});

after(async () => {
  const c = await conectar();
  try {
    await limpiar(c);
  } finally {
    await c.end();
  }
});

const insertar = (c: pg.Client, paciente: string, inicioMs: number) =>
  c.query(
    `insert into public.citas (paciente_id, medico_id, inicio, fin, origen) values ($1, $2, $3, $4, 'portal')`,
    [paciente, medicoId, new Date(inicioMs), new Date(inicioMs + SLOT_MS)],
  );

test("el segundo INSERT espera al primero y falla con 23P01 cuando éste confirma", async () => {
  await conVariosClientes(2, async ([a, b]) => {
    const inicio = BASE + 100 * SLOT_MS;
    await a.query("begin");
    await insertar(a, pacienteIds[0], inicio); // A retiene el horario, aún sin confirmar

    let b_termino = false;
    await b.query("begin");
    const intentoB = insertar(b, pacienteIds[1], inicio).then(
      () => ({ ok: true as const }),
      (e: { code?: string }) => ({ ok: false as const, code: e.code }),
    ).finally(() => {
      b_termino = true;
    });

    await new Promise((r) => setTimeout(r, 500));
    assert.equal(b_termino, false, "B debe quedar esperando mientras A no confirme: el motor serializa la reserva");

    await a.query("commit");
    const resultadoB = await intentoB;
    assert.deepEqual(resultadoB, { ok: false, code: "23P01" }, "al confirmar A, B recibe exclusion_violation");
    await b.query("rollback");
  });
});

test("si el primero se deshace, el segundo obtiene el horario", async () => {
  await conVariosClientes(2, async ([a, b]) => {
    const inicio = BASE + 101 * SLOT_MS;
    await a.query("begin");
    await insertar(a, pacienteIds[0], inicio);
    await b.query("begin");
    const intentoB = insertar(b, pacienteIds[1], inicio);
    await new Promise((r) => setTimeout(r, 300));
    await a.query("rollback");
    await intentoB; // ya no hay conflicto: no debe lanzar
    await b.query("commit");
    const { rows } = await a.query(`select count(*)::int as n from public.citas where medico_id = $1 and inicio = $2`, [
      medicoId,
      new Date(inicio),
    ]);
    assert.equal(rows[0].n, 1);
  });
});

test(`${RONDAS} rondas de ${CLIENTES} reservas simultáneas del mismo horario: siempre exactamente una se confirma`, async () => {
  await conVariosClientes(CLIENTES, async (clientes) => {
    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const inicio = BASE + ronda * SLOT_MS;
      const resultados = await Promise.allSettled(clientes.map((c, i) => insertar(c, pacienteIds[i], inicio)));
      const confirmadas = resultados.filter((r) => r.status === "fulfilled").length;
      const rechazos = resultados.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      assert.equal(confirmadas, 1, `ronda ${ronda}: debe confirmarse exactamente una reserva (hubo ${confirmadas})`);
      // Cuando dos inserciones chocan a la vez, Postgres puede resolverlo con exclusion_violation (23P01) o abortando
      // una de ellas con deadlock_detected (40P01). Ambas significan «el horario lo tomó otra transacción» y ninguna
      // deja una cita: lo que importa es que se confirme exactamente una. La aplicación debe mapear los dos códigos.
      for (const r of rechazos) {
        const code = (r.reason as { code?: string }).code;
        assert.ok(
          code === "23P01" || code === "40P01",
          `ronda ${ronda}: el rechazo debe ser exclusion_violation (23P01) o deadlock_detected (40P01), fue ${code}`,
        );
      }
    }
    const { rows } = await clientes[0].query(
      `select count(*)::int as n from public.citas where medico_id = $1 and inicio >= $2 and inicio < $3`,
      [medicoId, new Date(BASE), new Date(BASE + RONDAS * SLOT_MS)],
    );
    assert.equal(rows[0].n, RONDAS, "una cita por horario: ninguna doble reserva quedó en la base");
  });
});
