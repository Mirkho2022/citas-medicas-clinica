// Ayuda de las pruebas de turnos y jornada: repetir un archivo de pruebas con otra zona horaria del proceso. Las funciones de
// fechas de este change trabajan con fechas de Lima y no deben depender de la zona del servidor ni del navegador; para
// comprobarlo, el archivo se vuelve a ejecutar en un proceso hijo con `TZ=UTC` y con `TZ=Asia/Tokyo` (design.md, D12).
//
// Uso, al final de un archivo de pruebas:
//   repetirEnZonas(import.meta.url);
// Registra una prueba por zona que corre `node --test <ese archivo>` con TZ cambiada. El proceso hijo lleva la variable
// TURNOS_ZONA_HIJA para no repetirse a sí mismo, y comprueba que la zona pedida sí se aplicó (si no, la prueba pasaría sin probar nada).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

export const ZONAS = ["UTC", "Asia/Tokyo"] as const;

// Desfase de cada zona respecto de UTC en minutos, como lo devuelve `Date.getTimezoneOffset()` (UTC+9 es -540).
const DESFASE: Record<(typeof ZONAS)[number], number> = { UTC: 0, "Asia/Tokyo": -540 };

export function repetirEnZonas(urlDelArchivo: string): void {
  const hija = process.env.TURNOS_ZONA_HIJA;
  if (hija) {
    // Dentro del hijo: solo se verifica que la zona es la pedida.
    test(`el proceso corre en TZ=${hija}`, () => {
      assert.equal(new Date(2026, 0, 15).getTimezoneOffset(), DESFASE[hija as (typeof ZONAS)[number]]);
    });
    return;
  }
  const archivo = fileURLToPath(urlDelArchivo);
  for (const zona of ZONAS) {
    test(`el mismo archivo pasa con la zona del proceso en TZ=${zona}`, () => {
      try {
        execFileSync(process.execPath, ["--test", archivo], {
          env: { ...process.env, TZ: zona, TURNOS_ZONA_HIJA: zona },
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        const salida = error as { stdout?: string; stderr?: string };
        assert.fail(`Falló con TZ=${zona}:\n${salida.stdout ?? ""}\n${salida.stderr ?? ""}`);
      }
    });
  }
}
