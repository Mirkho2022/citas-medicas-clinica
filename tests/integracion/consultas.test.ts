// Lecturas de la consola del administrativo (H3, tarea 10.1; specs/gestion-de-citas): `lib/citas/consultas.ts` ejecutado COMO
// `authenticated` con la identidad y el rol de cada usuario, sobre un branch de pruebas (la RLS real y `slots_disponibles` reales).
// Complementa a tests/agenda/consultas.test.ts (doble del ejecutor). Los médicos de prueba tienen la agenda abierta todos los días
// (00:00–24:00, slots de 20 minutos), así que un día de Lima tiene 72 huecos por médico. Se usa un día dentro de 40 días para que
// todos los huecos sean futuros. Filas con marcas propias (documentos `7380…`, perfiles `user_ic_…`, CMP `CMP-IC-…`); se borran al
// empezar y al terminar. Nunca corre contra production (tests/concurrencia/_conexion.ts).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type pg from "pg";
import {
  agendaDelDia,
  bajasVigentes,
  bloqueosDelMedico,
  citaVigentePorId,
  citasFueraDeLaPlantilla,
  detalleDeBaja,
  diasConHorarios,
  horariosLibres,
  listarMedicos,
  medicosConHorarios,
  pacientePorId,
  plantillaDelMedico,
} from "../../lib/citas/consultas.ts";
import { hoyLima, instanteDesdeLima } from "../../lib/fechas/lima.ts";
import { sumarDias } from "../../lib/ui/calendario.ts";
import { conectar } from "../concurrencia/_conexion.ts";
import { ejecutorDeSesion } from "../concurrencia/_ejecutor.ts";
import { abrirSesion, type Identidad } from "../concurrencia/_sesion.ts";

const ADMIN: Identidad = { sub: "user_ic_admin", rol: "administrativo" };
const MEDICO_A: Identidad = { sub: "user_ic_medico_a", rol: "medico" };
const MEDICO_B: Identidad = { sub: "user_ic_medico_b", rol: "medico" };
const ENFERMERA: Identidad = { sub: "user_ic_enfermera", rol: "enfermera" };
const PACIENTE: Identidad = { sub: "user_ic_paciente", rol: "paciente" };
const SIN_ROL: Identidad = { sub: "user_ic_sinrol", rol: null };

const FECHA = sumarDias(hoyLima(), 40);
const FECHA_SIGUIENTE = sumarDias(FECHA, 1);
const SLOT = 20 * 60 * 1000;

let medicoA: string;
let medicoB: string;
let pacienteX: string;
let pacienteY: string;
let pacientePortal: string;
let citaA9: string; // A, 09:00, reservada
let citaA2340: string; // A, 23:40, confirmada (última del día)
let citaB9: string; // B, 09:00, confirmada
let citaB10: string; // B, 10:00, reservada, cubierta por una baja
let citaCancelada: string; // A, 15:00, cancelada

async function limpiar(c: pg.Client): Promise<void> {
  const ids = `select id from public.pacientes where numero_documento like '7380%'`;
  await c.query(`delete from public.citas where paciente_id in (${ids})`);
  await c.query(`delete from public.asignaciones_paciente_medico where paciente_id in (${ids})`);
  await c.query(`delete from public.historias_clinicas where paciente_id in (${ids})`);
  await c.query(`delete from public.pacientes where numero_documento like '7380%'`);
  await c.query(`delete from public.medicos where cmp like 'CMP-IC-%'`);
  await c.query(`delete from public.enfermeras where perfil_id in (select id from public.perfiles where clerk_user_id like 'user_ic_%')`);
  await c.query(`delete from public.perfiles where clerk_user_id like 'user_ic_%'`);
  await c.query(`delete from public.especialidades where nombre = 'Esp integracion consultas'`);
}

before(async () => {
  const c = await conectar();
  try {
    await limpiar(c);
    const esp = (await c.query(`insert into public.especialidades (nombre) values ('Esp integracion consultas') returning id`)).rows[0].id as string;
    const perfil = async ({ sub, rol }: Identidad, nombres = "Prueba") =>
      (await c.query(`insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, $2, $3, $1) returning id`, [sub, rol, nombres])).rows[0].id as string;
    await perfil(ADMIN);
    const perfilEnfermera = await perfil(ENFERMERA);
    await c.query(`insert into public.enfermeras (perfil_id) values ($1)`, [perfilEnfermera]);
    const perfilPaciente = await perfil(PACIENTE);
    const medico = async (identidad: Identidad, cmp: string, nombres: string) => {
      const id = (await c.query(`insert into public.medicos (perfil_id, cmp, especialidad_id) values ($1, $2, $3) returning id`, [await perfil(identidad, nombres), cmp, esp])).rows[0].id as string;
      await c.query(
        `insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde)
         select $1, d, '00:00', '24:00', 20, '2020-01-01' from generate_series(0, 6) d`,
        [id],
      );
      return id;
    };
    medicoA = await medico(MEDICO_A, "CMP-IC-0001", "Aurelia");
    medicoB = await medico(MEDICO_B, "CMP-IC-0002", "Benito");
    const paciente = async (perfilId: string | null, documento: string, tipo: "DNI" | "CE" = "DNI") =>
      (await c.query(
        `insert into public.pacientes (perfil_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
         values ($1, $2, $3, 'Paciente', 'Consultas', '1990-01-01', 'F', $4) returning id`,
        [perfilId, tipo, documento, `ic${documento}@demo.invalid`],
      )).rows[0].id as string;
    pacienteX = await paciente(null, "73800001");
    pacienteY = await paciente(null, "738000002", "CE");
    pacientePortal = await paciente(perfilPaciente, "73800003");

    const cita = async (paciente: string, medicoId: string, fecha: string, hora: string, estado: string) => {
      const inicio = instanteDesdeLima(fecha, hora);
      return (await c.query(
        `insert into public.citas (paciente_id, medico_id, inicio, fin, estado, origen) values ($1, $2, $3, $4, $5, 'administrativo') returning id`,
        [paciente, medicoId, inicio, new Date(inicio.getTime() + SLOT), estado],
      )).rows[0].id as string;
    };
    citaA9 = await cita(pacienteX, medicoA, FECHA, "09:00", "reservada");
    citaA2340 = await cita(pacienteY, medicoA, FECHA, "23:40", "confirmada");
    await cita(pacienteX, medicoA, FECHA_SIGUIENTE, "00:00", "reservada"); // pertenece al día siguiente
    citaCancelada = await cita(pacienteY, medicoA, FECHA, "15:00", "cancelada");
    citaB9 = await cita(pacientePortal, medicoB, FECHA, "09:00", "confirmada");
    citaB10 = await cita(pacienteY, medicoB, FECHA, "10:00", "reservada");
    await c.query(`insert into public.bloqueos_agenda (medico_id, rango, motivo) values ($1, tstzrange($2, $3), 'Baja de prueba')`, [
      medicoB,
      instanteDesdeLima(FECHA, "10:00"),
      instanteDesdeLima(FECHA, "10:20"),
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

test("la agenda de un médico trae sus citas del día de Lima y solo las de ese día (23:40 entra; 00:00 del día siguiente, no)", async () => {
  const agenda = await como(ADMIN, (e) => agendaDelDia(e, FECHA, medicoA));
  const citas = agenda.filas.filter((f) => f.tipo === "cita");
  assert.deepEqual(
    citas.map((c) => (c.tipo === "cita" ? c.id : "")),
    [citaA9, citaCancelada, citaA2340],
    "9:00, 15:00 (cancelada) y 23:40, en ese orden; la de 00:00 del día siguiente no",
  );
  assert.equal(agenda.citas, 3);
});

test("los huecos libres se intercalan por hora, descartan lo ocupado (también por citas) y la cancelada libera su horario", async () => {
  const agenda = await como(ADMIN, (e) => agendaDelDia(e, FECHA, medicoA));
  // 72 slots de 20 minutos menos 2 vigentes (la cancelada no ocupa): 70.
  assert.equal(agenda.huecos, 70);
  const horas = agenda.filas.map((f) => new Date(f.inicio).getTime());
  assert.deepEqual(horas, [...horas].sort((a, b) => a - b), "ordenada por hora");
  const hueco15 = agenda.filas.find((f) => f.tipo === "hueco" && f.inicio === instanteDesdeLima(FECHA, "15:00").toISOString());
  assert.ok(hueco15, "el horario de la cita cancelada vuelve a estar libre");
  const en9 = agenda.filas.filter((f) => f.inicio === instanteDesdeLima(FECHA, "09:00").toISOString());
  assert.deepEqual(en9.map((f) => f.tipo), ["cita"], "a las 9:00 hay solo la cita, no también un hueco");
});

test("una cita cubierta por una baja del médico lo dice (porBaja); una sin baja, no", async () => {
  const agenda = await como(ADMIN, (e) => agendaDelDia(e, FECHA, medicoB));
  const porId = new Map(agenda.filas.flatMap((f) => (f.tipo === "cita" ? [[f.id, f] as const] : [])));
  assert.equal(porId.get(citaB10)?.porBaja, true);
  assert.equal(porId.get(citaB9)?.porBaja, false);
  // el hueco de las 10:00 no se ofrece: hay cita y además una ausencia. 72 - 2 = 70.
  assert.equal(agenda.huecos, 70);
});

test("la agenda de todos los médicos incluye a los dos con su nombre y servicio, y el paciente con su documento", async () => {
  const agenda = await como(ADMIN, (e) => agendaDelDia(e, FECHA));
  const mias = agenda.filas.filter((f) => f.tipo === "cita" && [citaA9, citaB9, citaB10, citaA2340].includes(f.id));
  assert.equal(mias.length, 4);
  const b9 = mias.find((f) => f.tipo === "cita" && f.id === citaB9);
  assert.ok(b9 && b9.tipo === "cita");
  assert.equal(b9.medico, "Benito user_ic_medico_b");
  assert.equal(b9.servicio, "Esp integracion consultas");
  assert.equal(b9.estado, "confirmada");
  assert.deepEqual(b9.paciente, { id: pacientePortal, nombres: "Paciente", apellidos: "Consultas", tipoDocumento: "DNI", documento: "73800003" });
  const a2340 = mias.find((f) => f.tipo === "cita" && f.id === citaA2340);
  assert.ok(a2340 && a2340.tipo === "cita");
  assert.equal(a2340.paciente.tipoDocumento, "CE");
});

test("horariosLibres de un médico: 72 menos los vigentes, todos en la malla de 20 minutos y ninguno ocupado", async () => {
  const libres = await como(ADMIN, (e) => horariosLibres(e, medicoA, FECHA));
  assert.equal(libres.length, 70);
  assert.ok(libres.every((h) => new Date(h.inicio).getTime() % SLOT === 0 && new Date(h.fin).getTime() - new Date(h.inicio).getTime() === SLOT));
  assert.ok(!libres.some((h) => h.inicio === instanteDesdeLima(FECHA, "09:00").toISOString()), "el de las 9:00 está ocupado");
  assert.ok(libres.every((h) => h.medicoId === medicoA && h.servicio === "Esp integracion consultas"));
});

test("listarMedicos trae a los médicos activos con su especialidad; uno dado de baja no aparece", async () => {
  const antes = await como(ADMIN, (e) => listarMedicos(e));
  assert.ok(antes.some((m) => m.id === medicoA && m.especialidad === "Esp integracion consultas"));
  const c = await conectar();
  try {
    await c.query(`update public.medicos set activo = false where id = $1`, [medicoB]);
    const despues = await como(ADMIN, (e) => listarMedicos(e));
    assert.ok(despues.some((m) => m.id === medicoA));
    assert.ok(!despues.some((m) => m.id === medicoB));
    // y sus huecos ya no se ofrecen: la base de datos descarta a un médico de baja
    assert.equal((await como(ADMIN, (e) => agendaDelDia(e, FECHA, medicoB))).huecos, 0);
  } finally {
    await c.query(`update public.medicos set activo = true where id = $1`, [medicoB]);
    await c.end();
  }
});

test("pacientePorId y citaVigentePorId devuelven lo que ve el administrativo; una cancelada no es vigente", async () => {
  const p = await como(ADMIN, (e) => pacientePorId(e, pacienteX));
  assert.equal(p?.numero_documento, "73800001");
  assert.equal(p?.email, "ic73800001@demo.invalid");
  assert.equal(await como(ADMIN, (e) => pacientePorId(e, "00000000-0000-4000-8000-000000000000")), null);

  const vigente = await como(ADMIN, (e) => citaVigentePorId(e, citaA9));
  assert.equal(vigente?.id, citaA9);
  assert.equal(vigente?.estado, "reservada");
  assert.equal(vigente?.medicoId, medicoA);
  assert.equal(await como(ADMIN, (e) => citaVigentePorId(e, citaCancelada)), null);
});

test("la RLS acota las lecturas: enfermera y sin rol no ven citas ni huecos; el paciente ve solo su cita, no las de otros", async () => {
  for (const identidad of [ENFERMERA, SIN_ROL]) {
    const agenda = await como(identidad, (e) => agendaDelDia(e, FECHA));
    assert.equal(agenda.citas, 0, `${identidad.sub}: sin citas`);
    assert.equal(agenda.huecos, 0, `${identidad.sub}: sin huecos (slots_disponibles solo atiende a administrativo y paciente)`);
    assert.equal(await como(identidad, (e) => pacientePorId(e, pacienteX)), null);
    assert.equal(await como(identidad, (e) => citaVigentePorId(e, citaA9)), null);
  }
  const comoPaciente = await como(PACIENTE, (e) => agendaDelDia(e, FECHA));
  const ids = comoPaciente.filas.flatMap((f) => (f.tipo === "cita" ? [f.id] : []));
  assert.deepEqual(ids, [citaB9], "solo su propia cita");
  assert.equal(await como(PACIENTE, (e) => pacientePorId(e, pacienteX)), null, "no lee a otro paciente");
  assert.equal(await como(PACIENTE, (e) => citaVigentePorId(e, citaA9)), null, "ni su cita ajena");
});

test("diasConHorarios marca los días con plantilla vigente del médico (aquí, todos los días)", async () => {
  const dias = await como(ADMIN, (e) => diasConHorarios(e, medicoA, hoyLima(), 7));
  assert.deepEqual(dias, Array.from({ length: 7 }, (_, i) => sumarDias(hoyLima(), i)));
  // La plantilla la lee todo rol con sesión (política `disponibilidades_lee_todo_rol`: no es un dato sensible y el paciente la
  // necesita para reservar); una sesión sin rol, no.
  assert.equal((await como(ENFERMERA, (e) => diasConHorarios(e, medicoA, hoyLima(), 7))).length, 7);
  assert.deepEqual(await como(SIN_ROL, (e) => diasConHorarios(e, medicoA, hoyLima(), 7)), [], "sin rol no ve la plantilla");
});

test("la plantilla del médico sale de lunes a domingo, con el fin 24:00 intacto", async () => {
  const tramos = await como(ADMIN, (e) => plantillaDelMedico(e, medicoA));
  assert.deepEqual(tramos.map((t) => t.diaSemana), [1, 2, 3, 4, 5, 6, 0]);
  assert.ok(tramos.every((t) => t.horaInicio === "00:00" && t.horaFin === "24:00" && t.duracionSlotMin === 20 && t.vigenteDesde === "2020-01-01" && t.vigenteHasta === null));
});

test("las ausencias del médico traen el rango como instantes y el motivo; solo las vigentes o futuras", async () => {
  const ausencias = await como(ADMIN, (e) => bloqueosDelMedico(e, medicoB));
  assert.equal(ausencias.length, 1);
  assert.equal(ausencias[0]!.desde, instanteDesdeLima(FECHA, "10:00").toISOString());
  assert.equal(ausencias[0]!.hasta, instanteDesdeLima(FECHA, "10:20").toISOString());
  assert.equal(ausencias[0]!.motivo, "Baja de prueba");
  assert.deepEqual(await como(ADMIN, (e) => bloqueosDelMedico(e, medicoA)), []);
});

test("medicosConHorarios cuenta tramos y ausencias vigentes de cada médico", async () => {
  const todos = await como(ADMIN, (e) => medicosConHorarios(e));
  const a = todos.find((m) => m.id === medicoA);
  const b = todos.find((m) => m.id === medicoB);
  assert.deepEqual([a?.tramos, a?.ausencias, a?.activo], [7, 0, true]);
  assert.deepEqual([b?.tramos, b?.ausencias], [7, 1]);
  assert.equal(a?.especialidad, "Esp integracion consultas");
});

test("citasFueraDeLaPlantilla muestra solo las citas vigentes futuras que la plantilla ya no cubre, sin tocarlas", async () => {
  assert.deepEqual(await como(ADMIN, (e) => citasFueraDeLaPlantilla(e, medicoA)), [], "con la plantilla completa, ninguna queda fuera");
  const c = await conectar();
  let idFuera: string | undefined;
  try {
    // 11:10–11:30 no es un slot de 20 minutos desde las 00:00.
    const inicio = instanteDesdeLima(FECHA, "11:10");
    idFuera = (await c.query(
      `insert into public.citas (paciente_id, medico_id, inicio, fin, estado, origen) values ($1, $2, $3, $4, 'reservada', 'administrativo') returning id`,
      [pacienteX, medicoA, inicio, new Date(inicio.getTime() + SLOT)],
    )).rows[0].id as string;
    const fuera = await como(ADMIN, (e) => citasFueraDeLaPlantilla(e, medicoA));
    assert.deepEqual(fuera.map((f) => f.id), [idFuera]);
    assert.equal(fuera[0]!.paciente, "Paciente Consultas");
    assert.equal(fuera[0]!.documento, "DNI 73800001");
    assert.equal((await c.query(`select estado::text as e from public.citas where id = $1`, [idFuera])).rows[0].e, "reservada", "no se canceló");
  } finally {
    if (idFuera) await c.query(`delete from public.citas where id = $1`, [idFuera]);
    await c.end();
  }
});

test("bajasVigentes cuenta las citas por reasignar de cada baja; con un sustituto, ninguna queda por contactar", async () => {
  const todas = await como(ADMIN, (e) => bajasVigentes(e));
  const baja = todas.find((b) => b.medicoId === medicoB);
  assert.ok(baja, "la baja de prueba del médico B figura");
  assert.equal(baja.motivo, "Baja de prueba");
  assert.equal(baja.medico, "Benito user_ic_medico_b");
  assert.deepEqual([baja.porReasignar, baja.conPropuestas, baja.porContactar], [1, 1, 0]);
});

test("el detalle de la baja trae la cita afectada con su paciente y las propuestas, el mismo horario primero", async () => {
  const [ausencia] = await como(ADMIN, (e) => bloqueosDelMedico(e, medicoB));
  const detalle = await como(ADMIN, (e) => detalleDeBaja(e, ausencia!.id));
  assert.ok(detalle);
  assert.equal(detalle.citas.length, 1, "solo la cita de las 10:00 cae dentro de la baja; la de las 9:00, no");
  const c = detalle.citas[0]!;
  assert.equal(c.id, citaB10);
  assert.deepEqual(c.paciente, {
    id: pacienteY, nombres: "Paciente", apellidos: "Consultas", tipoDocumento: "CE", documento: "738000002",
    email: "ic738000002@demo.invalid", telefono: null,
  });
  assert.ok(c.propuestas.length >= 1 && c.propuestas.length <= 3);
  const primera = c.propuestas[0]!;
  assert.equal(primera.mismoHorario, true, "el mismo horario va primero");
  assert.equal(primera.medicoId, medicoA);
  assert.equal(primera.inicio, instanteDesdeLima(FECHA, "10:00").toISOString());
  assert.equal(await como(ADMIN, (e) => detalleDeBaja(e, "00000000-0000-4000-8000-000000000000")), null);
  assert.equal(await como(ADMIN, (e) => detalleDeBaja(e, "no-es-uuid")), null);
});

test("sin médico sustituto disponible no hay propuestas: la cita queda por contactar, con los datos del paciente", async () => {
  const [ausencia] = await como(ADMIN, (e) => bloqueosDelMedico(e, medicoB));
  const c = await conectar();
  try {
    await c.query(`update public.medicos set activo = false where id = $1`, [medicoA]);
    const detalle = await como(ADMIN, (e) => detalleDeBaja(e, ausencia!.id));
    assert.equal(detalle?.citas[0]?.propuestas.length, 0);
    assert.equal(detalle?.baja.porContactar, 1);
    assert.equal(detalle?.citas[0]?.paciente.email, "ic738000002@demo.invalid");
  } finally {
    await c.query(`update public.medicos set activo = true where id = $1`, [medicoA]);
    await c.end();
  }
});

test("enfermera y sin rol no ven bajas ni detalle (la RLS y las funciones los rechazan)", async () => {
  const [ausencia] = await como(ADMIN, (e) => bloqueosDelMedico(e, medicoB));
  for (const identidad of [ENFERMERA, SIN_ROL]) {
    assert.deepEqual(await como(identidad, (e) => bajasVigentes(e).catch(() => [])), [], identidad.sub);
    assert.equal(await como(identidad, (e) => detalleDeBaja(e, ausencia!.id).catch(() => null)), null, identidad.sub);
  }
});
