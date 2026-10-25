// Lecturas de las pantallas del portal del paciente (openspec/changes/portal-del-paciente/specs/busqueda-y-reserva-de-cita y
// mis-citas-y-cancelacion; design.md, D5 y D6).
//
// Igual que `lib/citas/consultas.ts`: cada función recibe un `Ejecutor` (en producción, `ejecutorAutenticado` desde un Server
// Component, con la identidad del paciente: la RLS decide qué filas existen para él). Son lecturas puras y de UNA transacción por
// pantalla. Los instantes salen como texto ISO 8601 en UTC; la pantalla los muestra en hora de Lima.
//
// Nada de aquí nombra una tabla clínica o administrativa (tests/portal/guarda-estatica.test.ts). Los horarios libres salen solo de
// `slots_disponibles()` (H3): ni las citas de otros pacientes ni los motivos de los bloqueos llegan hasta aquí.
import { aIso, esUuid } from "../citas/consultas.ts";
import { consultar, type Ejecutor, type Fila } from "../db/ejecutor.ts";
import { esFechaLima, fechaYHoraLima, finDiaLima, inicioDiaLima } from "../fechas/lima.ts";
import type { EstadoCita } from "../ui/estados-cita.ts";

// Horizonte de la búsqueda: un parámetro de interfaz, no una regla de negocio (design.md, D6 y Q4). La tarea 6.2 lo mide.
export const DIAS_DE_BUSQUEDA = 30;
// Cuántas citas anteriores se muestran de una vez en «Mis citas»; «Ver más» agrega otras tantas.
export const CITAS_ANTERIORES_POR_PAGINA = 20;
const MAXIMO_CITAS_ANTERIORES = 200;

const nombreCompleto = (nombres: unknown, apellidos: unknown) => `${String(nombres)} ${String(apellidos)}`.trim();

export interface Especialidad {
  id: string;
  nombre: string;
}

// Las especialidades que tienen al menos un médico activo: una sin médicos activos no se ofrece.
export async function listarEspecialidades(ejecutar: Ejecutor): Promise<Especialidad[]> {
  const filas = await consultar(
    ejecutar,
    `select e.id, e.nombre
       from public.especialidades e
      where exists (select 1 from public.medicos m where m.especialidad_id = e.id and m.activo)
      order by e.nombre`,
  );
  return filas.map((f) => ({ id: String(f.id), nombre: String(f.nombre) }));
}

export interface MedicoDelPortal {
  id: string;
  nombre: string;
  especialidadId: string;
  especialidad: string;
  // Primer horario libre dentro del horizonte, o `null` («Sin horarios próximos»). Solo lo calcula `medicosDeEspecialidad`.
  proximoHorario: string | null;
}

function aMedico(f: Fila): MedicoDelPortal {
  return {
    id: String(f.id),
    nombre: nombreCompleto(f.nombres, f.apellidos),
    especialidadId: String(f.especialidad_id),
    especialidad: String(f.especialidad),
    proximoHorario: f.proximo === null || f.proximo === undefined ? null : aIso(f.proximo),
  };
}

// Los médicos activos de una especialidad, cada uno con su próximo horario libre. Una sola consulta: `LATERAL` sobre los días del
// horizonte y `slots_disponibles` por día; se queda con el primero. `hoy` es la fecha de Lima de hoy (`AAAA-MM-DD`).
export async function medicosDeEspecialidad(
  ejecutar: Ejecutor,
  especialidadId: string,
  hoy: string,
  dias: number = DIAS_DE_BUSQUEDA,
): Promise<MedicoDelPortal[]> {
  if (!esUuid(especialidadId)) throw new Error("Identificador de especialidad no válido");
  if (!esFechaLima(hoy)) throw new Error(`Fecha de Lima no válida: «${hoy}»`);
  const filas = await consultar(
    ejecutar,
    `select m.id, pm.nombres, pm.apellidos, e.id as especialidad_id, e.nombre as especialidad, prox.inicio as proximo
       from public.medicos m
       join public.perfiles pm on pm.id = m.perfil_id
       join public.especialidades e on e.id = m.especialidad_id
       left join lateral (
         select s.inicio
           from generate_series(0, $3::int - 1) n
          cross join lateral public.slots_disponibles(m.id, $2::date + n) s
          order by s.inicio
          limit 1
       ) prox on true
      where m.activo and m.especialidad_id = $1::uuid
      order by pm.apellidos, pm.nombres`,
    [especialidadId, hoy, dias],
  );
  return filas.map(aMedico);
}

// Todos los médicos activos, para «Ya sé con qué médico». No calcula el próximo horario: el paciente ya sabe a quién busca.
export async function todosLosMedicos(ejecutar: Ejecutor): Promise<MedicoDelPortal[]> {
  const filas = await consultar(
    ejecutar,
    `select m.id, pm.nombres, pm.apellidos, e.id as especialidad_id, e.nombre as especialidad
       from public.medicos m
       join public.perfiles pm on pm.id = m.perfil_id
       join public.especialidades e on e.id = m.especialidad_id
      where m.activo
      order by pm.apellidos, pm.nombres`,
  );
  return filas.map(aMedico);
}

// Un médico activo por su identificador; `null` si no existe o fue dado de baja (un médico de baja no se ofrece).
export async function medicoActivoPorId(ejecutar: Ejecutor, medicoId: string): Promise<MedicoDelPortal | null> {
  if (!esUuid(medicoId)) return null;
  const filas = await consultar(
    ejecutar,
    `select m.id, pm.nombres, pm.apellidos, e.id as especialidad_id, e.nombre as especialidad
       from public.medicos m
       join public.perfiles pm on pm.id = m.perfil_id
       join public.especialidades e on e.id = m.especialidad_id
      where m.activo and m.id = $1::uuid`,
    [medicoId],
  );
  return filas[0] ? aMedico(filas[0]) : null;
}

export interface DiaDelMedico {
  // Fecha de Lima `AAAA-MM-DD`.
  dia: string;
  // Horarios libres ese día; 0 = «Sin horarios».
  libres: number;
}

// Los días del horizonte con cuántos horarios libres tiene el médico. Una consulta, sin función nueva: `LEFT JOIN LATERAL` sobre
// `slots_disponibles` y agrupado por día, de modo que los días sin horarios cuentan en cero (design.md, D6).
export async function diasDelMedico(
  ejecutar: Ejecutor,
  medicoId: string,
  hoy: string,
  dias: number = DIAS_DE_BUSQUEDA,
): Promise<DiaDelMedico[]> {
  if (!esUuid(medicoId)) throw new Error("Identificador de médico no válido");
  if (!esFechaLima(hoy)) throw new Error(`Fecha de Lima no válida: «${hoy}»`);
  const filas = await consultar(
    ejecutar,
    `select ($2::date + n)::text as dia, count(s.inicio)::int as libres
       from generate_series(0, $3::int - 1) n
       left join lateral public.slots_disponibles($1::uuid, $2::date + n) s on true
      group by n
      order by n`,
    [medicoId, hoy, dias],
  );
  return filas.map((f) => ({ dia: String(f.dia), libres: Number(f.libres) }));
}

export interface HorarioDelPortal {
  // Instante UTC en ISO 8601; es el que viaja en la dirección y de vuelta a la acción.
  inicio: string;
  // `null` solo en un horario recién tomado por otra persona (ya no figura entre los libres y no se conoce su fin).
  fin: string | null;
  // `false` = se pinta «No disponible» (cruza una cita vigente del propio paciente, o se acaba de tomar).
  disponible: boolean;
}

// Los horarios libres de un médico en un día de Lima. Un horario que se cruza con una cita vigente del propio paciente (con otro
// médico, por ejemplo) se devuelve como no disponible: es una ayuda de interfaz, la defensa real es `citas_sin_cruce_paciente`.
// `tomados` son instantes que el paciente acaba de intentar reservar y otra persona ganó: ya no figuran entre los libres, pero la
// lista los muestra como «No disponible» en vez de hacerlos desaparecer (specs/busqueda-y-reserva-de-cita, doble reserva).
export async function horariosDelDia(
  ejecutar: Ejecutor,
  medicoId: string,
  dia: string,
  opciones: { tomados?: readonly string[] } = {},
): Promise<HorarioDelPortal[]> {
  if (!esUuid(medicoId)) throw new Error("Identificador de médico no válido");
  if (!esFechaLima(dia)) throw new Error(`Fecha de Lima no válida: «${dia}»`);

  const [libres, propias] = await ejecutar([
    { texto: `select inicio, fin from public.slots_disponibles($1::uuid, $2::date)`, parametros: [medicoId, dia] },
    {
      // La RLS ya deja ver solo las citas del paciente; el filtro explícito es una segunda barrera.
      texto: `select inicio, fin from public.citas
               where estado in ('reservada', 'confirmada') and paciente_id = (select public.paciente_actual())
                 and inicio < $2::timestamptz and fin > $1::timestamptz`,
      parametros: [inicioDiaLima(dia).toISOString(), finDiaLima(dia).toISOString()],
    },
  ]);

  const citasPropias = (propias ?? []).map((f) => ({ inicio: new Date(aIso(f.inicio)).getTime(), fin: new Date(aIso(f.fin)).getTime() }));
  const horarios: HorarioDelPortal[] = (libres ?? []).map((f) => {
    const inicio = aIso(f.inicio);
    const fin = aIso(f.fin);
    const ini = new Date(inicio).getTime();
    const fi = new Date(fin).getTime();
    return { inicio, fin, disponible: !citasPropias.some((c) => c.inicio < fi && c.fin > ini) };
  });

  for (const tomado of opciones.tomados ?? []) {
    const fecha = new Date(tomado);
    if (Number.isNaN(fecha.getTime())) continue;
    const inicio = fecha.toISOString();
    if (fechaYHoraLima(inicio).fecha !== dia || horarios.some((h) => h.inicio === inicio)) continue;
    horarios.push({ inicio, fin: null, disponible: false });
  }
  return horarios.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
}

export interface HorarioLibre {
  inicio: string;
  fin: string;
}

// El horario libre que empieza exactamente en `inicio`, o `null` si ya no existe (se tomó, entró en un bloqueo o ya pasó). De aquí
// sale el `fin` de la reserva: el servidor no confía en el cliente para eso (design.md, D7).
export async function horarioLibre(ejecutar: Ejecutor, medicoId: string, inicio: string): Promise<HorarioLibre | null> {
  if (!esUuid(medicoId)) return null;
  const instante = new Date(inicio);
  if (Number.isNaN(instante.getTime())) return null;
  const iso = instante.toISOString();
  const filas = await consultar(
    ejecutar,
    `select inicio, fin from public.slots_disponibles($1::uuid, $2::date) where inicio = $3::timestamptz`,
    [medicoId, fechaYHoraLima(iso).fecha, iso],
  );
  return filas[0] ? { inicio: aIso(filas[0].inicio), fin: aIso(filas[0].fin) } : null;
}

export interface CitaDelPortal {
  id: string;
  inicio: string;
  fin: string;
  estado: EstadoCita;
  medico: string;
  servicio: string;
}

function aCita(f: Fila): CitaDelPortal {
  return {
    id: String(f.id),
    inicio: aIso(f.inicio),
    fin: aIso(f.fin),
    estado: String(f.estado) as EstadoCita,
    medico: nombreCompleto(f.nombres, f.apellidos),
    servicio: String(f.servicio),
  };
}

// Citas del paciente de la sesión. La RLS ya las limita a las suyas; `paciente_actual()` lo repite a propósito.
const SELECT_CITAS = `select c.id, c.inicio, c.fin, c.estado::text as estado, pm.nombres, pm.apellidos, e.nombre as servicio
       from public.citas c
       join public.medicos m on m.id = c.medico_id
       join public.perfiles pm on pm.id = m.perfil_id
       join public.especialidades e on e.id = m.especialidad_id
      where c.paciente_id = (select public.paciente_actual())`;

// «Próximas»: vigentes (`reservada` o `confirmada`) que todavía no terminaron.
const ES_PROXIMA = `c.estado in ('reservada', 'confirmada') and c.fin > now()`;

export interface MisCitas {
  // De la más cercana a la más lejana.
  proximas: CitaDelPortal[];
  // De la más reciente a la más antigua, hasta `limiteAnteriores`.
  anteriores: CitaDelPortal[];
  hayMasAnteriores: boolean;
}

// Las citas del paciente partidas en próximas y anteriores (todas las demás: atendidas, canceladas, «No asistió» y las que ya
// pasaron). Las dos lecturas van en una sola transacción.
export async function misCitas(ejecutar: Ejecutor, limiteAnteriores: number = CITAS_ANTERIORES_POR_PAGINA): Promise<MisCitas> {
  const limite = Math.min(Math.max(Math.trunc(limiteAnteriores) || CITAS_ANTERIORES_POR_PAGINA, 1), MAXIMO_CITAS_ANTERIORES);
  const [proximas, anteriores] = await ejecutar([
    { texto: `${SELECT_CITAS} and ${ES_PROXIMA} order by c.inicio, c.id` },
    // Una más que el límite: si llega, hay más que mostrar.
    { texto: `${SELECT_CITAS} and not (${ES_PROXIMA}) order by c.inicio desc, c.id limit $1::int`, parametros: [limite + 1] },
  ]);
  const todasAnteriores = (anteriores ?? []).map(aCita);
  return {
    proximas: (proximas ?? []).map(aCita),
    anteriores: todasAnteriores.slice(0, limite),
    hayMasAnteriores: todasAnteriores.length > limite,
  };
}

// La próxima cita del paciente (para «Inicio»), o `null` si no tiene ninguna vigente.
export async function proximaCita(ejecutar: Ejecutor): Promise<CitaDelPortal | null> {
  const filas = await consultar(ejecutar, `${SELECT_CITAS} and ${ES_PROXIMA} order by c.inicio, c.id limit 1`);
  return filas[0] ? aCita(filas[0]) : null;
}

// Una cita propia por su identificador (la pantalla de confirmación de la reserva); `null` si no existe o no es suya.
export async function citaPropiaPorId(ejecutar: Ejecutor, citaId: string): Promise<CitaDelPortal | null> {
  if (!esUuid(citaId)) return null;
  const filas = await consultar(ejecutar, `${SELECT_CITAS} and c.id = $1::uuid`, [citaId]);
  return filas[0] ? aCita(filas[0]) : null;
}

// El estado de una cita visible para el paciente, o `null` si no la ve (ajena o inexistente: indistinguibles a propósito).
export async function estadoDeCitaPropia(ejecutar: Ejecutor, citaId: string): Promise<EstadoCita | null> {
  if (!esUuid(citaId)) return null;
  const filas = await consultar(
    ejecutar,
    `select c.estado::text as estado from public.citas c where c.id = $1::uuid and c.paciente_id = (select public.paciente_actual())`,
    [citaId],
  );
  return filas[0] ? (String(filas[0].estado) as EstadoCita) : null;
}

// La cita vigente del propio paciente con ese médico que empieza en ese instante, si existe: sirve para reconocer un reintento de
// la misma reserva (doble clic, mala conexión) y no mostrarlo como choque.
export async function citaVigenteDelPacienteEn(ejecutar: Ejecutor, medicoId: string, inicio: string): Promise<string | null> {
  if (!esUuid(medicoId)) return null;
  const instante = new Date(inicio);
  if (Number.isNaN(instante.getTime())) return null;
  const filas = await consultar(
    ejecutar,
    `select c.id from public.citas c
      where c.medico_id = $1::uuid and c.inicio = $2::timestamptz and c.estado in ('reservada', 'confirmada')
        and c.paciente_id = (select public.paciente_actual())
      limit 1`,
    [medicoId, instante.toISOString()],
  );
  return filas[0] ? String(filas[0].id) : null;
}

// El nombre del paciente de la sesión, para el saludo de «Inicio». `null` si la lectura no devuelve nada.
export async function nombreDelPaciente(ejecutar: Ejecutor): Promise<string | null> {
  const filas = await consultar(ejecutar, `select p.nombres from public.pacientes p where p.id = (select public.paciente_actual())`);
  return filas[0] ? String(filas[0].nombres) : null;
}
