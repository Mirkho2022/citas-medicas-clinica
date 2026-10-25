// Pruebas de lib/portal/reserva.ts (H4, tarea 6.4; specs/busqueda-y-reserva-de-cita). Ejecutar con: npm run test:portal
// El ejecutor se inyecta: sin Clerk, sin red y sin base de datos. `reservar_cita()` y el EXCLUDE se prueban aparte (pgTAP y concurrencia).
import assert from "node:assert/strict";
import { test } from "node:test";
import { MENSAJE_DOBLE_RESERVA } from "../../lib/citas/errores.ts";
import type { Ejecutor, Fila, Sentencia } from "../../lib/db/ejecutor.ts";
import {
  MENSAJE_FALTA_REGISTRO,
  MENSAJE_HORARIO_TOMADO,
  MENSAJE_SESION_VENCIDA_RESERVA,
} from "../../lib/portal/mensajes.ts";
import { reservarCitaPortal, type EventoReservaPortal } from "../../lib/portal/reserva.ts";

const PACIENTE = "11111111-1111-4111-8111-111111111111";
const OTRO_PACIENTE = "99999999-9999-4999-8999-999999999999";
const MEDICO = "22222222-2222-4222-8222-222222222222";
const CITA = "33333333-3333-4333-8333-333333333333";
const CITA_GANADORA = "44444444-4444-4444-8444-444444444444";
const INICIO = "2026-11-10T19:30:00.000Z";
const FIN = "2026-11-10T19:50:00.000Z";

const errorPg = (code: string) => Object.assign(new Error("texto de la base de datos"), { code });

interface Escenario {
  // `null` = el paciente no tiene ficha vinculada.
  paciente?: string | null;
  // Respuestas sucesivas de «¿ya tiene una cita vigente con ese médico a esa hora?» (la última se repite).
  citaVigente?: Array<string | null>;
  // `null` = el horario ya no existe entre los libres.
  horario?: { inicio: string; fin: string } | null;
  // Qué hace `reservar_cita()`: devuelve el id de la cita o lanza este error.
  reservar?: { id: string } | { error: unknown };
  // Error que lanza el ejecutor ya en la primera consulta (p. ej. sesión vencida).
  alEmpezar?: unknown;
}

// Ejecutor de prueba: reconoce cada consulta por su texto, registra las llamadas y responde según el escenario.
function ejecutorSimulado(e: Escenario = {}) {
  const llamadas: Sentencia[] = [];
  let consultasDeCitaVigente = 0;
  const ejecutar: Ejecutor = async (sentencias) => {
    const respuestas: Fila[][] = [];
    for (const s of sentencias) {
      llamadas.push(s);
      if (e.alEmpezar) throw e.alEmpezar;
      if (/paciente_actual\(\) as id\s*$/.test(s.texto)) {
        respuestas.push([{ id: e.paciente === undefined ? PACIENTE : e.paciente }]);
      } else if (/public\.slots_disponibles/.test(s.texto)) {
        const horario = e.horario === undefined ? { inicio: INICIO, fin: FIN } : e.horario;
        respuestas.push(horario ? [horario] : []);
      } else if (/from public\.citas c\s+where c\.medico_id/.test(s.texto)) {
        const lista = e.citaVigente ?? [null];
        const id = lista[Math.min(consultasDeCitaVigente++, lista.length - 1)];
        respuestas.push(id ? [{ id }] : []);
      } else if (/public\.reservar_cita\(/.test(s.texto)) {
        const r = e.reservar ?? { id: CITA };
        if ("error" in r) throw r.error;
        respuestas.push([{ id: r.id }]);
      } else {
        throw new Error(`consulta inesperada: ${s.texto}`);
      }
    }
    return respuestas;
  };
  const reservas = () => llamadas.filter((l) => /public\.reservar_cita\(/.test(l.texto));
  return { ejecutar, llamadas, reservas };
}

const entrada = { medico_id: MEDICO, inicio: INICIO };

test("una reserva válida crea la cita con el paciente de la sesión y el fin del horario que ofrece el servidor", async () => {
  const { ejecutar, reservas } = ejecutorSimulado();
  const r = await reservarCitaPortal(ejecutar, entrada);
  assert.deepEqual(r, { ok: true, datos: { id: CITA } });
  assert.equal(reservas().length, 1);
  assert.deepEqual(reservas()[0]!.parametros, [PACIENTE, MEDICO, INICIO, FIN, null]);
});

test("el paciente y el fin enviados en la solicitud nunca llegan a la reserva", async () => {
  const { ejecutar, reservas } = ejecutorSimulado();
  await reservarCitaPortal(ejecutar, {
    ...entrada,
    paciente_id: OTRO_PACIENTE,
    perfil_id: OTRO_PACIENTE,
    rol: "administrativo",
    fin: "2030-01-01T00:00:00.000Z",
    motivo: "dolor de pecho",
  });
  assert.equal(reservas().length, 1);
  assert.deepEqual(reservas()[0]!.parametros, [PACIENTE, MEDICO, INICIO, FIN, null], "paciente de la base de datos, fin del horario, sin motivo");
  const enviado = JSON.stringify(reservas()[0]);
  for (const ajeno of [OTRO_PACIENTE, "administrativo", "2030-01-01", "dolor de pecho"]) assert.ok(!enviado.includes(ajeno), `«${ajeno}» llegó a la base de datos`);
});

test("un envío inválido se rechaza con un mensaje y no toca la base de datos", async () => {
  const { ejecutar, llamadas } = ejecutorSimulado();
  const r = await reservarCitaPortal(ejecutar, { medico_id: "no-es-uuid", inicio: "mañana" });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.codigo, "DATOS_INVALIDOS");
  assert.deepEqual(Object.keys(!r.ok ? (r.campos ?? {}) : {}).sort(), ["inicio", "medico_id"]);
  assert.equal(llamadas.length, 0);
});

test("un horario que ya no existe devuelve HORARIO_NO_DISPONIBLE y no intenta el INSERT", async () => {
  const { ejecutar, reservas } = ejecutorSimulado({ horario: null });
  const r = await reservarCitaPortal(ejecutar, entrada);
  assert.deepEqual(r, { ok: false, codigo: "HORARIO_NO_DISPONIBLE", mensaje: MENSAJE_HORARIO_TOMADO });
  assert.equal(MENSAJE_HORARIO_TOMADO, "El horario elegido ya no está disponible. Elija otro horario.");
  assert.equal(reservas().length, 0);
});

test("la doble reserva sin cita propia devuelve el literal exacto del PRD, sin guía mezclada", async () => {
  const { ejecutar } = ejecutorSimulado({ reservar: { error: errorPg("23P01") }, citaVigente: [null] });
  const r = await reservarCitaPortal(ejecutar, entrada);
  assert.deepEqual(r, { ok: false, codigo: "DOBLE_RESERVA", mensaje: "Registro de cita ya agendado" });
  assert.equal(!r.ok && r.mensaje, MENSAJE_DOBLE_RESERVA);
});

test("un interbloqueo (40P01) al reservar también es doble reserva", async () => {
  const { ejecutar } = ejecutorSimulado({ reservar: { error: errorPg("40P01") } });
  const r = await reservarCitaPortal(ejecutar, entrada);
  assert.equal(!r.ok && r.codigo, "DOBLE_RESERVA");
});

test("doble reserva con una cita propia en ese horario: éxito con esa cita, no un error", async () => {
  // Dos envíos seguidos del mismo paciente: el segundo choca con el primero. Antes del INSERT aún no la ve; después, sí.
  const { ejecutar } = ejecutorSimulado({ reservar: { error: errorPg("23P01") }, citaVigente: [null, CITA_GANADORA] });
  const r = await reservarCitaPortal(ejecutar, entrada);
  assert.deepEqual(r, { ok: true, datos: { id: CITA_GANADORA } });
});

test("reenviar la misma reserva devuelve la cita que ya existe y no vuelve a reservar", async () => {
  const eventos: EventoReservaPortal[] = [];
  const { ejecutar, reservas } = ejecutorSimulado({ citaVigente: [CITA_GANADORA] });
  const r = await reservarCitaPortal(ejecutar, entrada, { emitir: (e) => void eventos.push(e) });
  assert.deepEqual(r, { ok: true, datos: { id: CITA_GANADORA } });
  assert.equal(reservas().length, 0);
  assert.deepEqual(eventos, [], "un reintento no vuelve a avisar: la primera reserva ya lo hizo");
});

test("tras reservar se emite cita_reservada con solo el identificador de la cita", async () => {
  const eventos: EventoReservaPortal[] = [];
  const { ejecutar } = ejecutorSimulado();
  await reservarCitaPortal(ejecutar, entrada, { emitir: (e) => void eventos.push(e) });
  assert.deepEqual(eventos, [{ tipo: "cita_reservada", citaId: CITA }]);
});

test("un fallo del notificador no cambia el resultado de la reserva", async () => {
  const { ejecutar } = ejecutorSimulado();
  const r = await reservarCitaPortal(ejecutar, entrada, {
    emitir: () => {
      throw new Error("el notificador se cayó");
    },
  });
  assert.deepEqual(r, { ok: true, datos: { id: CITA } });
});

test("una reserva rechazada no emite ningún evento", async () => {
  const eventos: EventoReservaPortal[] = [];
  const { ejecutar } = ejecutorSimulado({ reservar: { error: errorPg("23P01") } });
  await reservarCitaPortal(ejecutar, entrada, { emitir: (e) => void eventos.push(e) });
  assert.deepEqual(eventos, []);
});

test("una cuenta sin ficha no puede reservar y no llega a la reserva", async () => {
  const { ejecutar, reservas } = ejecutorSimulado({ paciente: null });
  const r = await reservarCitaPortal(ejecutar, entrada);
  assert.deepEqual(r, { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_FALTA_REGISTRO });
  assert.equal(reservas().length, 0);
});

test("una sesión vencida a mitad de la reserva lo dice con el texto de la spec y no crea nada", async () => {
  const vencida = Object.assign(new Error("Se requiere una sesión autenticada"), { name: "SesionRequerida" });
  const { ejecutar, reservas } = ejecutorSimulado({ alEmpezar: vencida });
  const r = await reservarCitaPortal(ejecutar, entrada);
  assert.deepEqual(r, { ok: false, codigo: "SESION_VENCIDA", mensaje: MENSAJE_SESION_VENCIDA_RESERVA });
  assert.equal(MENSAJE_SESION_VENCIDA_RESERVA, "Su sesión venció. Inicie sesión de nuevo para terminar su reserva.");
  assert.equal(reservas().length, 0);
});

test("un error inesperado de la base de datos devuelve el mensaje genérico, sin su texto", async () => {
  const registrado: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void registrado.push(args);
  try {
    const { ejecutar } = ejecutorSimulado({ reservar: { error: errorPg("XX000") } });
    const r = await reservarCitaPortal(ejecutar, entrada);
    assert.equal(!r.ok && r.codigo, "ERROR_INTERNO");
    assert.ok(!JSON.stringify(r).includes("texto de la base de datos"));
    assert.ok(!JSON.stringify(registrado).includes(PACIENTE), "el registro no lleva el paciente");
  } finally {
    console.error = original;
  }
});
