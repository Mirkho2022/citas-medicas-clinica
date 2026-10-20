// Horarios y ausencias (H3, tareas 9.1 y 9.3; specs/disponibilidad-y-slots): `lib/citas/disponibilidades.ts` y
// `lib/citas/bloqueos.ts` ejecutados COMO `authenticated` con la identidad y el rol de cada usuario, sobre un branch de
// pruebas (la RLS, las restricciones EXCLUDE y la auditoría son las reales). Complementa a tests/agenda/horarios.test.ts
// (doble del ejecutor) y a pgTAP 33 y 34.
// Las filas de prueba llevan marcas propias (documentos `7350…`, perfiles `user_ih_…`, CMP `CMP-IH-…`) y se borran al empezar y
// al terminar; la auditoría es de solo agregar y conserva su rastro (por eso corre contra un branch de pruebas, nunca production).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type pg from "pg";
import { MENSAJE_DOBLE_RESERVA, MENSAJE_SOLAPE_BLOQUEO, MENSAJE_SOLAPE_DISPONIBILIDAD } from "../../lib/citas/errores.ts";
import { actualizarBloqueo, crearBloqueo, eliminarBloqueo, MENSAJE_BLOQUEO_INEXISTENTE } from "../../lib/citas/bloqueos.ts";
import {
  citaEnLaMalla,
  eliminarDisponibilidad,
  guardarDisponibilidad,
  type TramoSemanal,
} from "../../lib/citas/disponibilidades.ts";
import { hoyLima, instanteDesdeLima } from "../../lib/fechas/lima.ts";
import { conectar } from "../concurrencia/_conexion.ts";
import { ejecutorDeSesion } from "../concurrencia/_ejecutor.ts";
import { abrirSesion, type Identidad } from "../concurrencia/_sesion.ts";

const ADMIN: Identidad = { sub: "user_ih_admin", rol: "administrativo" };
const MEDICO: Identidad = { sub: "user_ih_medico", rol: "medico" };
const MEDICO_2: Identidad = { sub: "user_ih_medico2", rol: "medico" };
const ENFERMERA: Identidad = { sub: "user_ih_enfermera", rol: "enfermera" };
const PACIENTE: Identidad = { sub: "user_ih_paciente", rol: "paciente" };
const SIN_ROL: Identidad = { sub: "user_ih_sinrol", rol: null };

// Lunes 2/6/2031: lejos en el futuro, así que `inicio > now()` y las vigencias de 2030 no caducan.
const LUNES = "2031-06-02";
const MARTES = "2031-06-03";
const MIERCOLES = "2031-06-04";

let medico1: string;
let medico2: string;
let pacienteId: string;

async function limpiar(c: pg.Client): Promise<void> {
  const ids = `select id from public.pacientes where numero_documento like '7350%'`;
  await c.query(`delete from public.citas where paciente_id in (${ids})`);
  await c.query(`delete from public.historias_clinicas where paciente_id in (${ids})`);
  await c.query(`delete from public.pacientes where numero_documento like '7350%'`);
  await c.query(`delete from public.medicos where cmp like 'CMP-IH-%'`); // disponibilidades y bloqueos caen en cascada
  await c.query(`delete from public.enfermeras where perfil_id in (select id from public.perfiles where clerk_user_id like 'user_ih_%')`);
  await c.query(`delete from public.perfiles where clerk_user_id like 'user_ih_%'`);
  await c.query(`delete from public.especialidades where nombre = 'Esp integracion horarios'`);
}

before(async () => {
  const c = await conectar();
  try {
    await limpiar(c);
    const esp = await c.query(`insert into public.especialidades (nombre) values ('Esp integracion horarios') returning id`);
    const perfil = async ({ sub, rol }: Identidad) =>
      (await c.query(`insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, $2, 'Prueba', $1) returning id`, [sub, rol])).rows[0].id as string;
    await perfil(ADMIN);
    await perfil(ENFERMERA).then((id) => c.query(`insert into public.enfermeras (perfil_id) values ($1)`, [id]));
    const perfilPaciente = await perfil(PACIENTE);
    const medico = async (identidad: Identidad, cmp: string) =>
      (await c.query(`insert into public.medicos (perfil_id, cmp, especialidad_id) values ($1, $2, $3) returning id`, [await perfil(identidad), cmp, esp.rows[0].id])).rows[0].id as string;
    medico1 = await medico(MEDICO, "CMP-IH-0001");
    medico2 = await medico(MEDICO_2, "CMP-IH-0002");
    pacienteId = (
      await c.query(
        `insert into public.pacientes (perfil_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
         values ($1, 'DNI', '73500001', 'Paciente', 'Horarios', '1990-01-01', 'F', 'ih@demo.invalid') returning id`,
        [perfilPaciente],
      )
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

async function como<T>(identidad: Identidad, fn: (ejecutar: ReturnType<typeof ejecutorDeSesion>) => Promise<T>): Promise<T> {
  const sesion = await abrirSesion(identidad);
  try {
    return await fn(ejecutorDeSesion(sesion));
  } finally {
    await sesion.end().catch(() => undefined);
  }
}

// Lectura como dueño de la base de datos (comprobaciones; no pasan por el código bajo prueba).
async function comoDueno<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = await conectar();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

const tramo = (medico: string, dia: number, inicio: string, fin: string, extra: Record<string, unknown> = {}) => ({
  medico_id: medico,
  dia_semana: dia,
  hora_inicio: inicio,
  hora_fin: fin,
  duracion_slot_min: 20,
  vigente_desde: "2030-01-01",
  ...extra,
});

let tramoLunes: string;

test("el administrativo da de alta tramos; un solape se rechaza con el mensaje propio y los contiguos, otros días u otros médicos pasan", async () => {
  await como(ADMIN, async (e) => {
    const base = await guardarDisponibilidad(e, tramo(medico1, 1, "08:00", "12:00"));
    assert.equal(base.ok, true);
    if (base.ok) tramoLunes = base.datos.id;

    const solape = await guardarDisponibilidad(e, tramo(medico1, 1, "10:00", "14:00"));
    assert.equal(solape.ok === false && solape.codigo, "SOLAPE");
    assert.equal(solape.ok === false && solape.mensaje, MENSAJE_SOLAPE_DISPONIBILIDAD);
    assert.notEqual(solape.ok === false && solape.mensaje, MENSAJE_DOBLE_RESERVA);

    assert.equal((await guardarDisponibilidad(e, tramo(medico1, 1, "12:00", "16:00"))).ok, true, "contiguo");
    assert.equal((await guardarDisponibilidad(e, tramo(medico1, 2, "08:00", "12:00"))).ok, true, "otro día");
    assert.equal((await guardarDisponibilidad(e, tramo(medico2, 1, "08:00", "12:00"))).ok, true, "otro médico");

    // Vigencias que no se cruzan: el mismo tramo y día, una vez terminada la vigencia anterior.
    assert.equal((await guardarDisponibilidad(e, tramo(medico1, 1, "18:00", "20:00", { vigente_hasta: "2030-12-31" }))).ok, true);
    assert.equal((await guardarDisponibilidad(e, tramo(medico1, 1, "18:00", "20:00", { vigente_desde: "2031-01-01" }))).ok, true, "vigencias sin cruce");
    const cruzada = await guardarDisponibilidad(e, tramo(medico1, 1, "18:00", "20:00", { vigente_desde: "2030-06-01", vigente_hasta: "2031-02-01" }));
    assert.equal(cruzada.ok === false && cruzada.codigo, "SOLAPE", "vigencias que se cruzan");
  });
});

test("un alta sin fecha de inicio vigente desde hoy en Lima, y con 20 minutos por defecto", async () => {
  const antes = hoyLima();
  const r = await como(ADMIN, (e) =>
    guardarDisponibilidad(e, { medico_id: medico2, dia_semana: 4, hora_inicio: "09:00", hora_fin: "11:00", duracion_slot_min: "" }),
  );
  const despues = hoyLima();
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const fila = await comoDueno(async (c) => (await c.query(`select vigente_desde::text as desde, duracion_slot_min as slot from public.disponibilidades where id = $1`, [r.datos.id])).rows[0]);
  assert.ok(fila.desde === antes || fila.desde === despues, `vigente_desde ${fila.desde} debe ser hoy en Lima (${antes})`);
  assert.equal(fila.slot, 20);
});

test("datos incoherentes se rechazan con un mensaje por campo y no se guarda nada", async () => {
  const cuenta = () => comoDueno(async (c) => (await c.query(`select count(*)::int as n from public.disponibilidades where medico_id = $1`, [medico1])).rows[0].n as number);
  const antes = await cuenta();
  const r = await como(ADMIN, (e) => guardarDisponibilidad(e, tramo(medico1, 9, "12:00", "10:00", { duracion_slot_min: 0 })));
  assert.equal(r.ok === false && r.codigo, "DATOS_INVALIDOS");
  assert.equal(await cuenta(), antes);
});

test("acortar o eliminar un tramo avisa de las citas futuras que quedan fuera y no cancela ninguna", async () => {
  // Dos citas el lunes (09:00 y 11:40 de Lima), una dentro y otra en el borde del tramo de 08:00 a 12:00.
  const citas = await comoDueno(async (c) => {
    const ids: string[] = [];
    for (const [i, f] of [["09:00", "09:20"], ["11:40", "12:00"]] as const) {
      const r = await c.query(
        `insert into public.citas (paciente_id, medico_id, inicio, fin, origen) values ($1, $2, $3, $4, 'administrativo') returning id`,
        [pacienteId, medico1, instanteDesdeLima(LUNES, i), instanteDesdeLima(LUNES, f)],
      );
      ids.push(r.rows[0].id);
    }
    return ids;
  });

  await como(ADMIN, async (e) => {
    const acortada = await guardarDisponibilidad(e, { ...tramo(medico1, 1, "08:00", "10:00"), id: tramoLunes });
    assert.deepEqual(acortada.ok && acortada.datos.fueraDelHorario, { cantidad: 1, citaIds: [citas[1]] }, "queda fuera la de 11:40");

    const eliminada = await eliminarDisponibilidad(e, { id: tramoLunes, medico_id: medico1 });
    assert.deepEqual(eliminada.ok && eliminada.datos.fueraDelHorario, { cantidad: 2, citaIds: citas }, "sin el tramo quedan fuera las dos");

    const otraVez = await eliminarDisponibilidad(e, { id: tramoLunes, medico_id: medico1 });
    assert.equal(otraVez.ok, false, "el tramo ya no existe");
  });

  const estados = await comoDueno(async (c) => (await c.query(`select estado::text as estado from public.citas where id = any($1)`, [citas])).rows.map((r) => r.estado));
  assert.deepEqual(estados, ["reservada", "reservada"], "ninguna cita se canceló");
});

test("la función que decide si una cita cae fuera coincide con la malla que calcula la base de datos (horario_en_agenda)", async () => {
  // Plantilla de prueba del médico 2: lunes 08:00-12:00 con slots de 20 minutos.
  const tramos: TramoSemanal[] = await comoDueno(async (c) => {
    await c.query(`delete from public.disponibilidades where medico_id = $1`, [medico2]);
    await c.query(
      `insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde) values
         ($1, 1, '08:00', '12:00', 20, '2030-01-01'), ($1, 1, '14:00', '17:00', 30, '2030-01-01'), ($1, 2, '09:00', '10:00', 20, '2030-01-01')`,
      [medico2],
    );
    return (
      await c.query(
        `select dia_semana, hora_inicio::text as hora_inicio, hora_fin::text as hora_fin, duracion_slot_min,
                vigente_desde::text as vigente_desde, vigente_hasta::text as vigente_hasta
           from public.disponibilidades where medico_id = $1`,
        [medico2],
      )
    ).rows;
  });

  const sesion = await abrirSesion(ADMIN);
  try {
    let comparadas = 0;
    let dentro = 0;
    for (const fecha of [LUNES, MARTES, MIERCOLES]) {
      for (let minutos = 7 * 60; minutos <= 18 * 60; minutos += 10) {
        for (const duracion of [20, 30]) {
          const hora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
          const inicio = instanteDesdeLima(fecha, hora(minutos));
          const fin = instanteDesdeLima(fecha, hora(minutos + duracion));
          const { rows } = await sesion.query(`select public.horario_en_agenda($1, $2, $3) as dentro`, [medico2, inicio, fin]);
          assert.equal(citaEnLaMalla({ inicio, fin }, tramos), rows[0].dentro, `${fecha} ${hora(minutos)}-${hora(minutos + duracion)}`);
          comparadas++;
          if (rows[0].dentro) dentro++;
        }
      }
    }
    assert.ok(comparadas > 200 && dentro > 20, `la comparación debe incluir casos dentro y fuera (${dentro} de ${comparadas})`);
  } finally {
    await sesion.end();
  }
});

test("una ausencia se guarda con fechas de Lima, cuenta las citas que toca, rechaza solapes y queda auditada", async () => {
  // Una cita del médico 1 el miércoles 4/6/2031 a las 10:00 de Lima, dentro de la ausencia que sigue.
  const cita = await comoDueno(async (c) =>
    (await c.query(
      `insert into public.citas (paciente_id, medico_id, inicio, fin, origen) values ($1, $2, $3, $4, 'administrativo') returning id`,
      [pacienteId, medico1, instanteDesdeLima(MIERCOLES, "10:00"), instanteDesdeLima(MIERCOLES, "10:20")],
    )).rows[0].id as string,
  );

  await como(ADMIN, async (e) => {
    const alta = await crearBloqueo(e, { medico_id: medico1, inicio: "2031-06-03T08:00", fin: "2031-06-07T18:00", motivo: "Licencia" });
    assert.equal(alta.ok, true);
    if (!alta.ok) return;
    assert.equal(alta.datos.citasAfectadas, 1, `la cita ${cita} cae dentro de la ausencia`);

    const guardado = await comoDueno(async (c) =>
      (await c.query(`select lower(rango) as desde, upper(rango) as hasta, motivo from public.bloqueos_agenda where id = $1`, [alta.datos.id])).rows[0],
    );
    assert.equal(new Date(guardado.desde).toISOString(), "2031-06-03T13:00:00.000Z", "08:00 de Lima");
    assert.equal(new Date(guardado.hasta).toISOString(), "2031-06-07T23:00:00.000Z", "18:00 de Lima");

    const solape = await crearBloqueo(e, { medico_id: medico1, inicio: "2031-06-06T08:00", fin: "2031-06-09T18:00", motivo: "Otra" });
    assert.equal(solape.ok === false && solape.codigo, "SOLAPE");
    assert.equal(solape.ok === false && solape.mensaje, MENSAJE_SOLAPE_BLOQUEO);
    assert.notEqual(solape.ok === false && solape.mensaje, MENSAJE_DOBLE_RESERVA);

    const cambiado = await actualizarBloqueo(e, { id: alta.datos.id, medico_id: medico1, inicio: "2031-06-03T08:00", fin: "2031-06-05T18:00", motivo: "Licencia corta" });
    assert.deepEqual(cambiado.ok && cambiado.datos, { id: alta.datos.id, citasAfectadas: 1 });
    assert.equal((await eliminarBloqueo(e, { id: alta.datos.id, medico_id: medico1 })).ok, true);

    const otraVez = await eliminarBloqueo(e, { id: alta.datos.id, medico_id: medico1 });
    assert.equal(otraVez.ok === false && otraVez.mensaje, MENSAJE_BLOQUEO_INEXISTENTE);

    const auditoria = await comoDueno(async (c) =>
      (await c.query(`select accion, actor_rol::text as rol from public.auditoria where tabla = 'bloqueos_agenda' and registro_id = $1 order by id`, [alta.datos.id])).rows,
    );
    assert.deepEqual(auditoria, [
      { accion: "INSERT", rol: "administrativo" },
      { accion: "UPDATE", rol: "administrativo" },
      { accion: "DELETE", rol: "administrativo" },
    ]);
  });
});

test("modificar o eliminar con el médico equivocado no toca el tramo ni el bloqueo de otro médico", async () => {
  const { tramoId, bloqueoId } = await comoDueno(async (c) => ({
    tramoId: (await c.query(`insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, vigente_desde) values ($1, 5, '08:00', '09:00', '2030-01-01') returning id`, [medico1])).rows[0].id as string,
    bloqueoId: (await c.query(`insert into public.bloqueos_agenda (medico_id, rango, motivo) values ($1, tstzrange($2, $3), 'Ajena') returning id`, [medico1, instanteDesdeLima("2031-08-04", "08:00"), instanteDesdeLima("2031-08-05", "08:00")])).rows[0].id as string,
  }));
  await como(ADMIN, async (e) => {
    assert.equal((await eliminarDisponibilidad(e, { id: tramoId, medico_id: medico2 })).ok, false);
    assert.equal((await eliminarBloqueo(e, { id: bloqueoId, medico_id: medico2 })).ok, false);
    assert.equal((await actualizarBloqueo(e, { id: bloqueoId, medico_id: medico2, inicio: "2031-08-04T08:00", fin: "2031-08-06T08:00", motivo: "Cambiada" })).ok, false);
  });
  const restos = await comoDueno(async (c) => ({
    tramo: (await c.query(`select count(*)::int as n from public.disponibilidades where id = $1`, [tramoId])).rows[0].n,
    motivo: (await c.query(`select motivo from public.bloqueos_agenda where id = $1`, [bloqueoId])).rows[0].motivo,
  }));
  assert.deepEqual(restos, { tramo: 1, motivo: "Ajena" });
});

test("paciente, médico, enfermera y sesión sin rol no escriben horarios ni ausencias (negativo)", async () => {
  const { tramoId, bloqueoId } = await comoDueno(async (c) => ({
    tramoId: (await c.query(`insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, vigente_desde) values ($1, 6, '08:00', '09:00', '2030-01-01') returning id`, [medico1])).rows[0].id as string,
    bloqueoId: (await c.query(`insert into public.bloqueos_agenda (medico_id, rango, motivo) values ($1, tstzrange($2, $3), 'Protegida') returning id`, [medico1, instanteDesdeLima("2031-09-01", "08:00"), instanteDesdeLima("2031-09-02", "08:00")])).rows[0].id as string,
  }));

  for (const identidad of [PACIENTE, MEDICO, ENFERMERA, SIN_ROL]) {
    await como(identidad, async (e) => {
      const alta = await guardarDisponibilidad(e, tramo(medico1, 3, "08:00", "09:00"));
      assert.equal(alta.ok === false && alta.codigo, "NO_AUTORIZADO", `${identidad.sub}: alta de tramo`);
      const ausencia = await crearBloqueo(e, { medico_id: medico1, inicio: "2031-10-01T08:00", fin: "2031-10-02T08:00", motivo: "Intruso" });
      assert.equal(ausencia.ok === false && ausencia.codigo, "NO_AUTORIZADO", `${identidad.sub}: alta de ausencia`);
      // Modificar y eliminar: la RLS deja las filas fuera de su alcance, así que no encuentran nada que tocar.
      assert.equal((await eliminarDisponibilidad(e, { id: tramoId, medico_id: medico1 })).ok, false, `${identidad.sub}: borrar tramo`);
      assert.equal((await eliminarBloqueo(e, { id: bloqueoId, medico_id: medico1 })).ok, false, `${identidad.sub}: borrar ausencia`);
      assert.equal((await guardarDisponibilidad(e, { ...tramo(medico1, 6, "08:00", "10:00"), id: tramoId })).ok, false, `${identidad.sub}: modificar tramo`);
    });
  }

  const intactos = await comoDueno(async (c) => ({
    tramo: (await c.query(`select hora_fin::text as fin from public.disponibilidades where id = $1`, [tramoId])).rows[0]?.fin,
    bloqueo: (await c.query(`select motivo from public.bloqueos_agenda where id = $1`, [bloqueoId])).rows[0]?.motivo,
    intrusos: (await c.query(`select count(*)::int as n from public.bloqueos_agenda where motivo = 'Intruso'`)).rows[0].n,
  }));
  assert.deepEqual(intactos, { tramo: "09:00:00", bloqueo: "Protegida", intrusos: 0 });
});
