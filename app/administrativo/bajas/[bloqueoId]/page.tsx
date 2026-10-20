import { auth } from "@clerk/nextjs/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alerta } from "@/components/clinica/alerta";
import { Button } from "@/components/ui/button";
import { exigirPaginaAdministrativo } from "@/lib/auth/pagina-personal";
import { detalleDeBaja, esUuid } from "@/lib/citas/consultas";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { fechaHoraLima } from "@/lib/ui/formato";
import { Reasignacion } from "./reasignacion";

// Una baja médica y sus citas afectadas (specs/reasignacion-por-baja-medica; ADR-0011): para cada cita, hasta 3 propuestas de un
// sustituto de la misma especialidad con el mismo horario primero, o la marca «Contactar al paciente» con su correo y teléfono si
// no hay un sustituto libre. La lectura (`citas_por_reasignar` y `propuestas_reasignacion`) solo propone: nada cambia hasta que
// la recepción elige filas y reasigna.
export default async function PaginaBaja({ params }: { params: Promise<{ bloqueoId: string }> }) {
  await auth.protect();
  await exigirPaginaAdministrativo();

  const { bloqueoId } = await params;
  if (!esUuid(bloqueoId)) notFound();
  const detalle = await detalleDeBaja(ejecutorAutenticado, bloqueoId);
  if (!detalle) notFound();
  const { baja, citas } = detalle;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/administrativo/bajas">
            <ArrowLeft aria-hidden="true" />
            Volver a Bajas médicas
          </Link>
        </Button>
        <h1 className="font-display text-headline-lg text-ink">Baja de {baja.medico}</h1>
        <p className="text-body-sm text-muted-foreground tabular-nums">
          {baja.especialidad} · {fechaHoraLima(baja.desde)} → {fechaHoraLima(baja.hasta)} (hora de Lima) · {baja.motivo}
        </p>
      </div>

      <Alerta tono="informacion">
        Durante la baja no aplica la ventana de 1 hora: puede reasignar citas aunque empiecen en menos de una hora. Solo se reasignan las
        citas que usted elija.
      </Alerta>

      {citas.length === 0 ? (
        <Alerta tono="exito" titulo="No quedan citas por reasignar">
          <Link className="underline underline-offset-2" href="/administrativo/agenda">
            Volver a la agenda
          </Link>
        </Alerta>
      ) : (
        <Reasignacion bloqueoId={baja.id} citas={citas} />
      )}
    </div>
  );
}
