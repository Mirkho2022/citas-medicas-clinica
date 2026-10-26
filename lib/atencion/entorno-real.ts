// `Entorno` de producción de los casos de uso de atención (lib/atencion/casos-de-uso.ts): guarda de Clerk, ejecutor autenticado de
// Neon (nunca el rol dueño), refresco de Next y la firma lógica. Solo lo importan las Server Actions y las páginas del médico.
import { revalidatePath } from "next/cache";
import { exigirPersonal } from "../auth/accion-personal.ts";
import { ejecutorAutenticado } from "../db/ejecutor-autenticado.ts";
import type { EntornoAtencion } from "./casos-de-uso.ts";
import { firmaLogica } from "./firma/firma-logica.ts";

export const entornoAtencion: EntornoAtencion = {
  guarda: (rol) => exigirPersonal(rol),
  ejecutar: ejecutorAutenticado,
  proveedorFirma: firmaLogica,
  refrescar: (rutas) => rutas.forEach((ruta) => revalidatePath(ruta, "page")),
};
