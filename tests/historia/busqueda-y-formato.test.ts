// Pruebas de la búsqueda dentro de «Mis pacientes», de la validación de la dirección y del formato de fechas de calendario
// (lib/historia/busqueda.ts, esquemas.ts y formato.ts). Ejecutar con: npm run test:historia.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  escaparComodines,
  MAXIMO_LARGO_BUSQUEDA,
  MAXIMO_PALABRAS_BUSQUEDA,
  normalizarTexto,
  patronesDeBusqueda,
} from "../../lib/historia/busqueda.ts";
import { busquedaDe, identificadorValido, MAXIMO_PAGINA, paginaDe } from "../../lib/historia/esquemas.ts";
import { edadEnAnios, fechaDeCalendario, textoEdad } from "../../lib/historia/formato.ts";

test("normalizarTexto: minúsculas y sin tildes (ñ y ü incluidas)", () => {
  assert.equal(normalizarTexto("PÉREZ Peña ÜBEDA"), "perez pena ubeda");
});

test("patronesDeBusqueda: una palabra por patrón, en cualquier orden, con los comodines escapados", () => {
  assert.deepEqual(patronesDeBusqueda("  Juan   PÉREZ "), ["%juan%", "%perez%"]);
  assert.deepEqual(patronesDeBusqueda("100%_\\"), ["%100\\%\\_\\\\%"]);
  assert.deepEqual(patronesDeBusqueda(undefined), []);
  assert.deepEqual(patronesDeBusqueda("   "), []);
  assert.equal(escaparComodines("a%b_c\\d"), "a\\%b\\_c\\\\d");
});

test("patronesDeBusqueda: acota el número de palabras y el largo del texto", () => {
  assert.equal(patronesDeBusqueda("a b c d e f g h").length, MAXIMO_PALABRAS_BUSQUEDA);
  const largo = patronesDeBusqueda("x".repeat(MAXIMO_LARGO_BUSQUEDA * 3));
  assert.equal(largo.length, 1);
  assert.ok(largo[0]!.length <= MAXIMO_LARGO_BUSQUEDA + 2);
});

test("identificadorValido: solo uuid; nunca texto cualquiera", () => {
  assert.equal(identificadorValido("8F14E45F-CEEA-467A-9575-1C9A3E3A0A11"), "8f14e45f-ceea-467a-9575-1c9a3e3a0a11");
  for (const malo of ["", " ", "1", "8f14e45f", "'; select 1 --", null, undefined, 7, {}, []]) {
    assert.equal(identificadorValido(malo), null, `«${String(malo)}» no es un identificador`);
  }
});

test("paginaDe: valores ausentes, no numéricos o fuera de rango caen en la página 1", () => {
  assert.equal(paginaDe("3"), 3);
  assert.equal(paginaDe(["2", "9"]), 2);
  for (const malo of [undefined, "", "0", "-1", "1.5", "abc", "99999", String(MAXIMO_PAGINA + 1), null]) {
    assert.equal(paginaDe(malo), 1, `«${String(malo)}»`);
  }
});

test("busquedaDe: el primer valor si viene repetido, recortado; vacío si no es texto", () => {
  assert.equal(busquedaDe("  quispe "), "quispe");
  assert.equal(busquedaDe(["a", "b"]), "a");
  assert.equal(busquedaDe(undefined), "");
  assert.equal(busquedaDe(5), "");
});

test("fechaDeCalendario: reordena las partes sin pasar por una zona horaria", () => {
  assert.equal(fechaDeCalendario("1990-05-17"), "17/05/1990");
  assert.equal(fechaDeCalendario("2000-01-01"), "01/01/2000", "no retrocede un día por estar en UTC-5");
  assert.equal(fechaDeCalendario("1990-02-30"), "1990-02-30", "una fecha inválida no se inventa");
});

test("edad: cumplida, con el cumpleaños exacto y sin valores negativos", () => {
  assert.equal(edadEnAnios("1990-05-17", "2026-05-16"), 35);
  assert.equal(edadEnAnios("1990-05-17", "2026-05-17"), 36);
  assert.equal(edadEnAnios("2026-10-01", "2026-10-25"), 0);
  assert.equal(edadEnAnios("2027-01-01", "2026-10-25"), null);
  assert.equal(edadEnAnios("no es fecha", "2026-10-25"), null);
  assert.equal(textoEdad("2025-10-25", "2026-10-25"), "1 año");
  assert.equal(textoEdad("1990-05-17", "2026-10-25"), "36 años");
  assert.equal(textoEdad("xx", "2026-10-25"), "");
});
