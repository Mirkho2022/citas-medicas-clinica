// Pruebas de lib/seguridad/antibots.ts (H4, tarea 4.1; design.md, D9). Ejecutar con: npm run test:portal
// `checkBotId` de BotID se sustituye por un doble: sin Vercel y sin red.
import assert from "node:assert/strict";
import { test } from "node:test";
import { esSolicitudAutomatizada, excepcionDePruebasActiva } from "../../lib/seguridad/antibots.ts";

const dobleDe = (isBot: boolean) => {
  let llamadas = 0;
  return {
    checkBotId: async () => {
      llamadas++;
      return { isBot };
    },
    llamadas: () => llamadas,
  };
};

test("un bot se clasifica como automatizado", async () => {
  const doble = dobleDe(true);
  assert.equal(await esSolicitudAutomatizada({ checkBotId: doble.checkBotId, entorno: {} }), true);
});

test("una persona pasa sin desafío", async () => {
  const doble = dobleDe(false);
  assert.equal(await esSolicitudAutomatizada({ checkBotId: doble.checkBotId, entorno: {} }), false);
  assert.equal(doble.llamadas(), 1);
});

test("el modo de excepción de las E2E deja pasar sin consultar a BotID en un preview o en local", async () => {
  for (const vercelEnv of [undefined, "preview", "development"]) {
    const doble = dobleDe(true);
    const entorno = { BOTID_EXCEPCION_E2E: "1", VERCEL_ENV: vercelEnv };
    assert.equal(excepcionDePruebasActiva(entorno), true);
    assert.equal(await esSolicitudAutomatizada({ checkBotId: doble.checkBotId, entorno }), false);
    assert.equal(doble.llamadas(), 0);
  }
});

test("el modo de excepción NO se aplica con VERCEL_ENV=production", async () => {
  const doble = dobleDe(true);
  const entorno = { BOTID_EXCEPCION_E2E: "1", VERCEL_ENV: "production" };
  assert.equal(excepcionDePruebasActiva(entorno), false);
  assert.equal(await esSolicitudAutomatizada({ checkBotId: doble.checkBotId, entorno }), true);
  assert.equal(doble.llamadas(), 1);
});

test("la excepción solo se activa con el valor exacto «1»", () => {
  for (const valor of [undefined, "", "0", "true", "si"]) {
    assert.equal(excepcionDePruebasActiva({ BOTID_EXCEPCION_E2E: valor }), false);
  }
});

test("si BotID falla, se deja pasar y se registra solo la clase del error", async () => {
  const registrados: string[] = [];
  const resultado = await esSolicitudAutomatizada({
    checkBotId: async () => {
      throw new TypeError("detalle interno que no debe salir");
    },
    entorno: {},
    registrar: (clase) => registrados.push(clase),
  });
  assert.equal(resultado, false);
  assert.deepEqual(registrados, ["TypeError"]);
});
