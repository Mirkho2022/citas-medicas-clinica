// Mide el rendimiento de la búsqueda de horarios del portal (H4, tarea 6.2; openspec/changes/portal-del-paciente/design.md, D6):
// la consulta de «días» (`diasDelMedico`) y la del «próximo horario» de cada médico (`medicosDeEspecialidad`) de lib/portal/consultas.ts,
// sobre un volumen sintético y con `EXPLAIN (ANALYZE, BUFFERS)`. Objetivo del TECH-DESIGN: p95 < 500 ms.
//
// Uso (Node 24 ejecuta TypeScript directamente):
//   node scripts/medir-busqueda-portal.ts            # 40 médicos, 40 000 citas, 25 repeticiones
//   VOLUMEN_MEDICOS=80 VOLUMEN_PACIENTES=8000 REPETICIONES=40 node scripts/medir-busqueda-portal.ts
//
// Conexión: DATABASE_URL_PRUEBAS (o DATABASE_URL), la URL DIRECTA del rol dueño de un branch de desarrollo o efímero — nunca production
// (misma convención que scripts/ejecutar-pgtap.ts; si coincide el host de DATABASE_URL_PRODUCCION, se niega a correr).
//
// Todo ocurre en UNA transacción que termina en `ROLLBACK`: no deja datos. `public.slots_disponibles()` comprueba el rol de la sesión
// (`rol_actual()`), que aquí no existe porque no hay JWT; el script crea una copia temporal (`pg_temp.slots_libres`) con el MISMO cuerpo
// (agenda del médico menos las citas vigentes que se cruzan) y sin esa comprobación, que cuesta una lectura del claim y no cambia el plan.
// La función real es `SECURITY DEFINER`: lee `citas` sin pasar por la RLS, así que medir como dueño es representativo del costo en la base.
import pg from "pg";

try {
  process.loadEnvFile(process.env.ENV_FILE ?? ".env.local");
} catch {
  // sin .env.local (CI): se usa el entorno del proceso
}

const url = process.env.DATABASE_URL_PRUEBAS ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL_PRUEBAS (o DATABASE_URL): URL directa del branch de pruebas.");
  process.exit(1);
}
const { host } = new URL(url);
if (host.includes("-pooler")) {
  console.error("La URL es del pooler: usa la conexión directa.");
  process.exit(1);
}
if (process.env.DATABASE_URL_PRODUCCION && new URL(process.env.DATABASE_URL_PRODUCCION).host === host) {
  console.error("El destino es producción: la medición nunca corre contra production.");
  process.exit(1);
}

const MEDICOS = Number(process.env.VOLUMEN_MEDICOS ?? 40);
const PACIENTES = Number(process.env.VOLUMEN_PACIENTES ?? 4000);
const REPETICIONES = Number(process.env.REPETICIONES ?? 25);
const DIAS = 30;

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();

async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(texto: string, parametros: unknown[] = []): Promise<pg.QueryResult<T>> {
  return cliente.query<T>(texto, parametros);
}

const percentil = (valores: number[], p: number): number => {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)]!;
};

try {
  await sql("begin");

  // ---- Volumen sintético (se descarta al final) ----
  const especialidad = (await sql<{ id: string }>(`insert into public.especialidades (nombre) values ('Medición portal 6.2') returning id`)).rows[0]!.id;
  await sql(
    `insert into public.perfiles (clerk_user_id, rol, nombres, apellidos)
     select 'medicion_med_' || n, 'medico', 'Medico' || n, 'Prueba' || n from generate_series(1, $1) n`,
    [MEDICOS],
  );
  await sql(
    `insert into public.medicos (perfil_id, cmp, especialidad_id)
     select pf.id, 'CMP-M62-' || substr(pf.clerk_user_id, 14), $1
       from public.perfiles pf where pf.clerk_user_id like 'medicion_med_%'`,
    [especialidad],
  );
  // Lunes a sábado, 08:00–18:00, turnos de 20 minutos (30 por día).
  await sql(
    `insert into public.disponibilidades (medico_id, dia_semana, hora_inicio, hora_fin, duracion_slot_min, vigente_desde)
     select m.id, d, '08:00', '18:00', 20, '2020-01-01' from public.medicos m, generate_series(1, 6) d where m.especialidad_id = $1`,
    [especialidad],
  );
  await sql(
    `insert into public.pacientes (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo, email)
     select 'DNI', lpad((60000000 + n)::text, 8, '0'), 'Paciente' || n, 'Prueba', '1980-01-01', 'F', 'm62_' || n || '@demo.invalid'
       from generate_series(1, $1) n`,
    [PACIENTES],
  );
  // Citas: un tercio de los turnos de los últimos 120 días (atendidas) y la mitad de los de los próximos 30 días (reservadas), repartidas
  // para que ningún paciente se cruce consigo mismo (el mismo instante en dos médicos usa pacientes distintos).
  await sql(
    `with turnos as (
       select m.id as medico, row_number() over (order by m.id) as mi, s.n as dia, h.k as k
         from public.medicos m
         cross join generate_series(-120, $2 - 1) s(n)
         cross join generate_series(0, 29) h(k)
        where m.especialidad_id = $1
     ), pac as (select id, row_number() over (order by id) as pi from public.pacientes where numero_documento like '6%')
     insert into public.citas (paciente_id, medico_id, inicio, fin, estado, origen)
     select pac.id, t.medico,
            ((current_date + t.dia)::timestamp + time '08:00' + t.k * interval '20 minutes') at time zone 'America/Lima',
            ((current_date + t.dia)::timestamp + time '08:20' + t.k * interval '20 minutes') at time zone 'America/Lima',
            case when t.dia < 0 then 'atendida'::public.estado_cita else 'reservada'::public.estado_cita end, 'administrativo'
       from turnos t
       join pac on pac.pi = ((t.dia + 121) * 31 + t.k * 7 + t.mi) % $3 + 1
      where extract(dow from current_date + t.dia) <> 0
        and (t.dia < 0 and (t.k + t.mi + t.dia) % 3 = 0 or t.dia >= 0 and (t.k + t.mi) % 2 = 0)
     on conflict do nothing`,
    [especialidad, DIAS, PACIENTES],
  );
  const volumen = (await sql(`select count(*)::int as citas from public.citas where medico_id in (select id from public.medicos where especialidad_id = $1)`, [especialidad])).rows[0]!;
  console.log(`Volumen sintético: ${MEDICOS} médicos, ${PACIENTES} pacientes, ${volumen.citas} citas.\n`);
  await sql("analyze public.citas");

  // Copia de `slots_disponibles` sin la comprobación del rol de la sesión (ver el encabezado).
  await sql(
    `create function pg_temp.slots_libres(p_medico uuid, p_fecha date) returns table (inicio timestamptz, fin timestamptz)
     language sql stable as $f$
       select s.inicio, s.fin from public.slots_agenda(p_medico, p_fecha) s
        where s.inicio > now()
          and not exists (select 1 from public.citas c where c.medico_id = p_medico and c.estado in ('reservada', 'confirmada')
                             and c.rango && tstzrange(s.inicio, s.fin, '[)'))
        order by s.inicio
     $f$`,
  );

  const medico = (await sql<{ id: string }>(`select id from public.medicos where especialidad_id = $1 order by id limit 1`, [especialidad])).rows[0]!.id;
  const hoy = (await sql<{ hoy: string }>(`select (now() at time zone 'America/Lima')::date::text as hoy`)).rows[0]!.hoy;

  const CONSULTAS = {
    "Días de un médico (30 días, con cuántos horarios libres)": {
      texto: `select ($2::date + n)::text as dia, count(s.inicio)::int as libres
                from generate_series(0, $3::int - 1) n
                left join lateral pg_temp.slots_libres($1::uuid, $2::date + n) s on true
               group by n order by n`,
      parametros: [medico, hoy, DIAS],
    },
    [`Próximo horario de cada médico de la especialidad (${MEDICOS} médicos)`]: {
      texto: `select m.id, pm.nombres, pm.apellidos, prox.inicio as proximo
                from public.medicos m
                join public.perfiles pm on pm.id = m.perfil_id
                left join lateral (
                  select s.inicio from generate_series(0, $3::int - 1) n
                   cross join lateral pg_temp.slots_libres(m.id, $2::date + n) s
                   order by s.inicio limit 1
                ) prox on true
               where m.activo and m.especialidad_id = $1::uuid
               order by pm.apellidos, pm.nombres`,
      parametros: [especialidad, hoy, DIAS],
    },
  };

  for (const [nombre, consulta] of Object.entries(CONSULTAS)) {
    const tiempos: number[] = [];
    let plan = "";
    for (let i = 0; i < REPETICIONES; i++) {
      const filas = (await sql<{ "QUERY PLAN": string }>(`explain (analyze, buffers) ${consulta.texto}`, consulta.parametros)).rows.map((f) => f["QUERY PLAN"]);
      const ejecucion = Number(/Execution Time: ([\d.]+) ms/.exec(filas.join("\n"))?.[1] ?? NaN);
      tiempos.push(ejecucion);
      if (i === REPETICIONES - 1) plan = filas.join("\n");
    }
    const [p50, p95, max] = [percentil(tiempos, 50), percentil(tiempos, 95), Math.max(...tiempos)];
    console.log(`## ${nombre}`);
    console.log(`Tiempo de ejecución en la base (${REPETICIONES} repeticiones): p50 ${p50.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms · máx ${max.toFixed(1)} ms ` +
      `→ ${p95 < 500 ? "cumple" : "NO cumple"} el objetivo de 500 ms\n`);
    console.log("```\n" + plan + "\n```\n");
  }
} finally {
  await sql("rollback").catch(() => undefined);
  await cliente.end();
}
