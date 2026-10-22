// Registros simultáneos en el portal con `registrar_paciente_portal` (H4, tarea 2.6; specs/registro-del-paciente): cuentas de
// paciente, cada una en su sesión autenticada con su claim `email`, envían a la vez el mismo documento. Lo decide la base de datos
// (la unicidad del documento y el bloqueo de la fila de la ficha), no una comprobación previa de la aplicación:
//  - dos cuentas distintas con el mismo documento nuevo: una sola ficha por documento; la otra recibe PA002;
//  - la misma cuenta que envía dos veces a la vez un documento nuevo (doble clic): una sola ficha; el segundo envío recibe PA001;
//  - la misma cuenta que envía dos veces a la vez la vinculación de su ficha: se vincula una vez; el segundo envío recibe PA001.
// Las filas de prueba llevan marcas propias (documentos `7391…`, perfiles `user_rpp_…`) y se borran al empezar y al terminar.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type pg from "pg";
import { conectar } from "./_conexion.ts";
import { conSesiones, type Identidad } from "./_sesion.ts";

const RONDAS = 10;

const cuenta = (n: number): Identidad => ({ sub: `user_rpp_${n}`, rol: "paciente", email: `rpp${n}@demo.invalid` });
const A = cuenta(0);
const B = cuenta(1);

async function limpiar(c: pg.Client): Promise<void> {
  const ids = `select id from public.pacientes where numero_documento like '7391%'`;
  await c.query(`delete from public.historias_clinicas where paciente_id in (${ids})`);
  await c.query(`delete from public.pacientes where id in (${ids})`);
  await c.query(`delete from public.perfiles where clerk_user_id like 'user_rpp_%'`);
}

before(async () => {
  const c = await conectar();
  try {
    await limpiar(c);
    for (const { sub } of [A, B]) {
      await c.query(`insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, 'paciente', 'Paciente', $1)`, [sub]);
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

type Resultado = { ok: true; vinculado: boolean } | { ok: false; codigo: string };

async function registrar(sesion: pg.Client, documento: string, fecha = "1990-01-01"): Promise<Resultado> {
  try {
    const { rows } = await sesion.query(
      `select vinculado from public.registrar_paciente_portal('DNI', $1, 'Alta', 'Simultanea', $2::date, 'F')`,
      [documento, fecha],
    );
    return { ok: true, vinculado: rows[0].vinculado };
  } catch (e) {
    return { ok: false, codigo: (e as { code?: string }).code ?? "sin código" };
  }
}

// Deja a las cuentas de prueba sin ficha, como si no se hubieran registrado nunca.
async function reiniciar(c: pg.Client): Promise<void> {
  const ids = `select id from public.pacientes where numero_documento like '7391%'`;
  await c.query(`delete from public.historias_clinicas where paciente_id in (${ids})`);
  await c.query(`delete from public.pacientes where id in (${ids})`);
}

test(`${RONDAS} rondas de dos cuentas con el mismo documento nuevo: una sola ficha y la otra recibe PA002`, async () => {
  const admin = await conectar();
  try {
    await conSesiones([A, B], async ([a, b]) => {
      for (let ronda = 0; ronda < RONDAS; ronda++) {
        await reiniciar(admin);
        const documento = `7391${String(ronda).padStart(4, "0")}`;
        const resultados = await Promise.all([registrar(a!, documento), registrar(b!, documento)]);

        const altas = resultados.filter((r) => r.ok);
        assert.equal(altas.length, 1, `ronda ${ronda}: debe prosperar exactamente un registro (hubo ${altas.length})`);
        const perdedor = resultados.find((r) => !r.ok);
        assert.equal(perdedor && !perdedor.ok && perdedor.codigo, "PA002", `ronda ${ronda}: el rechazo debe ser PA002`);

        const { rows } = await admin.query(`select count(*)::int as n from public.pacientes where numero_documento = $1`, [documento]);
        assert.equal(rows[0].n, 1, `ronda ${ronda}: una sola ficha para el documento`);
      }
    });
  } finally {
    await admin.end();
  }
});

test(`${RONDAS} rondas de doble envío de una misma cuenta con un documento nuevo: una sola ficha y el segundo envío recibe PA001`, async () => {
  const admin = await conectar();
  try {
    // Dos sesiones de la misma cuenta (dos pestañas o un doble clic).
    await conSesiones([A, A], async ([a1, a2]) => {
      for (let ronda = 0; ronda < RONDAS; ronda++) {
        await reiniciar(admin);
        const documento = `7391${String(ronda + 100).padStart(4, "0")}`;
        const resultados = await Promise.all([registrar(a1!, documento), registrar(a2!, documento)]);

        assert.equal(resultados.filter((r) => r.ok).length, 1, `ronda ${ronda}: debe prosperar exactamente un envío`);
        const perdedor = resultados.find((r) => !r.ok);
        assert.equal(perdedor && !perdedor.ok && perdedor.codigo, "PA001", `ronda ${ronda}: el segundo envío debe ser PA001`);

        const { rows } = await admin.query(
          `select count(*)::int as n from public.pacientes p join public.perfiles pf on pf.id = p.perfil_id where pf.clerk_user_id = $1`,
          [A.sub],
        );
        assert.equal(rows[0].n, 1, `ronda ${ronda}: una sola ficha para la cuenta`);
      }
    });
  } finally {
    await admin.end();
  }
});

test(`${RONDAS} rondas de doble envío de la vinculación de una ficha existente: se vincula una vez y el segundo envío recibe PA001`, async () => {
  const admin = await conectar();
  try {
    await conSesiones([A, A], async ([a1, a2]) => {
      for (let ronda = 0; ronda < RONDAS; ronda++) {
        await reiniciar(admin);
        const documento = `7391${String(ronda + 200).padStart(4, "0")}`;
        await admin.query(
          `insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
           values ('DNI', $1, 'Ficha', 'Existente', '1990-01-01', 'F', $2)`,
          [documento, A.email],
        );
        const resultados = await Promise.all([registrar(a1!, documento), registrar(a2!, documento)]);

        const vinculaciones = resultados.filter((r) => r.ok);
        assert.equal(vinculaciones.length, 1, `ronda ${ronda}: debe prosperar exactamente una vinculación`);
        assert.equal(vinculaciones[0]!.ok && vinculaciones[0]!.vinculado, true);
        const perdedor = resultados.find((r) => !r.ok);
        assert.equal(perdedor && !perdedor.ok && perdedor.codigo, "PA001", `ronda ${ronda}: el segundo envío debe ser PA001`);
      }
    });
  } finally {
    await admin.end();
  }
});
