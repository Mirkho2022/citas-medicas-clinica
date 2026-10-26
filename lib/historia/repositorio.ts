// ÚNICO punto de lectura de contenido clínico (openspec/changes/historias-clinicas, design.md D2; specs/auditoria-de-accesos-
// clinicos). Todo SQL contra `atenciones`, `addendas`, `antecedentes`, `historias_clinicas`, `adjuntos_historia`,
// `asignaciones_paciente_medico` y `accesos_historia` vive en `lib/historia/`; `tests/historia/acceso-unico.test.ts` falla si
// otro archivo de `app/`, `lib/` o `components/` lo hace.
//
// LECTURA ATÓMICA CON AUDITORÍA. Cada función que ENTREGA contenido clínico de un paciente arma UNA sola transacción
// (`Ejecutor`: las sentencias van en orden y, si una falla, se revierte todo y no se devuelve nada) con este orden fijo:
//   1. el preludio (hoy vacío; ahí va la guarda del modo de datos clínicos cuando se construya el grupo 1 del change);
//   2. `insert into accesos_historia` — la política exige que el médico tenga al paciente a cargo y que el actor sea él mismo;
//   3. las lecturas del contenido.
// Como la transacción es una, si el paso 2 es rechazado (asignación vencida, perfil desactivado, paciente ajeno o inexistente…)
// la base responde 42501, se revierte todo y el paso 3 no entrega nada: NO se muestra contenido sin su registro de acceso. Cada
// solicitud que devuelve contenido deja su propio registro (no se deduplica).
//
// QUÉ SE DEVUELVE ANTE UN RECHAZO. Un 42501 no dice por qué. Para distinguir «la historia aún no está habilitada» de «no existe»
// sin filtrar información, una segunda consulta pregunta, bajo la misma RLS, si el médico tiene al paciente a cargo y si ya puede
// verlo (cita reservada o confirmada). Solo ese caso (visible y sin asignación) responde `no_habilitada`; todo lo demás es
// `no_encontrada`, igual que un paciente que no existe, que uno que tiene otro médico o que una asignación vencida.
//
// Los errores inesperados se registran SOLO con la operación y el SQLSTATE (nunca el texto de la base ni datos del paciente) y se
// relanzan como un error genérico sin `cause`.
import { sqlstateDe } from "../citas/errores.ts";
import type { Ejecutor, Fila, Sentencia } from "../db/ejecutor.ts";
import { ORIGEN_TILDES, DESTINO_TILDES, patronesDeBusqueda } from "./busqueda.ts";
import { identificadorValido, TAMANO_PAGINA_ATENCIONES } from "./esquemas.ts";
import {
  TIPOS_ANTECEDENTE,
  type Addenda,
  type Antecedente,
  type AtencionAbierta,
  type AtencionConAddendas,
  type BorradorSinFirmar,
  type Diagnostico,
  type DiagnosticoRegistrado,
  type FichaPaciente,
  type HistoriaAbierta,
  type ListaDePacientes,
  type PacienteACargo,
  type ResultadoApertura,
  type SexoPaciente,
  type TipoAntecedente,
  type TipoDocumento,
} from "./tipos.ts";

// Máximo de pacientes que muestra la lista; se piden uno más para saber si hay más coincidencias.
export const LIMITE_LISTA_PACIENTES = 50;
// Cuántas atenciones firmadas se leen para armar «Diagnósticos registrados» y cuántos borradores se listan.
const LIMITE_ATENCIONES_PARA_DIAGNOSTICOS = 200;
const LIMITE_BORRADORES = 20;

export class ErrorDeLecturaClinica extends Error {
  constructor() {
    super("No se pudo leer la historia clínica");
    this.name = "ErrorDeLecturaClinica";
  }
}

// ---- Sentencias ----

// Primer paso de toda transacción clínica. Hoy no hay nada: la guarda del modo de datos clínicos (`select
// public.exigir_modo_clinico(...)`, design.md D1) la añade el grupo 1 del change AQUÍ, para que vaya siempre antes del acceso.
function preludio(): Sentencia[] {
  return [];
}

// Instante de la base como texto ISO en UTC: no depende de cómo el driver convierta `timestamptz`.
const iso = (columna: string): string => `to_char(${columna} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const normalizado = (expresion: string): string =>
  `translate(lower(${expresion}), '${ORIGEN_TILDES}', '${DESTINO_TILDES}')`;

const AUTOR = (perfil: string): string =>
  `coalesce(nullif(btrim(coalesce(${perfil}.nombres, '') || ' ' || coalesce(${perfil}.apellidos, '')), ''), 'Médico')`;

// Registro del acceso. El actor sale de la sesión en la base (`perfil_actual()`), nunca de un dato del cliente; la hora, del
// valor por defecto de la columna (el INSERT del médico no admite `creado_en`).
export function sentenciaDeAcceso(pacienteId: string, atencionId?: string): Sentencia {
  if (atencionId === undefined) {
    return {
      texto: `insert into public.accesos_historia (actor_id, paciente_id, tipo_acceso)
              values ((select public.perfil_actual()), $1::uuid, 'historia')`,
      parametros: [pacienteId],
    };
  }
  return {
    texto: `insert into public.accesos_historia (actor_id, paciente_id, tipo_acceso, atencion_id)
            values ((select public.perfil_actual()), $1::uuid, 'atencion', $2::uuid)`,
    parametros: [pacienteId, atencionId],
  };
}

const sentenciaDeFicha = (pacienteId: string): Sentencia => ({
  texto: `select p.id, p.tipo_documento::text as tipo_documento, p.numero_documento, p.nombres, p.apellidos,
                 p.fecha_nacimiento::text as fecha_nacimiento, p.sexo, p.telefono, p.email::text as email,
                 h.numero as numero_historia
            from public.pacientes p
            left join public.historias_clinicas h on h.paciente_id = p.id
           where p.id = $1::uuid`,
  parametros: [pacienteId],
});

const sentenciaDeAntecedentes = (pacienteId: string): Sentencia => ({
  texto: `select a.id, a.tipo::text as tipo, a.descripcion, ${iso("a.creado_en")} as registrado_en
            from public.antecedentes a
           where a.paciente_id = $1::uuid and a.vigente
           order by a.tipo::text, a.creado_en desc, a.id`,
  parametros: [pacienteId],
});

// Columnas de una atención con su contenido y sus addendas (en orden cronológico). `autor` y `propia` salen de la base: la
// segunda compara con el médico de la sesión. Los `left join` evitan que un perfil que la RLS no deje leer oculte la atención.
const SELECCION_ATENCION = `
  a.id, ${iso("a.firmada_en")} as firmada_en, ${iso("a.creado_en")} as creado_en,
  ${AUTOR("pf")} as autor,
  (a.medico_id = (select public.medico_actual())) as propia,
  a.motivo_consulta, a.anamnesis, a.examen_fisico, a.diagnosticos, a.plan_tratamiento,
  coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'texto', d.texto, 'creado_en', ${iso("d.creado_en")}, 'autor', ${AUTOR("dp")})
                     order by d.creado_en, d.id)
      from public.addendas d
      left join public.medicos dm on dm.id = d.medico_id
      left join public.perfiles dp on dp.id = dm.perfil_id
     where d.atencion_id = a.id
  ), '[]'::jsonb) as addendas`;

const DESDE_ATENCIONES = `
  from public.atenciones a
  left join public.medicos m on m.id = a.medico_id
  left join public.perfiles pf on pf.id = m.perfil_id`;

const sentenciaDeAtencionesFirmadas = (pacienteId: string, pagina: number): Sentencia => ({
  texto: `select ${SELECCION_ATENCION}
          ${DESDE_ATENCIONES}
          where a.paciente_id = $1::uuid and a.firmada_en is not null
          order by a.firmada_en desc, a.id
          limit $2 offset $3`,
  parametros: [pacienteId, TAMANO_PAGINA_ATENCIONES, (pagina - 1) * TAMANO_PAGINA_ATENCIONES],
});

const sentenciaDeConteoDeFirmadas = (pacienteId: string): Sentencia => ({
  texto: `select count(*)::int as total from public.atenciones where paciente_id = $1::uuid and firmada_en is not null`,
  parametros: [pacienteId],
});

const sentenciaDeDiagnosticos = (pacienteId: string): Sentencia => ({
  texto: `select ${iso("a.firmada_en")} as firmada_en, a.diagnosticos
            from public.atenciones a
           where a.paciente_id = $1::uuid and a.firmada_en is not null
           order by a.firmada_en desc, a.id
           limit ${LIMITE_ATENCIONES_PARA_DIAGNOSTICOS}`,
  parametros: [pacienteId],
});

// Borradores: sin contenido (solo identificador, fecha y autor).
const sentenciaDeBorradores = (pacienteId: string): Sentencia => ({
  texto: `select a.id, ${iso("a.creado_en")} as creado_en, ${AUTOR("pf")} as autor,
                 (a.medico_id = (select public.medico_actual())) as propia
          ${DESDE_ATENCIONES}
          where a.paciente_id = $1::uuid and a.firmada_en is null
          order by a.creado_en desc, a.id
          limit ${LIMITE_BORRADORES}`,
  parametros: [pacienteId],
});

const sentenciaDeUnaAtencion = (pacienteId: string, atencionId: string): Sentencia => ({
  texto: `select ${SELECCION_ATENCION}
          ${DESDE_ATENCIONES}
          where a.id = $2::uuid and a.paciente_id = $1::uuid`,
  parametros: [pacienteId, atencionId],
});

// Pacientes a cargo: `medico_tiene_paciente()` es la ÚNICA fuente de «a cargo» (asignación vigente en fechas de Lima, médico
// activo, perfil activo). Sin ella la lista incluiría a los pacientes que el médico ve solo por tener una cita reservada.
export function sentenciaDeLista(patrones: readonly string[]): Sentencia {
  const condiciones = patrones.map(
    (_, i) => `and ${normalizado("p.apellidos || ' ' || p.nombres || ' ' || p.numero_documento")} like $${i + 1} escape '\\'`,
  );
  return {
    texto: `select p.id, p.tipo_documento::text as tipo_documento, p.numero_documento, p.nombres, p.apellidos,
                   p.fecha_nacimiento::text as fecha_nacimiento
              from public.pacientes p
             where public.medico_tiene_paciente(p.id)
               ${condiciones.join("\n               ")}
             order by p.apellidos, p.nombres, p.id
             limit ${LIMITE_LISTA_PACIENTES + 1}`,
    parametros: [...patrones],
  };
}

// «Visible» solo cuenta para un médico: otros roles (el administrativo lee todos los pacientes) nunca deben recibir el aviso de
// «historia aún no habilitada», que existe para quien tiene una cita con el paciente.
const sentenciaDeClasificacion = (pacienteId: string): Sentencia => ({
  texto: `select public.medico_tiene_paciente($1::uuid) as a_cargo,
                 ((select public.rol_actual()) = 'medico' and exists (select 1 from public.pacientes where id = $1::uuid)) as visible`,
  parametros: [pacienteId],
});

// ---- Lectura de filas ----

function texto(fila: Fila, campo: string): string {
  const valor = fila[campo];
  if (typeof valor !== "string") throw new ErrorDeLecturaClinica();
  return valor;
}

function textoONulo(fila: Fila, campo: string): string | null {
  const valor = fila[campo];
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "string") throw new ErrorDeLecturaClinica();
  return valor;
}

// Instante: el SQL ya lo entrega como texto ISO; si un driver entregara un `Date`, se normaliza.
function instante(fila: Fila, campo: string): string {
  const valor = fila[campo];
  if (valor instanceof Date) return valor.toISOString();
  return texto(fila, campo);
}

function instanteONulo(fila: Fila, campo: string): string | null {
  return fila[campo] === null || fila[campo] === undefined ? null : instante(fila, campo);
}

function numero(fila: Fila, campo: string): number {
  const valor = fila[campo];
  if (typeof valor === "number") return valor;
  if (typeof valor === "string" && /^\d+$/.test(valor)) return Number(valor);
  throw new ErrorDeLecturaClinica();
}

function aJson(valor: unknown): unknown {
  if (typeof valor !== "string") return valor;
  try {
    return JSON.parse(valor);
  } catch {
    throw new ErrorDeLecturaClinica();
  }
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

export function aDiagnosticos(valor: unknown): Diagnostico[] {
  const lista = aJson(valor);
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((entrada) => {
    if (!esObjeto(entrada) || typeof entrada.cie10 !== "string") return [];
    return [
      {
        cie10: entrada.cie10,
        descripcion: typeof entrada.descripcion === "string" ? entrada.descripcion : "",
        tipo: typeof entrada.tipo === "string" ? entrada.tipo : null,
      },
    ];
  });
}

function aAddendas(valor: unknown): Addenda[] {
  const lista = aJson(valor);
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((entrada) => {
    if (
      !esObjeto(entrada) ||
      typeof entrada.id !== "string" ||
      typeof entrada.texto !== "string" ||
      typeof entrada.creado_en !== "string"
    ) {
      return [];
    }
    return [
      {
        id: entrada.id,
        texto: entrada.texto,
        creadoEn: entrada.creado_en,
        autor: typeof entrada.autor === "string" ? entrada.autor : "Médico",
      },
    ];
  });
}

function aPacienteACargo(fila: Fila): PacienteACargo {
  return {
    id: texto(fila, "id"),
    tipoDocumento: texto(fila, "tipo_documento") as TipoDocumento,
    numeroDocumento: texto(fila, "numero_documento"),
    nombres: texto(fila, "nombres"),
    apellidos: texto(fila, "apellidos"),
    fechaNacimiento: texto(fila, "fecha_nacimiento"),
  };
}

function aFicha(fila: Fila): FichaPaciente {
  return {
    ...aPacienteACargo(fila),
    sexo: texto(fila, "sexo") as SexoPaciente,
    telefono: textoONulo(fila, "telefono"),
    email: texto(fila, "email"),
    numeroHistoria: textoONulo(fila, "numero_historia"),
  };
}

function aAntecedente(fila: Fila): Antecedente {
  const tipo = texto(fila, "tipo");
  if (!(TIPOS_ANTECEDENTE as readonly string[]).includes(tipo)) throw new ErrorDeLecturaClinica();
  return {
    id: texto(fila, "id"),
    tipo: tipo as TipoAntecedente,
    descripcion: texto(fila, "descripcion"),
    registradoEn: instante(fila, "registrado_en"),
  };
}

function aAtencion(fila: Fila): AtencionConAddendas {
  return {
    id: texto(fila, "id"),
    firmadaEn: instanteONulo(fila, "firmada_en"),
    creadoEn: instante(fila, "creado_en"),
    autor: texto(fila, "autor"),
    propia: fila.propia === true,
    motivoConsulta: texto(fila, "motivo_consulta"),
    anamnesis: texto(fila, "anamnesis"),
    examenFisico: texto(fila, "examen_fisico"),
    diagnosticos: aDiagnosticos(fila.diagnosticos),
    planTratamiento: texto(fila, "plan_tratamiento"),
    addendas: aAddendas(fila.addendas),
  };
}

function aBorrador(fila: Fila): BorradorSinFirmar {
  return {
    id: texto(fila, "id"),
    creadoEn: instante(fila, "creado_en"),
    autor: texto(fila, "autor"),
    propio: fila.propia === true,
  };
}

// «Diagnósticos registrados» (D12): de las atenciones firmadas, la más reciente primero, un código una sola vez.
export function diagnosticosRegistrados(filas: readonly Fila[]): DiagnosticoRegistrado[] {
  const vistos = new Set<string>();
  const resultado: DiagnosticoRegistrado[] = [];
  for (const fila of filas) {
    const firmadoEn = instante(fila, "firmada_en");
    for (const diagnostico of aDiagnosticos(fila.diagnosticos)) {
      if (vistos.has(diagnostico.cie10)) continue;
      vistos.add(diagnostico.cie10);
      resultado.push({ ...diagnostico, firmadoEn });
    }
  }
  return resultado;
}

// ---- Ejecución ----

function registrarInesperado(operacion: string, error: unknown): void {
  console.error(
    `[historia:${operacion}] error inesperado (sqlstate=${sqlstateDe(error) ?? "n/a"}, clase=${error instanceof Error ? error.name : typeof error})`,
  );
}

// Ejecuta la transacción clínica. Devuelve `null` si la base la rechazó por permisos (42501): el llamante decide qué responder
// con `clasificarRechazo`. Cualquier otro error se registra sin contenido y se relanza genérico.
async function ejecutarTransaccion(
  ejecutar: Ejecutor,
  operacion: string,
  sentencias: readonly Sentencia[],
): Promise<Fila[][] | null> {
  try {
    return await ejecutar(sentencias);
  } catch (error) {
    if (sqlstateDe(error) === "42501") return null;
    registrarInesperado(operacion, error);
    throw new ErrorDeLecturaClinica();
  }
}

async function clasificarRechazo(
  ejecutar: Ejecutor,
  operacion: string,
  pacienteId: string,
): Promise<{ estado: "no_habilitada" } | { estado: "no_encontrada" }> {
  const filas = await ejecutarSolaLectura(ejecutar, operacion, sentenciaDeClasificacion(pacienteId));
  const aCargo = filas[0]?.a_cargo === true;
  const visible = filas[0]?.visible === true;
  // A cargo y rechazado: lo que falló fue otra cosa (p. ej. una atención que no es de ese paciente): no se revela cuál.
  return !aCargo && visible ? { estado: "no_habilitada" } : { estado: "no_encontrada" };
}

async function ejecutarSolaLectura(ejecutar: Ejecutor, operacion: string, sentencia: Sentencia): Promise<Fila[]> {
  try {
    const [filas] = await ejecutar([sentencia]);
    return filas ?? [];
  } catch (error) {
    registrarInesperado(operacion, error);
    throw new ErrorDeLecturaClinica();
  }
}

// ---- Casos de uso ----

// Lista de «Mis pacientes». No entrega contenido clínico (solo identificación) y no deja registro de acceso: el registro es por
// historia abierta, no por lista. La RLS de `pacientes` y `medico_tiene_paciente()` deciden qué filas existen para el médico.
export async function listarPacientesACargo(
  ejecutar: Ejecutor,
  entrada: { busqueda?: string } = {},
): Promise<ListaDePacientes> {
  const sentencia = sentenciaDeLista(patronesDeBusqueda(entrada.busqueda));
  const filas = await ejecutarSolaLectura(ejecutar, "listar_pacientes", sentencia);
  return {
    pacientes: filas.slice(0, LIMITE_LISTA_PACIENTES).map(aPacienteACargo),
    hayMas: filas.length > LIMITE_LISTA_PACIENTES,
  };
}

// Abre la historia clínica de un paciente: ficha, antecedentes vigentes, atenciones firmadas (con addendas, paginadas),
// «Diagnósticos registrados» y borradores sin contenido. Deja un acceso de tipo `historia` en la misma transacción.
export async function abrirHistoria(
  ejecutar: Ejecutor,
  entrada: { pacienteId: unknown; pagina?: number },
): Promise<ResultadoApertura<HistoriaAbierta>> {
  const pacienteId = identificadorValido(entrada.pacienteId);
  if (!pacienteId) return { estado: "no_encontrada" };
  const pagina = entrada.pagina && entrada.pagina >= 1 ? Math.floor(entrada.pagina) : 1;

  const resultados = await ejecutarTransaccion(ejecutar, "abrir_historia", [
    ...preludio(),
    sentenciaDeAcceso(pacienteId),
    sentenciaDeFicha(pacienteId),
    sentenciaDeAntecedentes(pacienteId),
    sentenciaDeAtencionesFirmadas(pacienteId, pagina),
    sentenciaDeConteoDeFirmadas(pacienteId),
    sentenciaDeDiagnosticos(pacienteId),
    sentenciaDeBorradores(pacienteId),
  ]);
  if (resultados === null) return clasificarRechazo(ejecutar, "abrir_historia", pacienteId);

  // Se descartan los resultados del preludio y del acceso (el INSERT no devuelve filas): quedan las lecturas, en su orden.
  const [fichas, antecedentes, atenciones, conteo, diagnosticos, borradores] = resultados.slice(preludio().length + 1);
  const ficha = fichas?.[0];
  // No debería pasar (quien tiene al paciente a cargo puede leer su ficha); si pasara, no se entrega una historia sin ficha.
  if (!ficha) return { estado: "no_encontrada" };

  return {
    estado: "ok",
    datos: {
      ficha: aFicha(ficha),
      antecedentes: (antecedentes ?? []).map(aAntecedente),
      atenciones: {
        items: (atenciones ?? []).map(aAtencion),
        total: conteo?.[0] ? numero(conteo[0], "total") : 0,
        pagina,
        tamanoPagina: TAMANO_PAGINA_ATENCIONES,
      },
      diagnosticosRegistrados: diagnosticosRegistrados(diagnosticos ?? []),
      borradores: (borradores ?? []).map(aBorrador),
    },
  };
}

// Abre una atención (firmada o borrador) con sus addendas, junto con la ficha y los antecedentes vigentes. Deja un acceso de
// tipo `atencion` con el identificador de esa atención. La política del acceso exige que la atención exista y sea de ESE
// paciente: una atención ajena o inexistente se rechaza como cualquier otro acceso no permitido.
export async function abrirAtencion(
  ejecutar: Ejecutor,
  entrada: { pacienteId: unknown; atencionId: unknown },
): Promise<ResultadoApertura<AtencionAbierta>> {
  const pacienteId = identificadorValido(entrada.pacienteId);
  const atencionId = identificadorValido(entrada.atencionId);
  if (!pacienteId || !atencionId) return { estado: "no_encontrada" };

  const resultados = await ejecutarTransaccion(ejecutar, "abrir_atencion", [
    ...preludio(),
    sentenciaDeAcceso(pacienteId, atencionId),
    sentenciaDeFicha(pacienteId),
    sentenciaDeAntecedentes(pacienteId),
    sentenciaDeUnaAtencion(pacienteId, atencionId),
  ]);
  if (resultados === null) return clasificarRechazo(ejecutar, "abrir_atencion", pacienteId);

  const [fichas, antecedentes, atenciones] = resultados.slice(preludio().length + 1);
  const ficha = fichas?.[0];
  const atencion = atenciones?.[0];
  if (!ficha || !atencion) return { estado: "no_encontrada" };

  return {
    estado: "ok",
    datos: {
      ficha: aFicha(ficha),
      antecedentes: (antecedentes ?? []).map(aAntecedente),
      atencion: aAtencion(atencion),
    },
  };
}
