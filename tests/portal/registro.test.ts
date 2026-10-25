// Pruebas de lib/portal/registro.ts (H4, tarea 5.4; specs/registro-del-paciente). Ejecutar con: npm run test:portal
// El ejecutor se inyecta: sin Clerk, sin red y sin base de datos. La función SQL se prueba aparte (pgTAP 70 y concurrencia 30).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Ejecutor, Sentencia } from "../../lib/db/ejecutor.ts";
import { registrarPacientePortal } from "../../lib/portal/registro.ts";
import {
  MENSAJE_CUENTA_YA_REGISTRADA,
  MENSAJE_REGISTRO_RECHAZADO,
  MENSAJE_SESION_NO_CONFIRMADA,
} from "../../lib/portal/mensajes.ts";
import { MENSAJE_ERROR_INTERNO, MENSAJE_NO_AUTORIZADO } from "../../lib/acciones/resultado.ts";

const valido = {
  tipo_documento: "DNI",
  numero_documento: "72345678",
  nombres: "Ana María",
  apellidos: "Quispe Rojas",
  fecha_nacimiento: "1985-03-12",
  sexo: "F",
};

// Ejecutor de prueba: registra las sentencias y responde o lanza lo que se le indique.
function ejecutor(respuesta: () => Record<string, unknown>[] | never) {
  const llamadas: Sentencia[] = [];
  const ejecutar: Ejecutor = async (sentencias) => {
    llamadas.push(...sentencias);
    return [respuesta()];
  };
  return { ejecutar, llamadas };
}

const errorPg = (code: string, message = "texto de la base de datos") => Object.assign(new Error(message), { code });

test("un registro válido llama a registrar_paciente_portal con los datos normalizados y devuelve el resultado", async () => {
  const { ejecutar, llamadas } = ejecutor(() => [{ paciente_id: "pac-1", vinculado: true }]);
  const r = await registrarPacientePortal(ejecutar, { ...valido, tipo_documento: "CE", numero_documento: " ce1234567 ", telefono: "+51 987 654 321" });
  assert.deepEqual(r, { ok: true, datos: { pacienteId: "pac-1", vinculado: true } });
  assert.equal(llamadas.length, 1);
  assert.match(llamadas[0]!.texto, /public\.registrar_paciente_portal\(/);
  assert.deepEqual(llamadas[0]!.parametros, ["CE", "CE1234567", "Ana María", "Quispe Rojas", "1985-03-12", "F", "51987654321", null]);
});

test("un documento nuevo devuelve vinculado = false", async () => {
  const { ejecutar } = ejecutor(() => [{ paciente_id: "pac-2", vinculado: false }]);
  const r = await registrarPacientePortal(ejecutar, valido);
  assert.deepEqual(r, { ok: true, datos: { pacienteId: "pac-2", vinculado: false } });
});

test("un envío inválido se rechaza con un mensaje por campo y no toca la base de datos", async () => {
  const { ejecutar, llamadas } = ejecutor(() => []);
  const r = await registrarPacientePortal(ejecutar, { ...valido, numero_documento: "1234567", nombres: "" });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.codigo, "DATOS_INVALIDOS");
  assert.deepEqual(Object.keys(!r.ok ? (r.campos ?? {}) : {}).sort(), ["nombres", "numero_documento"]);
  assert.equal(llamadas.length, 0);
});

test("las claves extra (rol, perfil_id, paciente_id, email) se ignoran: no llegan a la base de datos", async () => {
  const { ejecutar, llamadas } = ejecutor(() => [{ paciente_id: "pac-3", vinculado: false }]);
  await registrarPacientePortal(ejecutar, {
    ...valido,
    rol: "administrativo",
    perfil_id: "00000000-0000-4000-8000-000000000001",
    paciente_id: "00000000-0000-4000-8000-000000000002",
    email: "otro@demo.invalid",
  });
  const enviado = JSON.stringify(llamadas[0]);
  for (const ajeno of ["administrativo", "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "otro@demo.invalid"]) {
    assert.ok(!enviado.includes(ajeno), `«${ajeno}» llegó a la base de datos`);
  }
  assert.equal(llamadas[0]!.parametros!.length, 8);
});

test("todos los rechazos de la vinculación (PA002) producen exactamente el mismo resultado", async () => {
  const causas = ["fecha distinta", "correo distinto", "ficha de otra cuenta", "documento ya vinculado", "carrera por el mismo documento"];
  const resultados = [];
  for (const causa of causas) {
    const { ejecutar } = ejecutor(() => {
      throw errorPg("PA002", causa);
    });
    resultados.push(await registrarPacientePortal(ejecutar, valido));
  }
  // La unicidad (23505) en una carrera se ve igual que cualquier otro rechazo.
  const { ejecutar } = ejecutor(() => {
    throw errorPg("23505");
  });
  resultados.push(await registrarPacientePortal(ejecutar, valido));

  for (const r of resultados) assert.deepEqual(r, { ok: false, codigo: "REGISTRO_RECHAZADO", mensaje: MENSAJE_REGISTRO_RECHAZADO });
  const serializados = new Set(resultados.map((r) => JSON.stringify(r)));
  assert.equal(serializados.size, 1, "los resultados son idénticos byte a byte");
  for (const causa of causas) assert.ok(!JSON.stringify(resultados).includes(causa), `no filtra «${causa}»`);
});

test("PA001 → cuenta ya registrada; PA003, PA004 y 42501 → no autorizado", async () => {
  const caso = async (code: string) => {
    const { ejecutar } = ejecutor(() => {
      throw errorPg(code);
    });
    return registrarPacientePortal(ejecutar, valido);
  };
  assert.deepEqual(await caso("PA001"), { ok: false, codigo: "CUENTA_YA_REGISTRADA", mensaje: MENSAJE_CUENTA_YA_REGISTRADA });
  assert.deepEqual(await caso("PA003"), { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_SESION_NO_CONFIRMADA });
  assert.deepEqual(await caso("PA004"), { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_SESION_NO_CONFIRMADA });
  assert.deepEqual(await caso("42501"), { ok: false, codigo: "NO_AUTORIZADO", mensaje: MENSAJE_NO_AUTORIZADO });
});

test("el CHECK de formato del documento (23514) cuelga del campo del documento", async () => {
  const { ejecutar } = ejecutor(() => {
    throw errorPg("23514");
  });
  const r = await registrarPacientePortal(ejecutar, valido);
  assert.equal(!r.ok && r.codigo, "DATOS_INVALIDOS");
  assert.deepEqual(Object.keys(!r.ok ? (r.campos ?? {}) : {}), ["numero_documento"]);
});

test("un error inesperado devuelve el mensaje genérico y el registro solo recibe la clase, nunca el documento", async () => {
  const registrados: string[] = [];
  const { ejecutar } = ejecutor(() => {
    throw new TypeError(`fallo con el documento ${valido.numero_documento} y el correo ana@demo.invalid`);
  });
  const r = await registrarPacientePortal(ejecutar, valido, (clase) => void registrados.push(clase));
  assert.deepEqual(r, { ok: false, codigo: "ERROR_INTERNO", mensaje: MENSAJE_ERROR_INTERNO });
  assert.deepEqual(registrados, ["TypeError"]);
  assert.ok(!registrados.join(" ").includes(valido.numero_documento));
  assert.ok(!JSON.stringify(r).includes(valido.numero_documento));
});

test("sin filas de respuesta es un error interno, no un éxito", async () => {
  const { ejecutar } = ejecutor(() => []);
  const r = await registrarPacientePortal(ejecutar, valido);
  assert.equal(!r.ok && r.codigo, "ERROR_INTERNO");
});
