// Datos de las E2E del portal del paciente (H4, tareas 5.6, 6.6 y 7.3). Se siembran con la conexión del DUEÑO sobre la misma base que sirve la
// app que se prueba (por defecto la rama `dev` de Neon: ver docs/07-testing/pruebas-e2e.md), porque desde la interfaz no se puede crear a un médico con
// la agenda abierta las 24 horas ni sembrar una cita a 40 minutos de ahora.
//
// La URL sale de `E2E_DATABASE_URL` (o, en local, de `DATABASE_URL_PRUEBAS` / `DATABASE_URL_UNPOOLED` de .env.local). Se niega a usar el pooler
// y la base de producción. Sin ella (en CI, contra el preview) las specs que necesitan estos datos se omiten con un aviso, como las de H3 sin los
// datos de demostración.
//
// Marcas propias, para no tocar la demostración: especialidad «Especialidad E2E portal», médico `CMP-E2E-PORTAL` (perfil `e2e_portal_medico`) y el
// documento `98000002` del segundo paciente (los de demostración son `99…`). El médico se borra al terminar; la ficha del segundo paciente queda,
// como las cuentas de prueba de H1.
import { createClerkClient } from "@clerk/backend";
import pg from "pg";
import { variable } from "./helpers";

export const ESPECIALIDAD_E2E = "Especialidad E2E portal";
export const NOMBRE_MEDICO_E2E = "Especialista E2E Portal";
const CMP_E2E = "CMP-E2E-PORTAL";
const CLERK_MEDICO_E2E = "e2e_portal_medico";
const DOCUMENTO_PACIENTE2 = "98000002";

export function urlDelDueno(): string | null {
  const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL_PRUEBAS ?? process.env.DATABASE_URL_UNPOOLED;
  if (!url) return null;
  const { host } = new URL(url);
  if (host.includes("-pooler")) return null;
  const produccion = process.env.DATABASE_URL_PRODUCCION;
  if (produccion && new URL(produccion).host === host) return null;
  return url;
}

export const hayBaseDeDatos = (): boolean => urlDelDueno() !== null;

export async function conDueno<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const url = urlDelDueno();
  if (!url) throw new Error("Sin E2E_DATABASE_URL (ni DATABASE_URL_UNPOOLED) no se pueden sembrar los datos del portal");
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end().catch(() => undefined);
  }
}

export async function idClerkDe(correo: string): Promise<string> {
  const clerk = createClerkClient({ secretKey: variable("CLERK_SECRET_KEY") });
  const { data } = await clerk.users.getUserList({ emailAddress: [correo], limit: 1 });
  if (!data[0]) throw new Error(`No hay una cuenta de Clerk para ${correo}`);
  return data[0].id;
}

export interface EscenarioPortal {
  medicoId: string;
  paciente1: string; // ficha del paciente E2E_PACIENTE_EMAIL (demostración)
  paciente2: string; // ficha del paciente E2E_PACIENTE2_EMAIL (documento 98000002)
}

// Deja listos: un médico activo con la agenda abierta todos los días (00:00–24:00, turnos de 20 minutos) en su propia especialidad, y las fichas
// de los dos pacientes de prueba vinculadas a sus cuentas. Es idempotente y no deja citas de corridas anteriores.
export async function prepararEscenario(): Promise<EscenarioPortal> {
  const clerk1 = await idClerkDe(variable("E2E_PACIENTE_EMAIL"));
  const clerk2 = await idClerkDe(variable("E2E_PACIENTE2_EMAIL"));
  return conDueno(async (c) => {
    await retirarMedico(c);

    const esp = (await c.query(`insert into public.especialidades (nombre) values ($1) returning id`, [ESPECIALIDAD_E2E])).rows[0].id as string;
    const perfilMedico = (
      await c.query(
        `insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, 'medico', 'Especialista', 'E2E Portal') returning id`,
        [CLERK_MEDICO_E2E],
      )
    ).rows[0].id as string;
    const medicoId = (
      await c.query(`insert into public.medicos (perfil_id, cmp, especialidad_id) values ($1, $2, $3) returning id`, [perfilMedico, CMP_E2E, esp])
    ).rows[0].id as string;
    await c.query(
      `insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde)
       select $1, d, '00:00', '24:00', 20, '2020-01-01' from generate_series(0, 6) d`,
      [medicoId],
    );

    const paciente1 = (
      await c.query(
        `select p.id from public.pacientes p join public.perfiles pf on pf.id = p.perfil_id where pf.clerk_user_id = $1`,
        [clerk1],
      )
    ).rows[0]?.id as string | undefined;
    if (!paciente1) throw new Error("La cuenta E2E_PACIENTE_EMAIL no tiene ficha de paciente (¿se sembraron los datos de demostración?)");

    await c.query(
      `insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, 'paciente', 'Segundo', 'Paciente de prueba')
       on conflict (clerk_user_id) do nothing`,
      [clerk2],
    );
    const perfil2 = (await c.query(`select id from public.perfiles where clerk_user_id = $1`, [clerk2])).rows[0].id as string;
    await c.query(
      `insert into public.pacientes (perfil_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
       select $1, 'DNI', $2, 'Segundo', 'Paciente de prueba', '1980-05-05', 'M', $3
        where not exists (select 1 from public.pacientes where perfil_id = $1)
       on conflict do nothing`,
      [perfil2, DOCUMENTO_PACIENTE2, variable("E2E_PACIENTE2_EMAIL").toLowerCase()],
    );
    const paciente2 = (await c.query(`select id from public.pacientes where perfil_id = $1`, [perfil2])).rows[0]?.id as string | undefined;
    if (!paciente2) throw new Error("No se pudo dejar la ficha del segundo paciente (¿otro paciente usa el documento 98000002?)");

    // Las citas portal que esos dos pacientes dejaron en corridas anteriores (las de la demostración no se tocan).
    await c.query(`delete from public.citas where paciente_id = $1`, [paciente2]);
    await c.query(`delete from public.citas where paciente_id = $1 and origen = 'portal'`, [paciente1]);

    return { medicoId, paciente1, paciente2 };
  });
}

// Borra al médico de prueba con todo lo suyo (las citas, la agenda, su perfil y su especialidad). Las fichas de los pacientes no se borran.
async function retirarMedico(c: pg.Client): Promise<void> {
  const medico = `select id from public.medicos where cmp = '${CMP_E2E}'`;
  await c.query(`delete from public.citas where medico_id in (${medico})`);
  await c.query(`delete from public.asignaciones_paciente_medico where medico_id in (${medico})`);
  await c.query(`delete from public.disponibilidades where medico_id in (${medico})`);
  await c.query(`delete from public.bloqueos_agenda where medico_id in (${medico})`);
  await c.query(`delete from public.medicos where cmp = '${CMP_E2E}'`);
  await c.query(`delete from public.perfiles where clerk_user_id = $1`, [CLERK_MEDICO_E2E]);
  await c.query(`delete from public.especialidades where nombre = $1`, [ESPECIALIDAD_E2E]);
}

export async function retirarEscenario(): Promise<void> {
  await conDueno(async (c) => {
    await retirarMedico(c);
    // Lo que el segundo paciente dejó en esta corrida.
    await c.query(
      `delete from public.citas where paciente_id in (select id from public.pacientes where numero_documento = $1)`,
      [DOCUMENTO_PACIENTE2],
    );
  });
}

const VEINTE_MINUTOS = 20 * 60 * 1000;

// Siembra una cita (origen `portal`) con el médico de prueba que empieza en `inicio`; dura un turno de 20 minutos.
export async function sembrarCita(
  escenario: EscenarioPortal,
  pacienteId: string,
  inicio: Date,
  estado: "reservada" | "confirmada" = "reservada",
): Promise<string> {
  return conDueno(async (c) => {
    const { rows } = await c.query(
      `insert into public.citas (paciente_id, medico_id, inicio, fin, estado, origen) values ($1, $2, $3, $4, $5, 'portal') returning id`,
      [pacienteId, escenario.medicoId, inicio, new Date(inicio.getTime() + VEINTE_MINUTOS), estado],
    );
    return rows[0].id as string;
  });
}

// Bloquea la agenda del médico de prueba durante todo un día de Lima (una licencia): ese día no ofrece ningún horario.
export async function sembrarBloqueoDelDia(escenario: EscenarioPortal, fecha: string): Promise<void> {
  await conDueno((c) =>
    c.query(`insert into public.bloqueos_agenda (medico_id, rango, motivo) values ($1, tstzrange($2, $3), 'Licencia de prueba E2E')`, [
      escenario.medicoId,
      instanteDeLima(fecha, "00:00"),
      instanteDeLima(sumarDiasA(fecha, 1), "00:00"),
    ]),
  );
}

// Cambia el inicio de una cita sembrada (para simular una pantalla desactualizada: el botón se ofrecía con tiempo y ahora falta menos de 1 hora).
export async function moverCita(citaId: string, inicio: Date): Promise<void> {
  await conDueno((c) =>
    c.query(`update public.citas set inicio = $2, fin = $3 where id = $1`, [citaId, inicio, new Date(inicio.getTime() + VEINTE_MINUTOS)]),
  );
}

// Pasa una cita a otro paciente (para simular que la pantalla del primero ofrecía una cita que ya no es suya).
export async function traspasarCita(citaId: string, pacienteId: string): Promise<void> {
  await conDueno((c) => c.query(`update public.citas set paciente_id = $2 where id = $1`, [citaId, pacienteId]));
}

// Borra las citas del médico de prueba, de cualquier paciente: deja a cada prueba con la agenda como la encontró.
export async function borrarCitasDelMedico(escenario: EscenarioPortal): Promise<void> {
  await conDueno((c) => c.query(`delete from public.citas where medico_id = $1`, [escenario.medicoId]));
}

// El próximo inicio de turno (múltiplo de 20 minutos) que queda a menos de 1 hora y a más de 20 minutos de ahora.
export function inicioEnMenosDeUnaHora(): Date {
  const turno = 20 * 60 * 1000;
  return new Date(Math.ceil((Date.now() + 25 * 60 * 1000) / turno) * turno);
}

export async function estadoDeCita(citaId: string): Promise<string | null> {
  return conDueno(async (c) => (await c.query(`select estado::text as estado from public.citas where id = $1`, [citaId])).rows[0]?.estado ?? null);
}

export async function citasDe(pacienteId: string, medicoId: string): Promise<Array<{ id: string; inicio: Date; estado: string; origen: string; creada_por: string | null; cancelada_por: string | null }>> {
  return conDueno(
    async (c) =>
      (
        await c.query(
          `select id, inicio, estado::text as estado, origen::text as origen, creada_por, cancelada_por
             from public.citas where paciente_id = $1 and medico_id = $2 order by inicio`,
          [pacienteId, medicoId],
        )
      ).rows,
  );
}

// ---- Registro del paciente (tarea 5.6) ----
// Se reutiliza la cuenta del segundo paciente en vez de crear cuentas nuevas de Clerk: cada alta nueva dispararía el webhook de la
// instancia compartida (la de producción también) y dejaría perfiles de prueba allí. Lo que cambia entre pruebas es el estado de la base:
// con o sin perfil (la espera de «cuenta en preparación») y con o sin ficha (el formulario). Las fichas de estas pruebas usan los
// documentos `9800001x`; la otra cuenta es el perfil `e2e_otra_cuenta`.
const CLERK_OTRA_CUENTA = "e2e_otra_cuenta";
export const DOCUMENTO_NUEVO = "98000011";
export const DOCUMENTO_FICHA_DE_LA_CLINICA = "98000012";
export const DOCUMENTO_FICHA_DE_OTRA_CUENTA = "98000013";
export const NACIMIENTO_PACIENTE2 = "1980-05-05";
const DOCUMENTOS_DE_REGISTRO = [DOCUMENTO_NUEVO, DOCUMENTO_FICHA_DE_LA_CLINICA, DOCUMENTO_FICHA_DE_OTRA_CUENTA, "98000014"];

export const correoPaciente2 = (): string => variable("E2E_PACIENTE2_EMAIL").toLowerCase();

// Una ficha nace con su historia clínica vacía (disparador de H5) y esa clave foránea es RESTRICT: se borra primero la historia. Solo sirve para fichas
// de prueba sin atenciones ni antecedentes; sus citas se borran antes.
async function borrarPacientes(c: pg.Client, condicion: string, parametros: unknown[]): Promise<void> {
  await c.query(`delete from public.historias_clinicas where paciente_id in (select id from public.pacientes where ${condicion})`, parametros);
  await c.query(`delete from public.pacientes where ${condicion}`, parametros);
}

// Quita la ficha (y sus citas) de la cuenta del segundo paciente. Con `sinPerfil`, también su perfil: la cuenta queda como recién creada,
// antes de que el webhook de Clerk la sincronice. Sin él, se asegura el perfil (la espera ya terminó).
export async function dejarCuenta2SinFicha(opciones: { sinPerfil?: boolean } = {}): Promise<void> {
  const clerk2 = await idClerkDe(variable("E2E_PACIENTE2_EMAIL"));
  await conDueno(async (c) => {
    const perfil = `select id from public.perfiles where clerk_user_id = $1`;
    await c.query(`delete from public.citas where paciente_id in (select id from public.pacientes where perfil_id in (${perfil}))`, [clerk2]);
    await borrarPacientes(c, `perfil_id in (${perfil})`, [clerk2]);
    await borrarPacientes(c, `numero_documento = any($1)`, [DOCUMENTOS_DE_REGISTRO]);
    if (opciones.sinPerfil) {
      await c.query(`delete from public.perfiles where clerk_user_id = $1`, [clerk2]);
    }
  });
  if (!opciones.sinPerfil) await asegurarPerfilCuenta2();
}

// Lo que hace el webhook de Clerk al sincronizar un usuario nuevo: crear su perfil de paciente.
export async function asegurarPerfilCuenta2(): Promise<void> {
  const clerk2 = await idClerkDe(variable("E2E_PACIENTE2_EMAIL"));
  await conDueno((c) =>
    c.query(
      `insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, 'paciente', 'Segundo', 'Paciente de prueba')
       on conflict (clerk_user_id) do nothing`,
      [clerk2],
    ),
  );
}

// Una ficha que la clínica registró sin cuenta (la crea el administrativo), con el correo y la fecha de nacimiento que se indiquen.
export async function sembrarFichaSinCuenta(ficha: { documento: string; correo: string; nacimiento: string; nombres?: string }): Promise<string> {
  return conDueno(async (c) => {
    const { rows } = await c.query(
      `insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
       values ('DNI', $1, $2, 'Registrada por la clínica', $3, 'F', $4) returning id`,
      [ficha.documento, ficha.nombres ?? "Ficha de la clínica", ficha.nacimiento, ficha.correo],
    );
    return rows[0].id as string;
  });
}

// Una ficha que ya pertenece a OTRA cuenta (con su propio perfil).
export async function sembrarFichaDeOtraCuenta(documento: string): Promise<void> {
  await conDueno(async (c) => {
    await c.query(
      `insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, 'paciente', 'Otra', 'Cuenta') on conflict (clerk_user_id) do nothing`,
      [CLERK_OTRA_CUENTA],
    );
    await c.query(
      `insert into public.pacientes (perfil_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
       select id, 'DNI', $2, 'Otra', 'Cuenta', $3, 'M', 'otra-cuenta@demo.invalid' from public.perfiles where clerk_user_id = $1`,
      [CLERK_OTRA_CUENTA, documento, NACIMIENTO_PACIENTE2],
    );
  });
}

export interface FichaDelRegistro {
  id: string;
  perfil_id: string | null;
  nombres: string;
  email: string;
  numero_documento: string;
}

export async function fichasDelDocumento(documento: string): Promise<FichaDelRegistro[]> {
  return conDueno(
    async (c) =>
      (await c.query(`select id, perfil_id, nombres, email, numero_documento from public.pacientes where numero_documento = $1`, [documento])).rows,
  );
}

// La ficha del segundo paciente cambia de identificador cada vez que se restaura (se borra y se vuelve a crear): no se guarda, se lee.
export async function idPaciente2(): Promise<string> {
  const ficha = await fichaDeLaCuenta2();
  if (!ficha) throw new Error("El segundo paciente no tiene ficha: ¿falta restaurarPaciente2()?");
  return ficha.id;
}

export async function fichaDeLaCuenta2(): Promise<FichaDelRegistro | null> {
  const clerk2 = await idClerkDe(variable("E2E_PACIENTE2_EMAIL"));
  return conDueno(
    async (c) =>
      (
        await c.query(
          `select p.id, p.perfil_id, p.nombres, p.email, p.numero_documento from public.pacientes p
            join public.perfiles pf on pf.id = p.perfil_id where pf.clerk_user_id = $1`,
          [clerk2],
        )
      ).rows[0] ?? null,
  );
}

// Deja la cuenta del segundo paciente con su ficha estándar (documento 98000002) y borra todo lo que sembraron las pruebas de registro.
export async function restaurarPaciente2(): Promise<void> {
  await dejarCuenta2SinFicha();
  await conDueno(async (c) => {
    await borrarPacientes(c, `numero_documento = any($1)`, [DOCUMENTOS_DE_REGISTRO]);
    await c.query(`delete from public.perfiles where clerk_user_id = $1`, [CLERK_OTRA_CUENTA]);
  });
  const clerk2 = await idClerkDe(variable("E2E_PACIENTE2_EMAIL"));
  await conDueno((c) =>
    c.query(
      `insert into public.pacientes (perfil_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
       select id, 'DNI', $2, 'Segundo', 'Paciente de prueba', $3, 'M', $4 from public.perfiles where clerk_user_id = $1
       on conflict do nothing`,
      [clerk2, DOCUMENTO_PACIENTE2, NACIMIENTO_PACIENTE2, correoPaciente2()],
    ),
  );
}

// ---- Fechas de Lima (UTC-5 todo el año, sin horario de verano) ----

export const hoyEnLima = (): string => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

export function sumarDiasA(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Instante (UTC) de una fecha y hora de Lima.
export function instanteDeLima(fecha: string, hora: string): Date {
  return new Date(`${fecha}T${hora}:00-05:00`);
}

// `dd/MM/yyyy`
export function textoFechaDe(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}
