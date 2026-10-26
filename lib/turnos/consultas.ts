// Lectura de datos de las pantallas de turnos del administrativo (specs/turnos-de-enfermeria; design.md, D5 y D8).
//
// Igual que `lib/citas/consultas.ts`: cada función recibe un `Ejecutor` (en producción, `ejecutorAutenticado` desde un Server Component,
// con la identidad del usuario: la RLS decide qué filas existen para el rol) y son lecturas puras. Las fechas de turno salen como texto
// `YYYY-MM-DD` (es una fecha de calendario de Lima, no un instante).
import { consultar, type Ejecutor, type Fila } from "../db/ejecutor.ts";
import { listarMedicos, type MedicoListado } from "../citas/consultas.ts";
import { sumarDias } from "../ui/calendario.ts";
import { esCausaDeAviso, type CausaDeAviso } from "./avisos.ts";
import { esFranja, ordenFranja, type Franja } from "./franjas.ts";

const nombreCompleto = (nombres: unknown, apellidos: unknown) => `${String(nombres)} ${String(apellidos)}`.trim();

function aFranja(valor: unknown): Franja {
  if (!esFranja(valor)) throw new Error(`Franja de turno desconocida: «${String(valor)}»`);
  return valor;
}

export interface TurnoDeSemana {
  id: string;
  enfermeraId: string;
  fecha: string;
  franja: Franja;
  // Con médico: su nombre y su especialidad (el servicio implícito). Un turno antiguo puede traer también `servicio`.
  medico: { id: string; nombre: string; especialidad: string; activo: boolean } | null;
  // Especialidad a la que se asignó el turno cuando no es con un médico (o además de él, en turnos antiguos).
  servicio: string | null;
}

export interface EnfermeraListada {
  id: string;
  nombre: string;
  activa: boolean;
}

export interface SemanaDeTurnos {
  enfermeras: EnfermeraListada[];
  turnos: TurnoDeSemana[];
}

function aTurno(f: Fila): TurnoDeSemana {
  return {
    id: String(f.id),
    enfermeraId: String(f.enfermera_id),
    fecha: String(f.fecha),
    franja: aFranja(f.turno),
    medico:
      f.medico_id === null || f.medico_id === undefined
        ? null
        : {
            id: String(f.medico_id),
            nombre: nombreCompleto(f.medico_nombres, f.medico_apellidos),
            especialidad: String(f.medico_especialidad),
            activo: f.medico_activo === true,
          },
    servicio: f.servicio === null || f.servicio === undefined ? null : String(f.servicio),
  };
}

const COLUMNAS_TURNO = `t.id, t.enfermera_id, t.fecha::text as fecha, t.turno::text as turno,
       t.medico_id, pm.nombres as medico_nombres, pm.apellidos as medico_apellidos, m.activo as medico_activo,
       em.nombre as medico_especialidad, es.nombre as servicio`;

const UNIONES_TURNO = `from public.turnos_enfermeria t
       left join public.medicos m on m.id = t.medico_id
       left join public.perfiles pm on pm.id = m.perfil_id
       left join public.especialidades em on em.id = m.especialidad_id
       left join public.especialidades es on es.id = t.especialidad_id`;

// Los turnos de la semana que empieza en `lunes` y las enfermeras que la componen: todas las activas y, si tienen turnos en esa
// semana, también las dadas de baja (su historia no se esconde). Orden: apellidos y nombres; los turnos, por fecha y franja.
export async function semanaDeTurnos(ejecutar: Ejecutor, lunes: string): Promise<SemanaDeTurnos> {
  const domingo = sumarDias(lunes, 6);
  const [filasTurnos = [], filasEnfermeras = []] = await ejecutar([
    {
      texto: `select ${COLUMNAS_TURNO}
                ${UNIONES_TURNO}
               where t.fecha between $1::date and $2::date
               order by t.fecha, t.turno`,
      parametros: [lunes, domingo],
    },
    {
      texto: `select e.id, p.nombres, p.apellidos, e.activo
                from public.enfermeras e
                join public.perfiles p on p.id = e.perfil_id
               where e.activo
                  or exists (select 1 from public.turnos_enfermeria t
                              where t.enfermera_id = e.id and t.fecha between $1::date and $2::date)
               order by p.apellidos, p.nombres`,
      parametros: [lunes, domingo],
    },
  ]);
  return {
    turnos: filasTurnos.map(aTurno),
    enfermeras: filasEnfermeras.map((f) => ({
      id: String(f.id),
      nombre: nombreCompleto(f.nombres, f.apellidos),
      activa: f.activo === true,
    })),
  };
}

export interface AvisoDeTurno {
  turnoId: string;
  enfermera: string;
  fecha: string;
  franja: Franja;
  // Nombre del médico del turno, o el servicio al que se asignó (turnos sin médico).
  medico: string | null;
  servicio: string | null;
  causas: CausaDeAviso[];
}

// Turnos de hoy en adelante que piden revisión (vista `turnos_enfermeria_con_aviso`): solo el administrativo recibe filas.
export async function avisosDeTurnos(ejecutar: Ejecutor): Promise<AvisoDeTurno[]> {
  const filas = await consultar(
    ejecutar,
    `select v.turno_id, v.enfermera_nombres, v.enfermera_apellidos, v.fecha::text as fecha, v.turno::text as turno,
            v.medico_nombres, v.medico_apellidos, es.nombre as servicio, v.causas
       from public.turnos_enfermeria_con_aviso v
       left join public.especialidades es on es.id = v.especialidad_id
      order by v.fecha, v.turno, v.enfermera_apellidos, v.enfermera_nombres`,
  );
  return filas.map((f) => ({
    turnoId: String(f.turno_id),
    enfermera: nombreCompleto(f.enfermera_nombres, f.enfermera_apellidos),
    fecha: String(f.fecha),
    franja: aFranja(f.turno),
    medico: f.medico_nombres === null || f.medico_nombres === undefined ? null : nombreCompleto(f.medico_nombres, f.medico_apellidos),
    servicio: f.servicio === null || f.servicio === undefined ? null : String(f.servicio),
    causas: (Array.isArray(f.causas) ? f.causas : []).map((c) => {
      if (!esCausaDeAviso(c)) throw new Error(`Causa de aviso desconocida: «${String(c)}»`);
      return c;
    }),
  }));
}

export interface CatalogosDeTurnos {
  enfermeras: EnfermeraListada[];
  medicos: MedicoListado[];
  servicios: Array<{ id: string; nombre: string }>;
}

// Lo que ofrecen los formularios de asignar y modificar: enfermeras activas, médicos activos y especialidades.
export async function catalogosDeTurnos(ejecutar: Ejecutor): Promise<CatalogosDeTurnos> {
  const [filasEnfermeras = [], filasServicios = []] = await ejecutar([
    {
      texto: `select e.id, p.nombres, p.apellidos, e.activo
                from public.enfermeras e join public.perfiles p on p.id = e.perfil_id
               where e.activo order by p.apellidos, p.nombres`,
    },
    { texto: `select id, nombre from public.especialidades order by nombre` },
  ]);
  return {
    enfermeras: filasEnfermeras.map((f) => ({ id: String(f.id), nombre: nombreCompleto(f.nombres, f.apellidos), activa: true })),
    medicos: await listarMedicos(ejecutar),
    servicios: filasServicios.map((f) => ({ id: String(f.id), nombre: String(f.nombre) })),
  };
}

export interface TurnoDetallado extends TurnoDeSemana {
  enfermera: EnfermeraListada;
}

// Un turno por su identificador (para la pantalla de modificar). `null` si no existe o la RLS no se lo muestra a quien llama.
export async function turnoPorId(ejecutar: Ejecutor, id: string): Promise<TurnoDetallado | null> {
  const filas = await consultar(
    ejecutar,
    `select ${COLUMNAS_TURNO}, pe.nombres as enfermera_nombres, pe.apellidos as enfermera_apellidos, e.activo as enfermera_activa
       ${UNIONES_TURNO}
       join public.enfermeras e on e.id = t.enfermera_id
       join public.perfiles pe on pe.id = e.perfil_id
      where t.id = $1::uuid`,
    [id],
  );
  const f = filas[0];
  if (!f) return null;
  return {
    ...aTurno(f),
    enfermera: {
      id: String(f.enfermera_id),
      nombre: nombreCompleto(f.enfermera_nombres, f.enfermera_apellidos),
      activa: f.enfermera_activa === true,
    },
  };
}

// Orden estable de los turnos de un día para mostrarlos: por franja.
export function ordenarPorFranja<T extends { franja: Franja }>(turnos: readonly T[]): T[] {
  return [...turnos].sort((a, b) => ordenFranja(a.franja) - ordenFranja(b.franja));
}
