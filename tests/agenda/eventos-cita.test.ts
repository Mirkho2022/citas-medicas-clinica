// Pruebas de lib/notificaciones/eventos-cita.ts (H3, tarea 7.5; design.md, D10). Ejecutar con: npm run test:agenda
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emitirTrasCommit,
  MOTIVOS_EVENTO_CITA,
  notificarEventoCita,
  sanearEvento,
  TIPOS_EVENTO_CITA,
  type EventoCita,
} from "../../lib/notificaciones/eventos-cita.ts";

const CITA = "11111111-1111-4111-8111-111111111111";
const ANTERIOR = "22222222-2222-4222-8222-222222222222";

const REPROGRAMADA: EventoCita = { tipo: "cita_reprogramada", citaId: CITA, citaAnteriorId: ANTERIOR, motivo: "reprogramacion" };

test("un notificador que lanza no cambia el resultado: la emisión termina sin error", async () => {
  const registrados: string[] = [];
  const registrar = (clase: string) => void registrados.push(clase);

  // Lanza de forma síncrona, rechaza una promesa y lanza un valor que no es Error.
  const sincrono = () => {
    throw new Error("Resend caído: ana@demo.invalid");
  };
  const asincrono = async () => {
    throw new TypeError("fallo de red");
  };
  const textoCrudo = () => {
    throw "boom";
  };

  for (const notificador of [sincrono, asincrono, textoCrudo]) {
    const resultado = await emitirTrasCommit({ tipo: "cita_reservada", citaId: CITA }, notificador, registrar);
    assert.equal(resultado, undefined);
  }
  // Solo se registra la clase del error, nunca su texto (puede traer un correo u otros datos).
  assert.deepEqual(registrados, ["Error", "TypeError", "string"]);
});

test("una acción que emite el evento tras el commit conserva su resultado aunque el notificador falle", async () => {
  async function accion(notificador: () => Promise<void>) {
    const citaId = CITA; // la cita ya quedó confirmada en la base de datos
    await emitirTrasCommit({ tipo: "cita_reservada", citaId }, notificador, () => {});
    return { ok: true as const, datos: { citaId } };
  }
  const fallido = await accion(async () => {
    throw new Error("falla");
  });
  const normal = await accion(async () => {});
  assert.deepEqual(fallido, normal);
  assert.equal(fallido.ok, true);
});

test("el notificador recibe el evento tal cual cuando todo va bien", async () => {
  const recibidos: EventoCita[] = [];
  await emitirTrasCommit(REPROGRAMADA, (e) => void recibidos.push(e));
  assert.deepEqual(recibidos, [REPROGRAMADA]);
});

test("el evento solo contiene identificadores y el motivo `reprogramacion` o `baja_medica`", async () => {
  const recibidos: EventoCita[] = [];
  const registrar = () => {};
  // Un objeto con más campos que los permitidos (p. ej. una fila de citas, con el motivo de la visita y el paciente).
  const conDatosDeMas = {
    ...REPROGRAMADA,
    motivo_visita: "Dolor de pecho",
    paciente: { nombres: "Rosa", email: "rosa@demo.invalid" },
    diagnostico: "I10",
    estado: "reservada",
  } as unknown as EventoCita;
  await emitirTrasCommit(conDatosDeMas, (e) => void recibidos.push(e), registrar);

  assert.deepEqual(recibidos, [REPROGRAMADA]);
  assert.deepEqual(Object.keys(recibidos[0]!).sort(), ["citaAnteriorId", "citaId", "motivo", "tipo"]);

  for (const motivo of MOTIVOS_EVENTO_CITA) {
    const evento = sanearEvento({ ...REPROGRAMADA, motivo });
    assert.equal(evento?.tipo === "cita_reprogramada" && evento.motivo, motivo);
  }
  assert.deepEqual([...MOTIVOS_EVENTO_CITA], ["reprogramacion", "baja_medica"]);

  // Un motivo distinto (p. ej. el texto libre de la cita) no es un evento válido y no se entrega.
  const entregados: EventoCita[] = [];
  await emitirTrasCommit({ ...REPROGRAMADA, motivo: "Dolor de pecho" } as unknown as EventoCita, (e) => void entregados.push(e), registrar);
  assert.equal(entregados.length, 0);
});

test("reservada y cancelada llevan solo el tipo y el identificador de la cita", () => {
  assert.deepEqual(sanearEvento({ tipo: "cita_reservada", citaId: CITA, motivo: "reprogramacion", citaAnteriorId: ANTERIOR }), {
    tipo: "cita_reservada",
    citaId: CITA,
  });
  assert.deepEqual(sanearEvento({ tipo: "cita_cancelada", citaId: CITA, extra: 1 }), { tipo: "cita_cancelada", citaId: CITA });
});

test("un evento sin identificadores o de otro tipo no se entrega y no lanza", async () => {
  const recibidos: EventoCita[] = [];
  const registrados: string[] = [];
  const invalidos = [
    null,
    undefined,
    "cita_reservada",
    {},
    { tipo: "cita_reservada" },
    { tipo: "cita_reservada", citaId: "" },
    { tipo: "cita_reprogramada", citaId: CITA, motivo: "baja_medica" }, // falta la cita anterior
    { tipo: "cita_confirmada", citaId: CITA },
    { tipo: "cita_no_asistio", citaId: CITA },
    { tipo: "cita_atendida", citaId: CITA },
  ];
  for (const evento of invalidos) {
    await emitirTrasCommit(evento as unknown as EventoCita, (e) => void recibidos.push(e), (clase) => void registrados.push(clase));
  }
  assert.deepEqual(recibidos, []);
  assert.equal(registrados.length, invalidos.length);
  assert.ok(registrados.every((clase) => clase === "EventoNoValido"));
});

test("el tipo EventoCita no incluye eventos de confirmación, «No asistió» ni «Atendida»", () => {
  assert.deepEqual([...TIPOS_EVENTO_CITA], ["cita_reservada", "cita_cancelada", "cita_reprogramada"]);
  for (const tipo of TIPOS_EVENTO_CITA) {
    assert.ok(!/confirm|asisti|atendid/i.test(tipo), tipo);
  }

  // Comprobación de tipos (la valida `npm run typecheck`): estos eventos NO existen en el tipo.
  const noExisten = [
    // @ts-expect-error: no hay evento de confirmación
    { tipo: "cita_confirmada", citaId: CITA } satisfies EventoCita,
    // @ts-expect-error: no hay evento de «No asistió»
    { tipo: "cita_no_asistio", citaId: CITA } satisfies EventoCita,
    // @ts-expect-error: no hay evento de «Atendida»
    { tipo: "cita_atendida", citaId: CITA } satisfies EventoCita,
    // @ts-expect-error: la reprogramación exige la cita anterior y el motivo
    { tipo: "cita_reprogramada", citaId: CITA } satisfies EventoCita,
  ];
  assert.equal(noExisten.length, 4);
});

test("la reprogramación emite un solo evento, el de reprogramada", async () => {
  const recibidos: EventoCita[] = [];
  await emitirTrasCommit(REPROGRAMADA, (e) => void recibidos.push(e));
  assert.equal(recibidos.length, 1);
  assert.equal(recibidos[0]?.tipo, "cita_reprogramada");
});

test("el notificador por defecto no hace nada: ni efectos ni registros fuera de desarrollo", async () => {
  const llamadas: string[] = [];
  const originales = { debug: console.debug, log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const nombre of Object.keys(originales) as (keyof typeof originales)[]) {
    console[nombre] = (...args: unknown[]) => void llamadas.push(`${nombre}:${args.join(" ")}`);
  }
  try {
    assert.equal(await notificarEventoCita(REPROGRAMADA), undefined);
    assert.equal(await emitirTrasCommit(REPROGRAMADA), undefined);
  } finally {
    Object.assign(console, originales);
  }
  assert.deepEqual(llamadas, []);
});
