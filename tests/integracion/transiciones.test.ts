// Ciclo de estados de la cita (H3, tareas 10.4, 10.5 y 6.5; design.md, D13): `lib/citas/transiciones.ts` ejecutado COMO `authenticated`
// con la identidad y el rol de cada usuario, sobre un branch de pruebas (el disparador de transiciones, la función
// `marcar_cita_atendida`, la RLS y la auditoría son los reales). Complementa a tests/agenda/transiciones.test.ts (doble del
// ejecutor) y a pgTAP 61.
// Las pruebas del cierre automático (6.5) van aquí y no en otro archivo a propósito: `cerrar_citas_vencidas_como_personal()` cierra TODAS las
// reservadas vencidas de la base y estas pruebas dejan reservadas ya terminadas como datos; archivos distintos corren en paralelo y se pisarían.
// Las citas de prueba se preparan como dueño de la base de datos (el disparador no actúa sobre él), con horas relativas a `now()`.
// Las filas llevan marcas propias (documentos `7360…`, perfiles `user_it_…`, CMP `CMP-IT-…`) y se borran al empezar y al terminar;
// la auditoría es de solo agregar y conserva su rastro (por eso corre contra un branch de pruebas, nunca production).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type pg from "pg";
import { MENSAJE_CITA_NO_VIGENTE, MENSAJE_TRANSICION } from "../../lib/citas/errores.ts";
import { cerrarCitasVencidas } from "../../lib/citas/cierre.ts";
import { confirmarCita, marcarAtendida, marcarNoAsistio } from "../../lib/citas/transiciones.ts";
import { MENSAJE_NO_AUTORIZADO } from "../../lib/acciones/resultado.ts";
import { conectar } from "../concurrencia/_conexion.ts";
import { ejecutorDeSesion } from "../concurrencia/_ejecutor.ts";
import { abrirSesion, type Identidad } from "../concurrencia/_sesion.ts";

const ADMIN: Identidad = { sub: "user_it_admin", rol: "administrativo" };
const MEDICO: Identidad = { sub: "user_it_medico", rol: "medico" };
const MEDICO_2: Identidad = { sub: "user_it_medico2", rol: "medico" };
const ENFERMERA: Identidad = { sub: "user_it_enfermera", rol: "enfermera" };
const PACIENTE: Identidad = { sub: "user_it_paciente", rol: "paciente" };
const SIN_ROL: Identidad = { sub: "user_it_sinrol", rol: null };

const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;

let medico1: string;
let pacienteA: string; // sin cuenta de portal
let pacienteB: string; // con la cuenta de portal PACIENTE

type Estado = "reservada" | "confirmada" | "atendida" | "no_asistio" | "cancelada";

// Una franja única por cita (el médico no puede tener dos vigentes solapadas): cada una vive en su propio día.
//  - futura: dentro de más de 30 días; - empezada: su hora de inicio ya pasó (y también terminó); - terminada: igual que
//    empezada, pero se usa donde importa que `now() >= fin`; - enCurso: ahora está entre su inicio y su fin (una a la vez:
//    dos vigentes en curso del mismo médico se solaparían).
let desplazamiento = 0;
function franja(tipo: "futura" | "empezada" | "terminada" | "enCurso"): { inicio: Date; fin: Date } {
  desplazamiento += 1;
  const ahora = Date.now();
  if (tipo === "enCurso") return { inicio: new Date(ahora - 10 * MIN), fin: new Date(ahora + 10 * MIN) };
  const base = tipo === "futura" ? ahora + (30 + desplazamiento) * DIA : ahora - (3 + desplazamiento) * DIA;
  return { inicio: new Date(base), fin: new Date(base + 20 * MIN) };
}

async function limpiar(c: pg.Client): Promise<void> {
  const ids = `select id from public.pacientes where numero_documento like '7360%'`;
  await c.query(`delete from public.citas where paciente_id in (${ids})`);
  await c.query(`delete from public.asignaciones_paciente_medico where paciente_id in (${ids})`);
  await c.query(`delete from public.historias_clinicas where paciente_id in (${ids})`);
  await c.query(`delete from public.pacientes where numero_documento like '7360%'`);
  await c.query(`delete from public.medicos where cmp like 'CMP-IT-%'`);
  await c.query(`delete from public.enfermeras where perfil_id in (select id from public.perfiles where clerk_user_id like 'user_it_%')`);
  await c.query(`delete from public.perfiles where clerk_user_id like 'user_it_%'`);
  await c.query(`delete from public.especialidades where nombre = 'Esp integracion transiciones'`);
}

before(async () => {
  const c = await conectar();
  try {
    await limpiar(c);
    const esp = await c.query(`insert into public.especialidades (nombre) values ('Esp integracion transiciones') returning id`);
    const perfil = async ({ sub, rol }: Identidad) =>
      (await c.query(`insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, $2, 'Prueba', $1) returning id`, [sub, rol])).rows[0].id as string;
    await perfil(ADMIN);
    await perfil(ENFERMERA).then((id) => c.query(`insert into public.enfermeras (perfil_id) values ($1)`, [id]));
    const perfilPaciente = await perfil(PACIENTE);
    const medico = async (identidad: Identidad, cmp: string) =>
      (await c.query(`insert into public.medicos (perfil_id, cmp, especialidad_id) values ($1, $2, $3) returning id`, [await perfil(identidad), cmp, esp.rows[0].id])).rows[0].id as string;
    medico1 = await medico(MEDICO, "CMP-IT-0001");
    await medico(MEDICO_2, "CMP-IT-0002");
    const paciente = async (perfilId: string | null, documento: string) =>
      (await c.query(
        `insert into public.pacientes (perfil_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
         values ($1, 'DNI', $2, 'Paciente', 'Transiciones', '1990-01-01', 'F', $3) returning id`,
        [perfilId, documento, `it${documento}@demo.invalid`],
      )).rows[0].id as string;
    pacienteA = await paciente(null, "73600001");
    pacienteB = await paciente(perfilPaciente, "73600002");
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

async function nuevaCita(estado: Estado, tipo: "futura" | "empezada" | "terminada" | "enCurso", paciente = pacienteA): Promise<string> {
  const { inicio, fin } = franja(tipo);
  return comoDueno(async (c) =>
    (await c.query(
      `insert into public.citas (paciente_id, medico_id, inicio, fin, estado, origen) values ($1, $2, $3, $4, $5, 'administrativo') returning id`,
      [paciente, medico1, inicio, fin, estado],
    )).rows[0].id as string,
  );
}

const estadoDe = (id: string) => comoDueno(async (c) => (await c.query(`select estado::text as estado from public.citas where id = $1`, [id])).rows[0]?.estado as string);

test("el administrativo confirma una cita futura: pasa a «Confirmada», concede acceso al médico y repetirlo es idempotente", async () => {
  const cita = await nuevaCita("reservada", "futura", pacienteA);
  const historiasQueVeElMedico = () => como(MEDICO, (e) => e([{ texto: `select count(*)::int as n from public.historias_clinicas where paciente_id = $1`, parametros: [pacienteA] }]).then((r) => r[0]![0]!.n as number));
  const asignaciones = () => comoDueno(async (c) => (await c.query(`select count(*)::int as n from public.asignaciones_paciente_medico where paciente_id = $1 and medico_id = $2`, [pacienteA, medico1])).rows[0].n as number);

  assert.equal(await historiasQueVeElMedico(), 0, "antes de confirmar, el médico no ve la historia");
  assert.equal(await asignaciones(), 0);

  const r = await como(ADMIN, (e) => confirmarCita(e, { cita_id: cita }));
  assert.deepEqual(r, { ok: true, datos: { estado: "confirmada" } });
  assert.equal(await estadoDe(cita), "confirmada");
  assert.equal(await asignaciones(), 1, "confirmar crea la asignación vigente (ADR-0016)");
  assert.equal(await historiasQueVeElMedico(), 1, "ahora el médico ve la historia");

  const otraVez = await como(ADMIN, (e) => confirmarCita(e, { cita_id: cita }));
  assert.deepEqual(otraVez, { ok: true, datos: { estado: "confirmada" } });
  assert.equal(await asignaciones(), 1, "confirmar de nuevo no duplica la asignación");
});

test("confirmar una cita que ya terminó o que no está reservada da el mensaje propio y no cambia el estado", async () => {
  const terminada = await nuevaCita("reservada", "terminada");
  const atendida = await nuevaCita("atendida", "futura");
  const noAsistio = await nuevaCita("no_asistio", "futura");
  for (const [cita, estado] of [[terminada, "reservada"], [atendida, "atendida"], [noAsistio, "no_asistio"]] as const) {
    const r = await como(ADMIN, (e) => confirmarCita(e, { cita_id: cita }));
    assert.deepEqual(r, { ok: false, codigo: "TRANSICION_INVALIDA", mensaje: MENSAJE_TRANSICION.confirmar }, estado);
    assert.equal(await estadoDe(cita), estado);
  }
});

test("«No asistió» solo se marca en una confirmada cuya hora ya empezó; antes de la hora o sobre otro estado se rechaza", async () => {
  const futura = await nuevaCita("confirmada", "futura");
  const reservadaEmpezada = await nuevaCita("reservada", "empezada");
  const atendida = await nuevaCita("atendida", "empezada");
  for (const [cita, estado] of [[futura, "confirmada"], [reservadaEmpezada, "reservada"], [atendida, "atendida"]] as const) {
    const r = await como(ADMIN, (e) => marcarNoAsistio(e, { cita_id: cita }));
    assert.deepEqual(r, { ok: false, codigo: "TRANSICION_INVALIDA", mensaje: MENSAJE_TRANSICION.no_asistio }, estado);
    assert.equal(await estadoDe(cita), estado);
  }

  const empezada = await nuevaCita("confirmada", "empezada");
  const r = await como(ADMIN, (e) => marcarNoAsistio(e, { cita_id: empezada }));
  assert.deepEqual(r, { ok: true, datos: { estado: "no_asistio" } });
  assert.equal(await estadoDe(empezada), "no_asistio");
});

test("el médico dueño marca «Atendida» una confirmada ya empezada: solo cambia el estado y la auditoría lo muestra como médico", async () => {
  const cita = await nuevaCita("confirmada", "enCurso", pacienteB);
  const antes = await comoDueno(async (c) => (await c.query(`select to_jsonb(c) - 'estado' as resto from public.citas c where id = $1`, [cita])).rows[0].resto);

  const r = await como(MEDICO, (e) => marcarAtendida(e, { cita_id: cita }));
  assert.deepEqual(r, { ok: true, datos: undefined });
  assert.equal(await estadoDe(cita), "atendida");

  const despues = await comoDueno(async (c) => (await c.query(`select to_jsonb(c) - 'estado' as resto from public.citas c where id = $1`, [cita])).rows[0].resto);
  assert.deepEqual(despues, antes, "ninguna otra columna cambió");

  const auditoria = await comoDueno(async (c) =>
    (await c.query(`select accion, actor_rol::text as rol, datos_despues ->> 'estado' as estado from public.auditoria where tabla = 'citas' and registro_id = $1 and accion = 'UPDATE' order by id desc limit 1`, [cita])).rows[0],
  );
  assert.deepEqual(auditoria, { accion: "UPDATE", rol: "medico", estado: "atendida" });
});

test("«Atendida» se rechaza para quien no es el médico dueño, con el mismo mensaje para una cita ajena y una inexistente (negativo)", async () => {
  const confirmadaEmpezada = await nuevaCita("confirmada", "empezada", pacienteA);

  const ajena = await como(MEDICO_2, (e) => marcarAtendida(e, { cita_id: confirmadaEmpezada }));
  const inexistente = await como(MEDICO, (e) => marcarAtendida(e, { cita_id: "99999999-9999-4999-8999-999999999999" }));
  assert.deepEqual(ajena, { ok: false, codigo: "CITA_NO_VIGENTE", mensaje: MENSAJE_CITA_NO_VIGENTE });
  assert.deepEqual(inexistente, ajena, "una cita ajena no se distingue de una inexistente");

  for (const identidad of [ADMIN, ENFERMERA, PACIENTE, SIN_ROL]) {
    const r = await como(identidad, (e) => marcarAtendida(e, { cita_id: confirmadaEmpezada }));
    assert.deepEqual(r, { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_NO_AUTORIZADO }, identidad.sub);
  }
  assert.equal(await estadoDe(confirmadaEmpezada), "confirmada", "ninguna lo cambió");
});

test("el médico dueño no marca «Atendida» una reservada ni una confirmada que aún no empezó", async () => {
  const reservada = await nuevaCita("reservada", "empezada");
  const futura = await nuevaCita("confirmada", "futura");
  for (const [cita, estado] of [[reservada, "reservada"], [futura, "confirmada"]] as const) {
    const r = await como(MEDICO, (e) => marcarAtendida(e, { cita_id: cita }));
    assert.deepEqual(r, { ok: false, codigo: "TRANSICION_INVALIDA", mensaje: MENSAJE_TRANSICION.atendida }, estado);
    assert.equal(await estadoDe(cita), estado);
  }
});

test("el médico, la enfermera, el paciente y una sesión sin rol no confirman ni marcan «No asistió» (negativo)", async () => {
  const reservada = await nuevaCita("reservada", "futura", pacienteB);
  const confirmadaEmpezada = await nuevaCita("confirmada", "empezada", pacienteB);
  for (const identidad of [MEDICO, ENFERMERA, PACIENTE, SIN_ROL]) {
    const a = await como(identidad, (e) => confirmarCita(e, { cita_id: reservada }));
    const b = await como(identidad, (e) => marcarNoAsistio(e, { cita_id: confirmadaEmpezada }));
    assert.equal(a.ok, false, `${identidad.sub}: confirmar`);
    assert.equal(b.ok, false, `${identidad.sub}: «No asistió»`);
  }
  assert.equal(await estadoDe(reservada), "reservada");
  assert.equal(await estadoDe(confirmadaEmpezada), "confirmada");
});

// ---- Cierre automático de las reservadas vencidas (6.5): se dispara al usar el sistema, sin cron ----

test("la enfermera, el paciente y una sesión sin rol no cierran citas vencidas (negativo) y no cambia ninguna", async () => {
  const vencida = await nuevaCita("reservada", "terminada", pacienteB);
  for (const identidad of [ENFERMERA, PACIENTE, SIN_ROL]) {
    const r = await como(identidad, (e) => cerrarCitasVencidas(e));
    assert.deepEqual(r, { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_NO_AUTORIZADO }, identidad.sub);
  }
  assert.equal(await estadoDe(vencida), "reservada", "ninguna la cerró");
});

test("el administrativo cierra las reservadas que terminaron como «No asistió» y no toca las demás; repetirlo no cambia nada", async () => {
  const vencida = await nuevaCita("reservada", "terminada", pacienteA);
  const otraVencida = await nuevaCita("reservada", "terminada", pacienteB);
  const enCurso = await nuevaCita("reservada", "enCurso", pacienteA);
  const futura = await nuevaCita("reservada", "futura", pacienteB);
  const confirmadaVencida = await nuevaCita("confirmada", "terminada", pacienteA);
  const atendida = await nuevaCita("atendida", "terminada", pacienteB);
  const cancelada = await nuevaCita("cancelada", "terminada", pacienteA);

  const r = await como(ADMIN, (e) => cerrarCitasVencidas(e));
  assert.equal(r.ok, true);
  assert.equal(typeof (r.ok && r.datos.cerradas), "number");
  assert.ok(r.ok && r.datos.cerradas >= 2, "al menos las dos vencidas de esta prueba (también cierra las que dejaron otras pruebas)");

  assert.equal(await estadoDe(vencida), "no_asistio");
  assert.equal(await estadoDe(otraVencida), "no_asistio");
  assert.equal(await estadoDe(enCurso), "reservada", "la que está en curso aún puede confirmarse");
  assert.equal(await estadoDe(futura), "reservada");
  assert.equal(await estadoDe(confirmadaVencida), "confirmada", "la confirmada la cierra la recepción o el médico, no el cierre automático");
  assert.equal(await estadoDe(atendida), "atendida");
  assert.equal(await estadoDe(cancelada), "cancelada");

  const segunda = await como(ADMIN, (e) => cerrarCitasVencidas(e));
  assert.equal(segunda.ok, true);
  assert.equal(await estadoDe(vencida), "no_asistio", "repetir no cambia lo ya cerrado");
});

test("el médico también dispara el cierre, y la cita cerrada deja constancia en la auditoría con él como actor", async () => {
  const vencida = await nuevaCita("reservada", "terminada", pacienteA);
  const r = await como(MEDICO, (e) => cerrarCitasVencidas(e));
  assert.equal(r.ok, true);
  assert.equal(await estadoDe(vencida), "no_asistio");
  const auditoria = await comoDueno(async (c) =>
    (await c.query(
      `select a.actor_rol::text as rol, a.datos_antes ->> 'estado' as antes, a.datos_despues ->> 'estado' as despues
         from public.auditoria a where a.tabla = 'citas' and a.accion = 'UPDATE' and a.registro_id = $1`,
      [vencida],
    )).rows,
  );
  assert.deepEqual(auditoria, [{ rol: "medico", antes: "reservada", despues: "no_asistio" }]);
});

test("el administrativo no puede cerrar a mano una reservada vencida: la regla es del sistema", async () => {
  const vencida = await nuevaCita("reservada", "terminada", pacienteA);
  const r = await como(ADMIN, (e) => marcarNoAsistio(e, { cita_id: vencida }));
  assert.deepEqual(r, { ok: false, codigo: "TRANSICION_INVALIDA", mensaje: MENSAJE_TRANSICION.no_asistio });
  assert.equal(await estadoDe(vencida), "reservada");
});
