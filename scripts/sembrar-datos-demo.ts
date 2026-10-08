// Siembra datos de DEMOSTRACIÓN sintéticos para probar el sistema (H2, design.md D10). Nunca datos reales: P-1 sigue
// bloqueando los reales. Es un script, no una migración: las migraciones corren en todos los entornos (también en
// producción) y los branches de CI copian production.
//
// Uso (Node 24 ejecuta TypeScript directamente):
//   node scripts/sembrar-datos-demo.ts --confirmar
//
// - Se conecta como el rol DUEÑO (escribe historias y auditoría sin pasar por RLS) a la URL DIRECTA de
//   DATABASE_URL_DEMO (o DATABASE_URL_PRUEBAS, o DATABASE_URL). Imprime el host de destino antes de escribir.
// - `--confirmar` es obligatorio. Si el destino coincide con DATABASE_URL_PRODUCCION hace falta además
//   `--incluir-produccion`: sembrar producción es una acción explícita, nunca un efecto lateral.
// - Idempotente: ejecutarlo dos veces deja los mismos conteos. Todo en una transacción.
// - NO desactiva triggers: las citas confirmadas generan sus asignaciones, las atenciones pasan por sus CHECK; así la
//   siembra es también una prueba de integración de las reglas del esquema.
// - Marcadores: perfiles sin cuenta con `clerk_user_id` de prefijo `mock_`, correos `@demo.invalid`, nombres ficticios.
//   Las cuentas reales de prueba de la instancia de desarrollo de Clerk (E2E_*_EMAIL) se asocian a personas de
//   demostración para poder entrar con cada rol (se resuelven por la API de Clerk con CLERK_SECRET_KEY).
// - No borra nada: las atenciones firmadas no se pueden eliminar por diseño. Para reiniciar una demostración se
//   recrea un branch de desarrollo. Ver docs/datos-demo.md.
import { createClerkClient } from "@clerk/backend";
import pg from "pg";

for (const archivo of [process.env.ENV_FILE, ".env.local"]) {
  if (!archivo) continue;
  try {
    process.loadEnvFile(archivo);
  } catch {
    // el archivo es opcional
  }
}

const confirmar = process.argv.includes("--confirmar");
const incluirProduccion = process.argv.includes("--incluir-produccion");

const url = process.env.DATABASE_URL_DEMO ?? process.env.DATABASE_URL_PRUEBAS ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL_DEMO (o DATABASE_URL_PRUEBAS / DATABASE_URL): URL directa del branch destino.");
  process.exit(1);
}
const host = new URL(url).host;
console.log(`# Destino: ${host}`);
if (host.includes("-pooler")) {
  console.error("La URL es del pooler: usa la conexión directa.");
  process.exit(1);
}
const produccion = process.env.DATABASE_URL_PRODUCCION;
if (produccion && new URL(produccion).host === host && !incluirProduccion) {
  console.error("El destino es PRODUCCIÓN: sembrar ahí exige --confirmar --incluir-produccion (acción explícita).");
  process.exit(1);
}
if (!confirmar) {
  console.error("Falta --confirmar. Revisa el destino de arriba y vuelve a ejecutar con --confirmar.");
  process.exit(1);
}

// ---- Cuentas reales de prueba (opcional) ----
const CUENTAS = {
  administrativo: process.env.E2E_ADMINISTRATIVO_EMAIL,
  medico: process.env.E2E_MEDICO_EMAIL,
  enfermera: process.env.E2E_ENFERMERA_EMAIL,
  paciente: process.env.E2E_PACIENTE_EMAIL,
} as const;

async function resolverCuentasClerk(): Promise<Record<string, string>> {
  const resueltas: Record<string, string> = {};
  const secretKey = process.env.CLERK_SECRET_KEY;
  const correos = Object.values(CUENTAS).filter((c): c is string => Boolean(c));
  if (!secretKey || correos.length === 0) {
    console.warn("# Sin CLERK_SECRET_KEY o E2E_*_EMAIL: se usarán solo perfiles mock_ (sin cuenta con la que entrar).");
    return resueltas;
  }
  try {
    const clerk = createClerkClient({ secretKey });
    const { data } = await clerk.users.getUserList({ emailAddress: correos, limit: 20 });
    for (const [rol, correo] of Object.entries(CUENTAS)) {
      const usuario = data.find((u) => u.emailAddresses.some((e) => e.emailAddress === correo));
      if (usuario) resueltas[rol] = usuario.id;
    }
  } catch (e) {
    console.warn(`# No se pudo consultar Clerk (${(e as Error).message}); se usarán solo perfiles mock_.`);
  }
  return resueltas;
}

// ---- Datos sintéticos ----
const ESPECIALIDADES = ["Medicina general", "Pediatría", "Cardiología", "Ginecología"];

// Médico 0 usa la cuenta real de médico si existe; los demás son mock.
const MEDICOS = [
  { clave: "medico", esp: 0, cmp: "CMP-DEMO-001", nombres: "Carlos", apellidos: "Vega Salas", horaInicio: "08:00" },
  { clave: "mock_medico_2", esp: 1, cmp: "CMP-DEMO-002", nombres: "Lucía", apellidos: "Paredes Ruiz", horaInicio: "08:00" },
  { clave: "mock_medico_3", esp: 2, cmp: "CMP-DEMO-003", nombres: "Jorge", apellidos: "Mendoza Rojas", horaInicio: "14:00" },
  { clave: "mock_medico_4", esp: 3, cmp: "CMP-DEMO-004", nombres: "Patricia", apellidos: "Quispe León", horaInicio: "14:00" },
];
const ENFERMERAS = [
  { clave: "enfermera", nombres: "Rosa", apellidos: "Díaz Torres" },
  { clave: "mock_enfermera_2", nombres: "Elena", apellidos: "Soto Cruz" },
];
const ADMIN = { clave: "administrativo", nombres: "Adela", apellidos: "Campos Vera" };

// Pacientes ficticios: DNI 99000001.., y uno con Carné de Extranjería. El 0 usa la cuenta real de paciente.
const PACIENTES = [
  { tipo: "DNI", doc: "99000001", nombres: "Paula", apellidos: "Ramos Huamán", nac: "1990-04-12", sexo: "F", cuenta: "paciente" },
  { tipo: "DNI", doc: "99000002", nombres: "Luis", apellidos: "Fernández Mori", nac: "1985-09-30", sexo: "M" },
  { tipo: "DNI", doc: "99000003", nombres: "Marta", apellidos: "Salazar Pino", nac: "1978-01-22", sexo: "F" },
  { tipo: "DNI", doc: "99000004", nombres: "Diego", apellidos: "Castro Lara", nac: "2015-06-05", sexo: "M" },
  { tipo: "DNI", doc: "99000005", nombres: "Sofía", apellidos: "Vargas Núñez", nac: "1995-11-18", sexo: "F" },
  { tipo: "DNI", doc: "99000006", nombres: "Andrés", apellidos: "Torres Bravo", nac: "1969-03-09", sexo: "M" },
  { tipo: "DNI", doc: "99000007", nombres: "Camila", apellidos: "Ríos Alva", nac: "2001-08-27", sexo: "F" },
  { tipo: "DNI", doc: "99000008", nombres: "Héctor", apellidos: "Luna Medina", nac: "1958-12-02", sexo: "M" },
  { tipo: "DNI", doc: "99000009", nombres: "Valeria", apellidos: "Ortiz Cano", nac: "2018-02-14", sexo: "F" },
  { tipo: "DNI", doc: "99000010", nombres: "Renzo", apellidos: "Palacios Gil", nac: "1992-07-21", sexo: "M" },
  { tipo: "DNI", doc: "99000011", nombres: "Inés", apellidos: "Guerra Poma", nac: "1983-05-16", sexo: "F" },
  { tipo: "CE", doc: "CEDEMO000001", nombres: "Anna", apellidos: "Kowalski", nac: "1988-10-03", sexo: "F" },
];

// Subconjunto de CIE-10 marcado como demostración (capítulo «DEMO»). El catálogo completo se carga en H6 (ADR-0014).
const CIE10_DEMO: [string, string][] = [
  ["R51", "Cefalea"], ["J00", "Rinofaringitis aguda (resfriado común)"], ["J06.9", "Infección aguda de las vías respiratorias superiores"],
  ["I10", "Hipertensión esencial (primaria)"], ["E11.9", "Diabetes mellitus tipo 2 sin complicaciones"], ["K29.7", "Gastritis, no especificada"],
  ["M54.5", "Lumbago no especificado"], ["N39.0", "Infección de vías urinarias, sitio no especificado"], ["J45.9", "Asma, no especificada"],
  ["A09", "Diarrea y gastroenteritis de presunto origen infeccioso"], ["Z00.0", "Examen médico general"], ["R50.9", "Fiebre, no especificada"],
];

// Citas: [paciente, médico, días desde hoy (Lima), hora, estado]. Pasadas «atendida» (con atención firmada), futuras
// reservadas o confirmadas y una cancelada con más de 1 hora de anticipación. Sin solapes por médico ni paciente.
type EstadoDemo = "atendida" | "confirmada" | "reservada" | "cancelada";
const CITAS: [number, number, number, string, EstadoDemo][] = [
  [0, 0, -60, "09:00", "atendida"], [1, 1, -45, "08:20", "atendida"], [2, 2, -30, "14:40", "atendida"],
  [3, 1, -20, "09:00", "atendida"], [4, 0, -10, "10:20", "atendida"], [5, 3, -3, "15:00", "atendida"],
  [0, 0, 2, "09:00", "confirmada"], [6, 1, 1, "08:00", "reservada"], [7, 2, 2, "14:00", "reservada"],
  [8, 3, 3, "14:20", "confirmada"], [9, 0, 5, "10:00", "reservada"], [1, 1, 7, "09:00", "confirmada"],
  [10, 2, 4, "15:20", "cancelada"], [11, 3, 6, "16:00", "reservada"],
];

const BD = new pg.Client({ connectionString: url });
await BD.connect();

async function filas<T extends pg.QueryResultRow>(texto: string, params: unknown[] = []): Promise<T[]> {
  return (await BD.query<T>(texto, params)).rows;
}

try {
  const cuentas = await resolverCuentasClerk();
  await BD.query("begin");

  // --- Catálogos ---
  for (const nombre of ESPECIALIDADES) {
    await BD.query("insert into public.especialidades (nombre) values ($1) on conflict (nombre) do nothing", [nombre]);
  }
  const esp = new Map((await filas<{ id: string; nombre: string }>("select id, nombre from public.especialidades")).map((e) => [e.nombre, e.id]));
  for (const [codigo, descripcion] of CIE10_DEMO) {
    await BD.query("insert into public.cie10 (codigo, descripcion, capitulo) values ($1, $2, 'DEMO') on conflict (codigo) do nothing", [codigo, descripcion]);
  }

  // --- Perfiles ---
  async function perfil(clerkUserId: string, rol: string, nombres: string, apellidos: string): Promise<string> {
    await BD.query(
      "insert into public.perfiles (clerk_user_id, rol, nombres, apellidos) values ($1, $2::public.rol_usuario, $3, $4) on conflict (clerk_user_id) do nothing",
      [clerkUserId, rol, nombres, apellidos],
    );
    return (await filas<{ id: string }>("select id from public.perfiles where clerk_user_id = $1", [clerkUserId]))[0].id;
  }
  const idClerk = (clave: string, mock: string) => cuentas[clave] ?? mock;

  const idAdmin = await perfil(idClerk("administrativo", "mock_administrativo_1"), "administrativo", ADMIN.nombres, ADMIN.apellidos);
  const medicos: string[] = [];
  for (const m of MEDICOS) {
    const perfilId = await perfil(idClerk(m.clave, m.clave.startsWith("mock_") ? m.clave : "mock_medico_1"), "medico", m.nombres, m.apellidos);
    await BD.query(
      "insert into public.medicos (perfil_id, cmp, especialidad_id) values ($1, $2, $3) on conflict (cmp) do nothing",
      [perfilId, m.cmp, esp.get(ESPECIALIDADES[m.esp])],
    );
    medicos.push((await filas<{ id: string }>("select id from public.medicos where cmp = $1", [m.cmp]))[0].id);
  }
  const enfermeras: string[] = [];
  for (const e of ENFERMERAS) {
    const perfilId = await perfil(idClerk(e.clave, e.clave.startsWith("mock_") ? e.clave : "mock_enfermera_1"), "enfermera", e.nombres, e.apellidos);
    await BD.query("insert into public.enfermeras (perfil_id) values ($1) on conflict (perfil_id) do nothing", [perfilId]);
    enfermeras.push((await filas<{ id: string }>("select id from public.enfermeras where perfil_id = $1", [perfilId]))[0].id);
  }

  // --- Pacientes (el disparador crea su historia clínica) ---
  const pacientes: string[] = [];
  for (const p of PACIENTES) {
    let perfilId: string | null = null;
    if (p.cuenta && cuentas[p.cuenta]) perfilId = await perfil(cuentas[p.cuenta], "paciente", p.nombres, p.apellidos);
    await BD.query(
      `insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email, telefono, perfil_id)
       values ($1::public.tipo_documento, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (tipo_documento, numero_documento) do nothing`,
      [p.tipo, p.doc, p.nombres, p.apellidos, p.nac, p.sexo, `${p.doc.toLowerCase()}@demo.invalid`, `9${p.doc.replace(/\D/g, "").slice(-8).padStart(8, "0")}`, perfilId],
    );
    pacientes.push((await filas<{ id: string }>("select id from public.pacientes where tipo_documento = $1::public.tipo_documento and numero_documento = $2", [p.tipo, p.doc]))[0].id);
  }

  // --- Disponibilidad semanal (lunes a viernes, 4 horas) y un bloqueo de agenda ---
  for (const [i, m] of MEDICOS.entries()) {
    for (let dia = 1; dia <= 5; dia++) {
      await BD.query(
        `insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin)
         select $1, $2, $3::time, ($3::time + interval '4 hours')
         where not exists (select 1 from public.disponibilidades d where d.medico_id = $1 and d.dia_semana = $2)`,
        [medicos[i], dia, m.horaInicio],
      );
    }
  }
  await BD.query(
    `insert into public.bloqueos_agenda (medico_id, rango, motivo)
     values ($1, tstzrange((public.hoy_lima() + 20)::timestamp at time zone 'America/Lima', (public.hoy_lima() + 27)::timestamp at time zone 'America/Lima'), 'Vacaciones (demostración)')
     on conflict do nothing`,
    [medicos[3]],
  );

  // --- Citas, atenciones firmadas, addenda y antecedentes ---
  const diagnostico = JSON.stringify([{ cie10: "R51", descripcion: "Cefalea", tipo: "definitivo" }]);
  for (const [p, m, dias, hora, estado] of CITAS) {
    const existe = await filas(
      "select 1 from public.citas where medico_id = $1 and inicio = ((public.hoy_lima() + $2::int) + $3::time) at time zone 'America/Lima'",
      [medicos[m], dias, hora],
    );
    if (existe.length > 0) continue;
    const insertarComo = estado === "cancelada" ? "reservada" : estado;
    const cita = await filas<{ id: string }>(
      `insert into public.citas (paciente_id, medico_id, inicio, fin, origen, estado, motivo)
       values ($1, $2, ((public.hoy_lima() + $3::int) + $4::time) at time zone 'America/Lima',
               ((public.hoy_lima() + $3::int) + $4::time + interval '20 minutes') at time zone 'America/Lima',
               'administrativo', $5::public.estado_cita, 'Consulta de demostración')
       returning id`,
      [pacientes[p], medicos[m], dias, hora, insertarComo],
    );
    if (estado === "cancelada") {
      await BD.query("update public.citas set estado = 'cancelada' where id = $1", [cita[0].id]);
    }
    if (estado === "atendida") {
      await BD.query(
        `insert into public.atenciones (historia_id, paciente_id, cita_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento, firmada_en)
         select h.id, $1, $2, $3, 'Dolor de cabeza (demostración)', 'Cefalea de 3 días de evolución, sin signos de alarma.',
                'Paciente consciente y orientado; sin focalización neurológica.', $4::jsonb, 'Reposo, hidratación y analgésico por 3 días; control en una semana.',
                (select inicio + interval '30 minutes' from public.citas where id = $2)
         from public.historias_clinicas h where h.paciente_id = $1
         on conflict (cita_id) do nothing`,
        [pacientes[p], cita[0].id, medicos[m], diagnostico],
      );
    }
  }
  // Una addenda sobre la primera atención firmada y antecedentes variados (idempotentes por texto).
  await BD.query(
    `insert into public.addendas (atencion_id, medico_id, texto)
     select a.id, a.medico_id, 'Se aclara que el analgésico indicado es paracetamol 500 mg (demostración).'
     from public.atenciones a join public.citas c on c.id = a.cita_id
     where a.paciente_id = $1 and not exists (select 1 from public.addendas x where x.atencion_id = a.id)
     order by c.inicio limit 1`,
    [pacientes[0]],
  );
  const ANTECEDENTES: [number, number, string, string][] = [
    [0, 0, "alergico", "Alergia a la penicilina (demostración)"], [0, 0, "habito_nocivo", "Fumador ocasional (demostración)"],
    [1, 1, "personal_patologico", "Hipertensión arterial en tratamiento (demostración)"], [2, 2, "quirurgico", "Apendicectomía en 2010 (demostración)"],
    [5, 3, "familiar", "Diabetes en línea materna (demostración)"],
  ];
  for (const [p, m, tipo, descripcion] of ANTECEDENTES) {
    await BD.query(
      `insert into public.antecedentes (paciente_id, tipo, descripcion, registrado_por)
       select $1, $2::public.tipo_antecedente, $3, $4
       where not exists (select 1 from public.antecedentes x where x.paciente_id = $1 and x.descripcion = $3)`,
      [pacientes[p], tipo, descripcion, medicos[m]],
    );
  }

  // --- Turnos de enfermería: próximos 7 días, mañana la primera y tarde la segunda ---
  for (let dia = 0; dia < 7; dia++) {
    for (const [i, turno] of (["manana", "tarde"] as const).entries()) {
      await BD.query(
        `insert into public.turnos_enfermeria (enfermera_id, fecha, turno, medico_id)
         values ($1, public.hoy_lima() + $2::int, $3::public.tipo_turno, $4) on conflict (enfermera_id, fecha, turno) do nothing`,
        [enfermeras[i], dia, turno, medicos[i]],
      );
    }
  }

  await BD.query("commit");
  void idAdmin;

  const [r] = await filas<Record<string, string>>(`
    select
      (select count(*) from public.especialidades)                as especialidades,
      (select count(*) from public.medicos where cmp like 'CMP-DEMO-%') as medicos,
      (select count(*) from public.enfermeras)                    as enfermeras,
      (select count(*) from public.pacientes where numero_documento like '99%' or numero_documento like 'CEDEMO%') as pacientes,
      (select count(*) from public.historias_clinicas)            as historias,
      (select count(*) from public.citas c join public.pacientes p on p.id = c.paciente_id where p.email like '%@demo.invalid') as citas,
      (select count(*) from public.asignaciones_paciente_medico)  as asignaciones,
      (select count(*) from public.atenciones)                    as atenciones,
      (select count(*) from public.antecedentes)                  as antecedentes,
      (select count(*) from public.turnos_enfermeria)             as turnos
  `);
  console.log("# Datos de demostración sembrados (conteos totales en la base):");
  console.log(JSON.stringify(r));
  console.log(`# Cuentas reales asociadas: ${Object.keys(cuentas).join(", ") || "ninguna (solo perfiles mock_)"}`);
} catch (error) {
  await BD.query("rollback").catch(() => undefined);
  console.error("Error al sembrar; la transacción se revirtió:", (error as Error).message);
  process.exitCode = 1;
} finally {
  await BD.end();
}
