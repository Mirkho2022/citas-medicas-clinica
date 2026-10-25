// Pruebas de lib/portal/mensajes.ts (H4, tarea 3.2; specs/usabilidad-y-accesibilidad-del-portal). Ejecutar con: npm run test:portal
import assert from "node:assert/strict";
import { test } from "node:test";
import * as mensajes from "../../lib/portal/mensajes.ts";

// Todos los textos del módulo: las constantes de texto y lo que devuelven las funciones de texto.
const textos: string[] = [
  ...(Object.values(mensajes).filter((v) => typeof v === "string") as string[]),
  mensajes.advertenciaCancelacion("10:20"),
];

// Los que son un error: deben decir qué hacer. La doble reserva es el literal del PRD y se acompaña de GUIA_DOBLE_RESERVA.
const errores: string[] = [
  mensajes.MENSAJE_REGISTRO_RECHAZADO,
  mensajes.MENSAJE_SESION_NO_CONFIRMADA,
  mensajes.MENSAJE_CUENTA_TARDA,
  mensajes.MENSAJE_SESION_VENCIDA,
  mensajes.MENSAJE_SESION_VENCIDA_RESERVA,
  mensajes.MENSAJE_DEMASIADOS_INTENTOS,
  mensajes.MENSAJE_ANTIBOTS,
  mensajes.MENSAJE_ERROR_INESPERADO,
  mensajes.MENSAJE_HORARIO_TOMADO,
  mensajes.MENSAJE_CANCELACION_TARDIA,
  mensajes.MENSAJE_CITA_NO_ENCONTRADA,
  mensajes.MENSAJE_CITA_YA_CANCELADA,
  mensajes.MENSAJE_CITA_NO_CANCELABLE,
];

test("el texto de la doble reserva coincide carácter a carácter con el del PRD", () => {
  assert.equal(mensajes.MENSAJE_DOBLE_RESERVA, "Registro de cita ya agendado");
});

test("el portal no vuelve a escribir el literal de la doble reserva", () => {
  const otros = textos.filter((t) => t !== mensajes.MENSAJE_DOBLE_RESERVA);
  for (const texto of otros) {
    assert.ok(!texto.includes("Registro de cita ya agendado"), `«${texto}» repite el literal`);
  }
});

// Formas de tuteo (segunda persona del singular) que no deben aparecer: el trato es de usted.
// «reserva» solo cuenta como orden si no es el sustantivo («terminar su reserva»).
const TUTEO = /\b(tú|tu|tus|ti|contigo|eres|tienes|puedes|debes|quieres|necesitas|ingresa|elige|selecciona|revisa|espera|intenta|cierra|toca|vuelve|comunícate|haz|ve|cancela|(?<!su )reserva)\b/i;

test("el detector de tuteo detecta el tuteo", () => {
  for (const tuteo of ["Ingresa tu correo", "Puedes cancelar tu cita", "Elige otro horario", "Comunícate con la clínica"]) {
    assert.match(tuteo, TUTEO, tuteo);
  }
});

test("ningún texto usa tuteo", () => {
  for (const texto of textos) {
    assert.doesNotMatch(texto, TUTEO, `«${texto}» parece tutear`);
  }
});

test("ningún texto muestra códigos de error ni jerga técnica", () => {
  const tecnico = /\b(PA00\d|UC00\d|23P01|40P01|P0001|42501|SQLSTATE|SQL|Postgres|RLS|JWT|token|null|undefined|NO_AUTORIZADO|ERROR_INTERNO|exception|error code)\b/i;
  for (const texto of textos) {
    assert.doesNotMatch(texto, tecnico, `«${texto}» muestra un detalle técnico`);
  }
});

test("todo error termina diciendo qué hacer", () => {
  // La última oración trae un verbo de acción en la forma de usted.
  const accion = /\b(Intente|Elija|Espere|Cierre|Comuníquese|comuníquese|Revise|Toque|Ingrese|Inicie|Vaya|avise)\b/;
  for (const texto of errores) {
    const oraciones = texto.split(/(?<=[.!?])\s+/);
    const ultima = oraciones[oraciones.length - 1]!;
    assert.match(ultima, accion, `«${texto}» no termina con una indicación`);
  }
});

test("todo texto es una frase completa en español: empieza con mayúscula y termina en punto", () => {
  // Salvo el literal del PRD (se muestra tal cual, sin punto) y «Estamos preparando su cuenta…» (termina en puntos suspensivos).
  const excepciones = [mensajes.MENSAJE_DOBLE_RESERVA, mensajes.MENSAJE_PREPARANDO_CUENTA];
  for (const texto of textos.filter((t) => !excepciones.includes(t))) {
    assert.match(texto, /^[A-ZÁÉÍÓÚÑ¿¡«]/, `«${texto}» no empieza con mayúscula`);
    assert.match(texto, /[.»]$/, `«${texto}» no termina en punto`);
  }
});

test("la advertencia de cancelación es la de la spec: plazo de 1 hora y hora límite", () => {
  assert.equal(mensajes.advertenciaCancelacion("13:30"), "Podrá cancelar esta cita hasta 1 hora antes, a las 13:30.");
});

test("el aviso de una cita en menos de 1 hora dice que ya no podrá cancelarla desde el portal y pide confirmar", () => {
  assert.match(mensajes.AVISO_CITA_PROXIMA, /menos de 1 hora/);
  assert.match(mensajes.AVISO_CITA_PROXIMA, /ya no podrá cancelarla desde el portal/);
  assert.match(mensajes.AVISO_CITA_PROXIMA, /Confirme solo si/);
});

test("los textos que cita la spec coinciden carácter a carácter", () => {
  assert.equal(mensajes.MENSAJE_HORARIO_TOMADO, "El horario elegido ya no está disponible. Elija otro horario.");
  assert.equal(mensajes.MENSAJE_SESION_VENCIDA_RESERVA, "Su sesión venció. Inicie sesión de nuevo para terminar su reserva.");
  assert.equal(
    mensajes.MENSAJE_CANCELACION_TARDIA,
    "Ya no es posible cancelar esta cita porque falta menos de 1 hora. Si no puede asistir, avise a la clínica.",
  );
  assert.ok(mensajes.MENSAJE_CITA_NO_ENCONTRADA.startsWith("No encontramos esa cita"));
  assert.ok(mensajes.MENSAJE_SIN_CITAS.startsWith("Todavía no tiene citas"));
});

test("el mensaje de registro rechazado es el de la spec y no revela qué dato falló", () => {
  assert.equal(
    mensajes.MENSAJE_REGISTRO_RECHAZADO,
    "No pudimos completar su registro con estos datos. Si ya se atendió en la clínica, comuníquese con ella para que revisen su ficha.",
  );
  assert.doesNotMatch(mensajes.MENSAJE_REGISTRO_RECHAZADO, /fecha|correo|documento|DNI|existe|cuenta/i);
});
