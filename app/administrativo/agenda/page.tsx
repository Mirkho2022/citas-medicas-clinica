import { auth } from "@clerk/nextjs/server";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { SelectorFecha } from "@/components/clinica/selector-fecha";
import { Button } from "@/components/ui/button";
import { exigirPaginaAdministrativo } from "@/lib/auth/pagina-personal";
import { accionesVisibles } from "@/lib/citas/acciones-visibles";
import { agendaDelDia, listarMedicos, parametrosAgenda } from "@/lib/citas/consultas";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { hoyLima } from "@/lib/fechas/lima";
import { sumarDias, textoFechaConDia } from "@/lib/ui/calendario";
import { horaLima } from "@/lib/ui/formato";
import { FiltroMedico } from "./filtro-medico";
import { TablaDelDia } from "./tabla-del-dia";
import type { FilaVista } from "./tipos";

const RUTA = "/administrativo/agenda";

// Agenda del día del administrativo (specs/gestion-de-citas; docs/diseno/BRIEF-DISENO.md, «Consola · Agenda del día»). Un Server
// Component que lee la fecha de Lima y el médico de la URL (`?fecha=`, `?medico=`), trae las citas con los huecos libres intercalados
// con la identidad del usuario (la RLS decide qué filas existen) y decide en el servidor qué acciones ofrece cada fila. Las acciones
// las ejecuta `./acciones` (cada una vuelve a comprobar rol y MFA) y refrescan esta ruta.
export default async function PaginaAgenda({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string | string[]; medico?: string | string[] }>;
}) {
  await auth.protect();
  await exigirPaginaAdministrativo();

  const hoy = hoyLima();
  const { fecha, medicoId } = parametrosAgenda(await searchParams, hoy);
  const [medicos, agenda] = await Promise.all([
    listarMedicos(ejecutorAutenticado),
    agendaDelDia(ejecutorAutenticado, fecha, medicoId),
  ]);

  const ahora = new Date();
  const filas: FilaVista[] = agenda.filas.map((fila) =>
    fila.tipo === "cita" ? { ...fila, acciones: accionesVisibles(fila, ahora) } : fila,
  );

  const hrefDia = (dia: string) => {
    const consulta = new URLSearchParams({ fecha: dia });
    if (medicoId) consulta.set("medico", medicoId);
    return `${RUTA}?${consulta.toString()}`;
  };
  const hrefAgendar = (() => {
    const consulta = new URLSearchParams({ fecha });
    if (medicoId) consulta.set("medico", medicoId);
    return `${RUTA}/nueva?${consulta.toString()}`;
  })();

  const citas = `${agenda.citas} ${agenda.citas === 1 ? "cita" : "citas"}`;
  const huecos = `${agenda.huecos} ${agenda.huecos === 1 ? "horario libre" : "horarios libres"}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-headline-lg text-ink">Agenda del día</h1>
          <p className="text-body-sm text-muted-foreground">
            Ahora son las <span className="tabular-nums">{horaLima(ahora)}</span> (hora de Lima) · {citas} · {huecos}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href={hrefAgendar}>
            <Plus aria-hidden="true" />
            Agendar cita
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button asChild variant="secondary" size="icon-sm">
            <Link href={hrefDia(sumarDias(fecha, -1))} aria-label="Día anterior">
              <ChevronLeft aria-hidden="true" />
            </Link>
          </Button>
          <SelectorFecha fecha={fecha} hoy={hoy} ruta={RUTA} parametros={{ medico: medicoId ?? undefined }} />
          <Button asChild variant="secondary" size="icon-sm">
            <Link href={hrefDia(sumarDias(fecha, 1))} aria-label="Día siguiente">
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <FiltroMedico medicos={medicos} medicoId={medicoId} ruta={RUTA} parametros={{ fecha }} />
        {fecha !== hoy ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={hrefDia(hoy)}>Ir a hoy</Link>
          </Button>
        ) : null}
      </div>

      <TablaDelDia filas={filas} titulo={`Agenda del ${textoFechaConDia(fecha)}`} />
    </div>
  );
}
