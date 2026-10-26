// Turnos de enfermería, vista de la enfermera y jornada del médico (H7, tareas 4.1, 6.1 y 8.1): el código de la aplicación
// (`lib/turnos/operaciones.ts`, `lib/turnos/mis-turnos.ts`, `lib/medico/jornada.ts`, `lib/citas/transiciones.ts`) ejecutado COMO
// `authenticated` con la identidad y el rol de cada usuario, sobre un branch de pruebas: la RLS, los `check`, el `unique` y las funciones
// son los reales. Complementa a tests/turnos-dashboard/ (dobles del ejecutor) y a pgTAP 80 a 84.
// Las filas llevan marcas propias (perfiles `user_tt_…`, CMP `CMP-TT-…`, documentos `7850…`) y se borran al empezar y al terminar.
// Fechas de turnos en 2032 salvo las que dependen de «hoy» (que se limpian igual). Nunca contra production (urlDePruebas()).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type pg from "pg";
import { MENSAJE_NO_AUTORIZADO } from "../../lib/acciones/resultado.ts";
import { MENSAJE_TRANSICION } from "../../lib/citas/errores.ts";
import { marcarAtendida } from "../../lib/citas/transiciones.ts";
import { hoyLima, inicioDiaLima, instanteDesdeLima } from "../../lib/fechas/lima.ts";
import { jornadaDelMedico } from "../../lib/medico/jornada.ts";
import {
  MENSAJE_ENFERMERA_DE_BAJA,
  MENSAJE_FECHA_ANTERIOR,
  MENSAJE_MEDICO_DE_BAJA,
  MENSAJE_REFERENCIA_INEXISTENTE,
  MENSAJE_SERVICIO_INEXISTENTE,
  MENSAJE_SIN_PERMISO_TURNOS,
  MENSAJE_TURNO_DUPLICADO,
  MENSAJE_TURNO_NO_EXISTE,
  MENSAJE_TURNO_PASADO,
} from "../../lib/turnos/errores.ts";
import { misTurnos } from "../../lib/turnos/mis-turnos.ts";
import { actualizarTurno, asignarTurno, quitarTurno } from "../../lib/turnos/operaciones.ts";
import { sumarDias } from "../../lib/ui/calendario.ts";
import { conectar } from "../concurrencia/_conexion.ts";
import { ejecutorDeSesion } from "../concurrencia/_ejecutor.ts";
import { abrirSesion, type Identidad } from "../concurrencia/_sesion.ts";

const ADMIN: Identidad = { sub: "user_tt_admin", rol: "administrativo" };
const ENFERMERA: Identidad = { sub: "user_tt_enfermera", rol: "enfermera" };
const MEDICO: Identidad = { sub: "user_tt_medico", rol: "medico" };
const PACIENTE: Identidad = { sub: "user_tt_paciente", rol: "paciente" };

let admin: pg.Client;
let enfermeraSesion: pg.Client;
let medicoSesion: pg.Client;
let pacienteSesion: pg.Client;
let dueno: pg.Client;

let enfermera1: string;
let enfermera2: string;
let enfermeraDeBaja: string;
let medico1: string;
let medico2: string;
let medicoDeBaja: string;
let especialidad1: string;
let especialidad2: string;
let paciente1: string;

const AHORA = Date.now();
const MIN = 60_000;
const HOY = hoyLima();

async function limpiar(c: pg.Client): Promise<void> {
  const pacientes = `select id from public.pacientes where numero_documento like '7850%'`;
  await c.query(`delete from public.citas where paciente_id in (${pacientes})`);
  await c.query(`delete from public.asignaciones_paciente_medico where paciente_id in (${pacientes})`);
  await c.query(`delete from public.historias_clinicas where paciente_id in (${pacientes})`);
  await c.query(`delete from public.pacientes where numero_documento like '7850%'`);
  await c.query(`delete from public.turnos_enfermeria where enfermera_id in (select e.id from public.enfermeras e join public.perfiles p on p.id = e.perfil_id where p.clerk_user_id like 'user_tt_%')`);
  await c.query(`delete from public.turnos_enfermeria where medico_id in (select id from public.medicos where cmp like 'CMP-TT-%')`);
  await c.query(`delete from public.medicos where cmp like 'CMP-TT-%'`); // disponibilidades y bloqueos caen en cascada
  await c.query(`delete from public.enfermeras where perfil_id in (select id from public.perfiles where clerk_user_id like 'user_tt_%')`);
  await c.query(`delete from public.perfiles where clerk_user_id like 'user_tt_%'`);
  await c.query(`delete from public.especialidades where nombre like 'Esp integracion turnos%'`);
}

async function perfil(c: pg.Client, sub: string, rol: string, nombres: string, apellidos: string): Promise<string> {
  return (await c.query(`insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, $2, $3, $4) returning id`, [sub, rol, nombres, apellidos])).rows[0].id;
}

before(async () => {
  dueno = await conectar();
  await limpiar(dueno);
  especialidad1 = (await dueno.query(`insert into public.especialidades (nombre) values ('Esp integracion turnos 1') returning id`)).rows[0].id;
  especialidad2 = (await dueno.query(`insert into public.especialidades (nombre) values ('Esp integracion turnos 2') returning id`)).rows[0].id;
  await perfil(dueno, ADMIN.sub, "administrativo", "Adela", "Admin");
  await perfil(dueno, PACIENTE.sub, "paciente", "Pia", "Portal");
  const enf = async (sub: string, nombres: string, activo = true) => {
    const id = await perfil(dueno, sub, "enfermera", nombres, "Turnos");
    return (await dueno.query(`insert into public.enfermeras (perfil_id, activo) values ($1, $2) returning id`, [id, activo])).rows[0].id as string;
  };
  enfermera1 = await enf(ENFERMERA.sub, "Elena");
  enfermera2 = await enf("user_tt_enfermera2", "Eva");
  enfermeraDeBaja = await enf("user_tt_enfermera3", "Edith", false);
  const med = async (sub: string, nombres: string, cmp: string, especialidad: string, activo = true) => {
    const id = await perfil(dueno, sub, "medico", nombres, "Jornada");
    return (await dueno.query(`insert into public.medicos (perfil_id, cmp, especialidad_id, activo) values ($1, $2, $3, $4) returning id`, [id, cmp, especialidad, activo])).rows[0].id as string;
  };
  medico1 = await med(MEDICO.sub, "Mario", "CMP-TT-0001", especialidad1);
  medico2 = await med("user_tt_medico2", "Marta", "CMP-TT-0002", especialidad1);
  medicoDeBaja = await med("user_tt_medico3", "Mauro", "CMP-TT-0003", especialidad1, false);
  paciente1 = (
    await dueno.query(
      `insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
       values ('DNI', '78500001', 'Paula', 'Jornada', '1990-01-01', 'F', 'tt1@demo.invalid') returning id`,
    )
  ).rows[0].id;
  [admin, enfermeraSesion, medicoSesion, pacienteSesion] = await Promise.all([ADMIN, ENFERMERA, MEDICO, PACIENTE].map(abrirSesion));
});

after(async () => {
  await Promise.all([admin, enfermeraSesion, medicoSesion, pacienteSesion].map((s) => s?.end().catch(() => undefined)));
  if (dueno) {
    try {
      await limpiar(dueno);
    } finally {
      await dueno.end();
    }
  }
});

const comoAdmin = () => ejecutorDeSesion(admin);
const mensaje = (r: { ok: boolean } & Record<string, unknown>) => (r.ok ? null : String(r.mensaje));
const filasDeTurno = async (id: string) => (await dueno.query(`select turno::text, medico_id, especialidad_id, fecha::text from public.turnos_enfermeria where id = $1`, [id])).rows;

test("asignar: con médico, a un servicio, otra franja el mismo día y hoy se aceptan", async () => {
  const conMedico = await asignarTurno(comoAdmin(), { enfermera_id: enfermera1, fecha: "2032-04-05", turno: "manana", medico_id: medico1 });
  assert.equal(conMedico.ok, true);
  const otraFranja = await asignarTurno(comoAdmin(), { enfermera_id: enfermera1, fecha: "2032-04-05", turno: "tarde", especialidad_id: especialidad2 });
  assert.equal(otraFranja.ok, true, "otra franja el mismo día");
  const hoy = await asignarTurno(comoAdmin(), { enfermera_id: enfermera2, fecha: HOY, turno: "noche", medico_id: medico2 });
  assert.equal(hoy.ok, true, "hoy en Lima todavía es hoy");
  if (otraFranja.ok) assert.deepEqual((await filasDeTurno(otraFranja.datos.id))[0], { turno: "tarde", medico_id: null, especialidad_id: especialidad2, fecha: "2032-04-05" });
});

test("asignar: el mismo turno otra vez da el mensaje de choque y deja el primero intacto", async () => {
  const entrada = { enfermera_id: enfermera2, fecha: "2032-04-06", turno: "manana", medico_id: medico1 };
  const primero = await asignarTurno(comoAdmin(), entrada);
  assert.equal(primero.ok, true);
  const segundo = await asignarTurno(comoAdmin(), { ...entrada, medico_id: medico2 });
  assert.deepEqual(segundo, { ok: false, codigo: "SOLAPE", mensaje: MENSAJE_TURNO_DUPLICADO });
  if (primero.ok) assert.equal((await filasDeTurno(primero.datos.id))[0]!.medico_id, medico1);
});

test("asignar: fecha pasada, enfermera de baja, médico de baja y especialidad inexistente, con su mensaje y sin guardar nada", async () => {
  const ayer = sumarDias(HOY, -1);
  assert.equal(mensaje(await asignarTurno(comoAdmin(), { enfermera_id: enfermera1, fecha: ayer, turno: "manana", medico_id: medico1 })), MENSAJE_FECHA_ANTERIOR);
  assert.equal(mensaje(await asignarTurno(comoAdmin(), { enfermera_id: enfermeraDeBaja, fecha: "2032-04-07", turno: "manana", medico_id: medico1 })), MENSAJE_ENFERMERA_DE_BAJA);
  assert.equal(mensaje(await asignarTurno(comoAdmin(), { enfermera_id: enfermera1, fecha: "2032-04-07", turno: "manana", medico_id: medicoDeBaja })), MENSAJE_MEDICO_DE_BAJA);
  const sinServicio = await asignarTurno(comoAdmin(), { enfermera_id: enfermera1, fecha: "2032-04-07", turno: "manana", especialidad_id: "99999999-9999-4999-8999-999999999999" });
  assert.equal(sinServicio.ok === false && sinServicio.mensaje, MENSAJE_SERVICIO_INEXISTENTE);
  assert.ok(MENSAJE_REFERENCIA_INEXISTENTE.length > 0);
  const { rows } = await dueno.query(`select count(*)::int as n from public.turnos_enfermeria where (fecha = '2032-04-07' or fecha = $1) and enfermera_id in ($2, $3, $4)`, [ayer, enfermera1, enfermera2, enfermeraDeBaja]);
  assert.equal(rows[0].n, 0, "ninguno de los intentos guardó un turno");
});

test("modificar: cambia el médico y la franja, respeta el choque y rechaza turnos pasados o que ya no existen", async () => {
  const creado = await asignarTurno(comoAdmin(), { enfermera_id: enfermera1, fecha: "2032-04-12", turno: "manana", medico_id: medico1 });
  const otro = await asignarTurno(comoAdmin(), { enfermera_id: enfermera1, fecha: "2032-04-12", turno: "tarde", medico_id: medico1 });
  assert.ok(creado.ok && otro.ok);
  if (!creado.ok || !otro.ok) return;

  const cambioMedico = await actualizarTurno(comoAdmin(), { id: creado.datos.id, turno: "manana", medico_id: medico2 });
  assert.equal(cambioMedico.ok, true);
  assert.equal((await filasDeTurno(creado.datos.id))[0]!.medico_id, medico2);

  const aServicio = await actualizarTurno(comoAdmin(), { id: creado.datos.id, turno: "manana", especialidad_id: especialidad1 });
  assert.equal(aServicio.ok, true);
  assert.deepEqual((await filasDeTurno(creado.datos.id))[0], { turno: "manana", medico_id: null, especialidad_id: especialidad1, fecha: "2032-04-12" }, "un solo destino: el médico se limpia");

  const choque = await actualizarTurno(comoAdmin(), { id: creado.datos.id, turno: "tarde", especialidad_id: especialidad1 });
  assert.deepEqual(choque, { ok: false, codigo: "SOLAPE", mensaje: MENSAJE_TURNO_DUPLICADO });
  assert.equal((await filasDeTurno(creado.datos.id))[0]!.turno, "manana", "el cambio que choca no se guardó");

  assert.equal(mensaje(await actualizarTurno(comoAdmin(), { id: creado.datos.id, turno: "manana", medico_id: medicoDeBaja })), MENSAJE_MEDICO_DE_BAJA);

  // Un turno pasado se conserva como registro: se siembra como dueño porque la acción no deja crearlo.
  const pasado = (
    await dueno.query(`insert into public.turnos_enfermeria (enfermera_id, fecha, turno, medico_id) values ($1, $2, 'noche', $3) returning id`, [enfermera1, sumarDias(HOY, -3), medico1])
  ).rows[0].id as string;
  assert.equal(mensaje(await actualizarTurno(comoAdmin(), { id: pasado, turno: "tarde", medico_id: medico1 })), MENSAJE_TURNO_PASADO);
  assert.equal((await filasDeTurno(pasado))[0]!.turno, "noche");
  assert.equal(mensaje(await quitarTurno(comoAdmin(), { id: pasado })), MENSAJE_TURNO_PASADO);
  assert.equal((await filasDeTurno(pasado)).length, 1, "el turno pasado sigue guardado");

  const inexistente = await actualizarTurno(comoAdmin(), { id: "99999999-9999-4999-8999-999999999999", turno: "manana", medico_id: medico1 });
  assert.deepEqual(inexistente, { ok: false, codigo: "DATOS_INVALIDOS", mensaje: MENSAJE_TURNO_NO_EXISTE });
});

test("quitar: borra un turno futuro y avisa si otro administrativo ya lo quitó", async () => {
  const creado = await asignarTurno(comoAdmin(), { enfermera_id: enfermera2, fecha: "2032-04-13", turno: "noche", medico_id: medico1 });
  assert.ok(creado.ok);
  if (!creado.ok) return;
  assert.deepEqual(await quitarTurno(comoAdmin(), { id: creado.datos.id }), { ok: true, datos: undefined });
  assert.equal((await filasDeTurno(creado.datos.id)).length, 0);
  assert.deepEqual(await quitarTurno(comoAdmin(), { id: creado.datos.id }), { ok: false, codigo: "DATOS_INVALIDOS", mensaje: MENSAJE_TURNO_NO_EXISTE });
});

test("negativo: la enfermera, el médico y el paciente no gestionan turnos: «No tiene permiso» y el turno queda intacto", async () => {
  const creado = await asignarTurno(comoAdmin(), { enfermera_id: enfermera1, fecha: "2032-04-14", turno: "manana", medico_id: medico1 });
  assert.ok(creado.ok);
  if (!creado.ok) return;
  const antes = await filasDeTurno(creado.datos.id);
  const esperado = { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_SIN_PERMISO_TURNOS };
  for (const sesion of [enfermeraSesion, medicoSesion, pacienteSesion]) {
    const ejecutar = ejecutorDeSesion(sesion);
    assert.deepEqual(await asignarTurno(ejecutar, { enfermera_id: enfermera1, fecha: "2032-04-15", turno: "manana", medico_id: medico1 }), esperado);
    assert.deepEqual(await actualizarTurno(ejecutar, { id: creado.datos.id, turno: "tarde", medico_id: medico2 }), esperado);
    assert.deepEqual(await quitarTurno(ejecutar, { id: creado.datos.id }), esperado);
  }
  assert.deepEqual(await filasDeTurno(creado.datos.id), antes, "el turno quedó intacto");
  assert.equal((await dueno.query(`select count(*)::int as n from public.turnos_enfermeria where fecha = '2032-04-15'`)).rows[0].n, 0);
  assert.notEqual(MENSAJE_SIN_PERMISO_TURNOS, MENSAJE_NO_AUTORIZADO);
});

test("la enfermera ve sus turnos con el médico y la especialidad, y no los de otra enfermera", async () => {
  await dueno.query(`delete from public.turnos_enfermeria where enfermera_id in ($1, $2)`, [enfermera1, enfermera2]);
  const mio = (fecha: string, turno: string, medico: string | null, esp: string | null, enf = enfermera1) =>
    dueno.query(`insert into public.turnos_enfermeria (enfermera_id, fecha, turno, medico_id, especialidad_id) values ($1, $2, $3, $4, $5)`, [enf, fecha, turno, medico, esp]);
  await mio(HOY, "manana", medico1, null);
  await mio(sumarDias(HOY, 3), "tarde", null, especialidad2);
  await mio(sumarDias(HOY, 5), "noche", medicoDeBaja, null);
  await mio(sumarDias(HOY, 14), "manana", medico1, null);
  await mio(sumarDias(HOY, 15), "manana", medico1, null); // fuera de la ventana
  await mio(sumarDias(HOY, -1), "manana", medico1, null); // ayer
  await mio(sumarDias(HOY, 1), "manana", medico2, null, enfermera2); // de otra enfermera

  const r = await misTurnos(ejecutorDeSesion(enfermeraSesion));
  assert.equal(r.hoy, HOY);
  assert.deepEqual(r.hoyTurnos.map((t) => [t.fecha, t.franja]), [[HOY, "manana"]]);
  assert.deepEqual(r.hoyTurnos[0]!.medico, { nombre: "Mario Jornada", especialidad: "Esp integracion turnos 1", activo: true });
  assert.deepEqual(r.proximos.map((t) => t.fecha), [sumarDias(HOY, 3), sumarDias(HOY, 5), sumarDias(HOY, 14)]);
  assert.equal(r.proximos[0]!.medico, null);
  assert.equal(r.proximos[0]!.servicio, "Esp integracion turnos 2");
  assert.equal(r.proximos[1]!.medico?.activo, false, "el médico de baja se muestra con su nombre y marcado como inactivo");

  // Nada más: la enfermera no lee citas, pacientes ni historias con su sesión.
  for (const tabla of ["citas", "pacientes", "historias_clinicas", "atenciones", "turnos_enfermeria_con_aviso"]) {
    const { rows } = await enfermeraSesion.query(`select count(*)::int as n from public.${tabla}`);
    assert.equal(rows[0].n, 0, `cero filas en ${tabla}`);
  }
  await dueno.query(`delete from public.turnos_enfermeria where enfermera_id in ($1, $2)`, [enfermera1, enfermera2]);
});

test("la jornada del médico: sus citas confirmadas con el paciente, su horario y su bloqueo; sin motivo; y marcar atendida la saca de la lista", async () => {
  const manana = sumarDias(HOY, 1);
  const empezada = new Date(Math.max(AHORA - 25 * MIN, inicioDiaLima(HOY).getTime()));
  const paciente2 = (
    await dueno.query(
      `insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
       values ('DNI', '78500002', 'Pedro', 'Jornada', '1991-01-01', 'M', 'tt2@demo.invalid') returning id`,
    )
  ).rows[0].id as string;
  const insertarCita = async (medico: string, estado: string, inicio: Date, motivo: string, paciente = paciente1) =>
    (
      await dueno.query(
        `insert into public.citas (paciente_id, medico_id, inicio, fin, origen, estado, motivo) values ($1, $2, $3, $4, 'portal', $5, $6) returning id`,
        [paciente, medico, inicio, new Date(inicio.getTime() + 20 * MIN), estado, motivo],
      )
    ).rows[0].id as string;
  const citaEmpezada = await insertarCita(medico1, "confirmada", empezada, "MOTIVO-CLINICO-SECRETO sintoma A");
  const citaFutura = await insertarCita(medico1, "confirmada", instanteDesdeLima(manana, "15:00"), "MOTIVO-CLINICO-SECRETO sintoma B");
  const citaReservada = await insertarCita(medico1, "reservada", instanteDesdeLima(manana, "16:00"), "MOTIVO-CLINICO-SECRETO sintoma C");
  const citaDeOtro = await insertarCita(medico2, "confirmada", instanteDesdeLima(manana, "15:00"), "MOTIVO-CLINICO-SECRETO sintoma D", paciente2);
  await dueno.query(`delete from public.disponibilidades where medico_id = $1`, [medico1]);
  await dueno.query(
    `insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde)
     select $1, d, '09:00', '13:00', 20, '2020-01-01' from generate_series(0, 6) d`,
    [medico1],
  );
  await dueno.query(`insert into public.bloqueos_agenda (medico_id, rango, motivo) values ($1, tstzrange($2, $3), 'MOTIVO-CLINICO-SECRETO licencia')`, [
    medico1,
    instanteDesdeLima(manana, "08:00"),
    instanteDesdeLima(manana, "12:00"),
  ]);

  const ejecutar = ejecutorDeSesion(medicoSesion);
  const jornada = await jornadaDelMedico(ejecutar);
  assert.equal(jornada.hoy, HOY);
  assert.equal(jornada.dias.length, 8);
  const ids = jornada.dias.flatMap((d) => d.citas.map((c) => c.id));
  assert.deepEqual(ids.sort(), [citaEmpezada, citaFutura].sort(), "solo sus citas confirmadas: ni la reservada ni la de otro médico");
  assert.ok(!ids.includes(citaReservada) && !ids.includes(citaDeOtro));
  const cita = jornada.dias.flatMap((d) => d.citas).find((c) => c.id === citaEmpezada)!;
  assert.deepEqual(cita.paciente, { nombres: "Paula", apellidos: "Jornada", tipoDocumento: "DNI", documento: "78500001" });
  assert.ok(cita.minutosDesdeInicio !== null && cita.minutosDesdeInicio >= 0, "una cita que ya empezó trae sus minutos, con el reloj de la base de datos");
  assert.equal(jornada.dias.find((d) => d.fecha === manana)!.citas.find((c) => c.id === citaFutura)!.minutosDesdeInicio, null);
  assert.ok(jornada.dias[0]!.horarios.length === 1 && jornada.dias[0]!.horarios[0]!.inicio === "09:00");
  assert.deepEqual(jornada.dias.find((d) => d.fecha === manana)!.bloqueos, [{ inicio: "08:00", fin: "12:00", todoElDia: false }]);
  assert.doesNotMatch(JSON.stringify(jornada), /MOTIVO-CLINICO-SECRETO|motivo/, "la jornada no lleva el motivo de la cita ni el de un bloqueo");

  // Marcar atendida con la acción de H3 (la que usa el botón): sale de la lista; repetirlo no la cambia de nuevo.
  assert.deepEqual(await marcarAtendida(ejecutar, { cita_id: citaEmpezada }), { ok: true, datos: undefined });
  const despues = await jornadaDelMedico(ejecutar);
  assert.deepEqual(despues.dias.flatMap((d) => d.citas.map((c) => c.id)), [citaFutura]);
  const repetido = await marcarAtendida(ejecutar, { cita_id: citaEmpezada });
  assert.equal(repetido.ok === false && repetido.mensaje, MENSAJE_TRANSICION.atendida);
  const ajena = await marcarAtendida(ejecutar, { cita_id: citaDeOtro });
  assert.equal(ajena.ok === false && ajena.codigo, "CITA_NO_VIGENTE", "una cita de otro médico se rechaza sin revelar si existe");
  assert.equal((await dueno.query(`select estado::text from public.citas where id = $1`, [citaDeOtro])).rows[0].estado, "confirmada");

  // La jornada de otro rol no devuelve nada ajeno: el paciente (sin ficha de médico) ve una jornada vacía.
  const vacia = await jornadaDelMedico(ejecutorDeSesion(pacienteSesion));
  assert.equal(vacia.totalCitas, 0);
});
