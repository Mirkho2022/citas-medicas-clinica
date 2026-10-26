// Casos de uso de las acciones de atención clínica: guarda de rol y MFA → lógica de datos → refresco de pantallas. Las Server
// Actions (`app/medico/pacientes/[pacienteId]/atencion/acciones.ts`) solo construyen el `Entorno` real y llaman aquí; así la
// composición completa se prueba con un entorno inyectado, sin Clerk, sin Next y sin red (tests/atencion/*.test.ts).
// Mismo patrón que lib/citas/casos-de-uso.ts.
import type { ResultadoAccion } from "../acciones/resultado.ts";
import type { RolPersonal, SesionPersonal } from "../auth/accion-personal.ts";
import type { Ejecutor } from "../db/ejecutor.ts";
import type { ProveedorFirma } from "./firma/proveedor.ts";
import {
  actualizarBorrador,
  agregarAddenda,
  firmarAtencion,
  registrarAtencion,
  type AddendaGuardada,
  type AtencionGuardada,
  type ResultadoAtencion,
} from "./repositorio.ts";

export interface EntornoAtencion {
  // `exigirPersonal`: sesión, claim de rol y MFA; devuelve un fallo en vez de redirigir.
  guarda: (rol: RolPersonal) => Promise<ResultadoAccion<SesionPersonal>>;
  ejecutar: Ejecutor;
  proveedorFirma: ProveedorFirma;
  // `revalidatePath` de cada ruta (solo se llama cuando la operación salió bien).
  refrescar: (rutas: readonly string[]) => void;
  // Solo pruebas: generador del id de la atención.
  generarId?: () => string;
}

// Las pantallas de historia leen en cada petición (son dinámicas); esto refresca además la caché del enrutador del servidor.
export const RUTAS_HISTORIA = ["/medico/pacientes/[pacienteId]"] as const;

async function conGuardaMedico<T>(
  entorno: EntornoAtencion,
  operacion: () => Promise<ResultadoAtencion<T>>,
): Promise<ResultadoAtencion<T>> {
  const guarda = await entorno.guarda("medico");
  if (!guarda.ok) return guarda;
  const resultado = await operacion();
  if (resultado.ok) entorno.refrescar(RUTAS_HISTORIA);
  return resultado;
}

export function casoRegistrarAtencion(entorno: EntornoAtencion, entrada: unknown): Promise<ResultadoAtencion<AtencionGuardada>> {
  return conGuardaMedico(entorno, () =>
    registrarAtencion(entorno.ejecutar, entrada, { generarId: entorno.generarId, proveedorFirma: entorno.proveedorFirma }),
  );
}

export function casoActualizarBorrador(entorno: EntornoAtencion, entrada: unknown): Promise<ResultadoAtencion<AtencionGuardada>> {
  return conGuardaMedico(entorno, () => actualizarBorrador(entorno.ejecutar, entrada, { proveedorFirma: entorno.proveedorFirma }));
}

export function casoFirmarAtencion(entorno: EntornoAtencion, entrada: unknown): Promise<ResultadoAtencion<AtencionGuardada>> {
  return conGuardaMedico(entorno, () => firmarAtencion(entorno.ejecutar, entrada, { proveedorFirma: entorno.proveedorFirma }));
}

export function casoAgregarAddenda(entorno: EntornoAtencion, entrada: unknown): Promise<ResultadoAtencion<AddendaGuardada>> {
  return conGuardaMedico(entorno, () => agregarAddenda(entorno.ejecutar, entrada));
}
