import { auth } from "@clerk/nextjs/server";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { exigirPaginaAdministrativo } from "@/lib/auth/pagina-personal";
import { esUuid } from "@/lib/citas/consultas";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { esFechaLima, hoyLima } from "@/lib/fechas/lima";
import { catalogosDeTurnos } from "@/lib/turnos/consultas";
import { esFranja } from "@/lib/turnos/franjas";
import { FormularioTurno } from "../formulario-turno";

export const metadata: Metadata = { title: "Asignar turno de enfermería" };

type Consulta = { enfermera?: string | string[]; fecha?: string | string[]; franja?: string | string[] };
const una = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Asignar un turno (specs/turnos-de-enfermeria; design.md, D4 y D5): formulario en una ruta. Admite `?enfermera=&fecha=&franja=` para
// llegar con lo elegido desde la semana. Solo se ofrecen enfermeras y médicos ACTIVOS; lo que llegue en la dirección se valida contra esas
// listas y, si no sirve, el campo queda vacío (la acción vuelve a validar todo en el servidor).
export default async function PaginaNuevoTurno({ searchParams }: { searchParams: Promise<Consulta> }) {
  await auth.protect();
  await exigirPaginaAdministrativo();

  const q = await searchParams;
  const hoy = hoyLima();
  const { enfermeras, medicos, servicios } = await catalogosDeTurnos(ejecutorAutenticado);

  const enfermera = una(q.enfermera);
  const fecha = una(q.fecha);
  const franja = una(q.franja);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/administrativo/turnos">
            <ArrowLeft aria-hidden="true" />
            Turnos de enfermería
          </Link>
        </Button>
        <h1 className="font-display text-headline-lg text-ink">Asignar turno</h1>
        <p className="text-body-sm text-muted-foreground">
          Una enfermera, una fecha y una franja, con un médico o en un servicio.
        </p>
      </div>
      <FormularioTurno
        modo="nuevo"
        enfermeras={enfermeras.map((e) => ({ id: e.id, nombre: e.nombre }))}
        medicos={medicos}
        servicios={servicios}
        hoy={hoy}
        valores={{
          enfermeraId: esUuid(enfermera) && enfermeras.some((e) => e.id === enfermera) ? enfermera : "",
          fecha: fecha !== undefined && esFechaLima(fecha) && fecha >= hoy ? fecha : "",
          franja: esFranja(franja) ? franja : "manana",
          destino: "medico",
          medicoId: "",
          servicioId: "",
        }}
      />
    </div>
  );
}
