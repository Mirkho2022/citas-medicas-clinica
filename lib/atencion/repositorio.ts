// Escritura de atenciones y addendas (openspec/changes/historias-clinicas: specs/registro-de-atencion y firma-y-addendas;
// design.md, D3, D5 y D10). Cada función recibe un `Ejecutor` (lib/db/ejecutor.ts): valida la entrada con Zod ANTES de tocar la
// base de datos, ejecuta con la identidad del usuario (la RLS decide) en UNA transacción y traduce los errores de Postgres con
// `traducirErrorAtencion`. La guarda de rol y MFA vive en `casos-de-uso.ts` y la Server Action solo llama a ese caso de uso.
//
// Principios (riesgo principal del proyecto: historias clínicas):
//  - Nada de identidad viene del cliente: el médico es `public.medico_actual()` (sesión), la historia se resuelve bajo RLS desde
//    el paciente (`insert ... select ... from historias_clinicas`: sin acceso, no hay historia visible y se inserta cero filas).
//  - La hora de creación y de firma, y la huella, las fija la base (disparador de sello): ninguna sentencia las envía.
//  - «Guardar y firmar» es UNA transacción: `firmar_atencion()` falla si no firma, y la transacción completa se revierte.
//  - Un error de la base nunca llega al cliente en crudo; sin contenido clínico en logs.
import {
  exito,
  fallo,
  falloPorValidacion,
  type ResultadoAccion,
} from "../acciones/resultado.ts";
import type { Ejecutor, Fila, Sentencia } from "../db/ejecutor.ts";
import {
  addendaSchema,
  atencionNuevaSchema,
  borradorSchema,
  firmarAtencionSchema,
  type DiagnosticoEntrada,
} from "../schemas/atencion.ts";
import {
  MENSAJE_ATENCION_FIRMADA,
  MENSAJE_ES_BORRADOR,
  MENSAJE_FIRMA_NO_SOPORTADA,
  MENSAJE_NO_ES_AUTOR,
  MENSAJE_SIN_ACCESO,
  traducirErrorAtencion,
  type FalloAtencion,
} from "./errores.ts";
import type { ProveedorFirma } from "./firma/proveedor.ts";

export type ResultadoAtencion<T> = Exclude<ResultadoAccion<T>, { ok: false }> | FalloAtencion;

export interface AtencionGuardada {
  id: string;
  // Hora de la firma fijada por el servidor (ISO 8601) o `null` si quedó como borrador.
  firmadaEn: string | null;
}

export interface OpcionesRegistro {
  // El `id` de la atención lo genera el servidor (nunca el cliente): permite insertar y firmar en la misma transacción.
  generarId?: () => string;
  proveedorFirma: ProveedorFirma;
}

function textoISO(valor: unknown): string | null {
  if (valor instanceof Date) return valor.toISOString();
  return typeof valor === "string" ? valor : null;
}

// El cliente envía solo `cie10` y `tipo`; la base pone la descripción del catálogo.
function diagnosticosJson(diagnosticos: readonly DiagnosticoEntrada[]): string {
  return JSON.stringify(diagnosticos.map((d) => ({ cie10: d.cie10, tipo: d.tipo })));
}

const SQL_FIRMAR = "select public.firmar_atencion($1::uuid) as firmada_en";

// Resultado de una firma que debe poder hacerse: si el proveedor devuelve un método que la base no soporta, no se firma.
async function prepararFirma(proveedor: ProveedorFirma, atencionId: string): Promise<FalloAtencion | null> {
  const constancia = await proveedor.firmar({ atencionId });
  if (constancia.metodo !== "logica") return fallo("ERROR_INTERNO", MENSAJE_FIRMA_NO_SOPORTADA);
  return null;
}

// Registra una atención nueva a nombre del médico de la sesión; con `firmar`, la guarda y la firma en una sola transacción.
export async function registrarAtencion(
  ejecutar: Ejecutor,
  entrada: unknown,
  opciones: OpcionesRegistro,
): Promise<ResultadoAtencion<AtencionGuardada>> {
  const validada = atencionNuevaSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);
  const a = validada.data;

  const id = (opciones.generarId ?? (() => crypto.randomUUID()))();
  if (a.firmar) {
    const rechazo = await prepararFirma(opciones.proveedorFirma, id);
    if (rechazo) return rechazo;
  }

  const sentencias: Sentencia[] = [
    {
      // La historia sale de `historias_clinicas` bajo RLS: sin médico a cargo no hay fila y no se inserta nada.
      texto: `insert into public.atenciones
                (id, historia_id, paciente_id, cita_id, medico_id, motivo_consulta, anamnesis, examen_fisico, diagnosticos, plan_tratamiento)
              select $1::uuid, h.id, h.paciente_id, $3::uuid, public.medico_actual(), $4, $5, $6, $7::jsonb, $8
                from public.historias_clinicas h
               where h.paciente_id = $2::uuid
              returning id`,
      parametros: [id, a.paciente_id, a.cita_id, a.motivo_consulta, a.anamnesis, a.examen_fisico, diagnosticosJson(a.diagnosticos), a.plan_tratamiento],
    },
  ];
  if (a.firmar) sentencias.push({ texto: SQL_FIRMAR, parametros: [id] });

  try {
    const resultados = await ejecutar(sentencias);
    if ((resultados[0] ?? []).length === 0) {
      // La RLS no mostró la historia: sin acceso (no se confirma si el paciente existe).
      return { ...fallo("NO_AUTORIZADO", MENSAJE_SIN_ACCESO), causa: "sin_acceso" };
    }
    return exito({ id, firmadaEn: a.firmar ? textoISO((resultados[1] ?? [])[0]?.firmada_en) : null });
  } catch (error) {
    return traducirErrorAtencion(error, "registrar");
  }
}

// Edita el borrador (solo su autor, mientras no esté firmado); con `firmar`, lo guarda y lo firma en la misma transacción.
export async function actualizarBorrador(
  ejecutar: Ejecutor,
  entrada: unknown,
  opciones: Pick<OpcionesRegistro, "proveedorFirma">,
): Promise<ResultadoAtencion<AtencionGuardada>> {
  const validada = borradorSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);
  const a = validada.data;

  if (a.firmar) {
    const rechazo = await prepararFirma(opciones.proveedorFirma, a.atencion_id);
    if (rechazo) return rechazo;
  }

  const sentencias: Sentencia[] = [
    {
      // La política de UPDATE solo deja pasar al autor, a cargo del paciente y con la atención sin firmar.
      texto: `update public.atenciones
                 set motivo_consulta = $2, anamnesis = $3, examen_fisico = $4, diagnosticos = $5::jsonb, plan_tratamiento = $6
               where id = $1::uuid
              returning id`,
      parametros: [a.atencion_id, a.motivo_consulta, a.anamnesis, a.examen_fisico, diagnosticosJson(a.diagnosticos), a.plan_tratamiento],
    },
    {
      // Para explicar un UPDATE de cero filas sin revelar nada: solo ve la atención quien ya tiene acceso a ella.
      texto: `select firmada_en is not null as firmada, medico_id = public.medico_actual() as es_autor
                from public.atenciones where id = $1::uuid`,
      parametros: [a.atencion_id],
    },
  ];
  if (a.firmar) sentencias.push({ texto: SQL_FIRMAR, parametros: [a.atencion_id] });

  try {
    const resultados = await ejecutar(sentencias);
    if ((resultados[0] ?? []).length === 0) return explicarCeroFilas(resultados[1] ?? []);
    return exito({ id: a.atencion_id, firmadaEn: a.firmar ? textoISO((resultados[2] ?? [])[0]?.firmada_en) : null });
  } catch (error) {
    return traducirErrorAtencion(error, "actualizar");
  }
}

function explicarCeroFilas(visible: Fila[]): FalloAtencion {
  const fila = visible[0];
  if (!fila) return { ...fallo("NO_AUTORIZADO", MENSAJE_SIN_ACCESO), causa: "sin_acceso" };
  if (fila.firmada === true) return { ...fallo("NO_AUTORIZADO", MENSAJE_ATENCION_FIRMADA), causa: "firmada" };
  return { ...fallo("NO_AUTORIZADO", MENSAJE_NO_ES_AUTOR), causa: "no_es_autor" };
}

// Firma una atención ya guardada (solo su autor). La hora y la huella las fija la base.
export async function firmarAtencion(
  ejecutar: Ejecutor,
  entrada: unknown,
  opciones: Pick<OpcionesRegistro, "proveedorFirma">,
): Promise<ResultadoAtencion<AtencionGuardada>> {
  const validada = firmarAtencionSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);
  const { atencion_id: id } = validada.data;

  const rechazo = await prepararFirma(opciones.proveedorFirma, id);
  if (rechazo) return rechazo;

  try {
    const [filas] = await ejecutar([{ texto: SQL_FIRMAR, parametros: [id] }]);
    return exito({ id, firmadaEn: textoISO((filas ?? [])[0]?.firmada_en) });
  } catch (error) {
    return traducirErrorAtencion(error, "firmar");
  }
}

export interface AddendaGuardada {
  id: string;
}

// Agrega una addenda a una atención FIRMADA, a nombre del médico de la sesión (la hora la fija la base).
export async function agregarAddenda(ejecutar: Ejecutor, entrada: unknown): Promise<ResultadoAtencion<AddendaGuardada>> {
  const validada = addendaSchema.safeParse(entrada);
  if (!validada.success) return falloPorValidacion(validada.error);
  const { atencion_id, texto } = validada.data;

  try {
    const [insertadas, visible] = await ejecutar([
      {
        // `from atenciones` va bajo RLS: sin médico a cargo no hay atención visible y no se inserta nada.
        texto: `insert into public.addendas (atencion_id, medico_id, texto)
                select a.id, public.medico_actual(), $2
                  from public.atenciones a
                 where a.id = $1::uuid and a.firmada_en is not null
                returning id`,
        parametros: [atencion_id, texto],
      },
      { texto: "select firmada_en is not null as firmada from public.atenciones where id = $1::uuid", parametros: [atencion_id] },
    ]);
    const id = (insertadas ?? [])[0]?.id;
    if (typeof id === "string") return exito({ id });
    const existe = (visible ?? [])[0];
    if (existe && existe.firmada !== true) return { ...fallo("DATOS_INVALIDOS", MENSAJE_ES_BORRADOR), causa: "es_borrador" };
    return { ...fallo("NO_AUTORIZADO", MENSAJE_SIN_ACCESO), causa: "sin_acceso" };
  } catch (error) {
    return traducirErrorAtencion(error, "addenda");
  }
}
