// reservar_cita() y reprogramar_cita() bajo concurrencia real, llamadas COMO `authenticated` (H3, tarea 4.4).
// Spec: gestion-de-citas («Doble reserva»). Complementa a 10_doble_reserva (INSERT directo como dueño): aquí se prueba
// la función que usan la consola y el portal, con la RLS y los disparadores del rol que llama.
// Las filas de prueba llevan marcas propias, se borran al empezar (por si una ejecución anterior se interrumpió) y al
// terminar. La auditoría (solo-agregar) conserva el rastro: por eso corre contra un branch de pruebas, nunca production.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type pg from "pg";
import { conectar, urlDePruebas } from "./_conexion.ts";
import { abrirSesion, conSesiones, type Identidad } from "./_sesion.ts";

const ADMINISTRATIVOS = 5;
const RONDAS = 20;
const RONDAS_REPROGRAMAR = 10;
const SLOT_MS = 20 * 60 * 1000;
// Lunes 2/6/2031 a las 09:00 de Lima (14:00Z): lejos en el futuro, en la malla de 20 minutos de la disponibilidad.
const BASE = Date.parse("2031-06-02T14:00:00Z");
const DIA_MS = 24 * 60 * 60 * 1000;

const identidades: Identidad[] = Array.from({ length: ADMINISTRATIVOS }, (_, i) => ({
  sub: `user_cf_admin_${i}`,
  rol: "administrativo",
}));

let medicoId: string;
const pacienteIds: string[] = [];

async function limpiar(c: pg.Client): Promise<void> {
  await c.query(`delete from public.citas where paciente_id in (select id from public.pacientes where numero_documento like '7320%')`);
  await c.query(`delete from public.historias_clinicas where paciente_id in (select id from public.pacientes where numero_documento like '7320%')`);
  await c.query(`delete from public.pacientes where numero_documento like '7320%'`);
  await c.query(`delete from public.medicos where cmp like 'CMP-CF-%'`); // las disponibilidades caen en cascada
  await c.query(`delete from public.perfiles where clerk_user_id like 'user_cf_%'`);
  await c.query(`delete from public.especialidades where nombre = 'Esp concurrencia funcion'`);
}

before(async () => {
  const c = await conectar();
  try {
    await limpiar(c);
    const esp = await c.query(`insert into public.especialidades (nombre) values ('Esp concurrencia funcion') returning id`);
    for (const { sub } of identidades) {
      await c.query(`insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, 'administrativo', 'Admin', $1)`, [sub]);
    }
    const perfil = await c.query(
      `insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ('user_cf_medico', 'medico', 'Medico', 'Funcion') returning id`,
    );
    medicoId = (
      await c.query(`insert into public.medicos (perfil_id, cmp, especialidad_id) values ($1, 'CMP-CF-0001', $2) returning id`, [
        perfil.rows[0].id,
        esp.rows[0].id,
      ])
    ).rows[0].id;
    // Todos los días de 00:00 a 24:00 en slots de 20 minutos: cualquier múltiplo de 20 minutos desde la medianoche de Lima sirve.
    await c.query(
      `insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde)
       select $1, d, '00:00', '24:00', 20, '2030-01-01' from generate_series(0, 6) d`,
      [medicoId],
    );
    for (let i = 0; i < ADMINISTRATIVOS; i++) {
      const p = await c.query(
        `insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
         values ('DNI', $1, 'Paciente', $2, '1990-01-01', 'F', $3) returning id`,
        [`7320000${i}`, `Funcion${i}`, `cf${i}@demo.invalid`],
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

const reservar = (s: pg.Client, paciente: string, inicioMs: number) =>
  s.query(`select public.reservar_cita($1, $2, $3, $4) as id`, [paciente, medicoId, new Date(inicioMs), new Date(inicioMs + SLOT_MS)]);

const codigo = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? (r.reason as { code?: string }).code : undefined);

test(`${RONDAS} rondas de ${ADMINISTRATIVOS} administrativos reservando el mismo horario con reservar_cita: siempre exactamente una cita`, async () => {
  await conSesiones(identidades, async (sesiones) => {
    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const inicio = BASE + ronda * SLOT_MS;
      const resultados = await Promise.allSettled(sesiones.map((s, i) => reservar(s, pacienteIds[i], inicio)));
      const confirmadas = resultados.filter((r) => r.status === "fulfilled").length;
      assert.equal(confirmadas, 1, `ronda ${ronda}: debe confirmarse exactamente una reserva (hubo ${confirmadas})`);
      // Los demás pierden por exclusion_violation (23P01) o, si Postgres los resuelve abortando a uno, deadlock_detected
      // (40P01). Ambos significan «el horario lo tomó otra transacción»; la aplicación los traduce al mismo mensaje.
      for (const r of resultados) {
        if (r.status === "fulfilled") continue;
        const code = codigo(r);
        assert.ok(code === "23P01" || code === "40P01", `ronda ${ronda}: el rechazo debe ser 23P01 o 40P01, fue ${code}`);
      }
    }
    const { rows } = await sesiones[0].query(
      `select count(*)::int as n from public.citas where medico_id = $1 and inicio >= $2 and inicio < $3 and estado = 'reservada'`,
      [medicoId, new Date(BASE), new Date(BASE + RONDAS * SLOT_MS)],
    );
    assert.equal(rows[0].n, RONDAS, "una cita por horario: ninguna doble reserva quedó en la base");
  });
});

test(`${RONDAS_REPROGRAMAR} rondas de dos reprogramaciones simultáneas de la misma cita: una sola cita nueva y la otra recibe UC002`, async () => {
  const c = await conectar();
  try {
    await conSesiones(identidades.slice(0, 2), async ([a, b]) => {
      for (let ronda = 0; ronda < RONDAS_REPROGRAMAR; ronda++) {
        // Original el martes 3/6/2031; los dos destinos distintos el miércoles 4/6/2031, para que solo el bloqueo de la
        // fila original impida que ambas reprogramaciones prosperen.
        const original = BASE + DIA_MS + ronda * SLOT_MS;
        const destinoA = BASE + 2 * DIA_MS + ronda * 2 * SLOT_MS;
        const destinoB = destinoA + SLOT_MS;
        const { rows } = await c.query(
          `insert into public.citas (paciente_id, medico_id, inicio, fin, origen) values ($1, $2, $3, $4, 'administrativo') returning id`,
          [pacienteIds[0], medicoId, new Date(original), new Date(original + SLOT_MS)],
        );
        const citaId: string = rows[0].id;
        const reprogramar = (s: pg.Client, destino: number) =>
          s.query(`select public.reprogramar_cita($1, $2, $3, $4) as id`, [citaId, medicoId, new Date(destino), new Date(destino + SLOT_MS)]);
        const resultados = await Promise.allSettled([reprogramar(a, destinoA), reprogramar(b, destinoB)]);

        assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1, `ronda ${ronda}: solo una reprogramación prospera`);
        const rechazada = resultados.find((r) => r.status === "rejected");
        assert.equal(codigo(rechazada!), "UC002", `ronda ${ronda}: la otra encuentra la cita ya no vigente (UC002)`);
        const nuevas = await c.query(`select count(*)::int as n from public.citas where reprogramada_de = $1`, [citaId]);
        assert.equal(nuevas.rows[0].n, 1, `ronda ${ronda}: exactamente una cita nueva apunta a la original`);
        const estado = await c.query(`select estado::text from public.citas where id = $1`, [citaId]);
        assert.equal(estado.rows[0].estado, "cancelada", `ronda ${ronda}: la original quedó cancelada`);
      }
    });
  } finally {
    await c.end();
  }
});

test("el ayudante de sesiones se niega a correr si el destino es producción", async () => {
  const anterior = process.env.DATABASE_URL_PRODUCCION;
  process.env.DATABASE_URL_PRODUCCION = urlDePruebas().replace("?sslmode=require", "");
  try {
    await assert.rejects(abrirSesion({ sub: "user_cf_prod", rol: null }), /producción/);
  } finally {
    if (anterior === undefined) delete process.env.DATABASE_URL_PRODUCCION;
    else process.env.DATABASE_URL_PRODUCCION = anterior;
  }
});
