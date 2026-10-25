// Lecturas del portal del paciente (H4, tarea 6.1 y 7.1; specs/busqueda-y-reserva-de-cita y mis-citas-y-cancelacion):
// `lib/portal/consultas.ts` ejecutado COMO `authenticated` con la identidad de dos pacientes, sobre un branch de pruebas (la RLS real y
// `slots_disponibles` reales). Los médicos de prueba tienen la agenda abierta todos los días (00:00–24:00, slots de 20 minutos), así que
// un día de Lima tiene 72 horarios por médico. Filas con marcas propias (documentos `7392…`, perfiles `user_pc_…`, CMP `CMP-PC-…`); se
// borran al empezar y al terminar. Nunca corre contra production (tests/concurrencia/_conexion.ts).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type pg from "pg";
import { hoyLima, instanteDesdeLima } from "../../lib/fechas/lima.ts";
import {
  citaPropiaPorId,
  citaVigenteDelPacienteEn,
  diasDelMedico,
  estadoDeCitaPropia,
  horarioLibre,
  horariosDelDia,
  listarEspecialidades,
  medicoActivoPorId,
  medicosDeEspecialidad,
  misCitas,
  nombreDelPaciente,
  proximaCita,
  todosLosMedicos,
} from "../../lib/portal/consultas.ts";
import { sumarDias } from "../../lib/ui/calendario.ts";
import { conectar } from "../concurrencia/_conexion.ts";
import { ejecutorDeSesion } from "../concurrencia/_ejecutor.ts";
import { abrirSesion, type Identidad } from "../concurrencia/_sesion.ts";

const PACIENTE_A: Identidad = { sub: "user_pc_paciente_a", rol: "paciente", email: "pc.a@demo.invalid" };
const PACIENTE_B: Identidad = { sub: "user_pc_paciente_b", rol: "paciente", email: "pc.b@demo.invalid" };
const SIN_FICHA: Identidad = { sub: "user_pc_sin_ficha", rol: "paciente", email: "pc.sf@demo.invalid" };

const HOY = hoyLima();
const FECHA = sumarDias(HOY, 14); // un día lejano: todos sus horarios son futuros
const FECHA_BLOQUEADA = sumarDias(HOY, 20);
const SLOT = 20 * 60 * 1000;
const MOTIVO_DEL_BLOQUEO = "Licencia secreta de prueba";

let esp1: string;
let esp2: string;
let medicoA: string;
let medicoB: string;
let medicoInactivo: string;
let medicoSinAgenda: string;
let medicoEspInactiva: string;
let pacienteA: string;
let pacienteB: string;
let citaDeB: string; // paciente B con el médico A, FECHA 09:00
let citaPropiaConB: string; // paciente A con el médico B, FECHA 10:00
let citaProximaReservada: string;
let citaProximaConfirmada: string;
let citaFuturaCancelada: string;
let citaPasadaReservada: string;
let citaPasadaNoAsistio: string;
let citaPasadaAtendida: string;

async function limpiar(c: pg.Client): Promise<void> {
  const ids = `select id from public.pacientes where numero_documento like '7392%'`;
  await c.query(`delete from public.citas where paciente_id in (${ids})`);
  await c.query(`delete from public.asignaciones_paciente_medico where paciente_id in (${ids})`);
  await c.query(`delete from public.historias_clinicas where paciente_id in (${ids})`);
  await c.query(`delete from public.pacientes where numero_documento like '7392%'`);
  await c.query(`delete from public.medicos where cmp like 'CMP-PC-%'`);
  await c.query(`delete from public.perfiles where clerk_user_id like 'user_pc_%'`);
  await c.query(`delete from public.especialidades where nombre in ('Esp portal consultas', 'Esp portal sin activos')`);
}

before(async () => {
  const c = await conectar();
  try {
    await limpiar(c);
    esp1 = (await c.query(`insert into public.especialidades (nombre) values ('Esp portal consultas') returning id`)).rows[0].id as string;
    esp2 = (await c.query(`insert into public.especialidades (nombre) values ('Esp portal sin activos') returning id`)).rows[0].id as string;
    const perfil = async (sub: string, rol: string, nombres = "Prueba") =>
      (await c.query(`insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, $2, $3, $1) returning id`, [sub, rol, nombres])).rows[0].id as string;
    const medico = async (sub: string, cmp: string, nombres: string, esp: string, activo: boolean, conAgenda: boolean) => {
      const id = (await c.query(`insert into public.medicos (perfil_id, cmp, especialidad_id, activo) values ($1, $2, $3, $4) returning id`, [await perfil(sub, "medico", nombres), cmp, esp, activo])).rows[0].id as string;
      if (conAgenda) {
        await c.query(
          `insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde)
           select $1, d, '00:00', '24:00', 20, '2020-01-01' from generate_series(0, 6) d`,
          [id],
        );
      }
      return id;
    };
    medicoA = await medico("user_pc_medico_a", "CMP-PC-0001", "Aurelia", esp1, true, true);
    medicoB = await medico("user_pc_medico_b", "CMP-PC-0002", "Benito", esp1, true, true);
    medicoInactivo = await medico("user_pc_medico_c", "CMP-PC-0003", "Cecilia", esp1, false, true);
    medicoSinAgenda = await medico("user_pc_medico_d", "CMP-PC-0004", "Dario", esp1, true, false);
    medicoEspInactiva = await medico("user_pc_medico_e", "CMP-PC-0005", "Elena", esp2, false, true);

    const paciente = async (sub: string, documento: string) =>
      (await c.query(
        `insert into public.pacientes (perfil_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
         values ($1, 'DNI', $2, $3, 'Portal', '1990-01-01', 'F', $4) returning id`,
        [await perfil(sub, "paciente"), documento, sub === PACIENTE_A.sub ? "Alicia" : "Beatriz", `pc${documento}@demo.invalid`],
      )).rows[0].id as string;
    pacienteA = await paciente(PACIENTE_A.sub, "73920001");
    pacienteB = await paciente(PACIENTE_B.sub, "73920002");
    await perfil(SIN_FICHA.sub, "paciente");

    const cita = async (paciente: string, medicoId: string, fecha: string, hora: string, estado: string) => {
      const inicio = instanteDesdeLima(fecha, hora);
      return (await c.query(
        `insert into public.citas (paciente_id, medico_id, inicio, fin, estado, origen) values ($1, $2, $3, $4, $5, 'portal') returning id`,
        [paciente, medicoId, inicio, new Date(inicio.getTime() + SLOT), estado],
      )).rows[0].id as string;
    };
    citaDeB = await cita(pacienteB, medicoA, FECHA, "09:00", "reservada");
    citaPropiaConB = await cita(pacienteA, medicoB, FECHA, "10:00", "reservada");
    citaProximaReservada = await cita(pacienteA, medicoA, sumarDias(HOY, 3), "08:00", "reservada");
    citaProximaConfirmada = await cita(pacienteA, medicoA, sumarDias(HOY, 5), "08:00", "confirmada");
    citaFuturaCancelada = await cita(pacienteA, medicoA, sumarDias(HOY, 7), "08:00", "cancelada");
    citaPasadaReservada = await cita(pacienteA, medicoA, sumarDias(HOY, -1), "08:00", "reservada");
    citaPasadaNoAsistio = await cita(pacienteA, medicoA, sumarDias(HOY, -2), "08:00", "no_asistio");
    citaPasadaAtendida = await cita(pacienteA, medicoA, sumarDias(HOY, -3), "08:00", "atendida");

    // Un día completo bloqueado para el médico A: ninguna hora de ese día debe ofrecerse ni explicarse.
    await c.query(`insert into public.bloqueos_agenda (medico_id, rango, motivo) values ($1, tstzrange($2, $3), $4)`, [
      medicoA,
      instanteDesdeLima(FECHA_BLOQUEADA, "00:00"),
      instanteDesdeLima(sumarDias(FECHA_BLOQUEADA, 1), "00:00"),
      MOTIVO_DEL_BLOQUEO,
    ]);
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

test("las especialidades listadas son solo las que tienen al menos un médico activo", async () => {
  const lista = await como(PACIENTE_A, (e) => listarEspecialidades(e));
  const propias = lista.filter((x) => x.id === esp1 || x.id === esp2);
  assert.deepEqual(propias.map((x) => x.id), [esp1], "la especialidad solo con médicos de baja no se ofrece");
});

test("los médicos de una especialidad son los activos, cada uno con su próximo horario o «sin horarios»", async () => {
  const medicos = await como(PACIENTE_A, (e) => medicosDeEspecialidad(e, esp1, HOY));
  assert.deepEqual(medicos.map((m) => m.id).sort(), [medicoA, medicoB, medicoSinAgenda].sort(), "el médico dado de baja no aparece");
  const a = medicos.find((m) => m.id === medicoA)!;
  assert.ok(a.proximoHorario, "el médico con agenda abierta tiene próximo horario");
  assert.ok(new Date(a.proximoHorario!).getTime() > Date.now(), "y es futuro");
  assert.equal(a.especialidad, "Esp portal consultas");
  assert.equal(medicos.find((m) => m.id === medicoSinAgenda)!.proximoHorario, null, "sin disponibilidad: «Sin horarios próximos»");
});

test("«Ya sé con qué médico» lista solo médicos activos, y un médico de baja no se puede elegir por su identificador", async () => {
  const todos = await como(PACIENTE_A, (e) => todosLosMedicos(e));
  const ids = todos.map((m) => m.id);
  assert.ok(ids.includes(medicoA) && ids.includes(medicoB));
  assert.ok(!ids.includes(medicoInactivo) && !ids.includes(medicoEspInactiva));
  assert.equal(await como(PACIENTE_A, (e) => medicoActivoPorId(e, medicoInactivo)), null);
  assert.equal((await como(PACIENTE_A, (e) => medicoActivoPorId(e, medicoA)))?.especialidadId, esp1);
});

test("los días: 30 desde hoy, con la cuenta de horarios libres; un bloqueo deja el día en cero y la cita de otro paciente resta uno", async () => {
  const dias = await como(PACIENTE_A, (e) => diasDelMedico(e, medicoA, HOY));
  assert.equal(dias.length, 30);
  assert.equal(dias[0]!.dia, HOY);
  assert.equal(dias[29]!.dia, sumarDias(HOY, 29));
  const de = (fecha: string) => dias.find((d) => d.dia === fecha)!;
  assert.equal(de(FECHA_BLOQUEADA).libres, 0, "el día bloqueado aparece con cero horarios");
  assert.equal(de(FECHA).libres, 71, "72 horarios menos el de las 09:00, que tiene la cita de otro paciente");
  assert.equal(de(sumarDias(HOY, 10)).libres, 72);
  assert.ok(!JSON.stringify(dias).includes(MOTIVO_DEL_BLOQUEO), "el motivo del bloqueo no llega al paciente");
});

test("los horarios de un día no incluyen el ocupado por otro paciente ni dicen de quién es", async () => {
  const horarios = await como(PACIENTE_A, (e) => horariosDelDia(e, medicoA, FECHA));
  const a9 = instanteDesdeLima(FECHA, "09:00").toISOString();
  assert.equal(horarios.length, 71);
  assert.ok(!horarios.some((h) => h.inicio === a9), "el horario con la cita de otro paciente no se ofrece");
  assert.ok(!JSON.stringify(horarios).includes(pacienteB), "ningún dato del otro paciente");
  assert.ok(horarios.every((h) => new Date(h.inicio).getTime() > Date.now()), "todos son futuros");
});

test("un horario que cruza una cita vigente del propio paciente con otro médico se marca como no disponible", async () => {
  const horarios = await como(PACIENTE_A, (e) => horariosDelDia(e, medicoA, FECHA));
  const a10 = instanteDesdeLima(FECHA, "10:00").toISOString();
  const a1020 = instanteDesdeLima(FECHA, "10:20").toISOString();
  assert.equal(horarios.find((h) => h.inicio === a10)?.disponible, false, "choca con su cita de las 10:00 con el médico B");
  assert.equal(horarios.find((h) => h.inicio === a1020)?.disponible, true, "el siguiente sí está libre");
  // El otro paciente no tiene ese cruce.
  const deB = await como(PACIENTE_B, (e) => horariosDelDia(e, medicoA, FECHA));
  assert.equal(deB.find((h) => h.inicio === a10)?.disponible, true);
});

test("un horario recién tomado por otra persona se muestra «No disponible» en vez de desaparecer", async () => {
  const tomado = instanteDesdeLima(FECHA, "09:00").toISOString(); // ya no figura entre los libres
  const horarios = await como(PACIENTE_A, (e) => horariosDelDia(e, medicoA, FECHA, { tomados: [tomado, "no-es-una-fecha", instanteDesdeLima(HOY, "09:00").toISOString()] }));
  const fila = horarios.find((h) => h.inicio === tomado);
  assert.deepEqual(fila, { inicio: tomado, fin: null, disponible: false });
  assert.equal(horarios.length, 72, "solo se agrega el del mismo día; el de otro día y el inválido se ignoran");
  assert.deepEqual(horarios.map((h) => h.inicio), [...horarios.map((h) => h.inicio)].sort(), "siguen en orden");
});

test("un día bloqueado no tiene ningún horario y no explica por qué", async () => {
  const horarios = await como(PACIENTE_A, (e) => horariosDelDia(e, medicoA, FECHA_BLOQUEADA));
  assert.deepEqual(horarios, []);
});

test("el horario libre trae el fin; uno ocupado, bloqueado o pasado ya no existe", async () => {
  const libre = instanteDesdeLima(FECHA, "09:20");
  const encontrado = await como(PACIENTE_A, (e) => horarioLibre(e, medicoA, libre.toISOString()));
  assert.deepEqual(encontrado, { inicio: libre.toISOString(), fin: new Date(libre.getTime() + SLOT).toISOString() });
  assert.equal(await como(PACIENTE_A, (e) => horarioLibre(e, medicoA, instanteDesdeLima(FECHA, "09:00").toISOString())), null, "ocupado");
  assert.equal(await como(PACIENTE_A, (e) => horarioLibre(e, medicoA, instanteDesdeLima(FECHA_BLOQUEADA, "09:00").toISOString())), null, "bloqueado");
  assert.equal(await como(PACIENTE_A, (e) => horarioLibre(e, medicoA, instanteDesdeLima(sumarDias(HOY, -1), "09:00").toISOString())), null, "pasado");
  assert.equal(await como(PACIENTE_A, (e) => horarioLibre(e, medicoA, "no-es-una-fecha")), null);
});

test("«Mis citas» separa próximas y anteriores, con el orden de la spec, y solo trae las del paciente", async () => {
  const r = await como(PACIENTE_A, (e) => misCitas(e));
  assert.deepEqual(
    r.proximas.map((c) => c.id),
    [citaProximaReservada, citaProximaConfirmada, citaPropiaConB],
    "vigentes que no terminaron, de la más cercana a la más lejana",
  );
  assert.deepEqual(
    r.anteriores.map((c) => c.id),
    [citaFuturaCancelada, citaPasadaReservada, citaPasadaNoAsistio, citaPasadaAtendida],
    "las demás, de la más reciente a la más antigua (una cancelada futura va en «Anteriores»)",
  );
  assert.equal(r.hayMasAnteriores, false);
  const todas = [...r.proximas, ...r.anteriores].map((c) => c.id);
  assert.ok(!todas.includes(citaDeB), "la cita de otro paciente no aparece");
  assert.deepEqual(
    r.proximas[0],
    {
      id: citaProximaReservada,
      inicio: instanteDesdeLima(sumarDias(HOY, 3), "08:00").toISOString(),
      fin: new Date(instanteDesdeLima(sumarDias(HOY, 3), "08:00").getTime() + SLOT).toISOString(),
      estado: "reservada",
      medico: "Aurelia user_pc_medico_a",
      servicio: "Esp portal consultas",
    },
  );
});

test("«Ver más»: con un límite menor se devuelven solo esas citas anteriores y se avisa que hay más", async () => {
  const r = await como(PACIENTE_A, (e) => misCitas(e, 2));
  assert.deepEqual(r.anteriores.map((c) => c.id), [citaFuturaCancelada, citaPasadaReservada]);
  assert.equal(r.hayMasAnteriores, true);
});

test("un paciente sin citas ve listas vacías; la cita de otro no se ve ni con su identificador", async () => {
  const sinCitas = await como(PACIENTE_B, (e) => misCitas(e));
  assert.deepEqual(sinCitas.proximas.map((c) => c.id), [citaDeB], "su única cita");
  assert.deepEqual(sinCitas.anteriores, []);
  // El paciente B pregunta por citas del paciente A.
  assert.equal(await como(PACIENTE_B, (e) => citaPropiaPorId(e, citaProximaReservada)), null);
  assert.equal(await como(PACIENTE_B, (e) => estadoDeCitaPropia(e, citaProximaReservada)), null);
  assert.equal(await como(PACIENTE_B, (e) => citaVigenteDelPacienteEn(e, medicoA, instanteDesdeLima(sumarDias(HOY, 3), "08:00").toISOString())), null);
  // Y el paciente sin ficha no ve ninguna.
  const sinFicha = await como(SIN_FICHA, (e) => misCitas(e));
  assert.deepEqual([sinFicha.proximas, sinFicha.anteriores], [[], []]);
});

test("la próxima cita y el estado de una cita propia salen de la misma fuente", async () => {
  const proxima = await como(PACIENTE_A, (e) => proximaCita(e));
  assert.equal(proxima?.id, citaProximaReservada);
  assert.equal(await como(PACIENTE_A, (e) => estadoDeCitaPropia(e, citaFuturaCancelada)), "cancelada");
  assert.equal(await como(PACIENTE_A, (e) => estadoDeCitaPropia(e, citaPasadaAtendida)), "atendida");
  assert.equal((await como(PACIENTE_A, (e) => citaPropiaPorId(e, citaProximaConfirmada)))?.estado, "confirmada");
  assert.equal(await como(PACIENTE_A, (e) => proximaCita(e).then(() => nombreDelPaciente(e))), "Alicia");
  assert.equal(await como(PACIENTE_B, (e) => nombreDelPaciente(e)), "Beatriz");
  assert.equal(await como(SIN_FICHA, (e) => nombreDelPaciente(e)), null);
});

test("un reintento de la misma reserva se reconoce: la cita vigente propia en ese médico y hora", async () => {
  const inicio = instanteDesdeLima(sumarDias(HOY, 3), "08:00").toISOString();
  assert.equal(await como(PACIENTE_A, (e) => citaVigenteDelPacienteEn(e, medicoA, inicio)), citaProximaReservada);
  assert.equal(await como(PACIENTE_A, (e) => citaVigenteDelPacienteEn(e, medicoB, inicio)), null, "otro médico");
  assert.equal(await como(PACIENTE_A, (e) => citaVigenteDelPacienteEn(e, medicoA, instanteDesdeLima(sumarDias(HOY, 7), "08:00").toISOString())), null, "una cancelada no cuenta");
});
