// Prueba de la regla de la guardia clínica del médico (lib/historia/guardia-base.ts): rol primero, después MFA, y sin MFA se
// redirige antes de leer nada. Ejecutar con: npm run test:historia.
import assert from "node:assert/strict";
import { test } from "node:test";
import { exigirMedicoConMfa, RUTA_CONFIGURAR_MFA } from "../../lib/historia/guardia-base.ts";

class Redireccion extends Error {
  ruta: string;
  constructor(ruta: string) {
    super(`redirige a ${ruta}`);
    this.ruta = ruta;
  }
}

function dependencias(opciones: { mfa: boolean; rolValido?: boolean }) {
  const llamadas: string[] = [];
  return {
    llamadas,
    dependencias: {
      exigirRol: async (rol: string) => {
        llamadas.push(`rol:${rol}`);
        if (opciones.rolValido === false) throw new Redireccion("/administrativo");
      },
      tieneMfaActivo: async () => {
        llamadas.push("mfa");
        return opciones.mfa;
      },
      redirigir: (ruta: string): never => {
        throw new Redireccion(ruta);
      },
    },
  };
}

test("médico con MFA: pasa, tras comprobar el rol de médico y después el MFA", async () => {
  const { dependencias: d, llamadas } = dependencias({ mfa: true });
  await exigirMedicoConMfa(d);
  assert.deepEqual(llamadas, ["rol:medico", "mfa"]);
});

test("médico sin MFA: va a configurarlo y la página no continúa", async () => {
  const { dependencias: d } = dependencias({ mfa: false });
  await assert.rejects(exigirMedicoConMfa(d), (e: unknown) => e instanceof Redireccion && e.ruta === RUTA_CONFIGURAR_MFA);
});

test("rol distinto de médico: se redirige a su área sin ni siquiera consultar el MFA", async () => {
  const { dependencias: d, llamadas } = dependencias({ mfa: true, rolValido: false });
  await assert.rejects(exigirMedicoConMfa(d), (e: unknown) => e instanceof Redireccion && e.ruta === "/administrativo");
  assert.deepEqual(llamadas, ["rol:medico"]);
});
