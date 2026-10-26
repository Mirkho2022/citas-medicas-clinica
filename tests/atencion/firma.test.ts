// Proveedor de firma (specs/firma-y-addendas, «La firma está detrás de un proveedor reemplazable»; design.md, D5).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { firmaLogica } from "../../lib/atencion/firma/firma-logica.ts";

describe("proveedor de firma", () => {
  it("la firma lógica es el método por defecto y no usa ningún servicio externo", async () => {
    assert.equal(firmaLogica.metodo, "logica");
    assert.deepEqual(await firmaLogica.firmar({ atencionId: "22222222-2222-4222-8222-222222222222" }), { metodo: "logica" });
  });

  it("la interfaz no importa nada de la implementación (se puede sustituir sin tocar el flujo)", () => {
    const fuente = readFileSync(new URL("../../lib/atencion/firma/proveedor.ts", import.meta.url), "utf8");
    assert.doesNotMatch(fuente, /^\s*import\b/m);
    assert.doesNotMatch(fuente, /from "[^"]*firma-logica/);
  });

  it("la implementación solo depende de la interfaz", () => {
    const fuente = readFileSync(new URL("../../lib/atencion/firma/firma-logica.ts", import.meta.url), "utf8");
    const importaciones = [...fuente.matchAll(/^import .* from "(.*)";$/gm)].map((m) => m[1]);
    assert.deepEqual(importaciones, ["./proveedor.ts"]);
  });

  it("ni el código ni los textos de la pantalla afirman validez legal de la firma lógica (P-1 abierta)", () => {
    for (const ruta of [
      "../../lib/atencion/firma/proveedor.ts",
      "../../lib/atencion/firma/firma-logica.ts",
      "../../app/medico/pacientes/[pacienteId]/atencion/_componentes/vista-atencion.tsx",
      "../../app/medico/pacientes/[pacienteId]/atencion/_componentes/formulario-atencion.tsx",
    ]) {
      // Sin comentarios: en ellos se explica justamente que NO se afirma validez legal.
      const fuente = readFileSync(new URL(ruta, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      // Solo se permiten menciones que NIEGAN la validez (comentarios); ningún texto de interfaz dice «válida» ni «con validez legal».
      assert.doesNotMatch(fuente, /["'`>][^"'`<]*(validez legal|firma válida|cumple (con )?la norma)[^"'`<]*["'`<]/i, ruta);
    }
  });
});
