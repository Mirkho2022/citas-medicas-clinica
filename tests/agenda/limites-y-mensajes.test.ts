// Arreglos de la revisión de código de H3 (largo máximo de los textos, mensajes en español para entradas que no son objetos, vigencia
// sin fecha de inicio, orden y alcance de las consultas de aviso). Sin Clerk, sin red y sin base de datos. Ejecutar con: npm run
// test:agenda, también con TZ=UTC y TZ=Asia/Tokyo.
import assert from "node:assert/strict";
import { test } from "node:test";
import { falloPorValidacion } from "../../lib/acciones/resultado.ts";
import { guardarBloqueo } from "../../lib/citas/bloqueos.ts";
import { guardarDisponibilidad } from "../../lib/citas/disponibilidades.ts";
import { MENSAJE_VIGENCIA_INVERTIDA, traducirError } from "../../lib/citas/errores.ts";
import { registrarPaciente } from "../../lib/citas/pacientes.ts";
import { reservarCita } from "../../lib/citas/reservas.ts";
import { crearBloqueo } from "../../lib/citas/bloqueos.ts";
import type { Ejecutor, Fila, Sentencia } from "../../lib/db/ejecutor.ts";
import { hoyLima } from "../../lib/fechas/lima.ts";
import { disponibilidadSchema } from "../../lib/schemas/agenda.ts";
import { citaNuevaSchema } from "../../lib/schemas/cita.ts";
import { LONGITUD_MAXIMA, mensajeLongitudMaxima } from "../../lib/schemas/comun.ts";
import { pacienteSchema } from "../../lib/schemas/paciente.ts";

const MEDICO = "11111111-1111-4111-8111-111111111111";
const PACIENTE = "22222222-2222-4222-8222-222222222222";

function ejecutorDe(respuestas: Fila[][] = []) {
  const llamadas: Sentencia[][] = [];
  const ejecutar: Ejecutor = async (sentencias) => {
    llamadas.push([...sentencias]);
    return sentencias.map((_, i) => respuestas[i] ?? []);
  };
  return { ejecutar, llamadas };
}

const PACIENTE_VALIDO = {
  tipo_documento: "DNI",
  numero_documento: "99000101",
  nombres: "Rosa",
  apellidos: "Quispe",
  fecha_nacimiento: "1990-05-17",
  sexo: "F",
  email: "rosa@demo.invalid",
};

// ---- Largo máximo de los textos libres ----
test("nombres, apellidos, correo, teléfono y dirección tienen largo máximo, con mensaje en español", () => {
  const largos: [string, number][] = [
    ["nombres", LONGITUD_MAXIMA.nombre],
    ["apellidos", LONGITUD_MAXIMA.nombre],
    ["telefono", LONGITUD_MAXIMA.telefono],
    ["direccion", LONGITUD_MAXIMA.direccion],
  ];
  for (const [campo, maximo] of largos) {
    const justo = pacienteSchema.safeParse({ ...PACIENTE_VALIDO, [campo]: "a".repeat(maximo) });
    assert.equal(justo.success, true, `${campo} con ${maximo} caracteres debe pasar`);
    const pasado = pacienteSchema.safeParse({ ...PACIENTE_VALIDO, [campo]: "a".repeat(maximo + 1) });
    assert.equal(pasado.success, false, `${campo} con ${maximo + 1} caracteres debe rechazarse`);
    if (!pasado.success) assert.equal(pasado.error.issues[0]?.message, mensajeLongitudMaxima(maximo));
  }
  const correoLargo = `${"a".repeat(LONGITUD_MAXIMA.correo)}@x.pe`;
  const r = pacienteSchema.safeParse({ ...PACIENTE_VALIDO, email: correoLargo });
  assert.equal(r.success, false);
  if (!r.success) assert.ok(r.error.issues.some((i) => i.message === mensajeLongitudMaxima(LONGITUD_MAXIMA.correo)));
});

test("un nombre de 900 KB se rechaza antes de llegar a la base de datos", async () => {
  const { ejecutar, llamadas } = ejecutorDe();
  const r = await registrarPaciente(ejecutar, { ...PACIENTE_VALIDO, nombres: "a".repeat(900_000) });
  assert.equal(r.ok === false && r.codigo, "DATOS_INVALIDOS");
  assert.equal(r.ok === false && r.campos?.nombres, mensajeLongitudMaxima(LONGITUD_MAXIMA.nombre));
  assert.equal(llamadas.length, 0);
});

test("el motivo de una cita y el de una ausencia tienen largo máximo (500) y mantienen su mensaje cuando faltan", async () => {
  const cita = (motivo: string) =>
    citaNuevaSchema.safeParse({ paciente_id: PACIENTE, medico_id: MEDICO, inicio: "2026-10-14T19:30:00.000Z", fin: "2026-10-14T19:50:00.000Z", motivo });
  assert.equal(cita("a".repeat(500)).success, true);
  assert.equal(cita("a".repeat(501)).success, false);
  assert.equal(cita("   ").success, true, "un motivo vacío sigue siendo opcional");

  const { ejecutar, llamadas } = ejecutorDe();
  const bloqueo = { medico_id: MEDICO, inicio: "2026-10-20T08:00", fin: "2026-10-24T18:00" };
  const r = await crearBloqueo(ejecutar, { ...bloqueo, motivo: "a".repeat(501) });
  assert.equal(r.ok === false && r.campos?.motivo, mensajeLongitudMaxima(500));
  const vacio = await crearBloqueo(ejecutar, { ...bloqueo, motivo: "  " });
  assert.equal(vacio.ok === false && vacio.campos?.motivo, "Ingrese el motivo de la ausencia");
  assert.equal(llamadas.length, 0);

  const reserva = await reservarCita(ejecutar, { paciente_id: PACIENTE, medico_id: MEDICO, inicio: "2026-10-14T19:30:00.000Z", fin: "2026-10-14T19:50:00.000Z", motivo: "a".repeat(501) });
  assert.equal(reserva.ok === false && reserva.codigo, "DATOS_INVALIDOS");
});

// ---- Mensajes en español para una entrada que no es un objeto ----
test("una entrada que no es un objeto (null, texto, arreglo) da un mensaje en español, no el «Expected object» de Zod", async () => {
  for (const entrada of [null, "texto", [], 7, undefined]) {
    const { ejecutar, llamadas } = ejecutorDe();
    for (const operacion of [
      () => registrarPaciente(ejecutar, entrada),
      () => guardarDisponibilidad(ejecutar, entrada),
      () => guardarBloqueo(ejecutar, entrada),
      () => reservarCita(ejecutar, entrada),
    ]) {
      const r = await operacion();
      assert.equal(r.ok, false);
      if (r.ok) continue;
      assert.equal(r.codigo, "DATOS_INVALIDOS");
      assert.doesNotMatch(r.mensaje, /Expected|Required|received|undefined|null/, JSON.stringify(entrada));
      for (const mensaje of Object.values(r.campos ?? {})) assert.doesNotMatch(mensaje, /Expected|Required|received/);
    }
    assert.equal(llamadas.length, 0);
  }
});

test("falloPorValidacion traduce un problema de tipo en la raíz, y deja intactos los de cada campo", () => {
  const raiz = falloPorValidacion({ issues: [{ code: "invalid_type", path: [], message: "Expected object, received null" }] });
  assert.equal(raiz.mensaje, "Revise los datos ingresados");
  assert.deepEqual(raiz.campos, { _: "Revise los datos ingresados" });
  const campo = falloPorValidacion({ issues: [{ code: "invalid_type", path: ["email"], message: "Ingrese el correo electrónico" }] });
  assert.equal(campo.mensaje, "Ingrese el correo electrónico");
  assert.deepEqual(campo.campos, { email: "Ingrese el correo electrónico" });
  assert.equal(falloPorValidacion({ issues: [] }).mensaje, "Revise los datos ingresados");
});

// ---- Vigencia sin fecha de inicio ----
const TRAMO = { medico_id: MEDICO, dia_semana: "1", hora_inicio: "08:00", hora_fin: "12:00" };

test("un fin de vigencia anterior a hoy, sin fecha de inicio, se rechaza en el servidor (la base usaría hoy como inicio)", () => {
  const ayer = new Date(Date.now() - 36 * 60 * 60 * 1000);
  const r = disponibilidadSchema.safeParse({ ...TRAMO, vigente_hasta: hoyLima(ayer) });
  assert.equal(r.success, false);
  if (!r.success) assert.equal(r.error.issues[0]?.message, "La fecha de fin no puede ser anterior a hoy");
  // Hoy y el futuro pasan; y con fecha de inicio explícita rige la comparación entre ambas.
  assert.equal(disponibilidadSchema.safeParse({ ...TRAMO, vigente_hasta: hoyLima() }).success, true);
  assert.equal(disponibilidadSchema.safeParse({ ...TRAMO, vigente_hasta: "2099-01-01" }).success, true);
  assert.equal(disponibilidadSchema.safeParse({ ...TRAMO, vigente_desde: "2020-01-01", vigente_hasta: "2020-06-01" }).success, true);
});

test("un rango de vigencia invertido que llega a la base (22000, p. ej. al modificar sin cambiar el inicio) se traduce en español", async () => {
  const errorRango = Object.assign(new Error("range lower bound must be less than or equal to range upper bound"), { code: "22000" });
  const r = traducirError(errorRango, "disponibilidad");
  assert.deepEqual(r, { ok: false, codigo: "DATOS_INVALIDOS", mensaje: MENSAJE_VIGENCIA_INVERTIDA, campos: { vigente_hasta: MENSAJE_VIGENCIA_INVERTIDA } });
  // Fuera del contexto de horarios, un 22000 sigue siendo un error inesperado y no se reenvía su texto.
  const original = console.error;
  console.error = () => undefined;
  try {
    assert.equal(traducirError(errorRango, "agendar").codigo, "ERROR_INTERNO");
  } finally {
    console.error = original;
  }
});

// ---- Orden y alcance de las consultas de aviso ----
test("las citas del aviso de plantilla se leen en un orden definido, para que el aviso y los identificadores no cambien entre corridas", async () => {
  const { ejecutar, llamadas } = ejecutorDe([[{ id: "t" }], [], []]);
  await guardarDisponibilidad(ejecutar, { ...TRAMO, id: "33333333-3333-4333-8333-333333333333" });
  const lecturaDeCitas = llamadas[0]![1]!.texto;
  assert.match(lecturaDeCitas, /order by inicio, id/);
});

test("las citas afectadas por una ausencia son solo las que no han terminado: la misma regla que la vista de bajas", async () => {
  const { ejecutar, llamadas } = ejecutorDe([[{ id: "b" }], [{ n: 2 }]]);
  const r = await crearBloqueo(ejecutar, { medico_id: MEDICO, inicio: "2026-10-20T08:00", fin: "2026-10-24T18:00", motivo: "Licencia" });
  assert.deepEqual(r, { ok: true, datos: { id: "b", citasAfectadas: 2 } });
  assert.match(llamadas[0]![1]!.texto, /estado in \('reservada', 'confirmada'\) and fin > now\(\)/);
});
