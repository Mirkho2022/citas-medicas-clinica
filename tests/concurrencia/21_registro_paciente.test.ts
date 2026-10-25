// Altas simultáneas del mismo documento con `registrarPaciente` (H3, tarea 8.2; specs/identificacion-de-pacientes
// «Registros simultáneos del mismo documento»): varios administrativos, cada uno en su sesión autenticada, registran a la vez
// el mismo tipo y número de documento. Una sola alta prospera y las demás reciben «Ya existe un paciente con ese documento»:
// lo decide la restricción única de la base de datos, no una comprobación previa de la aplicación.
// Las filas de prueba llevan marcas propias (documentos `7340…`, perfiles `user_rp_…`) y se borran al empezar y al terminar.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type pg from "pg";
import { MENSAJE_DOCUMENTO_DUPLICADO } from "../../lib/citas/errores.ts";
import { registrarPaciente } from "../../lib/citas/pacientes.ts";
import { conectar } from "./_conexion.ts";
import { ejecutorDeSesion } from "./_ejecutor.ts";
import { conSesiones, type Identidad } from "./_sesion.ts";

const ADMINISTRATIVOS = 5;
const RONDAS = 10;

const identidades: Identidad[] = Array.from({ length: ADMINISTRATIVOS }, (_, i) => ({
  sub: `user_rp_admin_${i}`,
  rol: "administrativo",
}));

async function limpiar(c: pg.Client): Promise<void> {
  const ids = `select id from public.pacientes where numero_documento like '7340%' or numero_documento = 'AB734000001'`;
  await c.query(`delete from public.historias_clinicas where paciente_id in (${ids})`);
  await c.query(`delete from public.pacientes where id in (${ids})`);
  await c.query(`delete from public.perfiles where clerk_user_id like 'user\\_rp\\_%'`);
}

before(async () => {
  const c = await conectar();
  try {
    await limpiar(c);
    for (const { sub } of identidades) {
      await c.query(`insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, 'administrativo', 'Admin', $1)`, [sub]);
    }
  } finally {
    await c.end();
  }
});

after(async () => {
  const c = await conectar();
  try {
    await limpiar(c);
  } finally {
    await c.end();
  }
});

const datosDe = (documento: string, tipo: "DNI" | "CE" = "DNI") => ({
  tipo_documento: tipo,
  numero_documento: documento,
  nombres: "Alta",
  apellidos: "Simultanea",
  fecha_nacimiento: "1990-01-01",
  sexo: "F",
  email: `rp${documento.trim().toLowerCase()}@demo.invalid`,
});

test(`${RONDAS} rondas de ${ADMINISTRATIVOS} administrativos registrando el mismo documento: una sola fila y el resto recibe el mensaje de duplicado`, async () => {
  await conSesiones(identidades, async (sesiones) => {
    const ejecutores = sesiones.map(ejecutorDeSesion);
    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const documento = `7340${String(ronda).padStart(4, "0")}`;
      const resultados = await Promise.all(ejecutores.map((e) => registrarPaciente(e, datosDe(documento))));

      const altas = resultados.filter((r) => r.ok);
      assert.equal(altas.length, 1, `ronda ${ronda}: debe prosperar exactamente un alta (hubo ${altas.length})`);
      for (const r of resultados) {
        if (r.ok) continue;
        assert.equal(r.codigo, "DOCUMENTO_DUPLICADO", `ronda ${ronda}: el rechazo debe ser por documento duplicado`);
        assert.equal(r.mensaje, MENSAJE_DOCUMENTO_DUPLICADO);
      }

      const { rows } = await sesiones[0]!.query(`select count(*)::int as n from public.pacientes where numero_documento = $1`, [documento]);
      assert.equal(rows[0].n, 1, `ronda ${ronda}: una sola fila para el documento`);
    }
  });
});

test("dos altas simultáneas del mismo Carné de Extranjería escrito distinto se normalizan y solo una prospera", async () => {
  await conSesiones(identidades.slice(0, 2), async ([a, b]) => {
    // Dos altas simultáneas del mismo Carné escrito distinto (minúsculas y espacios): ambas se normalizan a `AB734000001`.
    const [r1, r2] = await Promise.all([
      registrarPaciente(ejecutorDeSesion(a!), datosDe("ab734000001 ", "CE")),
      registrarPaciente(ejecutorDeSesion(b!), datosDe(" AB734000001", "CE")),
    ]);
    assert.equal([r1, r2].filter((r) => r.ok).length, 1);
    const perdedor = [r1, r2].find((r) => !r.ok);
    assert.equal(perdedor && !perdedor.ok && perdedor.codigo, "DOCUMENTO_DUPLICADO");
  });
});
