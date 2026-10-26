// Vista de la enfermera: sus turnos de hoy a los próximos 14 días y con qué médico o servicio trabaja
// (specs/turnos-de-enfermeria, «La enfermera ve su turno y con quién trabaja, y nada más»; design.md, D7).
//
// Es UNA consulta a `turnos_enfermeria` con `medicos`, `perfiles` y `especialidades`, sin vista y SIN NINGUNA POLÍTICA NUEVA: la RLS
// ya limita sus filas (`turnos_lee_la_enfermera_propia`) y le deja resolver el nombre y la especialidad del médico
// (`medicos_lee_todo_rol`, `perfiles_lee_los_medicos`, `especialidades_lee_todo_rol`). Como defensa en profundidad la consulta también
// filtra por `enfermera_actual()`; la RLS es la autoridad. Nada más sale de aquí: ni pacientes, ni citas, ni turnos de otras enfermeras.
// «Hoy» es el día de Lima según la base de datos (`hoy_lima()`), no el del servidor de la aplicación.
import type { Ejecutor } from "../db/ejecutor.ts";
import { esFranja, type Franja } from "./franjas.ts";

// Días hacia adelante que cubre la pantalla además de hoy.
export const DIAS_HACIA_ADELANTE = 14;

export interface MiTurno {
  id: string;
  fecha: string;
  franja: Franja;
  medico: { nombre: string; especialidad: string; activo: boolean } | null;
  // Servicio (especialidad) al que se asignó el turno; con médico, solo en turnos antiguos que guardan ambos.
  servicio: string | null;
}

export interface MisTurnos {
  // `hoy_lima()`: la fecha de hoy en Lima (`YYYY-MM-DD`).
  hoy: string;
  hoyTurnos: MiTurno[];
  proximos: MiTurno[];
}

// El texto SQL se exporta para que la prueba pgTAP 83 ejecute exactamente la misma consulta con la sesión de la enfermera.
export const SQL_MIS_TURNOS = `select t.id, t.fecha::text as fecha, t.turno::text as turno,
       pm.nombres as medico_nombres, pm.apellidos as medico_apellidos, m.activo as medico_activo,
       em.nombre as medico_especialidad, es.nombre as servicio
  from public.turnos_enfermeria t
  left join public.medicos m on m.id = t.medico_id
  left join public.perfiles pm on pm.id = m.perfil_id
  left join public.especialidades em on em.id = m.especialidad_id
  left join public.especialidades es on es.id = t.especialidad_id
 where t.enfermera_id = (select public.enfermera_actual())
   and t.fecha >= public.hoy_lima()
   and t.fecha <= public.hoy_lima() + ${DIAS_HACIA_ADELANTE}
 order by t.fecha, t.turno`;

export async function misTurnos(ejecutar: Ejecutor): Promise<MisTurnos> {
  // Misma transacción para los turnos y para «hoy»: aunque no haya turnos, la pantalla sabe qué día es en Lima.
  const [filas = [], dia = []] = await ejecutar([{ texto: SQL_MIS_TURNOS }, { texto: "select public.hoy_lima()::text as hoy" }]);
  const hoy = String(dia[0]?.hoy ?? "");
  const turnos: MiTurno[] = filas.map((f) => {
    if (!esFranja(f.turno)) throw new Error(`Franja de turno desconocida: «${String(f.turno)}»`);
    const conMedico = f.medico_nombres !== null && f.medico_nombres !== undefined;
    return {
      id: String(f.id),
      fecha: String(f.fecha),
      franja: f.turno,
      medico: conMedico
        ? {
            nombre: `${String(f.medico_nombres)} ${String(f.medico_apellidos)}`.trim(),
            especialidad: String(f.medico_especialidad),
            activo: f.medico_activo === true,
          }
        : null,
      servicio: f.servicio === null || f.servicio === undefined ? null : String(f.servicio),
    };
  });
  return {
    hoy,
    hoyTurnos: turnos.filter((t) => t.fecha === hoy),
    proximos: turnos.filter((t) => t.fecha !== hoy),
  };
}
