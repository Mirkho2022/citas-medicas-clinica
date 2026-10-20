// Lectura de datos de las pantallas de la consola del administrativo (specs/gestion-de-citas; design.md, D7 y D11).
//
// Igual que el resto de `lib/citas/*.ts`: cada función recibe un `Ejecutor` (en producción, `ejecutorAutenticado` desde un
// Server Component, con la identidad del usuario: la RLS decide qué filas existen para el rol). Son lecturas puras: no emiten
// eventos ni refrescan nada. Los instantes salen como texto ISO 8601 en UTC; la pantalla los muestra en hora de Lima.
import { consultar, type Ejecutor, type Fila } from "../db/ejecutor.ts";
import { esFechaLima, finDiaLima, inicioDiaLima } from "../fechas/lima.ts";
import { diaDeLaSemana, sumarDias } from "../ui/calendario.ts";
import type { EstadoCita } from "../ui/estados-cita.ts";
import { citaEnLaMalla, type TramoSemanal } from "./disponibilidades.ts";
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

export interface TramoPlantilla {
  // 0 = domingo … 6 = sábado, como `disponibilidades.dia_semana`.
  diaSemana: number;
  vigenteDesde: string;
  vigenteHasta: string | null;
}

// Los días, entre `desde` y `desde + dias - 1`, en que la plantilla del médico tiene algún tramo vigente. Es lo que marca con un
// punto el selector de fecha; no mira ausencias ni citas: un día sin huecos libres se ve igual al elegirlo.
export function diasConPlantilla(tramos: readonly TramoPlantilla[], desde: string, dias: number): string[] {
  const salida: string[] = [];
  for (let i = 0; i < dias; i++) {
    const dia = sumarDias(desde, i);
    const dow = diaDeLaSemana(dia);
    if (tramos.some((t) => t.diaSemana === dow && t.vigenteDesde <= dia && (t.vigenteHasta === null || t.vigenteHasta >= dia))) {
      salida.push(dia);
    }
  }
  return salida;
}

export async function diasConHorarios(ejecutar: Ejecutor, medicoId: string, desde: string, dias = 90): Promise<string[]> {
  if (!esFechaLima(desde)) throw new Error(`Fecha de Lima no válida: «${desde}»`);
  if (!esUuid(medicoId)) throw new Error("Identificador de médico no válido");
  const filas = await consultar(
    ejecutar,
    `select dia_semana, vigente_desde::text as vigente_desde, vigente_hasta::text as vigente_hasta
       from public.disponibilidades where medico_id = $1::uuid`,
    [medicoId],
  );
  return diasConPlantilla(
    filas.map((f) => ({
      diaSemana: Number(f.dia_semana),
      vigenteDesde: String(f.vigente_desde),
      vigenteHasta: f.vigente_hasta === null || f.vigente_hasta === undefined ? null : String(f.vigente_hasta),
    })),
    desde,
    dias,
  );
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

// ---- Horarios y ausencias (9.2 y 9.3) ----

export interface MedicoConHorarios {
  id: string;
  nombre: string;
  especialidad: string;
  activo: boolean;
  tramos: number;
  // Ausencias vigentes o futuras (las ya terminadas no cuentan).
  ausencias: number;
}

// Todos los médicos (también los dados de baja, marcados) con cuántos tramos semanales y ausencias vigentes o futuras tienen.
export async function medicosConHorarios(ejecutar: Ejecutor): Promise<MedicoConHorarios[]> {
  const filas = await consultar(
    ejecutar,
    `select m.id, pm.nombres, pm.apellidos, e.nombre as especialidad, m.activo,
            (select count(*) from public.disponibilidades d where d.medico_id = m.id)::int as tramos,
            (select count(*) from public.bloqueos_agenda b where b.medico_id = m.id and upper(b.rango) > now())::int as ausencias
       from public.medicos m
       join public.perfiles pm on pm.id = m.perfil_id
       join public.especialidades e on e.id = m.especialidad_id
      order by m.activo desc, pm.apellidos, pm.nombres`,
  );
  return filas.map((f) => ({
    id: String(f.id),
    nombre: nombreCompleto(f.nombres, f.apellidos),
    especialidad: String(f.especialidad),
    activo: f.activo === true,
    tramos: Number(f.tramos),
    ausencias: Number(f.ausencias),
  }));
}

export interface TramoListado {
  id: string;
  // 0 = domingo … 6 = sábado
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
  duracionSlotMin: number;
  vigenteDesde: string;
  vigenteHasta: string | null;
}

// La plantilla semanal del médico, de lunes a domingo y por hora.
export async function plantillaDelMedico(ejecutar: Ejecutor, medicoId: string): Promise<TramoListado[]> {
  if (!esUuid(medicoId)) throw new Error("Identificador de médico no válido");
  const filas = await consultar(
    ejecutar,
    `select id, dia_semana, left(hora_inicio::text, 5) as hora_inicio, left(hora_fin::text, 5) as hora_fin,
            duracion_slot_min, vigente_desde::text as vigente_desde, vigente_hasta::text as vigente_hasta
       from public.disponibilidades where medico_id = $1::uuid
      order by (dia_semana + 6) % 7, hora_inicio, vigente_desde`,
    [medicoId],
  );
  return filas.map((f) => ({
    id: String(f.id),
    diaSemana: Number(f.dia_semana),
    horaInicio: String(f.hora_inicio),
    horaFin: String(f.hora_fin),
    duracionSlotMin: Number(f.duracion_slot_min),
    vigenteDesde: String(f.vigente_desde),
    vigenteHasta: f.vigente_hasta === null || f.vigente_hasta === undefined ? null : String(f.vigente_hasta),
  }));
}

export interface BloqueoListado {
  id: string;
  desde: string;
  hasta: string;
  motivo: string;
  // Citas vigentes del médico que esta ausencia alcanza y siguen sin reasignar (vista `citas_por_reasignar`).
  porReasignar: number;
}

// Las ausencias del médico vigentes o futuras, por fecha de inicio.
export async function bloqueosDelMedico(ejecutar: Ejecutor, medicoId: string): Promise<BloqueoListado[]> {
  if (!esUuid(medicoId)) throw new Error("Identificador de médico no válido");
  const filas = await consultar(
    ejecutar,
    `select b.id, lower(b.rango) as desde, upper(b.rango) as hasta, b.motivo,
            (select count(*) from public.citas_por_reasignar r where r.bloqueo_id = b.id)::int as por_reasignar
       from public.bloqueos_agenda b where b.medico_id = $1::uuid and upper(b.rango) > now()
      order by lower(b.rango), b.id`,
    [medicoId],
  );
  return filas.map((f) => ({
    id: String(f.id),
    desde: aIso(f.desde),
    hasta: aIso(f.hasta),
    motivo: String(f.motivo),
    porReasignar: Number(f.por_reasignar),
  }));
}

export interface CitaFueraDeLaPlantilla {
  id: string;
  inicio: string;
  fin: string;
  estado: EstadoCita;
  paciente: string;
  documento: string;
}

// Las citas vigentes futuras del médico que su plantilla actual ya no cubre (specs/disponibilidad-y-slots: «Advertencia al
// recortar una disponibilidad con citas futuras»). Solo informa: no cancela ni mueve nada; la recepción las reprograma desde la agenda.
export async function citasFueraDeLaPlantilla(ejecutar: Ejecutor, medicoId: string): Promise<CitaFueraDeLaPlantilla[]> {
  if (!esUuid(medicoId)) throw new Error("Identificador de médico no válido");
  const [citas, tramos] = await ejecutar([
    {
      texto: `select c.id, c.inicio, c.fin, c.estado::text as estado, pa.nombres, pa.apellidos,
                     pa.tipo_documento::text as tipo_documento, pa.numero_documento
                from public.citas c join public.pacientes pa on pa.id = c.paciente_id
               where c.medico_id = $1::uuid and c.estado in ('reservada', 'confirmada') and c.inicio > now()
               order by c.inicio, c.id`,
      parametros: [medicoId],
    },
    {
      texto: `select dia_semana, hora_inicio::text as hora_inicio, hora_fin::text as hora_fin, duracion_slot_min,
                     vigente_desde::text as vigente_desde, vigente_hasta::text as vigente_hasta
                from public.disponibilidades where medico_id = $1::uuid`,
      parametros: [medicoId],
    },
  ]);
  const plantilla = (tramos ?? []) as unknown as TramoSemanal[];
  return (citas ?? [])
    .filter((f) => !citaEnLaMalla({ inicio: aIso(f.inicio), fin: aIso(f.fin) }, plantilla))
    .map((f) => ({
      id: String(f.id),
      inicio: aIso(f.inicio),
      fin: aIso(f.fin),
      estado: String(f.estado) as EstadoCita,
      paciente: nombreCompleto(f.nombres, f.apellidos),
      documento: `${String(f.tipo_documento)} ${String(f.numero_documento)}`,
    }));
}

// ---- Bajas médicas y reasignación (11.1 y 11.2) ----

export interface BajaListada {
  id: string;
  medicoId: string;
  medico: string;
  especialidad: string;
  desde: string;
  hasta: string;
  motivo: string;
  // Citas vigentes del médico que la baja alcanza y siguen sin reasignar.
  porReasignar: number;
  // De ellas, las que tienen al menos una propuesta de reasignación; el resto exige contactar al paciente.
  conPropuestas: number;
  porContactar: number;
}

const SENTENCIA_BAJA = `select b.id, b.medico_id, pm.nombres, pm.apellidos, e.nombre as especialidad,
         lower(b.rango) as desde, upper(b.rango) as hasta, b.motivo,
         (select count(*) from public.citas_por_reasignar r where r.bloqueo_id = b.id)::int as por_reasignar,
         (select count(distinct p.cita_id) from public.propuestas_reasignacion(b.id) p)::int as con_propuestas
    from public.bloqueos_agenda b
    join public.medicos m on m.id = b.medico_id
    join public.perfiles pm on pm.id = m.perfil_id
    join public.especialidades e on e.id = m.especialidad_id`;

function aBaja(f: Fila): BajaListada {
  const porReasignar = Number(f.por_reasignar);
  const conPropuestas = Number(f.con_propuestas);
  return {
    id: String(f.id),
    medicoId: String(f.medico_id),
    medico: nombreCompleto(f.nombres, f.apellidos),
    especialidad: String(f.especialidad),
    desde: aIso(f.desde),
    hasta: aIso(f.hasta),
    motivo: String(f.motivo),
    porReasignar,
    conPropuestas,
    porContactar: Math.max(porReasignar - conPropuestas, 0),
  };
}

// Las bajas (ausencias de un médico) vigentes o futuras, de todos los médicos, con cuántas citas quedan por reasignar y por contactar.
export async function bajasVigentes(ejecutar: Ejecutor): Promise<BajaListada[]> {
  const filas = await consultar(ejecutar, `${SENTENCIA_BAJA} where upper(b.rango) > now() order by lower(b.rango), b.id`);
  return filas.map(aBaja);
}

export interface PropuestaReasignacion {
  medicoId: string;
  medico: string;
  inicio: string;
  fin: string;
  // Mismo día y misma hora que la cita original: es la propuesta que se destaca.
  mismoHorario: boolean;
}

export interface CitaAfectada {
  id: string;
  inicio: string;
  fin: string;
  estado: EstadoCita;
  paciente: {
    id: string;
    nombres: string;
    apellidos: string;
    tipoDocumento: "DNI" | "CE";
    documento: string;
    email: string;
    telefono: string | null;
  };
  // Hasta 3, en el orden de la base de datos (mismo horario primero). Vacío = contactar al paciente.
  propuestas: PropuestaReasignacion[];
}

export interface DetalleBaja {
  baja: BajaListada;
  citas: CitaAfectada[];
}

// Una baja con sus citas afectadas, cada una con sus propuestas de reasignación (`propuestas_reasignacion`: solo propone, no cambia
// nada) y los datos de contacto del paciente para cuando no hay propuestas. `null` si la baja no existe o ya terminó.
export async function detalleDeBaja(ejecutar: Ejecutor, bloqueoId: string): Promise<DetalleBaja | null> {
  if (!esUuid(bloqueoId)) return null;
  const [baja, citas, propuestas] = await ejecutar([
    { texto: `${SENTENCIA_BAJA} where b.id = $1::uuid and upper(b.rango) > now()`, parametros: [bloqueoId] },
    {
      texto: `select r.cita_id, r.inicio, r.fin, r.estado::text as estado, pa.id as paciente_id, pa.nombres, pa.apellidos,
                     pa.tipo_documento::text as tipo_documento, pa.numero_documento, pa.email::text as email, pa.telefono
                from public.citas_por_reasignar r join public.pacientes pa on pa.id = r.paciente_id
               where r.bloqueo_id = $1::uuid order by r.inicio, r.cita_id`,
      parametros: [bloqueoId],
    },
    {
      texto: `select p.cita_id, p.medico_id, pm.nombres, pm.apellidos, p.inicio, p.fin, p.mismo_horario
                from public.propuestas_reasignacion($1::uuid) with ordinality as p(cita_id, medico_id, inicio, fin, mismo_horario, orden)
                join public.medicos m on m.id = p.medico_id join public.perfiles pm on pm.id = m.perfil_id
               order by p.orden`,
      parametros: [bloqueoId],
    },
  ]);
  if (!baja?.[0]) return null;

  const porCita = new Map<string, PropuestaReasignacion[]>();
  for (const f of propuestas ?? []) {
    const lista = porCita.get(String(f.cita_id)) ?? [];
    lista.push({
      medicoId: String(f.medico_id),
      medico: nombreCompleto(f.nombres, f.apellidos),
      inicio: aIso(f.inicio),
      fin: aIso(f.fin),
      mismoHorario: f.mismo_horario === true,
    });
    porCita.set(String(f.cita_id), lista);
  }
  return {
    baja: aBaja(baja[0]),
    citas: (citas ?? []).map((f) => ({
      id: String(f.cita_id),
      inicio: aIso(f.inicio),
      fin: aIso(f.fin),
      estado: String(f.estado) as EstadoCita,
      paciente: {
        id: String(f.paciente_id),
        nombres: String(f.nombres),
        apellidos: String(f.apellidos),
        tipoDocumento: String(f.tipo_documento) === "CE" ? "CE" : "DNI",
        documento: String(f.numero_documento),
        email: String(f.email),
        telefono: f.telefono === null || f.telefono === undefined ? null : String(f.telefono),
      },
      propuestas: porCita.get(String(f.cita_id)) ?? [],
    })),
  };
}
