// Autogestión medible (H4, tarea 8.4; design.md, D10; specs/mis-citas-y-cancelacion): la métrica «75 % de las citas se reservan o se
// cancelan por el propio paciente» sale de datos que ya guarda el esquema, sin construir ninguna pantalla:
//   - reservas por canal: `citas.origen` ('portal' = el propio paciente; 'administrativo' = la recepción);
//   - cancelaciones por quién las hizo: `citas.cancelada_por` (perfil) → `perfiles.rol`.
// Esta prueba reserva y cancela COMO paciente y COMO administrativo, con `lib/citas/reservas.ts` ejecutado como `authenticated` sobre
// un branch de pruebas (la RLS, los disparadores y `reservar_cita()` son los reales), y ejecuta las dos consultas de la métrica.
// Las filas llevan marcas propias (documentos `7390…`, perfiles `user_ag_…`, CMP `CMP-AG-…`) y se borran al empezar y al terminar.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type pg from "pg";
import { cancelarCita, reservarCita } from "../../lib/citas/reservas.ts";
import { conectar } from "../concurrencia/_conexion.ts";
import { ejecutorDeSesion } from "../concurrencia/_ejecutor.ts";
import { abrirSesion, type Identidad } from "../concurrencia/_sesion.ts";

const ADMIN: Identidad = { sub: "user_ag_admin", rol: "administrativo" };
const PACIENTE: Identidad = { sub: "user_ag_paciente", rol: "paciente", email: "ag.paciente@demo.invalid" };

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const SLOT = 20 * MIN;

let medico: string;
let pacientePortal: string; // con la cuenta PACIENTE
let pacienteSinCuenta: string; // lo atiende la recepción
let perfilPaciente: string;
let perfilAdmin: string;

// Franja de 20 minutos a `horas` horas de ahora (el médico de prueba tiene la agenda abierta todos los días, 00:00–24:00).
function slot(horas: number): { inicio: string; fin: string } {
  const inicio = Math.ceil((Date.now() + horas * HORA) / SLOT) * SLOT;
  return { inicio: new Date(inicio).toISOString(), fin: new Date(inicio + SLOT).toISOString() };
}

async function limpiar(c: pg.Client): Promise<void> {
  const ids = `select id from public.pacientes where numero_documento like '7390%'`;
  await c.query(`delete from public.citas where paciente_id in (${ids})`);
  await c.query(`delete from public.asignaciones_paciente_medico where paciente_id in (${ids})`);
  await c.query(`delete from public.historias_clinicas where paciente_id in (${ids})`);
  await c.query(`delete from public.pacientes where numero_documento like '7390%'`);
  await c.query(`delete from public.medicos where cmp like 'CMP-AG-%'`);
  await c.query(`delete from public.perfiles where clerk_user_id like 'user_ag_%'`);
  await c.query(`delete from public.especialidades where nombre = 'Esp integracion autogestion'`);
}

before(async () => {
  const c = await conectar();
  try {
    await limpiar(c);
    const esp = (await c.query(`insert into public.especialidades (nombre) values ('Esp integracion autogestion') returning id`)).rows[0].id as string;
    const perfil = async ({ sub, rol }: Identidad) =>
      (await c.query(`insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, $2, 'Prueba', $1) returning id`, [sub, rol])).rows[0].id as string;
    perfilAdmin = await perfil(ADMIN);
    perfilPaciente = await perfil(PACIENTE);
    const perfilMedico = (await c.query(`insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ('user_ag_medico', 'medico', 'Prueba', 'Medico') returning id`)).rows[0].id as string;
    medico = (await c.query(`insert into public.medicos (perfil_id, cmp, especialidad_id) values ($1, 'CMP-AG-0001', $2) returning id`, [perfilMedico, esp])).rows[0].id as string;
    await c.query(
      `insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde)
       select $1, d, '00:00', '24:00', 20, '2020-01-01' from generate_series(0, 6) d`,
      [medico],
    );
    const paciente = async (perfilId: string | null, documento: string) =>
      (await c.query(
        `insert into public.pacientes (perfil_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
         values ($1, 'DNI', $2, 'Paciente', 'Autogestion', '1990-01-01', 'F', $3) returning id`,
        [perfilId, documento, `ag${documento}@demo.invalid`],
      )).rows[0].id as string;
    pacientePortal = await paciente(perfilPaciente, "73900001");
    pacienteSinCuenta = await paciente(null, "73900002");
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

async function como<T>(identidad: Identidad, fn: (ejecutar: ReturnType<typeof ejecutorDeSesion>) => Promise<T>): Promise<T> {
  const sesion = await abrirSesion(identidad);
  try {
    return await fn(ejecutorDeSesion(sesion));
  } finally {
    await sesion.end().catch(() => undefined);
  }
}

async function comoDueno<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = await conectar();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

const fila = (id: string) =>
  comoDueno(async (c) => (await c.query(`select estado::text as estado, origen, creada_por, cancelada_por, cancelada_en from public.citas where id = $1`, [id])).rows[0]);

// Las dos consultas de la métrica (docs/07-testing/pruebas-sql.md, «Autogestión medible»), acotadas a los pacientes de esta prueba.
const RESERVAS_POR_ORIGEN = `
  select c.origen, count(*)::int as n
    from public.citas c join public.pacientes p on p.id = c.paciente_id
   where p.numero_documento like '7390%'
   group by c.origen order by c.origen`;
const CANCELACIONES_POR_ROL = `
  select pf.rol::text as rol, count(*)::int as n
    from public.citas c
    join public.pacientes p on p.id = c.paciente_id
    join public.perfiles pf on pf.id = c.cancelada_por
   where c.estado = 'cancelada' and p.numero_documento like '7390%'
   group by pf.rol order by pf.rol`;

test("la reserva y la cancelación del propio paciente quedan marcadas como suyas, y las de la recepción se distinguen", async () => {
  // El paciente reserva y cancela su propia cita por el portal.
  const propia = slot(72);
  const reserva = await como(PACIENTE, (e) =>
    reservarCita(e, { paciente_id: pacientePortal, medico_id: medico, inicio: propia.inicio, fin: propia.fin }),
  );
  assert.equal(reserva.ok, true);
  if (!reserva.ok) return;
  const reservada = await fila(reserva.datos.id);
  assert.equal(reservada.origen, "portal", "una reserva del propio paciente tiene origen 'portal'");
  assert.equal(reservada.creada_por, perfilPaciente, "y su autora es el perfil del paciente");

  const cancelacion = await como(PACIENTE, (e) => cancelarCita(e, { cita_id: reserva.datos.id }));
  assert.equal(cancelacion.ok, true);
  const cancelada = await fila(reserva.datos.id);
  assert.equal(cancelada.estado, "cancelada");
  assert.equal(cancelada.cancelada_por, perfilPaciente, "la cancela el perfil del paciente");
  assert.ok(cancelada.cancelada_en, "con la hora de cancelación");

  // La recepción reserva y cancela la cita de un paciente sin cuenta.
  const ajena = slot(96);
  const reservaAdmin = await como(ADMIN, (e) =>
    reservarCita(e, { paciente_id: pacienteSinCuenta, medico_id: medico, inicio: ajena.inicio, fin: ajena.fin }),
  );
  assert.equal(reservaAdmin.ok, true);
  if (!reservaAdmin.ok) return;
  assert.equal((await fila(reservaAdmin.datos.id)).origen, "administrativo");
  const cancelaAdmin = await como(ADMIN, (e) => cancelarCita(e, { cita_id: reservaAdmin.datos.id }));
  assert.equal(cancelaAdmin.ok, true);
  const canceladaAdmin = await fila(reservaAdmin.datos.id);
  assert.equal(canceladaAdmin.cancelada_por, perfilAdmin, "una cancelación del administrativo se distingue de la del paciente");
  assert.notEqual(canceladaAdmin.cancelada_por, cancelada.cancelada_por);
});

test("las dos consultas de la métrica devuelven lo que ocurrió", async () => {
  const reservas = await comoDueno(async (c) => (await c.query(RESERVAS_POR_ORIGEN)).rows);
  assert.deepEqual(reservas, [
    { origen: "administrativo", n: 1 },
    { origen: "portal", n: 1 },
  ]);
  const cancelaciones = await comoDueno(async (c) => (await c.query(CANCELACIONES_POR_ROL)).rows);
  assert.deepEqual(cancelaciones, [
    { rol: "administrativo", n: 1 },
    { rol: "paciente", n: 1 },
  ]);
});
