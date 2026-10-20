// Agendar, cancelar, reprogramar y reasignar por baja (H3, tareas 10.2, 10.3 y 11.2; specs/gestion-de-citas y
// reasignacion-por-baja-medica): `lib/citas/reservas.ts` ejecutado COMO `authenticated` con la identidad y el rol de cada
// usuario, sobre un branch de pruebas (las funciones, la ventana de 1 hora, la doble reserva y la RLS son las reales).
// Complementa a tests/agenda/reservas.test.ts (doble del ejecutor), a pgTAP 36–38 y a tests/concurrencia/20_*.
// Los médicos de prueba tienen la agenda abierta TODOS los días (00:00–24:00, slots de 20 minutos, vigente desde 2020), así que
// cualquier múltiplo de 20 minutos desde el epoch es un horario válido (Lima no tiene horario de verano: su medianoche cae en
// una hora entera de UTC). Cada caso usa su propia hora para no chocar con los demás.
// Las filas llevan marcas propias (documentos `7370…`, perfiles `user_ir_…`, CMP `CMP-IR-…`) y se borran al empezar y al terminar;
// la auditoría es de solo agregar (por eso corre contra un branch de pruebas, nunca production).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type pg from "pg";
import { MENSAJE_NO_AUTORIZADO } from "../../lib/acciones/resultado.ts";
import {
  MENSAJE_CANCELACION_TARDIA,
  MENSAJE_CITA_NO_VIGENTE,
  MENSAJE_DOBLE_RESERVA,
  MENSAJE_HORARIO_NO_DISPONIBLE,
  MENSAJE_REASIGNACION_INVALIDA,
  MENSAJE_REPROGRAMACION_TARDIA,
} from "../../lib/citas/errores.ts";
import { cancelarCita, reasignarPorBaja, reprogramarCita, reservarCita } from "../../lib/citas/reservas.ts";
import type { Ejecutor } from "../../lib/db/ejecutor.ts";
import { fechaYHoraLima } from "../../lib/fechas/lima.ts";
import { conectar } from "../concurrencia/_conexion.ts";
import { ejecutorDeSesion } from "../concurrencia/_ejecutor.ts";
import { abrirSesion, type Identidad } from "../concurrencia/_sesion.ts";

const ADMIN: Identidad = { sub: "user_ir_admin", rol: "administrativo" };
const MEDICO_A: Identidad = { sub: "user_ir_medico_a", rol: "medico" };
const MEDICO_B: Identidad = { sub: "user_ir_medico_b", rol: "medico" };
const MEDICO_C: Identidad = { sub: "user_ir_medico_c", rol: "medico" };
const ENFERMERA: Identidad = { sub: "user_ir_enfermera", rol: "enfermera" };
const PACIENTE: Identidad = { sub: "user_ir_paciente", rol: "paciente" };
const SIN_ROL: Identidad = { sub: "user_ir_sinrol", rol: null };

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const SLOT = 20 * MIN;

let medicoA: string;
let medicoB: string;
let medicoC: string;
let pacienteA: string; // sin cuenta de portal
let pacienteB: string; // sin cuenta de portal
let pacientePortal: string; // con la cuenta PACIENTE
let adminPerfil: string;

// El primer horario de la malla de 20 minutos a `horas` horas de ahora (o más tarde).
function slot(horas: number): { inicio: Date; fin: Date } {
  const inicio = Math.ceil((Date.now() + horas * HORA) / SLOT) * SLOT;
  return { inicio: new Date(inicio), fin: new Date(inicio + SLOT) };
}
// El horario que reservan la primera y la segunda prueba: se calcula UNA vez (si cada prueba lo recalculara, un cambio de franja de
// 20 minutos entre ambas las apuntaría a horarios distintos).
const RESERVADO = slot(48);

const entrada = (paciente: string, medico: string, s: { inicio: Date; fin: Date }, extra: Record<string, unknown> = {}) => ({
  paciente_id: paciente,
  medico_id: medico,
  inicio: s.inicio.toISOString(),
  fin: s.fin.toISOString(),
  ...extra,
});

async function limpiar(c: pg.Client): Promise<void> {
  const ids = `select id from public.pacientes where numero_documento like '7370%'`;
  await c.query(`delete from public.citas where paciente_id in (${ids})`);
  await c.query(`delete from public.asignaciones_paciente_medico where paciente_id in (${ids})`);
  await c.query(`delete from public.historias_clinicas where paciente_id in (${ids})`);
  await c.query(`delete from public.pacientes where numero_documento like '7370%'`);
  await c.query(`delete from public.medicos where cmp like 'CMP-IR-%'`); // disponibilidades y bloqueos caen en cascada
  await c.query(`delete from public.enfermeras where perfil_id in (select id from public.perfiles where clerk_user_id like 'user_ir_%')`);
  await c.query(`delete from public.perfiles where clerk_user_id like 'user_ir_%'`);
  await c.query(`delete from public.especialidades where nombre like 'Esp integracion reservas%'`);
}

before(async () => {
  const c = await conectar();
  try {
    await limpiar(c);
    const esp1 = (await c.query(`insert into public.especialidades (nombre) values ('Esp integracion reservas') returning id`)).rows[0].id as string;
    const esp2 = (await c.query(`insert into public.especialidades (nombre) values ('Esp integracion reservas 2') returning id`)).rows[0].id as string;
    const perfil = async ({ sub, rol }: Identidad) =>
      (await c.query(`insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, $2, 'Prueba', $1) returning id`, [sub, rol])).rows[0].id as string;
    adminPerfil = await perfil(ADMIN);
    await perfil(ENFERMERA).then((id) => c.query(`insert into public.enfermeras (perfil_id) values ($1)`, [id]));
    const perfilPaciente = await perfil(PACIENTE);
    const medico = async (identidad: Identidad, cmp: string, esp: string) => {
      const id = (await c.query(`insert into public.medicos (perfil_id, cmp, especialidad_id) values ($1, $2, $3) returning id`, [await perfil(identidad), cmp, esp])).rows[0].id as string;
      await c.query(
        `insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde)
         select $1, d, '00:00', '24:00', 20, '2020-01-01' from generate_series(0, 6) d`,
        [id],
      );
      return id;
    };
    medicoA = await medico(MEDICO_A, "CMP-IR-0001", esp1);
    medicoB = await medico(MEDICO_B, "CMP-IR-0002", esp1);
    medicoC = await medico(MEDICO_C, "CMP-IR-0003", esp2);
    const paciente = async (perfilId: string | null, documento: string) =>
      (await c.query(
        `insert into public.pacientes (perfil_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
         values ($1, 'DNI', $2, 'Paciente', 'Reservas', '1990-01-01', 'F', $3) returning id`,
        [perfilId, documento, `ir${documento}@demo.invalid`],
      )).rows[0].id as string;
    pacienteA = await paciente(null, "73700001");
    pacienteB = await paciente(null, "73700002");
    pacientePortal = await paciente(perfilPaciente, "73700003");
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

type Estado = "reservada" | "confirmada" | "atendida" | "no_asistio" | "cancelada";
const citaDueno = (paciente: string, medico: string, inicio: Date, fin: Date, estado: Estado = "reservada") =>
  comoDueno(async (c) =>
    (await c.query(
      `insert into public.citas (paciente_id, medico_id, inicio, fin, estado, origen) values ($1, $2, $3, $4, $5, 'administrativo') returning id`,
      [paciente, medico, inicio, fin, estado],
    )).rows[0].id as string,
  );
const fila = (id: string) =>
  comoDueno(async (c) => (await c.query(`select estado::text as estado, origen, medico_id, creada_por, reprogramada_de, cancelada_en, cancelada_por, motivo from public.citas where id = $1`, [id])).rows[0]);
const cuentaDeCitas = (medico: string, desde: Date, hasta: Date) =>
  comoDueno(async (c) => (await c.query(`select count(*)::int as n from public.citas where medico_id = $1 and inicio >= $2 and inicio < $3`, [medico, desde, hasta])).rows[0].n as number);

test("el administrativo agenda un horario libre: nace reservada, con origen administrativo y su perfil como autor, y el horario deja de ofrecerse", async () => {
  const s = RESERVADO;
  const r = await como(ADMIN, (e) => reservarCita(e, entrada(pacienteA, medicoA, s, { motivo: "Control" })));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const cita = await fila(r.datos.id);
  assert.equal(cita.estado, "reservada");
  assert.equal(cita.origen, "administrativo");
  assert.equal(cita.creada_por, adminPerfil);
  assert.equal(cita.motivo, "Control");

  const libres = await como(ADMIN, (e) =>
    e([{ texto: `select inicio from public.slots_disponibles($1, $2::date)`, parametros: [medicoA, fechaYHoraLima(s.inicio).fecha] }]).then((rs) => rs[0]!.map((f) => new Date(f.inicio as string | Date).getTime())),
  );
  assert.equal(libres.includes(s.inicio.getTime()), false, "el horario reservado ya no se ofrece");
  // Otro horario del MISMO día de Lima (a 2 franjas hacia adelante o, si eso cruza la medianoche de Lima, hacia atrás).
  const otro = [2, -2].map((k) => s.inicio.getTime() + k * SLOT).find((t) => fechaYHoraLima(new Date(t)).fecha === fechaYHoraLima(s.inicio).fecha)!;
  assert.equal(libres.includes(otro), true, "los demás siguen libres");
});

test("la doble reserva da exactamente «Registro de cita ya agendado»: mismo médico y mismo paciente con otro médico", async () => {
  const s = RESERVADO; // el horario de la prueba anterior: ya está reservado con el médico A
  const mismoMedico = await como(ADMIN, (e) => reservarCita(e, entrada(pacienteB, medicoA, s)));
  assert.deepEqual(mismoMedico, { ok: false, codigo: "DOBLE_RESERVA", mensaje: "Registro de cita ya agendado" });
  assert.equal(MENSAJE_DOBLE_RESERVA, "Registro de cita ya agendado");

  // El paciente A ya tiene cita a esa hora: con otro médico choca con `citas_sin_cruce_paciente`.
  const mismoPaciente = await como(ADMIN, (e) => reservarCita(e, entrada(pacienteA, medicoB, s)));
  assert.deepEqual(mismoPaciente, { ok: false, codigo: "DOBLE_RESERVA", mensaje: MENSAJE_DOBLE_RESERVA });
  assert.equal(await cuentaDeCitas(medicoB, s.inicio, s.fin), 0);
});

test("un horario pasado, fuera de la malla, de otra duración, dentro de una ausencia o de un médico dado de baja se rechaza y no crea la cita", async () => {
  const futuro = slot(49);
  const ausente = slot(120);
  await comoDueno((c) =>
    c.query(`insert into public.bloqueos_agenda (medico_id, rango, motivo) values ($1, tstzrange($2, $3), 'Ausencia de prueba')`, [medicoA, new Date(ausente.inicio.getTime() - HORA), new Date(ausente.inicio.getTime() + HORA)]),
  );
  const baja = slot(50);
  await comoDueno((c) => c.query(`update public.medicos set activo = false where id = $1`, [medicoC]));
  try {
    const casos: [string, ReturnType<typeof entrada>][] = [
      ["pasado", entrada(pacienteA, medicoA, { inicio: new Date(Math.floor((Date.now() - 2 * HORA) / SLOT) * SLOT), fin: new Date(Math.floor((Date.now() - 2 * HORA) / SLOT) * SLOT + SLOT) })],
      ["fuera de la malla (+10 min)", entrada(pacienteA, medicoA, { inicio: new Date(futuro.inicio.getTime() + 10 * MIN), fin: new Date(futuro.fin.getTime() + 10 * MIN) })],
      ["otra duración (30 min)", entrada(pacienteA, medicoA, { inicio: futuro.inicio, fin: new Date(futuro.inicio.getTime() + 30 * MIN) })],
      ["dentro de una ausencia", entrada(pacienteA, medicoA, ausente)],
      ["médico dado de baja", entrada(pacienteA, medicoC, baja)],
    ];
    for (const [nombre, datos] of casos) {
      const r = await como(ADMIN, (e) => reservarCita(e, datos));
      assert.deepEqual(r, { ok: false, codigo: "HORARIO_NO_DISPONIBLE", mensaje: MENSAJE_HORARIO_NO_DISPONIBLE }, nombre);
    }
    assert.equal(await cuentaDeCitas(medicoA, futuro.inicio, new Date(futuro.fin.getTime() + HORA)), 0, "ninguna cita en el horario fuera de la malla");
    assert.equal(await cuentaDeCitas(medicoA, ausente.inicio, ausente.fin), 0);
    assert.equal(await cuentaDeCitas(medicoC, baja.inicio, baja.fin), 0);
  } finally {
    await comoDueno((c) => c.query(`update public.medicos set activo = true where id = $1`, [medicoC]));
  }
});

test("cancelar con más de 1 hora funciona, registra quién y cuándo, libera el horario y no borra la cita", async () => {
  const s = slot(3);
  const cita = await citaDueno(pacienteA, medicoA, s.inicio, s.fin);
  const r = await como(ADMIN, (e) => cancelarCita(e, { cita_id: cita }));
  assert.deepEqual(r, { ok: true, datos: { id: cita } });
  const c = await fila(cita);
  assert.equal(c.estado, "cancelada");
  assert.ok(c.cancelada_en, "queda el instante");
  assert.equal(c.cancelada_por, adminPerfil, "queda quién canceló");

  // Una cancelada libera el horario: se puede volver a reservar.
  const otra = await como(ADMIN, (e) => reservarCita(e, entrada(pacienteB, medicoA, s)));
  assert.equal(otra.ok, true);

  // Una cita que ya no está vigente no se cancela de nuevo.
  const otraVez = await como(ADMIN, (e) => cancelarCita(e, { cita_id: cita }));
  assert.deepEqual(otraVez, { ok: false, codigo: "CITA_NO_VIGENTE", mensaje: MENSAJE_CITA_NO_VIGENTE });
});

test("cancelar con menos de 1 hora se rechaza aunque cancele el administrativo; con una ausencia del médico que la cubre, se acepta", async () => {
  const inicio = new Date(Date.now() + 59 * MIN);
  const tarde = await citaDueno(pacienteB, medicoA, inicio, new Date(inicio.getTime() + SLOT));
  const r = await como(ADMIN, (e) => cancelarCita(e, { cita_id: tarde }));
  assert.deepEqual(r, { ok: false, codigo: "CANCELACION_TARDIA", mensaje: MENSAJE_CANCELACION_TARDIA });
  assert.equal((await fila(tarde)).estado, "reservada", "la cita sigue vigente");

  // La misma situación con una ausencia del médico B que cubre la cita: es una reasignación por baja y se acepta.
  const cubierta = new Date(Date.now() + 45 * MIN);
  const citaCubierta = await citaDueno(pacienteA, medicoB, cubierta, new Date(cubierta.getTime() + SLOT));
  await comoDueno((c) =>
    c.query(`insert into public.bloqueos_agenda (medico_id, rango, motivo) values ($1, tstzrange($2, $3), 'Baja de prueba')`, [medicoB, new Date(Date.now() + 30 * MIN), new Date(Date.now() + 2 * HORA)]),
  );
  const aceptada = await como(ADMIN, (e) => cancelarCita(e, { cita_id: citaCubierta }));
  assert.equal(aceptada.ok, true);
  assert.equal((await fila(citaCubierta)).estado, "cancelada");
});

test("una cita atendida o «No asistió» no se cancela: «La cita ya no está vigente»", async () => {
  const pasada = slot(-30);
  for (const estado of ["atendida", "no_asistio"] as const) {
    const s = { inicio: new Date(pasada.inicio.getTime() - (estado === "atendida" ? 0 : 6 * HORA)), fin: new Date(pasada.fin.getTime() - (estado === "atendida" ? 0 : 6 * HORA)) };
    const cita = await citaDueno(pacienteA, medicoA, s.inicio, s.fin, estado);
    const r = await como(ADMIN, (e) => cancelarCita(e, { cita_id: cita }));
    assert.deepEqual(r, { ok: false, codigo: "CITA_NO_VIGENTE", mensaje: MENSAJE_CITA_NO_VIGENTE }, estado);
    assert.equal((await fila(cita)).estado, estado);
  }
});

test("reprogramar cancela la original y crea la nueva reservada (aunque estuviera confirmada), con reprogramada_de y otro médico si se pide", async () => {
  const origen = slot(5);
  const original = await citaDueno(pacienteA, medicoA, origen.inicio, origen.fin, "confirmada");
  const destino = slot(72);
  const r = await como(ADMIN, (e) => reprogramarCita(e, { ...entrada(pacienteA, medicoB, destino), cita_id: original }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.datos.citaAnteriorId, original);

  assert.equal((await fila(original)).estado, "cancelada");
  const nueva = await fila(r.datos.id);
  assert.equal(nueva.estado, "reservada", "la nueva no hereda la confirmación");
  assert.equal(nueva.reprogramada_de, original);
  assert.equal(nueva.medico_id, medicoB);
});

test("si el nuevo horario está ocupado o no es válido, la reprogramación falla y la original sigue vigente y sin cancelar", async () => {
  const origen = slot(6);
  const original = await citaDueno(pacienteB, medicoB, origen.inicio, origen.fin);
  const ocupado = slot(96);
  await citaDueno(pacientePortal, medicoA, ocupado.inicio, ocupado.fin);
  const pasado = { inicio: new Date(Math.floor((Date.now() - 3 * HORA) / SLOT) * SLOT), fin: new Date(Math.floor((Date.now() - 3 * HORA) / SLOT) * SLOT + SLOT) };

  const choque = await como(ADMIN, (e) => reprogramarCita(e, { ...entrada(pacienteB, medicoA, ocupado), cita_id: original }));
  assert.deepEqual(choque, { ok: false, codigo: "DOBLE_RESERVA", mensaje: MENSAJE_DOBLE_RESERVA });
  const invalido = await como(ADMIN, (e) => reprogramarCita(e, { ...entrada(pacienteB, medicoA, pasado), cita_id: original }));
  assert.deepEqual(invalido, { ok: false, codigo: "HORARIO_NO_DISPONIBLE", mensaje: MENSAJE_HORARIO_NO_DISPONIBLE });

  const intacta = await fila(original);
  assert.equal(intacta.estado, "reservada");
  assert.equal(intacta.cancelada_en, null);
  assert.equal(await cuentaDeCitas(medicoA, ocupado.inicio, ocupado.fin), 1, "solo la que ya estaba");
});

test("reprogramar una cita que empieza dentro de la hora previa se rechaza con su mensaje y no crea ninguna cita nueva", async () => {
  const inicio = new Date(Date.now() + 25 * MIN);
  const original = await citaDueno(pacienteA, medicoA, inicio, new Date(inicio.getTime() + SLOT));
  const destino = slot(144);
  const r = await como(ADMIN, (e) => reprogramarCita(e, { ...entrada(pacienteA, medicoA, destino), cita_id: original }));
  assert.deepEqual(r, { ok: false, codigo: "CANCELACION_TARDIA", mensaje: MENSAJE_REPROGRAMACION_TARDIA });
  assert.equal((await fila(original)).estado, "reservada");
  assert.equal(await cuentaDeCitas(medicoA, destino.inicio, destino.fin), 0);
});

test("reasignar por baja: una transacción por cita y un resultado por fila; la fila con un sustituto de otra especialidad falla y las demás se hacen", async () => {
  const dia = slot(170);
  const primera = { inicio: dia.inicio, fin: dia.fin };
  const segunda = { inicio: new Date(dia.inicio.getTime() + SLOT), fin: new Date(dia.fin.getTime() + SLOT) };
  const c1 = await citaDueno(pacienteA, medicoA, primera.inicio, primera.fin);
  const c2 = await citaDueno(pacienteB, medicoA, segunda.inicio, segunda.fin);
  const bloqueo = await comoDueno(async (c) =>
    (await c.query(`insert into public.bloqueos_agenda (medico_id, rango, motivo) values ($1, tstzrange($2, $3), 'Baja de prueba') returning id`, [medicoA, new Date(dia.inicio.getTime() - HORA), new Date(dia.inicio.getTime() + 2 * HORA)])).rows[0].id as string,
  );

  const r = await como(ADMIN, (e) =>
    reasignarPorBaja(e, {
      bloqueo_id: bloqueo,
      reasignaciones: [
        { cita_id: c1, medico_id: medicoB, inicio: primera.inicio.toISOString(), fin: primera.fin.toISOString() },
        { cita_id: c2, medico_id: medicoC, inicio: segunda.inicio.toISOString(), fin: segunda.fin.toISOString() }, // otra especialidad
      ],
    }),
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const [uno, dos] = r.datos.filas;
  assert.equal(uno?.ok, true);
  assert.deepEqual(dos, { ok: false, citaId: c2, codigo: "REASIGNACION_INVALIDA", mensaje: MENSAJE_REASIGNACION_INVALIDA });

  assert.equal((await fila(c1)).estado, "cancelada");
  const nueva = await fila(uno!.ok ? uno.id : "");
  assert.equal(nueva.medico_id, medicoB);
  assert.equal(nueva.reprogramada_de, c1);
  assert.equal((await fila(c2)).estado, "reservada", "la fila fallida quedó vigente");

  // Reintentar la fallida con un sustituto válido (la misma especialidad) funciona.
  const reintento = await como(ADMIN, (e) =>
    reasignarPorBaja(e, {
      bloqueo_id: bloqueo,
      reasignaciones: [{ cita_id: c2, medico_id: medicoB, inicio: segunda.inicio.toISOString(), fin: segunda.fin.toISOString() }],
    }),
  );
  assert.equal(reintento.ok && reintento.datos.filas[0]?.ok, true);
});

test("reasignar con una baja que no cubre la cita da «Esta reasignación no corresponde a la baja registrada»", async () => {
  const s = slot(200);
  const cita = await citaDueno(pacienteA, medicoA, s.inicio, s.fin);
  const bloqueoLejano = await comoDueno(async (c) =>
    (await c.query(`insert into public.bloqueos_agenda (medico_id, rango, motivo) values ($1, tstzrange($2, $3), 'Otra baja') returning id`, [medicoA, new Date(s.inicio.getTime() + 24 * HORA), new Date(s.inicio.getTime() + 26 * HORA)])).rows[0].id as string,
  );
  const r = await como(ADMIN, (e) =>
    reasignarPorBaja(e, {
      bloqueo_id: bloqueoLejano,
      reasignaciones: [{ cita_id: cita, medico_id: medicoB, inicio: s.inicio.toISOString(), fin: s.fin.toISOString() }],
    }),
  );
  assert.equal(r.ok && r.datos.filas[0]?.ok === false && r.datos.filas[0].codigo, "REASIGNACION_INVALIDA");
  assert.equal((await fila(cita)).estado, "reservada");
});

test("el paciente reserva a su nombre con origen portal y no a nombre de otro; médico, enfermera y sin rol no reservan (negativo)", async () => {
  const s = slot(240);
  const propia = await como(PACIENTE, (e) => reservarCita(e, entrada(pacientePortal, medicoA, s)));
  assert.equal(propia.ok, true);
  if (propia.ok) assert.equal((await fila(propia.datos.id)).origen, "portal");

  const ajeno = slot(241);
  const aNombreDeOtro = await como(PACIENTE, (e) => reservarCita(e, entrada(pacienteA, medicoA, ajeno)));
  assert.deepEqual(aNombreDeOtro, { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_NO_AUTORIZADO });

  for (const identidad of [MEDICO_A, ENFERMERA, SIN_ROL]) {
    const r = await como(identidad, (e) => reservarCita(e, entrada(pacienteA, medicoA, ajeno)));
    assert.equal(r.ok === false && r.codigo, "NO_AUTORIZADO", identidad.sub);
  }
  assert.equal(await cuentaDeCitas(medicoA, ajeno.inicio, ajeno.fin), 0, "ninguna cita en ese horario");
});

test("solo el administrativo reprograma y cancela: el paciente (hasta que H4 añada su política), el médico, la enfermera y una sesión sin rol no (negativo)", async () => {
  const propiaSlot = slot(260);
  const propia = await citaDueno(pacientePortal, medicoA, propiaSlot.inicio, propiaSlot.fin);
  const ajenaSlot = slot(261);
  const ajena = await citaDueno(pacienteA, medicoA, ajenaSlot.inicio, ajenaSlot.fin);
  const destino = slot(262);

  for (const identidad of [PACIENTE, MEDICO_A, ENFERMERA, SIN_ROL]) {
    const r = await como(identidad, (e) => reprogramarCita(e, { ...entrada(pacientePortal, medicoA, destino), cita_id: propia }));
    assert.equal(r.ok === false && r.codigo, "NO_AUTORIZADO", `${identidad.sub}: reprogramar`);
  }
  // En H3 el paciente no tiene política de UPDATE sobre `citas` (la añade H4, portal-del-paciente): cancelar no encuentra la fila.
  for (const identidad of [PACIENTE, MEDICO_A, ENFERMERA, SIN_ROL]) {
    for (const cita of [propia, ajena]) {
      const r = await como(identidad, (e) => cancelarCita(e, { cita_id: cita }));
      assert.deepEqual(r, { ok: false, codigo: "CITA_NO_VIGENTE", mensaje: MENSAJE_CITA_NO_VIGENTE }, `${identidad.sub}: cancelar`);
    }
  }
  assert.equal((await fila(ajena)).estado, "reservada");
  assert.equal((await fila(propia)).estado, "reservada", "ninguno de los anteriores la cambió");

  const delAdministrativo = await como(ADMIN, (e) => cancelarCita(e, { cita_id: propia }));
  assert.equal(delAdministrativo.ok, true);
  assert.equal((await fila(propia)).estado, "cancelada");
});

// Ejecutor que simula una red que falla en torno a la reasignación: `cuando` = «despues» ejecuta la sentencia de verdad (se confirma
// en la base de datos) y luego pierde la respuesta; «antes» la pierde sin haberla ejecutado. Solo afecta a la primera reasignación.
function conRedInestable(base: Ejecutor, cuando: "antes" | "despues"): Ejecutor {
  let pendiente = true;
  return async (sentencias) => {
    const esReasignacion = sentencias.some((s) => s.texto.includes("reasignar_cita_por_baja"));
    const caida = () => Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    if (esReasignacion && pendiente && cuando === "antes") {
      pendiente = false;
      throw caida();
    }
    const filas = await base(sentencias);
    if (esReasignacion && pendiente) {
      pendiente = false;
      throw caida();
    }
    return filas;
  };
}

test("si la respuesta de una fila se pierde DESPUÉS de confirmar, se recupera la cita nueva real y sale su evento; si se perdió ANTES, la fila falla y la cita sigue vigente", async () => {
  const dia = slot(300);
  const lejos = slot(301);
  const hecha = await citaDueno(pacienteA, medicoA, dia.inicio, dia.fin);
  const noHecha = await citaDueno(pacienteB, medicoA, lejos.inicio, lejos.fin);
  const bloqueo = await comoDueno(async (c) =>
    (await c.query(`insert into public.bloqueos_agenda (medico_id, rango, motivo) values ($1, tstzrange($2, $3), 'Baja de recuperación') returning id`, [medicoA, new Date(dia.inicio.getTime() - HORA), new Date(lejos.fin.getTime() + HORA)])).rows[0].id as string,
  );
  const filaDe = (cita: string, s: { inicio: Date; fin: Date }) => ({ cita_id: cita, medico_id: medicoB, inicio: s.inicio.toISOString(), fin: s.fin.toISOString() });

  // El error inesperado se registra con su clase y SQLSTATE (`console.error`); en esta prueba es lo esperado.
  const original = console.error;
  console.error = () => undefined;

  // Respuesta perdida DESPUÉS de confirmar: la reasignación se hizo de verdad y la comprobación la encuentra.
  const eventos: { citaId: string; id: string }[] = [];
  const despues = await como(ADMIN, (e) =>
    reasignarPorBaja(conRedInestable(e, "despues"), { bloqueo_id: bloqueo, reasignaciones: [filaDe(hecha, dia)] }, { alHacerseFila: (f) => void eventos.push(f) }),
  );
  assert.equal(despues.ok && despues.datos.filas[0]?.ok, true, "la fila se recupera");
  const nueva = despues.ok && despues.datos.filas[0]?.ok ? despues.datos.filas[0].id : "";
  assert.equal((await fila(hecha)).estado, "cancelada");
  const creada = await fila(nueva);
  assert.equal(creada.reprogramada_de, hecha);
  assert.equal(creada.medico_id, medicoB);
  assert.deepEqual(eventos, [{ citaId: hecha, id: nueva }], "el evento no se perdió");

  // Respuesta perdida ANTES de ejecutar: no se hizo nada, la comprobación no encuentra cita nueva y la fila queda como error.
  let antes;
  try {
    antes = await como(ADMIN, (e) => reasignarPorBaja(conRedInestable(e, "antes"), { bloqueo_id: bloqueo, reasignaciones: [filaDe(noHecha, lejos)] }));
  } finally {
    console.error = original;
  }
  assert.deepEqual(antes.ok && antes.datos.filas[0]?.ok, false);
  assert.equal((await fila(noHecha)).estado, "reservada", "la cita sigue vigente y sin cancelar");
});
