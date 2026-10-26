// Navegación de cada área (H2b, D8). Lista tipada por rol; la usan el portal del paciente (navegación inferior de tres
// destinos) y la consola del personal (barra lateral). Un destino cuyo hito aún no existe se muestra deshabilitado con
// «Próximamente»: así no hay enlaces a rutas que responden 404. El hito que construye la pantalla cambia `disponible`
// a `true` en el mismo PR.
import {
  Bell,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  Clock,
  House,
  Stethoscope,
  TriangleAlert,
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
    { ruta: "/paciente/citas", etiqueta: "Mis citas", icono: CalendarDays, disponible: true },
    { ruta: "/paciente/citas/nueva", etiqueta: "Reservar", icono: CalendarPlus, disponible: true },
  ],
  administrativo: [
    { ruta: "/administrativo", etiqueta: "Inicio", icono: House, disponible: true },
    { ruta: "/administrativo/agenda", etiqueta: "Agenda", icono: CalendarDays, disponible: true },
    { ruta: "/administrativo/pacientes", etiqueta: "Pacientes", icono: Users, disponible: true },
    { ruta: "/administrativo/horarios", etiqueta: "Horarios", icono: Clock, disponible: true },
    { ruta: "/administrativo/bajas", etiqueta: "Bajas médicas", icono: TriangleAlert, disponible: true },
    { ruta: "/administrativo/turnos", etiqueta: "Turnos de enfermería", icono: ClipboardList, disponible: true },
    { ruta: "/administrativo/notificaciones", etiqueta: "Notificaciones", icono: Bell, disponible: false },
  ],
  medico: [
    { ruta: "/medico", etiqueta: "Mi jornada", icono: Stethoscope, disponible: true },
    { ruta: "/medico/pacientes", etiqueta: "Mis pacientes", icono: Users, disponible: true },
  ],
  enfermera: [
    { ruta: "/enfermera", etiqueta: "Mi turno", icono: ClipboardList, disponible: true },
  ],
};

// Título del área, como aparece en el encabezado de la estructura.
export const TITULO_AREA: Record<Rol, string> = {
  paciente: "Portal del paciente",
  administrativo: "Panel administrativo",
  medico: "Panel del médico",
  enfermera: "Panel de enfermería",
};

// Un destino está activo si la ruta actual es la suya o una subruta (salvo la raíz del área, que solo coincide exacta). Si se
// pasan los destinos del área y otro, más específico, también coincide (en el portal, «Reservar» cuelga de «Mis citas»), solo
// ese está activo: la navegación no marca dos destinos a la vez.
export function destinoActivo(
  destino: Destino,
  rutaActual: string,
  raizArea: string,
  destinos: readonly Destino[] = [],
): boolean {
  const coincide = (d: Destino) =>
    d.ruta === raizArea ? rutaActual === raizArea : rutaActual === d.ruta || rutaActual.startsWith(`${d.ruta}/`);
  if (!coincide(destino)) return false;
  return !destinos.some((otro) => otro !== destino && otro.ruta.length > destino.ruta.length && coincide(otro));
}
