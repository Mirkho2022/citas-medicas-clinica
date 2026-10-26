// Operaciones de los turnos de enfermería: asignar, modificar y quitar (specs/turnos-de-enfermeria; design.md, D6).
//
// Igual que `lib/citas/*.ts`: cada función recibe un `Ejecutor` (en producción, `ejecutorAutenticado`, con la identidad del
// usuario: la RLS decide qué puede escribir cada rol) y devuelve un `ResultadoAccion`; nunca deja escapar la excepción de Postgres.
// La guarda de rol y MFA, y el refresco de pantallas, están en `lib/turnos/casos-de-uso.ts`.
//
// Cómo se leen y escriben las cosas. La transacción HTTP de Neon no es interactiva: las sentencias de una llamada van juntas, en una
// transacción, y no se puede decidir entre una y otra. Por eso cada operación manda DOS sentencias:
//   1. una LECTURA del estado (el día de hoy en Lima según la base de datos, el rol, y si la enfermera y el médico siguen
//      activos), que solo sirve para dar el mensaje preciso cuando algo falla;
//   2. la ESCRITURA, que repite esas mismas condiciones en su propio `WHERE` y devuelve la fila afectada. Si una condición no se
//      cumple, no afecta ninguna fila: ni siquiera ante una carrera entre la lectura y la escritura se asigna un turno en el pasado
//      ni a alguien dado de baja en ese instante (la ventana que design.md, D6 aceptaba queda cerrada, a precio de nada).
// La unicidad `(enfermera_id, fecha, turno)` la impone el motor (`23505`), también entre dos administrativos a la vez.
//
// Si la escritura no afectó ninguna fila: un rol sin permiso → «No tiene permiso…»; fecha pasada o personal de baja → el mensaje
// de `validarContraEstado`; el turno no existe → «El turno ya no existe».
import {
  exito,
  fallo,
  falloPorValidacion,
  MENSAJE_ERROR_INTERNO,
  type ResultadoAccion,
} from "../acciones/resultado.ts";
import type { Ejecutor, Fila } from "../db/ejecutor.ts";
import { turnoActualizacionSchema, turnoRefSchema, turnoSchema } from "../schemas/turno.ts";
import {
  MENSAJE_SIN_PERMISO_TURNOS,
  SIN_FILA_AFECTADA,
  traducirErrorTurno,
  validarContraEstado,
} from "./errores.ts";

const ES_ADMINISTRATIVO = "administrativo";

const sinPermiso = () => fallo("NO_AUTORIZADO", MENSAJE_SIN_PERMISO_TURNOS);

// `bool` de una columna que puede venir nula (la fila no existe o la RLS no la muestra).
function bool(valor: unknown): boolean | null {
  return typeof valor === "boolean" ? valor : null;
}

// Asignar un turno: `insert … select … where` con las condiciones de fecha y de personal activo dentro de la propia escritura.
export async function asignarTurno(ejecutar: Ejecutor, entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  const validada = turnoSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);
  const { enfermera_id, fecha, turno, medico_id, especialidad_id } = validada.data;

  let estado: Fila[];
  let insertadas: Fila[];
  try {
    [estado = [], insertadas = []] = await ejecutar([
      {
        texto: `select public.hoy_lima()::text as hoy,
                       public.rol_actual()::text as rol,
                       (select e.activo from public.enfermeras e where e.id = $1::uuid) as enfermera_activa,
                       (select m.activo from public.medicos m where m.id = $2::uuid) as medico_activo`,
        parametros: [enfermera_id, medico_id ?? null],
      },
      {
        texto: `insert into public.turnos_enfermeria (enfermera_id, fecha, turno, medico_id, especialidad_id)
                select $1::uuid, $3::date, $4::public.tipo_turno, $2::uuid, $5::uuid
                 where $3::date >= public.hoy_lima()
                   and exists (select 1 from public.enfermeras e where e.id = $1::uuid and e.activo)
                   and ($2::uuid is null or exists (select 1 from public.medicos m where m.id = $2::uuid and m.activo))
                returning id`,
        parametros: [enfermera_id, medico_id ?? null, fecha, turno, especialidad_id ?? null],
      },
    ]);
  } catch (error) {
    return traducirErrorTurno(error);
  }

  if (insertadas.length === 1) return exito({ id: String(insertadas[0]!.id) });

  // Ninguna fila: ¿no tiene permiso, o no se cumplió una condición?
  const leido = estado[0] ?? {};
  if (leido.rol !== ES_ADMINISTRATIVO) return sinPermiso();
  return (
    validarContraEstado({
      operacion: "asignar",
      hoy: String(leido.hoy),
      fecha,
      enfermeraActiva: bool(leido.enfermera_activa),
      medicoActivo: medico_id === undefined ? undefined : bool(leido.medico_activo),
    }) ?? fallo("ERROR_INTERNO", MENSAJE_ERROR_INTERNO)
  );
}

// Modificar un turno de hoy o futuro: la franja, el médico o el servicio. La enfermera y la fecha no cambian.
export async function actualizarTurno(ejecutar: Ejecutor, entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  const validada = turnoActualizacionSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);
  const { id, turno, medico_id, especialidad_id } = validada.data;

  let estado: Fila[];
  let actualizadas: Fila[];
  try {
    [estado = [], actualizadas = []] = await ejecutar([
      {
        // `left join`: devuelve siempre una fila; con `fecha` nula si el turno no existe o la RLS no lo muestra.
        texto: `select public.hoy_lima()::text as hoy,
                       public.rol_actual()::text as rol,
                       t.fecha::text as fecha,
                       (select e.activo from public.enfermeras e where e.id = t.enfermera_id) as enfermera_activa,
                       (select m.activo from public.medicos m where m.id = $2::uuid) as medico_activo
                  from (select 1) s
                  left join public.turnos_enfermeria t on t.id = $1::uuid`,
        parametros: [id, medico_id ?? null],
      },
      {
        texto: `update public.turnos_enfermeria t
                   set turno = $3::public.tipo_turno, medico_id = $2::uuid, especialidad_id = $4::uuid
                 where t.id = $1::uuid
                   and t.fecha >= public.hoy_lima()
                   and exists (select 1 from public.enfermeras e where e.id = t.enfermera_id and e.activo)
                   and ($2::uuid is null or exists (select 1 from public.medicos m where m.id = $2::uuid and m.activo))
                returning t.id`,
        parametros: [id, medico_id ?? null, turno, especialidad_id ?? null],
      },
    ]);
  } catch (error) {
    return traducirErrorTurno(error);
  }

  if (actualizadas.length === 1) return exito({ id: String(actualizadas[0]!.id) });

  const leido = estado[0] ?? {};
  if (leido.rol !== ES_ADMINISTRATIVO) return sinPermiso();
  if (leido.fecha === null || leido.fecha === undefined) return traducirErrorTurno(SIN_FILA_AFECTADA);
  return (
    validarContraEstado({
      operacion: "modificar",
      hoy: String(leido.hoy),
      fecha: String(leido.fecha),
      enfermeraActiva: bool(leido.enfermera_activa),
      medicoActivo: medico_id === undefined ? undefined : bool(leido.medico_activo),
    }) ?? fallo("ERROR_INTERNO", MENSAJE_ERROR_INTERNO)
  );
}

// Quitar un turno de hoy o futuro. Los de fechas pasadas se conservan como registro de quién trabajó.
export async function quitarTurno(ejecutar: Ejecutor, entrada: unknown): Promise<ResultadoAccion<void>> {
  const validada = turnoRefSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);
  const { id } = validada.data;

  let estado: Fila[];
  let borradas: Fila[];
  try {
    [estado = [], borradas = []] = await ejecutar([
      {
        texto: `select public.hoy_lima()::text as hoy, public.rol_actual()::text as rol, t.fecha::text as fecha
                  from (select 1) s
                  left join public.turnos_enfermeria t on t.id = $1::uuid`,
        parametros: [id],
      },
      {
        texto: `delete from public.turnos_enfermeria where id = $1::uuid and fecha >= public.hoy_lima() returning id`,
        parametros: [id],
      },
    ]);
  } catch (error) {
    return traducirErrorTurno(error);
  }

  if (borradas.length === 1) return exito();

  const leido = estado[0] ?? {};
  if (leido.rol !== ES_ADMINISTRATIVO) return sinPermiso();
  if (leido.fecha === null || leido.fecha === undefined) return traducirErrorTurno(SIN_FILA_AFECTADA);
  return (
    validarContraEstado({
      operacion: "quitar",
      hoy: String(leido.hoy),
      fecha: String(leido.fecha),
      enfermeraActiva: true,
    }) ?? fallo("ERROR_INTERNO", MENSAJE_ERROR_INTERNO)
  );
}
