// Pruebas de lib/seguridad/limites.ts (H4, tareas 4.2 y 4.3; design.md, D9). Ejecutar con: npm run test:portal
// Todo con el almacén en memoria y un reloj inyectado: sin Redis, sin red y sin esperar de verdad.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  conFalloAbierto,
  ipDelCliente,
  limitadorEnMemoria,
  mensajeDeEspera,
  REGLAS,
  reglaDeRutaDeAutenticacion,
  type Limitador,
} from "../../lib/seguridad/limites.ts";

const MINUTO = 60_000;

test("la tabla de reglas trae los valores del diseño", () => {
  assert.deepEqual(REGLAS.autenticacionEscritura, { nombre: "autenticacion-escritura", maximo: 5, ventanaSegundos: 15 * 60 });
  assert.deepEqual([REGLAS.registro.maximo, REGLAS.registro.ventanaSegundos], [5, 15 * 60]);
  assert.deepEqual([REGLAS.reserva.maximo, REGLAS.reserva.ventanaSegundos], [10, 10 * 60]);
  assert.deepEqual([REGLAS.cancelacion.maximo, REGLAS.cancelacion.ventanaSegundos], [10, 10 * 60]);
  assert.deepEqual([REGLAS.busqueda.maximo, REGLAS.busqueda.ventanaSegundos], [60, 60]);
  assert.deepEqual([REGLAS.autenticacionLectura.maximo, REGLAS.autenticacionLectura.ventanaSegundos], [60, 60]);
});

test("el sexto intento en la ventana se rechaza y dice cuánto esperar", async () => {
  let ahora = 0;
  const limitador = limitadorEnMemoria(() => ahora);
  for (let i = 1; i <= 5; i++) {
    ahora = i * 1000;
    assert.equal((await limitador.limitar(REGLAS.autenticacionEscritura, "ip:1.1.1.1")).permitido, true, `intento ${i}`);
  }
  ahora = 6000;
  const sexto = await limitador.limitar(REGLAS.autenticacionEscritura, "ip:1.1.1.1");
  assert.equal(sexto.permitido, false);
  // El primer intento fue en t = 1 s y la ventana dura 15 min: se libera en 15 min - 5 s.
  assert.equal(sexto.reintentarEnSegundos, 15 * 60 - 5);
});

test("pasada la ventana vuelve a permitirse", async () => {
  let ahora = 0;
  const limitador = limitadorEnMemoria(() => ahora);
  for (let i = 0; i < 5; i++) await limitador.limitar(REGLAS.autenticacionEscritura, "ip:2.2.2.2");
  assert.equal((await limitador.limitar(REGLAS.autenticacionEscritura, "ip:2.2.2.2")).permitido, false);
  ahora = 15 * MINUTO + 1;
  assert.equal((await limitador.limitar(REGLAS.autenticacionEscritura, "ip:2.2.2.2")).permitido, true);
});

test("cinco lecturas de una misma IP no bloquean a nadie: cada regla tiene su propio contador", async () => {
  const limitador = limitadorEnMemoria(() => 0);
  for (let i = 0; i < 5; i++) {
    assert.equal((await limitador.limitar(REGLAS.autenticacionLectura, "ip:3.3.3.3")).permitido, true);
  }
  // Y las lecturas no gastan el cupo de las escrituras de esa IP.
  for (let i = 0; i < 5; i++) {
    assert.equal((await limitador.limitar(REGLAS.autenticacionEscritura, "ip:3.3.3.3")).permitido, true);
  }
});

test("dos claves distintas no comparten contador", async () => {
  const limitador = limitadorEnMemoria(() => 0);
  for (let i = 0; i < 5; i++) await limitador.limitar(REGLAS.autenticacionEscritura, "ip:4.4.4.4");
  assert.equal((await limitador.limitar(REGLAS.autenticacionEscritura, "ip:4.4.4.4")).permitido, false);
  assert.equal((await limitador.limitar(REGLAS.autenticacionEscritura, "ip:5.5.5.5")).permitido, true);
});

test("un almacén que lanza deja pasar y registra solo la clase del error", async () => {
  const registrados: string[] = [];
  const roto: Limitador = {
    limitar: async () => {
      throw new TypeError("redis://clave-secreta@host: ECONNREFUSED ip:9.9.9.9");
    },
  };
  const limitador = conFalloAbierto(roto, (clase) => registrados.push(clase));
  const decision = await limitador.limitar(REGLAS.reserva, "u:usuario-secreto");
  assert.equal(decision.permitido, true);
  assert.deepEqual(registrados, ["TypeError"]);
  assert.ok(!registrados.join().includes("secreto") && !registrados.join().includes("9.9.9.9"));
});

test("un almacén que no responde a tiempo deja pasar", async () => {
  const registrados: string[] = [];
  const colgado: Limitador = { limitar: () => new Promise(() => undefined) };
  const limitador = conFalloAbierto(colgado, (clase) => registrados.push(clase), 20);
  assert.equal((await limitador.limitar(REGLAS.reserva, "u:1")).permitido, true);
  assert.equal(registrados.length, 1);
});

test("un almacén sano pasa su decisión tal cual", async () => {
  const limitador = conFalloAbierto(limitadorEnMemoria(() => 0), () => assert.fail("no debe registrar"));
  for (let i = 0; i < 5; i++) await limitador.limitar(REGLAS.registro, "u:1");
  assert.equal((await limitador.limitar(REGLAS.registro, "u:1")).permitido, false);
});

test("qué regla corresponde a una petición a las rutas de autenticación", () => {
  assert.equal(reglaDeRutaDeAutenticacion("POST", "/iniciar-sesion"), REGLAS.autenticacionEscritura);
  assert.equal(reglaDeRutaDeAutenticacion("POST", "/registro/verify-email-address"), REGLAS.autenticacionEscritura);
  assert.equal(reglaDeRutaDeAutenticacion("GET", "/iniciar-sesion"), REGLAS.autenticacionLectura);
  assert.equal(reglaDeRutaDeAutenticacion("get", "/registro/sso-callback"), REGLAS.autenticacionLectura);
  assert.equal(reglaDeRutaDeAutenticacion("HEAD", "/iniciar-sesion"), REGLAS.autenticacionLectura);
  // Lo que no es una ruta de autenticación no se limita aquí (ni se confunde por el prefijo).
  assert.equal(reglaDeRutaDeAutenticacion("POST", "/paciente/citas/nueva"), null);
  assert.equal(reglaDeRutaDeAutenticacion("POST", "/registros"), null);
  assert.equal(reglaDeRutaDeAutenticacion("POST", "/api/webhooks/clerk"), null);
});

const cabeceras = (valores: Record<string, string>) => ({ get: (n: string) => valores[n.toLowerCase()] ?? null });

test("un x-forwarded-for falsificado por el cliente no cambia la clave del contador", () => {
  // Fuera de un proxy de confianza las cabeceras de reenvío las manda el cliente: se ignoran todas.
  const a = ipDelCliente(cabeceras({ "x-forwarded-for": "6.6.6.6" }), false);
  const b = ipDelCliente(cabeceras({ "x-forwarded-for": "7.7.7.7", "x-real-ip": "8.8.8.8" }), false);
  assert.equal(a, b);
  assert.ok(!a.includes("6.6.6.6"));
});

test("detrás de Vercel manda la cabecera que fija la plataforma, no la lista que agrega el cliente", () => {
  const ip = ipDelCliente(
    cabeceras({ "x-vercel-forwarded-for": "190.1.2.3", "x-real-ip": "190.1.2.3", "x-forwarded-for": "6.6.6.6, 190.1.2.3" }),
    true,
  );
  assert.equal(ip, "190.1.2.3");
  assert.equal(ipDelCliente(cabeceras({ "x-real-ip": "190.4.5.6" }), true), "190.4.5.6");
  assert.equal(ipDelCliente(cabeceras({ "x-forwarded-for": "190.7.8.9, 10.0.0.1" }), true), "190.7.8.9");
  assert.equal(ipDelCliente(cabeceras({}), true), "desconocida");
  assert.equal(ipDelCliente(cabeceras({ "x-real-ip": "x".repeat(200) }), true), "desconocida");
});

test("el mensaje de espera dice los minutos, redondeados hacia arriba", () => {
  assert.equal(mensajeDeEspera(15 * 60), "Demasiados intentos. Espere 15 minutos e intente de nuevo.");
  assert.equal(mensajeDeEspera(61), "Demasiados intentos. Espere 2 minutos e intente de nuevo.");
  assert.equal(mensajeDeEspera(1), "Demasiados intentos. Espere 1 minuto e intente de nuevo.");
});
