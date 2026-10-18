// `Entorno` de producción de los casos de uso de citas (lib/citas/casos-de-uso.ts): la guarda de Clerk, el ejecutor autenticado
// de Neon, el refresco de pantallas de Next y el notificador de eventos. Solo lo importan las Server Actions
// (`app/**/acciones.ts`); las pruebas construyen su propio `Entorno` y nunca cargan este módulo (necesita Clerk y Next).
import { revalidatePath } from "next/cache";
import { exigirPersonal } from "../auth/accion-personal.ts";
import { ejecutorAutenticado } from "../db/ejecutor-autenticado.ts";
import { emitirTrasCommit } from "../notificaciones/eventos-cita.ts";
import type { Entorno } from "./casos-de-uso.ts";

export const entornoReal: Entorno = {
  guarda: (rol) => exigirPersonal(rol),
  ejecutar: ejecutorAutenticado,
  refrescar: (rutas) => rutas.forEach((ruta) => revalidatePath(ruta)),
  emitir: (evento) => emitirTrasCommit(evento),
};
