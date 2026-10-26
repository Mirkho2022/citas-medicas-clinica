// Búsqueda de diagnósticos CIE-10 del selector (design.md, D4): normalización de la entrada y forma de la consulta.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buscarDiagnosticos, normalizarBusqueda, sentenciaBusquedaCie10 } from "../../lib/atencion/cie10.ts";
import type { Sentencia } from "../../lib/db/ejecutor.ts";

describe("normalizarBusqueda", () => {
  it("exige al menos 2 caracteres, recorta los extremos y normaliza a NFC", () => {
    assert.equal(normalizarBusqueda("a"), null);
    assert.equal(normalizarBusqueda("  r "), null);
    assert.equal(normalizarBusqueda(" R5 "), "R5");
    assert.equal(normalizarBusqueda("cafe\u0301"), "café");
  });

  it("rechaza lo que no es texto, un texto larguísimo o con U+0000", () => {
    for (const x of [null, undefined, 7, {}, "x".repeat(61), "ab\u0000"]) assert.equal(normalizarBusqueda(x), null);
  });
});

describe("sentenciaBusquedaCie10", () => {
  it("pone primero las coincidencias de código, limita a 20 y no concatena el texto en el SQL", () => {
    const { texto, parametros } = sentenciaBusquedaCie10("hipertensión");
    assert.match(texto, /limit 20\s*$/);
    assert.match(texto, /order by \(codigo ilike \$1 escape '\\'\) desc, codigo/);
    assert.doesNotMatch(texto, /hipertensi/i);
    assert.deepEqual(parametros, ["hipertensión%", "hipertensión"]);
  });

  it("compara sin tildes ni mayúsculas en ambos lados con translate(lower())", () => {
    const { texto } = sentenciaBusquedaCie10("ñandú");
    assert.match(texto, /translate\(lower\(descripcion\), 'áéíóúüñ', 'aeiouun'\)/);
    assert.match(texto, /translate\(lower\(\$2::text\), 'áéíóúüñ', 'aeiouun'\)/);
  });

  it("escapa los comodines de LIKE para que el texto sea literal", () => {
    assert.deepEqual(sentenciaBusquedaCie10("a%_b").parametros, ["a\\%\\_b%", "a\\%\\_b"]);
  });
});

describe("buscarDiagnosticos", () => {
  it("con un texto demasiado corto no consulta la base", async () => {
    const llamadas: Sentencia[][] = [];
    const r = await buscarDiagnosticos(async (s) => (llamadas.push([...s]), [[]]), "a");
    assert.deepEqual(r, []);
    assert.equal(llamadas.length, 0);
  });

  it("devuelve código y descripción tal como los entrega el catálogo", async () => {
    const r = await buscarDiagnosticos(async () => [[{ codigo: "R51", descripcion: "Cefalea", extra: 1 }]], "cef");
    assert.deepEqual(r, [{ codigo: "R51", descripcion: "Cefalea" }]);
  });
});
