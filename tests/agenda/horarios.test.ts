// Pruebas de lib/citas/disponibilidades.ts y lib/citas/bloqueos.ts (H3, tareas 9.1 y 9.3; specs/disponibilidad-y-slots).
// Ejecutar con: npm run test:agenda, también con TZ=UTC y TZ=Asia/Tokyo. El `Ejecutor` es un doble: sin Clerk, sin red y sin
// base de datos. Lo que sí toca la base de datos (solapes reales, vigencia por defecto, auditoría, roles) está en
// tests/integracion/horarios.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MENSAJE_DOBLE_RESERVA, MENSAJE_SOLAPE_BLOQUEO, MENSAJE_SOLAPE_DISPONIBILIDAD } from "../../lib/citas/errores.ts";
import {
  citaEnLaMalla,
  citasFueraDeLaMalla,
  eliminarDisponibilidad,
  guardarDisponibilidad,
  MENSAJE_HORARIO_INEXISTENTE,
  type TramoSemanal,
} from "../../lib/citas/disponibilidades.ts";
import {
  actualizarBloqueo,
  crearBloqueo,
  eliminarBloqueo,
  MENSAJE_BLOQUEO_INEXISTENTE,
} from "../../lib/citas/bloqueos.ts";
import type { Ejecutor, Fila, Sentencia } from "../../lib/db/ejecutor.ts";

const MEDICO = "11111111-1111-4111-8111-111111111111";
const TRAMO = "22222222-2222-4222-8222-222222222222";

// Ejecutor de prueba: registra las llamadas y responde, por orden de sentencia, con `respuestas` (o lanza `error`).
function ejecutorDe(opciones: { respuestas?: Fila[][]; error?: unknown } = {}) {
  const llamadas: Sentencia[][] = [];
  const ejecutar: Ejecutor = async (sentencias) => {
    llamadas.push([...sentencias]);
    if (opciones.error !== undefined) throw opciones.error;
    return sentencias.map((_, i) => opciones.respuestas?.[i] ?? []);
  };
  return { ejecutar, llamadas };
}

const errorSql = (code: string) => Object.assign(new Error("texto de postgres en inglés"), { code });

// Lunes 08:00–12:00 de Lima con slots de 20 minutos, vigente desde 2026-01-01.
const LUNES_MANANA: TramoSemanal = {
  dia_semana: 1,
  hora_inicio: "08:00:00",
  hora_fin: "12:00:00",
  duracion_slot_min: 20,
  vigente_desde: "2026-01-01",
  vigente_hasta: null,
};

// Lunes 19/10/2026 en Lima: 13:00Z es 08:00 de Lima.
const lima = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-05:00`);
const cita = (inicioLima: string, finLima: string, fecha = "2026-10-19") => ({
  inicio: lima(fecha, inicioLima),
  fin: lima(fecha, finLima),
});

test("citaEnLaMalla: un slot exacto de la plantilla está dentro, y también el primero y el último del tramo", () => {
  for (const [inicio, fin] of [["08:00", "08:20"], ["09:40", "10:00"], ["11:40", "12:00"]]) {
    assert.equal(citaEnLaMalla(cita(inicio!, fin!), [LUNES_MANANA]), true, `${inicio}-${fin}`);
  }
});

test("citaEnLaMalla: fuera del tramo, desalineada con la malla o de otra duración cae fuera", () => {
  assert.equal(citaEnLaMalla(cita("07:40", "08:00"), [LUNES_MANANA]), false, "antes del tramo");
  assert.equal(citaEnLaMalla(cita("12:00", "12:20"), [LUNES_MANANA]), false, "después del tramo");
  assert.equal(citaEnLaMalla(cita("11:50", "12:10"), [LUNES_MANANA]), false, "sobrepasa el final");
  assert.equal(citaEnLaMalla(cita("08:10", "08:30"), [LUNES_MANANA]), false, "desalineada con la malla de 20 minutos");
  assert.equal(citaEnLaMalla(cita("08:00", "08:30"), [LUNES_MANANA]), false, "otra duración");
  assert.equal(citaEnLaMalla(cita("08:00", "08:20"), [{ ...LUNES_MANANA, duracion_slot_min: 30 }]), false, "el slot pasó de 20 a 30 minutos");
});

test("citaEnLaMalla: respeta el día de la semana y la vigencia del tramo", () => {
  assert.equal(citaEnLaMalla(cita("08:00", "08:20", "2026-10-20"), [LUNES_MANANA]), false, "un martes");
  assert.equal(citaEnLaMalla(cita("08:00", "08:20"), [{ ...LUNES_MANANA, vigente_desde: "2026-10-20" }]), false, "la vigencia aún no empieza");
  assert.equal(citaEnLaMalla(cita("08:00", "08:20"), [{ ...LUNES_MANANA, vigente_desde: "2026-10-19" }]), true, "empieza ese mismo día");
  assert.equal(citaEnLaMalla(cita("08:00", "08:20"), [{ ...LUNES_MANANA, vigente_hasta: "2026-10-18" }]), false, "la vigencia ya terminó");
  assert.equal(citaEnLaMalla(cita("08:00", "08:20"), [{ ...LUNES_MANANA, vigente_hasta: "2026-10-19" }]), true, "termina ese mismo día");
});

test("citaEnLaMalla: sin tramos nada está dentro, y basta un tramo que la cubra", () => {
  assert.equal(citaEnLaMalla(cita("08:00", "08:20"), []), false);
  const tarde: TramoSemanal = { ...LUNES_MANANA, hora_inicio: "14:00", hora_fin: "18:00" };
  assert.equal(citaEnLaMalla(cita("15:00", "15:20"), [LUNES_MANANA, tarde]), true);
});

test("citaEnLaMalla usa la fecha y la hora de Lima, no las de UTC: 22:40 de Lima ya es martes en UTC", () => {
  // Lunes 19/10/2026 22:40–23:00 de Lima = 03:40Z–04:00Z del martes 20/10 en UTC.
  const noche: TramoSemanal = { ...LUNES_MANANA, hora_inicio: "22:00", hora_fin: "23:00" };
  assert.equal(citaEnLaMalla(cita("22:40", "23:00"), [noche]), true);
  assert.equal(citaEnLaMalla(cita("22:40", "23:00"), [{ ...noche, dia_semana: 2 }]), false, "no es martes en Lima");
});

test("citaEnLaMalla: un tramo hasta las 24:00 cubre el último slot, que termina en la medianoche de Lima", () => {
  const todoElDia: TramoSemanal = { ...LUNES_MANANA, hora_inicio: "00:00", hora_fin: "24:00" };
  const ultimo = { inicio: lima("2026-10-19", "23:40"), fin: lima("2026-10-20", "00:00") };
  assert.equal(citaEnLaMalla(ultimo, [todoElDia]), true);
  assert.equal(citaEnLaMalla({ inicio: lima("2026-10-19", "23:50"), fin: lima("2026-10-20", "00:10") }, [todoElDia]), false);
});

test("citasFueraDeLaMalla cuenta las citas que la plantilla ya no cubre y devuelve sus identificadores", () => {
  const citas = [
    { id: "a", ...cita("08:00", "08:20") },
    { id: "b", ...cita("11:40", "12:00") },
    { id: "c", ...cita("09:00", "09:20") },
  ];
  // Acortar el tramo a 08:00–10:00 deja fuera la de 11:40.
  const acortado = { ...LUNES_MANANA, hora_fin: "10:00:00" };
  assert.deepEqual(citasFueraDeLaMalla(citas, [acortado]), { cantidad: 1, citaIds: ["b"] });
  // Eliminar el tramo (plantilla vacía) deja fuera todas.
  assert.deepEqual(citasFueraDeLaMalla(citas, []), { cantidad: 3, citaIds: ["a", "b", "c"] });
  // Con el tramo completo no queda ninguna.
  assert.deepEqual(citasFueraDeLaMalla(citas, [LUNES_MANANA]), { cantidad: 0, citaIds: [] });
});

const DISPONIBILIDAD_VALIDA = {
  medico_id: MEDICO,
  dia_semana: "1",
  hora_inicio: "08:00",
  hora_fin: "12:00",
  duracion_slot_min: "",
};

test("guardar con datos incoherentes devuelve un mensaje por campo y no consulta la base de datos", async () => {
  const { ejecutar, llamadas } = ejecutorDe();
  const r = await guardarDisponibilidad(ejecutar, { ...DISPONIBILIDAD_VALIDA, dia_semana: "7", hora_fin: "07:00", duracion_slot_min: "0", id: "no-es-uuid" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.codigo, "DATOS_INVALIDOS");
  for (const campo of ["dia_semana", "hora_fin", "duracion_slot_min", "id"]) assert.ok(r.campos?.[campo], `falta el mensaje de ${campo}`);
  assert.equal(llamadas.length, 0);
});

test("un alta sin fecha de inicio deja que la base de datos use la fecha de Lima, con 20 minutos por defecto", async () => {
  const { ejecutar, llamadas } = ejecutorDe({ respuestas: [[{ id: TRAMO }]] });
  const r = await guardarDisponibilidad(ejecutar, DISPONIBILIDAD_VALIDA);
  assert.deepEqual(r, { ok: true, datos: { id: TRAMO, fueraDelHorario: { cantidad: 0, citaIds: [] } } });
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0]!.length, 1, "un alta no consulta el efecto sobre las citas");
  assert.match(llamadas[0]![0]!.texto, /coalesce\(\$6::date, public\.hoy_lima\(\)\)/);
  assert.deepEqual(llamadas[0]![0]!.parametros, [MEDICO, 1, "08:00", "12:00", 20, null, null]);
});

test("una modificación actualiza el tramo del médico indicado y calcula el aviso de las citas con la plantilla resultante", async () => {
  const { ejecutar, llamadas } = ejecutorDe({
    respuestas: [
      [{ id: TRAMO }],
      [
        { id: "a", inicio: lima("2026-10-19", "08:00"), fin: lima("2026-10-19", "08:20") },
        { id: "b", inicio: lima("2026-10-19", "11:40"), fin: lima("2026-10-19", "12:00") },
      ],
      [{ dia_semana: 1, hora_inicio: "08:00:00", hora_fin: "10:00:00", duracion_slot_min: 20, vigente_desde: "2026-01-01", vigente_hasta: null }],
    ],
  });
  const r = await guardarDisponibilidad(ejecutar, { ...DISPONIBILIDAD_VALIDA, id: TRAMO, hora_fin: "10:00" });
  assert.deepEqual(r, { ok: true, datos: { id: TRAMO, fueraDelHorario: { cantidad: 1, citaIds: ["b"] } } });
  // Una sola llamada: modificar, leer las citas futuras y leer la plantilla, en la misma transacción y en ese orden.
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0]!.length, 3);
  assert.match(llamadas[0]![0]!.texto, /update public\.disponibilidades/);
  assert.match(llamadas[0]![0]!.texto, /where id = \$1 and medico_id = \$2/);
  assert.deepEqual(llamadas[0]![0]!.parametros!.slice(0, 2), [TRAMO, MEDICO]);
  assert.match(llamadas[0]![1]!.texto, /from public\.citas/);
  assert.match(llamadas[0]![1]!.texto, /estado in \('reservada', 'confirmada'\) and inicio > now\(\)/);
  assert.match(llamadas[0]![2]!.texto, /from public\.disponibilidades/);
});

test("modificar un tramo que ya no existe (o es de otro médico) lo dice sin tocar nada más", async () => {
  const { ejecutar } = ejecutorDe({ respuestas: [[]] });
  const r = await guardarDisponibilidad(ejecutar, { ...DISPONIBILIDAD_VALIDA, id: TRAMO });
  assert.deepEqual(r, { ok: false, codigo: "DATOS_INVALIDOS", mensaje: MENSAJE_HORARIO_INEXISTENTE, campos: { id: MENSAJE_HORARIO_INEXISTENTE } });
});

test("un solape de horarios (23P01) da el mensaje propio y NO el de la doble reserva", async () => {
  const { ejecutar } = ejecutorDe({ error: errorSql("23P01") });
  for (const operacion of [
    () => guardarDisponibilidad(ejecutar, DISPONIBILIDAD_VALIDA),
    () => guardarDisponibilidad(ejecutar, { ...DISPONIBILIDAD_VALIDA, id: TRAMO }),
  ]) {
    const r = await operacion();
    assert.equal(r.ok === false && r.codigo, "SOLAPE");
    assert.equal(r.ok === false && r.mensaje, MENSAJE_SOLAPE_DISPONIBILIDAD);
    assert.notEqual(r.ok === false && r.mensaje, MENSAJE_DOBLE_RESERVA);
  }
});

test("eliminar un tramo exige ambos identificadores, borra solo el del médico y avisa de las citas que quedan fuera", async () => {
  const sin = ejecutorDe();
  const invalido = await eliminarDisponibilidad(sin.ejecutar, { id: TRAMO });
  assert.equal(invalido.ok === false && invalido.codigo, "DATOS_INVALIDOS");
  assert.equal(sin.llamadas.length, 0);

  const { ejecutar, llamadas } = ejecutorDe({
    respuestas: [[{ id: TRAMO }], [{ id: "a", inicio: lima("2026-10-19", "08:00"), fin: lima("2026-10-19", "08:20") }], []],
  });
  const r = await eliminarDisponibilidad(ejecutar, { id: TRAMO, medico_id: MEDICO });
  assert.deepEqual(r, { ok: true, datos: { fueraDelHorario: { cantidad: 1, citaIds: ["a"] } } });
  assert.match(llamadas[0]![0]!.texto, /delete from public\.disponibilidades where id = \$1 and medico_id = \$2/);
});

test("eliminar un tramo inexistente da el mensaje de «ya no existe»", async () => {
  const { ejecutar } = ejecutorDe({ respuestas: [[]] });
  const r = await eliminarDisponibilidad(ejecutar, { id: TRAMO, medico_id: MEDICO });
  assert.equal(r.ok === false && r.mensaje, MENSAJE_HORARIO_INEXISTENTE);
});

const BLOQUEO_VALIDO = {
  medico_id: MEDICO,
  inicio: "2026-10-20T08:00",
  fin: "2026-10-24T18:00",
  motivo: "Licencia",
};

test("un bloqueo interpreta lo escrito como hora de Lima: 08:00 de Lima es 13:00Z", async () => {
  const { ejecutar, llamadas } = ejecutorDe({ respuestas: [[{ id: TRAMO }], [{ n: 3 }]] });
  const r = await crearBloqueo(ejecutar, BLOQUEO_VALIDO);
  assert.deepEqual(r, { ok: true, datos: { id: TRAMO, citasAfectadas: 3 } });
  assert.deepEqual(llamadas[0]![0]!.parametros, ["2026-10-20T13:00:00.000Z", "2026-10-24T23:00:00.000Z", MEDICO, "Licencia"]);
  assert.equal(llamadas[0]![1]!.parametros![0], MEDICO);
});

test("bloqueo con fin anterior, sin fin o con motivo vacío se rechaza con su mensaje y no consulta la base de datos", async () => {
  for (const cambio of [{ fin: "2026-10-20T07:00" }, { fin: "" }, { motivo: "   " }]) {
    const { ejecutar, llamadas } = ejecutorDe();
    const r = await crearBloqueo(ejecutar, { ...BLOQUEO_VALIDO, ...cambio });
    assert.equal(r.ok === false && r.codigo, "DATOS_INVALIDOS", JSON.stringify(cambio));
    assert.equal(llamadas.length, 0);
  }
});

test("crear un bloqueo nunca modifica uno existente, aunque la entrada traiga un id", async () => {
  const { ejecutar, llamadas } = ejecutorDe({ respuestas: [[{ id: TRAMO }], [{ n: 0 }]] });
  await crearBloqueo(ejecutar, { ...BLOQUEO_VALIDO, id: "33333333-3333-4333-8333-333333333333" });
  assert.match(llamadas[0]![0]!.texto, /insert into public\.bloqueos_agenda/);
});

test("actualizar un bloqueo exige su id; con id modifica solo el del médico indicado", async () => {
  const sin = ejecutorDe();
  const r1 = await actualizarBloqueo(sin.ejecutar, BLOQUEO_VALIDO);
  assert.equal(r1.ok === false && r1.codigo, "DATOS_INVALIDOS");
  assert.equal(sin.llamadas.length, 0);

  const { ejecutar, llamadas } = ejecutorDe({ respuestas: [[{ id: TRAMO }], [{ n: 1 }]] });
  const r2 = await actualizarBloqueo(ejecutar, { ...BLOQUEO_VALIDO, id: TRAMO });
  assert.deepEqual(r2, { ok: true, datos: { id: TRAMO, citasAfectadas: 1 } });
  assert.match(llamadas[0]![0]!.texto, /update public\.bloqueos_agenda/);
  assert.match(llamadas[0]![0]!.texto, /where id = \$3 and medico_id = \$5/);

  const inexistente = ejecutorDe({ respuestas: [[]] });
  const r3 = await actualizarBloqueo(inexistente.ejecutar, { ...BLOQUEO_VALIDO, id: TRAMO });
  assert.equal(r3.ok === false && r3.mensaje, MENSAJE_BLOQUEO_INEXISTENTE);
});

test("un solape de ausencias (23P01) da el mensaje propio de ausencias y NO el de la doble reserva", async () => {
  const { ejecutar } = ejecutorDe({ error: errorSql("23P01") });
  const r = await crearBloqueo(ejecutar, BLOQUEO_VALIDO);
  assert.equal(r.ok === false && r.codigo, "SOLAPE");
  assert.equal(r.ok === false && r.mensaje, MENSAJE_SOLAPE_BLOQUEO);
  assert.equal(MENSAJE_SOLAPE_BLOQUEO, "Ya existe una ausencia registrada que se cruza con ese periodo");
  assert.notEqual(r.ok === false && r.mensaje, MENSAJE_DOBLE_RESERVA);
});

test("eliminar un bloqueo exige id y médico, y borra solo el del médico indicado", async () => {
  const sin = ejecutorDe();
  const r1 = await eliminarBloqueo(sin.ejecutar, { id: TRAMO });
  assert.equal(r1.ok === false && r1.codigo, "DATOS_INVALIDOS");
  assert.equal(sin.llamadas.length, 0);

  const { ejecutar, llamadas } = ejecutorDe({ respuestas: [[{ id: TRAMO }]] });
  assert.deepEqual(await eliminarBloqueo(ejecutar, { id: TRAMO, medico_id: MEDICO }), { ok: true, datos: undefined });
  assert.match(llamadas[0]![0]!.texto, /delete from public\.bloqueos_agenda where id = \$1 and medico_id = \$2/);

  const inexistente = ejecutorDe({ respuestas: [[]] });
  const r2 = await eliminarBloqueo(inexistente.ejecutar, { id: TRAMO, medico_id: MEDICO });
  assert.equal(r2.ok === false && r2.mensaje, MENSAJE_BLOQUEO_INEXISTENTE);
});

test("un error inesperado al guardar es genérico y no escapa", async () => {
  const registrados: unknown[] = [];
  const original = console.error;
  console.error = (...datos: unknown[]) => void registrados.push(datos);
  try {
    const { ejecutar } = ejecutorDe({ error: errorSql("57P01") });
    const r = await guardarDisponibilidad(ejecutar, DISPONIBILIDAD_VALIDA);
    assert.equal(r.ok === false && r.codigo, "ERROR_INTERNO");
  } finally {
    console.error = original;
  }
  assert.doesNotMatch(JSON.stringify(registrados), /texto de postgres/);
});
