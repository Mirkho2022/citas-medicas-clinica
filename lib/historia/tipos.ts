// Tipos de lo que el módulo de lectura de historias clínicas entrega a las pantallas (openspec/changes/historias-clinicas,
// grupos 4 y 6). Son objetos planos y serializables: los lee un Server Component y se pasan a componentes de presentación.
// Las fechas con hora (`timestamptz`) son texto ISO 8601 en UTC y se muestran en `America/Lima` (lib/ui/formato.ts); la fecha
// de nacimiento es una fecha de calendario `YYYY-MM-DD` que NUNCA se convierte de zona (lib/historia/formato.ts).

export type TipoDocumento = "DNI" | "CE";
export type SexoPaciente = "M" | "F" | "X";

// Los cinco tipos de antecedente de ADR-0015 (enum `tipo_antecedente`).
export const TIPOS_ANTECEDENTE = ["personal_patologico", "quirurgico", "alergico", "familiar", "habito_nocivo"] as const;
export type TipoAntecedente = (typeof TIPOS_ANTECEDENTE)[number];

// Fila de «Mis pacientes»: lo mínimo para reconocer a la persona y abrir su historia. Nada clínico.
export interface PacienteACargo {
  id: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  fechaNacimiento: string;
}

// Ficha del paciente: datos del registro del paciente, de SOLO LECTURA desde la historia clínica. Sin dirección: no hace falta
// para atender y «no se muestra más de lo necesario».
export interface FichaPaciente extends PacienteACargo {
  sexo: SexoPaciente;
  telefono: string | null;
  email: string;
  numeroHistoria: string | null;
}

export interface Antecedente {
  id: string;
  tipo: TipoAntecedente;
  descripcion: string;
  registradoEn: string;
}

export interface Diagnostico {
  cie10: string;
  descripcion: string;
  tipo: string | null;
}

export interface Addenda {
  id: string;
  texto: string;
  creadoEn: string;
  autor: string;
}

// Una atención con su contenido. `firmadaEn` es nulo solo en el borrador que el propio médico abre con `abrirAtencion`.
export interface AtencionConAddendas {
  id: string;
  firmadaEn: string | null;
  creadoEn: string;
  autor: string;
  propia: boolean;
  motivoConsulta: string;
  anamnesis: string;
  examenFisico: string;
  diagnosticos: Diagnostico[];
  planTratamiento: string;
  addendas: Addenda[];
}

// Un borrador sin firmar aparece en la historia sin contenido: quién y cuándo, nada más. Un borrador incompleto no debe
// leerse como si fuera definitivo (design.md, D6 H9).
export interface BorradorSinFirmar {
  id: string;
  creadoEn: string;
  autor: string;
  propio: boolean;
}

// «Diagnósticos registrados» (D12): los de las atenciones firmadas, del más reciente al más antiguo, un código una sola vez.
export interface DiagnosticoRegistrado extends Diagnostico {
  firmadoEn: string;
}

export interface PaginaDeAtenciones {
  items: AtencionConAddendas[];
  total: number;
  pagina: number;
  tamanoPagina: number;
}

export interface HistoriaAbierta {
  ficha: FichaPaciente;
  antecedentes: Antecedente[];
  atenciones: PaginaDeAtenciones;
  diagnosticosRegistrados: DiagnosticoRegistrado[];
  borradores: BorradorSinFirmar[];
}

export interface AtencionAbierta {
  ficha: FichaPaciente;
  antecedentes: Antecedente[];
  atencion: AtencionConAddendas;
}

// Resultado de abrir algo clínico. `no_encontrada` cubre por igual al paciente que no existe, al que otro médico tiene a cargo,
// a la asignación vencida y a la atención ajena: la pantalla responde lo mismo (404) y no revela cuál fue. `no_habilitada` solo
// se da cuando el médico ya puede VER al paciente (tiene con él una cita reservada o confirmada) pero aún no lo tiene a cargo.
export type ResultadoApertura<T> =
  | { estado: "ok"; datos: T }
  | { estado: "no_habilitada" }
  | { estado: "no_encontrada" };

export interface ListaDePacientes {
  pacientes: PacienteACargo[];
  // Hay más coincidencias que las mostradas: se pide afinar la búsqueda.
  hayMas: boolean;
}
