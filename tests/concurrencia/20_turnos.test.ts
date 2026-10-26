// Turnos de enfermería bajo concurrencia real, con el código de la aplicación (H7, tarea 4.2; specs/turnos-de-enfermeria,
// «Dos asignaciones simultáneas»). Cinco administrativos, cada uno con su sesión autenticada y su conexión, asignan a la vez la misma
// enfermera, fecha y franja con `asignarTurno` de lib/turnos/operaciones.ts (la misma función que usa la Server Action): en cada ronda
// queda exactamente UNA fila y las demás reciben el mensaje de choque (el `23505` de `unique (enfermera_id, fecha, turno)` ya
// traducido). También se prueba el cambio de franja simultáneo hacia una franja libre (`actualizarTurno`).
// Las fechas son de 2032 (lejos en el futuro) y las filas de prueba llevan marcas propias (perfiles `user_ct_…`, CMP `CMP-CT-…`): se
// borran al empezar (por si una ejecución anterior se interrumpió) y al terminar. Corre contra un branch de pruebas, nunca production.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type pg from "pg";
import { MENSAJE_TURNO_DUPLICADO } from "../../lib/turnos/errores.ts";
import { actualizarTurno, asignarTurno } from "../../lib/turnos/operaciones.ts";
import { conectar } from "./_conexion.ts";
import { ejecutorDeSesion } from "./_ejecutor.ts";
import { conSesiones, type Identidad } from "./_sesion.ts";

const ADMINISTRATIVOS = 5;
const RONDAS = 20;

const identidades: Identidad[] = Array.from({ length: ADMINISTRATIVOS }, (_, i) => ({
  sub: `user_ct_admin_${i}`,
  rol: "administrativo",
}));

let enfermeraId: string;
let medicoId: string;

// Día `n` de 2032 desde el 1/3/2032 (fecha de calendario `YYYY-MM-DD`).
const fechaDe = (n: number) => new Date(Date.UTC(2032, 2, 1 + n)).toISOString().slice(0, 10);

async function limpiar(c: pg.Client): Promise<void> {
  await c.query(`delete from public.turnos_enfermeria where enfermera_id in (select e.id from public.enfermeras e join public.perfiles p on p.id = e.perfil_id where p.clerk_user_id like 'user_ct_%')`);
  await c.query(`delete from public.enfermeras where perfil_id in (select id from public.perfiles where clerk_user_id like 'user_ct_%')`);
  await c.query(`delete from public.medicos where cmp like 'CMP-CT-%'`);
  await c.query(`delete from public.perfiles where clerk_user_id like 'user_ct_%'`);
  await c.query(`delete from public.especialidades where nombre = 'Esp concurrencia turnos'`);
}

before(async () => {
  const c = await conectar();
  try {
    await limpiar(c);
    const esp = await c.query(`insert into public.especialidades (nombre) values ('Esp concurrencia turnos') returning id`);
    for (const { sub } of identidades) {
      await c.query(`insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, 'administrativo', 'Admin', $1)`, [sub]);
    }
    const perfilEnfermera = await c.query(
      `insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ('user_ct_enfermera', 'enfermera', 'Elena', 'Turnos') returning id`,
    );
    enfermeraId = (await c.query(`insert into public.enfermeras (perfil_id) values ($1) returning id`, [perfilEnfermera.rows[0].id])).rows[0].id;
    const perfilMedico = await c.query(
      `insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ('user_ct_medico', 'medico', 'Mario', 'Turnos') returning id`,
    );
    medicoId = (
      await c.query(`insert into public.medicos (perfil_id, cmp, especialidad_id) values ($1, 'CMP-CT-0001', $2) returning id`, [
        perfilMedico.rows[0].id,
        esp.rows[0].id,
      ])
    ).rows[0].id;
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

test(`${RONDAS} rondas de ${ADMINISTRATIVOS} administrativos asignando la misma enfermera, fecha y franja: siempre exactamente un turno`, async () => {
  await conSesiones(identidades, async (sesiones) => {
    const ejecutores = sesiones.map(ejecutorDeSesion);
    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const entrada = { enfermera_id: enfermeraId, fecha: fechaDe(ronda), turno: "manana", medico_id: medicoId };
      const resultados = await Promise.all(ejecutores.map((ejecutar) => asignarTurno(ejecutar, entrada)));

      const confirmados = resultados.filter((r) => r.ok);
      assert.equal(confirmados.length, 1, `ronda ${ronda}: debe quedar exactamente un turno (hubo ${confirmados.length})`);
      for (const r of resultados) {
        if (r.ok) continue;
        // Los demás reciben el mensaje de la spec, ya traducido: nunca el error crudo de Postgres.
        assert.equal(r.mensaje, MENSAJE_TURNO_DUPLICADO, `ronda ${ronda}: el rechazo debe ser el choque de turnos`);
        assert.equal(r.codigo, "SOLAPE");
      }
    }
    const { rows } = await sesiones[0]!.query(
      `select count(*)::int as n from public.turnos_enfermeria where enfermera_id = $1 and turno = 'manana' and fecha >= $2 and fecha <= $3`,
      [enfermeraId, fechaDe(0), fechaDe(RONDAS - 1)],
    );
    assert.equal(rows[0].n, RONDAS, "un turno por ronda: ningún duplicado quedó en la base");
  });
});

test("dos administrativos pasan a la vez dos turnos distintos a la misma franja libre: uno solo lo logra y el otro recibe el choque", async () => {
  await conSesiones(identidades.slice(0, 2), async ([a, b]) => {
    const [ejecutarA, ejecutarB] = [ejecutorDeSesion(a!), ejecutorDeSesion(b!)];
    for (let ronda = 0; ronda < 5; ronda++) {
      const fecha = fechaDe(40 + ronda);
      // La enfermera tiene turno de mañana y de tarde ese día; ambos quieren pasar su turno a la noche.
      const creados = await Promise.all(
        ["manana", "tarde"].map((turno) => asignarTurno(ejecutarA, { enfermera_id: enfermeraId, fecha, turno, medico_id: medicoId })),
      );
      assert.ok(creados.every((r) => r.ok), "se crean los dos turnos de partida");
      const ids = creados.map((r) => (r.ok ? r.datos.id : ""));
      const resultados = await Promise.all([
        actualizarTurno(ejecutarA, { id: ids[0], turno: "noche", medico_id: medicoId }),
        actualizarTurno(ejecutarB, { id: ids[1], turno: "noche", medico_id: medicoId }),
      ]);
      assert.equal(resultados.filter((r) => r.ok).length, 1, `ronda ${ronda}: solo un cambio prospera`);
      const perdedor = resultados.find((r) => !r.ok);
      assert.equal(perdedor && !perdedor.ok && perdedor.mensaje, MENSAJE_TURNO_DUPLICADO);
      const { rows } = await a!.query(`select count(*)::int as n from public.turnos_enfermeria where enfermera_id = $1 and fecha = $2 and turno = 'noche'`, [enfermeraId, fecha]);
      assert.equal(rows[0].n, 1, `ronda ${ronda}: una sola enfermera en la noche`);
    }
  });
});
