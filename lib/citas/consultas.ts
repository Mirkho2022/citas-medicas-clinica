// Lectura de datos de las pantallas de la consola del administrativo (specs/gestion-de-citas; design.md, D7 y D11).
//
// Igual que el resto de `lib/citas/*.ts`: cada función recibe un `Ejecutor` (en producción, `ejecutorAutenticado` desde un
// Server Component, con la identidad del usuario: la RLS decide qué filas existen para el rol). Son lecturas puras: no emiten
// eventos ni refrescan nada. Los instantes salen como texto ISO 8601 en UTC; la pantalla los muestra en hora de Lima.
import { consultar, type Ejecutor, type Fila } from "../db/ejecutor.ts";
import { esFechaLima, finDiaLima, inicioDiaLima } from "../fechas/lima.ts";
import type { EstadoCita } from "../ui/estados-cita.ts";
import type { PacienteEncontrado } from "./pacientes.ts";

const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(texto: unknown): texto is string {
  return typeof texto === "string" && FORMA_UUID.test(texto);
}

// `timestamptz` llega como `Date` o como texto según el driver; la interfaz trabaja siempre con texto ISO.
export function aIso(valor: unknown): string {
  const fecha = valor instanceof Date ? valor : new Date(String(valor));
  if (Number.isNaN(fecha.getTime())) throw new Error(`Instante no válido: «${String(valor)}»`);
  return fecha.toISOString();
}

const nombreCompleto = (nombres: unknown, apellidos: unknown) => `${String(nombres)} ${String(apellidos)}`.trim();

export interface MedicoListado {
  id: string;
  nombre: string;
  especialidad: string;
}

// Médicos activos, para el filtro de la agenda y para elegir con quién agendar.
export async function listarMedicos(ejecutar: Ejecutor): Promise<MedicoListado[]> {
  const filas = await consultar(
    ejecutar,
    `select m.id, pm.nombres, pm.apellidos, e.nombre as especialidad
       from public.medicos m
       join public.perfiles pm on pm.id = m.perfil_id
       join public.especialidades e on e.id = m.especialidad_id
      where m.activo
      order by pm.apellidos, pm.nombres`,
  );
  return filas.map((f) => ({
    id: String(f.id),
    nombre: nombreCompleto(f.nombres, f.apellidos),
    especialidad: String(f.especialidad),
  }));
}

export interface CitaDelDia {
  tipo: "cita";
  id: string;
  inicio: string;
  fin: string;
  estado: EstadoCita;
  medicoId: string;
  medico: string;
  servicio: string;
  // ¿Un bloqueo de agenda del médico (una baja) cubre la cita? Entonces la ventana de 1 hora no aplica (ADR-0011).
  porBaja: boolean;
  paciente: {
    id: string;
    nombres: string;
    apellidos: string;
    tipoDocumento: "DNI" | "CE";
    documento: string;
  };
}

export interface HuecoLibre {
  tipo: "hueco";
  medicoId: string;
  medico: string;
  servicio: string;
  inicio: string;
  fin: string;
}

export type FilaAgendaDia = CitaDelDia | HuecoLibre;

export interface AgendaDelDia {
  fecha: string;
  filas: FilaAgendaDia[];
  citas: number;
  huecos: number;
}

// Orden de la agenda: por hora y, a igual hora, por médico (así los huecos de varios médicos se intercalan de forma estable).
export function ordenarAgenda(filas: readonly FilaAgendaDia[]): FilaAgendaDia[] {
  return [...filas].sort(
    (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime() || a.medico.localeCompare(b.medico, "es"),
  );
}

function aCita(f: Fila): CitaDelDia {
  return {
    tipo: "cita",
    id: String(f.id),
    inicio: aIso(f.inicio),
    fin: aIso(f.fin),
    estado: String(f.estado) as EstadoCita,
    medicoId: String(f.medico_id),
    medico: nombreCompleto(f.medico_nombres, f.medico_apellidos),
    servicio: String(f.servicio),
    porBaja: f.por_baja === true,
    paciente: {
      id: String(f.paciente_id),
      nombres: String(f.paciente_nombres),
      apellidos: String(f.paciente_apellidos),
      tipoDocumento: String(f.tipo_documento) === "CE" ? "CE" : "DNI",
      documento: String(f.numero_documento),
    },
  };
}

function aHueco(f: Fila): HuecoLibre {
  return {
    tipo: "hueco",
    medicoId: String(f.medico_id),
    medico: nombreCompleto(f.nombres, f.apellidos),
    servicio: String(f.servicio),
    inicio: aIso(f.inicio),
    fin: aIso(f.fin),
  };
}

// Sentencia de los huecos libres de un día: `slots_disponibles` ya descarta citas vigentes, ausencias y horas pasadas.
const SENTENCIA_HUECOS = `select m.id as medico_id, pm.nombres, pm.apellidos, e.nombre as servicio, s.inicio, s.fin
       from public.medicos m
       join public.perfiles pm on pm.id = m.perfil_id
       join public.especialidades e on e.id = m.especialidad_id
      cross join lateral public.slots_disponibles(m.id, $1::date) s
      where m.activo and ($2::uuid is null or m.id = $2::uuid)
      order by s.inicio, pm.apellidos`;

// La agenda de un día de Lima: las citas (de cualquier estado) con los huecos libres intercalados. Las dos lecturas van en una
// sola transacción. `medicoId` nulo = todos los médicos.
export async function agendaDelDia(
  ejecutar: Ejecutor,
  fecha: string,
  medicoId: string | null = null,
): Promise<AgendaDelDia> {
  if (!esFechaLima(fecha)) throw new Error(`Fecha de Lima no válida: «${fecha}»`);
  if (medicoId !== null && !esUuid(medicoId)) throw new Error("Identificador de médico no válido");

  const [citas, huecos] = await ejecutar([
    {
      texto: `select c.id, c.inicio, c.fin, c.estado::text as estado, c.medico_id,
                     pa.id as paciente_id, pa.nombres as paciente_nombres, pa.apellidos as paciente_apellidos,
                     pa.tipo_documento::text as tipo_documento, pa.numero_documento,
                     pm.nombres as medico_nombres, pm.apellidos as medico_apellidos, e.nombre as servicio,
                     exists (select 1 from public.bloqueos_agenda b where b.medico_id = c.medico_id and b.rango && c.rango) as por_baja
                from public.citas c
                join public.pacientes pa on pa.id = c.paciente_id
                join public.medicos m on m.id = c.medico_id
                join public.perfiles pm on pm.id = m.perfil_id
                join public.especialidades e on e.id = m.especialidad_id
               where c.inicio >= $1::timestamptz and c.inicio < $2::timestamptz
                 and ($3::uuid is null or c.medico_id = $3::uuid)
               order by c.inicio, pm.apellidos`,
      parametros: [inicioDiaLima(fecha).toISOString(), finDiaLima(fecha).toISOString(), medicoId],
    },
    { texto: SENTENCIA_HUECOS, parametros: [fecha, medicoId] },
  ]);

  const delDia = (citas ?? []).map(aCita);
  const libres = (huecos ?? []).map(aHueco);
  return { fecha, filas: ordenarAgenda([...delDia, ...libres]), citas: delDia.length, huecos: libres.length };
}

// Los huecos libres de un médico en un día (para elegir horario al agendar o reprogramar).
export async function horariosLibres(ejecutar: Ejecutor, medicoId: string, fecha: string): Promise<HuecoLibre[]> {
  if (!esFechaLima(fecha)) throw new Error(`Fecha de Lima no válida: «${fecha}»`);
  if (!esUuid(medicoId)) throw new Error("Identificador de médico no válido");
  const filas = await consultar(ejecutar, SENTENCIA_HUECOS, [fecha, medicoId]);
  return filas.map(aHueco);
}

// Un paciente por su identificador (solo identificación y contacto, nunca datos clínicos). `null` si no existe o la RLS no lo deja ver.
export async function pacientePorId(ejecutar: Ejecutor, id: string): Promise<PacienteEncontrado | null> {
  if (!esUuid(id)) return null;
  const filas = await consultar(
    ejecutar,
    `select id, tipo_documento::text as tipo_documento, numero_documento, nombres, apellidos,
            fecha_nacimiento::text as fecha_nacimiento, email::text as email, telefono
       from public.pacientes where id = $1::uuid`,
    [id],
  );
  return (filas[0] as unknown as PacienteEncontrado | undefined) ?? null;
}

// Una cita por su identificador, para reprogramarla: paciente, médico y horario actuales. `null` si no existe o ya no está vigente.
export async function citaVigentePorId(ejecutar: Ejecutor, id: string): Promise<CitaDelDia | null> {
  if (!esUuid(id)) return null;
  const filas = await consultar(
    ejecutar,
    `select c.id, c.inicio, c.fin, c.estado::text as estado, c.medico_id,
            pa.id as paciente_id, pa.nombres as paciente_nombres, pa.apellidos as paciente_apellidos,
            pa.tipo_documento::text as tipo_documento, pa.numero_documento,
            pm.nombres as medico_nombres, pm.apellidos as medico_apellidos, e.nombre as servicio,
            exists (select 1 from public.bloqueos_agenda b where b.medico_id = c.medico_id and b.rango && c.rango) as por_baja
       from public.citas c
       join public.pacientes pa on pa.id = c.paciente_id
       join public.medicos m on m.id = c.medico_id
       join public.perfiles pm on pm.id = m.perfil_id
       join public.especialidades e on e.id = m.especialidad_id
      where c.id = $1::uuid and c.estado in ('reservada', 'confirmada')`,
    [id],
  );
  return filas[0] ? aCita(filas[0]) : null;
}

// Parámetros de la URL de la agenda: una fecha de Lima válida (si no, hoy) y un médico `uuid` (si no, todos).
export function parametrosAgenda(
  consulta: { fecha?: string | string[]; medico?: string | string[] },
  hoy: string,
): { fecha: string; medicoId: string | null } {
  const una = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const fecha = una(consulta.fecha);
  const medico = una(consulta.medico);
  return { fecha: fecha && esFechaLima(fecha) ? fecha : hoy, medicoId: esUuid(medico) ? medico : null };
}
