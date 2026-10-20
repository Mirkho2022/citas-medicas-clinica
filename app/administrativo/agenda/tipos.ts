// Datos que la página de la agenda (servidor) entrega a la tabla (cliente): la fila de la agenda del día con lo que ofrece cada
// una ya decidido en el servidor (`lib/citas/acciones-visibles.ts`), de modo que el cliente solo pinta.
import type { AccionesVisibles } from "@/lib/citas/acciones-visibles";
import type { CitaDelDia, HuecoLibre } from "@/lib/citas/consultas";

export type CitaVista = CitaDelDia & { acciones: AccionesVisibles };
export type FilaVista = CitaVista | HuecoLibre;
