// Búsqueda y alta de pacientes (H3, tarea 8.1; specs/identificacion-de-pacientes): `lib/citas/pacientes.ts` ejecutado COMO
// `authenticated` con la identidad y el rol de cada usuario, sobre un branch de pruebas (la RLS real decide qué filas existen
// para cada rol). Complementa a tests/agenda/pacientes.test.ts (doble del ejecutor) y a pgTAP.
// Las filas de prueba llevan marcas propias (documentos `7330…`, perfiles `user_ip_…`), se borran al empezar y al terminar.
// Nunca corre contra production (tests/concurrencia/_conexion.ts).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type pg from "pg";
import { buscarPacientes, LIMITE_BUSQUEDA_PACIENTES, registrarPaciente } from "../../lib/citas/pacientes.ts";
import { MENSAJE_DOCUMENTO_DUPLICADO } from "../../lib/citas/errores.ts";
import { conectar } from "../concurrencia/_conexion.ts";
import { ejecutorDeSesion } from "../concurrencia/_ejecutor.ts";
import { abrirSesion, type Identidad } from "../concurrencia/_sesion.ts";

const ADMIN: Identidad = { sub: "user_ip_admin", rol: "administrativo" };
const MEDICO: Identidad = { sub: "user_ip_medico", rol: "medico" };
const ENFERMERA: Identidad = { sub: "user_ip_enfermera", rol: "enfermera" };
const PACIENTE: Identidad = { sub: "user_ip_paciente", rol: "paciente" };
const SIN_ROL: Identidad = { sub: "user_ip_sinrol", rol: null };

const COLUMNAS_PERMITIDAS = ["apellidos", "email", "fecha_nacimiento", "id", "nombres", "numero_documento", "telefono", "tipo_documento"];

async function limpiar(c: pg.Client): Promise<void> {
  const ids = `select id from public.pacientes where numero_documento like '7330%'`;
  await c.query(`delete from public.citas where paciente_id in (${ids})`);
  await c.query(`delete from public.historias_clinicas where paciente_id in (${ids})`);
  await c.query(`delete from public.pacientes where numero_documento like '7330%'`);
  await c.query(`delete from public.medicos where cmp like 'CMP-IP-%'`);
  await c.query(`delete from public.enfermeras where perfil_id in (select id from public.perfiles where clerk_user_id like 'user_ip_%')`);
  await c.query(`delete from public.perfiles where clerk_user_id like 'user_ip_%'`);
  await c.query(`delete from public.especialidades where nombre = 'Esp integracion pacientes'`);
}

async function sembrarPaciente(c: pg.Client, documento: string, apellidos: string, perfilId: string | null = null): Promise<void> {
  await c.query(
    `insert into public.pacientes (perfil_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
     values ($1, 'DNI', $2, 'Paciente', $3, '1990-01-01', 'F', $4)`,
    [perfilId, documento, apellidos, `ip${documento}@demo.invalid`],
  );
}

before(async () => {
  const c = await conectar();
  try {
    await limpiar(c);
    const esp = await c.query(`insert into public.especialidades (nombre) values ('Esp integracion pacientes') returning id`);
    const perfiles: Record<string, string> = {};
    for (const { sub, rol } of [ADMIN, MEDICO, ENFERMERA, PACIENTE]) {
      const r = await c.query(
        `insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, $2, 'Prueba', $1) returning id`,
        [sub, rol],
      );
      perfiles[sub] = r.rows[0].id;
    }
    await c.query(`insert into public.medicos (perfil_id, cmp, especialidad_id) values ($1, 'CMP-IP-0001', $2)`, [perfiles[MEDICO.sub], esp.rows[0].id]);
    await c.query(`insert into public.enfermeras (perfil_id) values ($1)`, [perfiles[ENFERMERA.sub]]);

    await sembrarPaciente(c, "73300001", "Quispe");
    await sembrarPaciente(c, "73300002", "Quispe Rojas");
    await sembrarPaciente(c, "73300003", "Torres");
    await sembrarPaciente(c, "73300050", "Propio Integracion", perfiles[PACIENTE.sub]);
    await sembrarPaciente(c, "73300060", "%Raro");
    await sembrarPaciente(c, "73300061", "_Guion");
    for (let i = 0; i < LIMITE_BUSQUEDA_PACIENTES + 5; i++) {
      await sembrarPaciente(c, `733001${String(i).padStart(2, "0")}`, `Limite${String(i).padStart(2, "0")}`);
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

async function como<T>(identidad: Identidad, fn: (ejecutar: ReturnType<typeof ejecutorDeSesion>) => Promise<T>): Promise<T> {
  const sesion = await abrirSesion(identidad);
  try {
    return await fn(ejecutorDeSesion(sesion));
  } finally {
    await sesion.end().catch(() => undefined);
  }
}

const apellidosDe = (r: Awaited<ReturnType<typeof buscarPacientes>>) => {
  assert.equal(r.ok, true);
  return r.ok ? r.datos.map((p) => p.apellidos) : [];
};

test("el administrativo busca por DNI exacto y obtiene solo identificación y contacto", async () => {
  const r = await como(ADMIN, (e) => buscarPacientes(e, { termino: "73300001" }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.datos.length, 1);
  assert.equal(r.datos[0]!.apellidos, "Quispe");
  assert.deepEqual(Object.keys(r.datos[0]!).sort(), COLUMNAS_PERMITIDAS);
  assert.equal(r.datos[0]!.fecha_nacimiento, "1990-01-01");
});

test("el administrativo busca por el inicio del apellido sin distinguir mayúsculas", async () => {
  for (const termino of ["quis", "QUIS", "QuIs"]) {
    const apellidos = apellidosDe(await como(ADMIN, (e) => buscarPacientes(e, { termino })));
    assert.deepEqual(apellidos, ["Quispe", "Quispe Rojas"], termino);
  }
  // El inicio, no cualquier parte: «ojas» está dentro de «Quispe Rojas» pero no la empieza.
  assert.deepEqual(apellidosDe(await como(ADMIN, (e) => buscarPacientes(e, { termino: "ojas" }))), []);
});

test("los comodines % y _ se buscan como texto literal y no devuelven a todos los pacientes", async () => {
  assert.deepEqual(apellidosDe(await como(ADMIN, (e) => buscarPacientes(e, { termino: "%" }))), ["%Raro"]);
  assert.deepEqual(apellidosDe(await como(ADMIN, (e) => buscarPacientes(e, { termino: "_" }))), ["_Guion"]);
  assert.deepEqual(apellidosDe(await como(ADMIN, (e) => buscarPacientes(e, { termino: "\\" }))), []);
});

test(`la búsqueda devuelve como máximo ${LIMITE_BUSQUEDA_PACIENTES} pacientes`, async () => {
  const r = await como(ADMIN, (e) => buscarPacientes(e, { termino: "limite" }));
  assert.equal(r.ok && r.datos.length, LIMITE_BUSQUEDA_PACIENTES);
});

test("el administrativo registra un paciente nuevo y la búsqueda lo encuentra de inmediato", async () => {
  const datos = {
    tipo_documento: "DNI",
    numero_documento: "73300200",
    nombres: "Rosa",
    apellidos: "Nueva Alta",
    fecha_nacimiento: "1985-03-09",
    sexo: "F",
    email: "rosa.nueva@demo.invalid",
    telefono: "999000111",
  };
  const alta = await como(ADMIN, (e) => registrarPaciente(e, datos));
  assert.equal(alta.ok, true);

  const encontrado = await como(ADMIN, (e) => buscarPacientes(e, { termino: "73300200" }));
  assert.equal(encontrado.ok && encontrado.datos[0]?.id, alta.ok ? alta.datos.id : undefined);
  assert.equal(encontrado.ok && encontrado.datos[0]?.telefono, "999000111");

  // El alta crea la carpeta de la historia clínica vacía, pero el administrativo no ve contenido clínico (spec).
  const sesion = await abrirSesion(ADMIN);
  try {
    const { rows } = await sesion.query(`select count(*)::int as n from public.historias_clinicas where paciente_id = $1`, [alta.ok ? alta.datos.id : null]);
    assert.equal(rows[0].n, 0);
  } finally {
    await sesion.end();
  }
});

test("registrar un documento ya registrado da «Ya existe un paciente con ese documento» y no crea otra fila", async () => {
  const r = await como(ADMIN, (e) =>
    registrarPaciente(e, {
      tipo_documento: "DNI",
      numero_documento: "73300003",
      nombres: "Otra",
      apellidos: "Persona",
      fecha_nacimiento: "1991-02-02",
      sexo: "M",
      email: "otra@demo.invalid",
    }),
  );
  assert.deepEqual(r, {
    ok: false,
    codigo: "DOCUMENTO_DUPLICADO",
    mensaje: MENSAJE_DOCUMENTO_DUPLICADO,
    campos: { numero_documento: MENSAJE_DOCUMENTO_DUPLICADO },
  });
  const c = await conectar();
  try {
    const { rows } = await c.query(`select count(*)::int as n from public.pacientes where numero_documento = '73300003'`);
    assert.equal(rows[0].n, 1);
  } finally {
    await c.end();
  }
});

test("un paciente solo ve su propio registro y no puede registrar pacientes (negativo)", async () => {
  assert.deepEqual(apellidosDe(await como(PACIENTE, (e) => buscarPacientes(e, { termino: "quis" }))), []);
  assert.deepEqual(apellidosDe(await como(PACIENTE, (e) => buscarPacientes(e, { termino: "propio" }))), ["Propio Integracion"]);

  const alta = await como(PACIENTE, (e) =>
    registrarPaciente(e, {
      tipo_documento: "DNI",
      numero_documento: "73300201",
      nombres: "Intruso",
      apellidos: "Prueba",
      fecha_nacimiento: "1991-02-02",
      sexo: "M",
      email: "intruso@demo.invalid",
    }),
  );
  assert.equal(alta.ok === false && alta.codigo, "NO_AUTORIZADO");
});

test("la enfermera, el médico sin relación y una sesión sin rol no obtienen pacientes ni pueden registrarlos (negativo)", async () => {
  for (const identidad of [ENFERMERA, MEDICO, SIN_ROL]) {
    const busqueda = await como(identidad, (e) => buscarPacientes(e, { termino: "quis" }));
    assert.deepEqual(apellidosDe(busqueda), [], `${identidad.sub} no debe ver pacientes`);
    const alta = await como(identidad, (e) =>
      registrarPaciente(e, {
        tipo_documento: "DNI",
        numero_documento: "73300202",
        nombres: "Intruso",
        apellidos: "Prueba",
        fecha_nacimiento: "1991-02-02",
        sexo: "M",
        email: "intruso@demo.invalid",
      }),
    );
    assert.equal(alta.ok === false && alta.codigo, "NO_AUTORIZADO", identidad.sub);
  }
});
