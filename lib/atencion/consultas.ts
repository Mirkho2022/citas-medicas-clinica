// Lecturas de las pantallas de registro de atención (formulario nuevo y detalle/edición de una atención). Cada lectura que ENTREGA
// contenido clínico (antecedentes, atenciones, addendas) va en UNA transacción cuya primera sentencia registra el acceso en
// `accesos_historia` (ADR-0003; design.md, D2): la política exige médico a cargo y actor = perfil de la sesión, así que si el
// acceso no se puede registrar la transacción se revierte y NO se devuelve contenido.
//
// Un acceso denegado (42501) no revela si el paciente existe: solo si el médico ya puede ver al paciente (tiene con él una cita
// reservada o confirmada, política «médico con relación») se le explica que la historia aún no está habilitada; en cualquier
// otro caso es «no existe» (404 uniforme).
import type { Ejecutor, Fila, Sentencia } from "../db/ejecutor.ts";
import { sqlstateDe } from "../citas/errores.ts";

const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (valor: unknown): valor is string => typeof valor === "string" && FORMA_UUID.test(valor);

export interface FichaPaciente {
  id: string;
  tipoDocumento: "DNI" | "CE";
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  fechaNacimiento: string;
  sexo: string;
}

export interface AntecedenteVigente {
  id: string;
  tipo: string;
  descripcion: string;
}

export interface DiagnosticoGuardado {
  cie10: string;
  descripcion: string;
  tipo?: string;
}

export interface AddendaDetalle {
  id: string;
  texto: string;
  creadaEn: string;
  autor: string;
}

export interface AtencionDetalle {
  id: string;
  citaId: string | null;
  // Estado de la cita vinculada (solo si es del médico que lee), para ofrecer «Marcar cita como atendida».
  citaEstado: string | null;
  motivoConsulta: string;
  anamnesis: string;
  examenFisico: string;
  diagnosticos: DiagnosticoGuardado[];
  planTratamiento: string;
  firmadaEn: string | null;
  creadaEn: string;
  esAutor: boolean;
  autor: string;
  addendas: AddendaDetalle[];
}

export type Apertura<T> =
  | { estado: "ok"; datos: T }
  | { estado: "no_habilitada" } // el médico ve al paciente pero aún no lo tiene a cargo
  | { estado: "no_existe" } // 404 uniforme: ajeno e inexistente son indistinguibles
  | { estado: "error" };

// Abrir el formulario de una atención nueva deja un acceso de tipo `historia` (no hay atención todavía). Abrir una atención existente deja un
// acceso de tipo `atencion` con su identificador: la política de `accesos_historia` exige que esa atención exista y sea del mismo paciente.
const SQL_ACCESO = `insert into public.accesos_historia (actor_id, paciente_id)
                    values (public.perfil_actual(), $1::uuid)`;
const SQL_ACCESO_ATENCION = `insert into public.accesos_historia (actor_id, paciente_id, tipo_acceso, atencion_id)
                             values (public.perfil_actual(), $1::uuid, 'atencion', $2::uuid)`;

const SQL_PACIENTE = `select id, tipo_documento::text as tipo_documento, numero_documento, nombres, apellidos,
                             fecha_nacimiento::text as fecha_nacimiento, sexo::text as sexo
                        from public.pacientes where id = $1::uuid`;

const SQL_ANTECEDENTES = `select id, tipo::text as tipo, descripcion
                            from public.antecedentes
                           where paciente_id = $1::uuid and vigente
                           order by tipo, creado_en`;

function aFicha(fila: Fila | undefined): FichaPaciente | null {
  if (!fila) return null;
  return {
    id: String(fila.id),
    tipoDocumento: fila.tipo_documento === "CE" ? "CE" : "DNI",
    numeroDocumento: String(fila.numero_documento),
    nombres: String(fila.nombres),
    apellidos: String(fila.apellidos),
    fechaNacimiento: String(fila.fecha_nacimiento),
    sexo: String(fila.sexo),
  };
}

function aAntecedentes(filas: Fila[] | undefined): AntecedenteVigente[] {
  return (filas ?? []).map((f) => ({ id: String(f.id), tipo: String(f.tipo), descripcion: String(f.descripcion) }));
}

function textoISO(valor: unknown): string {
  return valor instanceof Date ? valor.toISOString() : String(valor);
}

// Tras un 42501: ¿el médico ya ve al paciente (cita reservada o confirmada)? Si sí, «no habilitada»; si no, «no existe».
async function distinguirDenegado(ejecutar: Ejecutor, pacienteId: string): Promise<Apertura<never>> {
  try {
    const [filas] = await ejecutar([{ texto: "select id from public.pacientes where id = $1::uuid", parametros: [pacienteId] }]);
    return (filas ?? []).length > 0 ? { estado: "no_habilitada" } : { estado: "no_existe" };
  } catch {
    return { estado: "no_existe" };
  }
}

export interface DatosFormularioNuevo {
  paciente: FichaPaciente;
  antecedentes: AntecedenteVigente[];
  // Cita vinculable (del médico y de este paciente) con su motivo, para prellenar el formulario. `null` si no hay o no es válida.
  cita: { id: string; motivo: string | null } | null;
}

export async function abrirFormularioNuevo(
  ejecutar: Ejecutor,
  pacienteId: string,
  citaId: string | null,
): Promise<Apertura<DatosFormularioNuevo>> {
  if (!esUuid(pacienteId)) return { estado: "no_existe" };
  const sentencias: Sentencia[] = [
    { texto: SQL_ACCESO, parametros: [pacienteId] },
    { texto: SQL_PACIENTE, parametros: [pacienteId] },
    { texto: SQL_ANTECEDENTES, parametros: [pacienteId] },
  ];
  const conCita = esUuid(citaId);
  if (conCita) {
    // La cita se lee bajo la política «el médico ve su agenda»; además se exige que sea suya y de este paciente.
    // Una cita que ya tiene atención no se ofrece para vincular (el `unique` la rechazaría).
    sentencias.push({
      texto: `select c.id, c.motivo from public.citas c
               where c.id = $1::uuid and c.paciente_id = $2::uuid and c.medico_id = public.medico_actual()
                 and not exists (select 1 from public.atenciones a where a.cita_id = c.id)`,
      parametros: [citaId, pacienteId],
    });
  }
  try {
    const r = await ejecutar(sentencias);
    const paciente = aFicha((r[1] ?? [])[0]);
    if (!paciente) return { estado: "no_existe" };
    const filaCita = conCita ? (r[3] ?? [])[0] : undefined;
    return {
      estado: "ok",
      datos: {
        paciente,
        antecedentes: aAntecedentes(r[2]),
        cita: filaCita ? { id: String(filaCita.id), motivo: typeof filaCita.motivo === "string" ? filaCita.motivo : null } : null,
      },
    };
  } catch (error) {
    if (sqlstateDe(error) === "42501") return distinguirDenegado(ejecutar, pacienteId);
    console.error(`[atención:abrir] error inesperado (sqlstate=${sqlstateDe(error) ?? "n/a"})`);
    return { estado: "error" };
  }
}

export interface DatosAtencion {
  paciente: FichaPaciente;
  antecedentes: AntecedenteVigente[];
  atencion: AtencionDetalle;
}

export async function abrirAtencion(
  ejecutar: Ejecutor,
  pacienteId: string,
  atencionId: string,
): Promise<Apertura<DatosAtencion>> {
  if (!esUuid(pacienteId) || !esUuid(atencionId)) return { estado: "no_existe" };
  try {
    const r = await ejecutar([
      { texto: SQL_ACCESO_ATENCION, parametros: [pacienteId, atencionId] },
      { texto: SQL_PACIENTE, parametros: [pacienteId] },
      { texto: SQL_ANTECEDENTES, parametros: [pacienteId] },
      {
        texto: `select a.id, a.cita_id, c.estado::text as cita_estado, a.motivo_consulta, a.anamnesis, a.examen_fisico, a.diagnosticos, a.plan_tratamiento,
                       a.firmada_en, a.creado_en, a.medico_id = public.medico_actual() as es_autor,
                       coalesce(pf.nombres || ' ' || pf.apellidos, 'Médico') as autor
                  from public.atenciones a
                  join public.medicos m on m.id = a.medico_id
                  left join public.perfiles pf on pf.id = m.perfil_id
                  left join public.citas c on c.id = a.cita_id
                 where a.id = $1::uuid and a.paciente_id = $2::uuid`,
        parametros: [atencionId, pacienteId],
      },
      {
        texto: `select ad.id, ad.texto, ad.creado_en, coalesce(pf.nombres || ' ' || pf.apellidos, 'Médico') as autor
                  from public.addendas ad
                  join public.atenciones a on a.id = ad.atencion_id
                  join public.medicos m on m.id = ad.medico_id
                  left join public.perfiles pf on pf.id = m.perfil_id
                 where ad.atencion_id = $1::uuid and a.paciente_id = $2::uuid
                 order by ad.creado_en, ad.id`,
        parametros: [atencionId, pacienteId],
      },
    ]);
    const paciente = aFicha((r[1] ?? [])[0]);
    const a = (r[3] ?? [])[0];
    if (!paciente || !a) return { estado: "no_existe" };
    const diagnosticos = Array.isArray(a.diagnosticos) ? (a.diagnosticos as DiagnosticoGuardado[]) : [];
    return {
      estado: "ok",
      datos: {
        paciente,
        antecedentes: aAntecedentes(r[2]),
        atencion: {
          id: String(a.id),
          citaId: typeof a.cita_id === "string" ? a.cita_id : null,
          citaEstado: typeof a.cita_estado === "string" ? a.cita_estado : null,
          motivoConsulta: String(a.motivo_consulta),
          anamnesis: String(a.anamnesis),
          examenFisico: String(a.examen_fisico),
          diagnosticos,
          planTratamiento: String(a.plan_tratamiento),
          firmadaEn: a.firmada_en ? textoISO(a.firmada_en) : null,
          creadaEn: textoISO(a.creado_en),
          esAutor: a.es_autor === true,
          autor: String(a.autor),
          addendas: (r[4] ?? []).map((f) => ({
            id: String(f.id),
            texto: String(f.texto),
            creadaEn: textoISO(f.creado_en),
            autor: String(f.autor),
          })),
        },
      },
    };
  } catch (error) {
    if (sqlstateDe(error) === "42501") return distinguirDenegado(ejecutar, pacienteId);
    console.error(`[atención:abrir] error inesperado (sqlstate=${sqlstateDe(error) ?? "n/a"})`);
    return { estado: "error" };
  }
}
