import { auth } from "@clerk/nextjs/server";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alerta } from "@/components/clinica/alerta";
import { Button } from "@/components/ui/button";
import { exigirPaginaAdministrativo } from "@/lib/auth/pagina-personal";
import { esUuid } from "@/lib/citas/consultas";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { hoyLima } from "@/lib/fechas/lima";
import { catalogosDeTurnos, turnoPorId } from "@/lib/turnos/consultas";
import { MENSAJE_TURNO_NO_EXISTE, MENSAJE_TURNO_PASADO } from "@/lib/turnos/errores";
import { etiquetaFranja } from "@/lib/turnos/franjas";
import { textoFechaConDia } from "@/lib/ui/calendario";
import { FormularioTurno, QuitarTurno } from "../formulario-turno";

export const metadata: Metadata = { title: "Modificar turno de enfermería" };

function Volver() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-3">
      <Link href="/administrativo/turnos">
        <ArrowLeft aria-hidden="true" />
        Turnos de enfermería
      </Link>
    </Button>
  );
}

// Modificar o quitar un turno (specs/turnos-de-enfermeria; design.md, D4 y D5). Cambia la franja, el médico o el servicio; la enfermera y la
// fecha no cambian (para eso se quita y se asigna otro). Un turno de una fecha anterior a hoy se muestra pero no se puede modificar ni
// quitar: se conserva como registro de quién trabajó.
export default async function PaginaTurno({ params }: { params: Promise<{ id: string }> }) {
  await auth.protect();
  await exigirPaginaAdministrativo();

  const { id } = await params;
  const [turno, catalogos] = await Promise.all([
    esUuid(id) ? turnoPorId(ejecutorAutenticado, id) : Promise.resolve(null),
    catalogosDeTurnos(ejecutorAutenticado),
  ]);

  if (!turno) {
    return (
      <div className="flex flex-col gap-4">
        <Volver />
        <h1 className="font-display text-headline-lg text-ink">Modificar turno</h1>
        <Alerta tono="error">{MENSAJE_TURNO_NO_EXISTE}</Alerta>
      </div>
    );
  }

  const hoy = hoyLima();
  const descripcion = `de ${turno.enfermera.nombre} del ${textoFechaConDia(turno.fecha)}, ${etiquetaFranja(turno.franja)}`;
  const pasado = turno.fecha < hoy;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Volver />
        <h1 className="font-display text-headline-lg text-ink">Modificar turno</h1>
      </div>
      {pasado ? (
        <>
          <Alerta tono="informacion">{MENSAJE_TURNO_PASADO}</Alerta>
          <p className="text-body-md">
            Turno {descripcion}
            {turno.medico ? `, con ${turno.medico.nombre} (${turno.medico.especialidad})` : ""}
            {turno.servicio ? `, servicio ${turno.servicio}` : ""}.
          </p>
        </>
      ) : (
        <>
          <FormularioTurno
            modo="editar"
            turnoId={turno.id}
            enfermeras={[]}
            medicos={catalogos.medicos}
            servicios={catalogos.servicios}
            hoy={hoy}
            resumen={{ enfermera: turno.enfermera.nombre, fechaTexto: textoFechaConDia(turno.fecha), enfermeraDeBaja: !turno.enfermera.activa }}
            valores={{
              enfermeraId: turno.enfermera.id,
              fecha: turno.fecha,
              franja: turno.franja,
              destino: turno.medico ? "medico" : "servicio",
              // Un médico dado de baja no está entre los que se ofrecen: el campo queda vacío para elegir otro.
              medicoId: turno.medico && turno.medico.activo ? turno.medico.id : "",
              servicioId: turno.medico ? "" : (catalogos.servicios.find((s) => s.nombre === turno.servicio)?.id ?? ""),
            }}
          />
          <QuitarTurno turnoId={turno.id} descripcion={descripcion} fecha={turno.fecha} />
        </>
      )}
    </div>
  );
}
