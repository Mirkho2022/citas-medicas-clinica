// Navegación de cada área (H2b, D8). Lista tipada por rol; la usan el portal del paciente (navegación inferior de tres
// destinos) y la consola del personal (barra lateral). Un destino cuyo hito aún no existe se muestra deshabilitado con
// «Próximamente»: así no hay enlaces a rutas que responden 404. El hito que construye la pantalla cambia `disponible`
// a `true` en el mismo PR.
import {
  Bell,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  House,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Rol } from "../auth/rol.ts";

export interface Destino {
  ruta: string;
  etiqueta: string;
  icono: LucideIcon;
  disponible: boolean;
}

export const NAVEGACION: Record<Rol, Destino[]> = {
  paciente: [
    { ruta: "/paciente", etiqueta: "Inicio", icono: House, disponible: true },
    { ruta: "/paciente/citas", etiqueta: "Mis citas", icono: CalendarDays, disponible: false },
    { ruta: "/paciente/citas/nueva", etiqueta: "Reservar", icono: CalendarPlus, disponible: false },
  ],
  administrativo: [
    { ruta: "/administrativo", etiqueta: "Inicio", icono: House, disponible: true },
    { ruta: "/administrativo/agenda", etiqueta: "Agenda", icono: CalendarDays, disponible: false },
    { ruta: "/administrativo/pacientes", etiqueta: "Pacientes", icono: Users, disponible: false },
    { ruta: "/administrativo/notificaciones", etiqueta: "Notificaciones", icono: Bell, disponible: false },
  ],
  medico: [
    { ruta: "/medico", etiqueta: "Inicio", icono: House, disponible: true },
    { ruta: "/medico/jornada", etiqueta: "Mi jornada", icono: Stethoscope, disponible: false },
    { ruta: "/medico/pacientes", etiqueta: "Mis pacientes", icono: Users, disponible: false },
  ],
  enfermera: [
    { ruta: "/enfermera", etiqueta: "Inicio", icono: House, disponible: true },
    { ruta: "/enfermera/turno", etiqueta: "Mi turno", icono: ClipboardList, disponible: false },
  ],
};

// Título del área, como aparece en el encabezado de la estructura.
export const TITULO_AREA: Record<Rol, string> = {
  paciente: "Portal del paciente",
  administrativo: "Panel administrativo",
  medico: "Panel del médico",
  enfermera: "Panel de enfermería",
};

// Un destino está activo si la ruta actual es la suya o una subruta (salvo la raíz del área, que solo coincide exacta).
export function destinoActivo(destino: Destino, rutaActual: string, raizArea: string): boolean {
  if (destino.ruta === raizArea) return rutaActual === raizArea;
  return rutaActual === destino.ruta || rutaActual.startsWith(`${destino.ruta}/`);
}
