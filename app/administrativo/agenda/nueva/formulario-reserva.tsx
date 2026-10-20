"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Alerta } from "@/components/clinica/alerta";
import { useAviso } from "@/components/clinica/aviso-temporal";
import { SelectorHorario } from "@/components/clinica/selector-horario";
import { Button } from "@/components/ui/button";
import { advertenciaCancelacion } from "@/lib/citas/advertencia";
import type { HuecoLibre } from "@/lib/citas/consultas";
import { fechaYHoraLima } from "@/lib/fechas/lima";
import { fechaLima, horaLima } from "@/lib/ui/formato";
import { reprogramarCita, reservarCita } from "../acciones";

// Paso 3 de agendar y de reprogramar (specs/gestion-de-citas): elegir el horario entre los huecos libres que ofreció el servidor y
// confirmar con un resumen (paciente, médico, servicio, fecha y hora de Lima) y la advertencia de la ventana de 1 hora con su hora
// límite, ANTES del botón. El horario viaja como el instante exacto del servidor, nunca reconstruido a partir de texto.
// Un horario tomado entretanto da exactamente `Registro de cita ya agendado`; la lista se vuelve a leer y no lo ofrece. Al salir
// bien se vuelve a la agenda del día de esa cita, donde el aviso temporal confirma la acción.
export function FormularioReserva({
  modo,
  citaId,
  pacienteId,
  pacienteNombre,
  medicoId,
  medicoNombre,
  servicio,
  horarios,
}: {
  modo: "nueva" | "reprogramar";
  citaId?: string;
  pacienteId: string;
  pacienteNombre: string;
  medicoId: string;
  medicoNombre: string;
  servicio: string;
  horarios: HuecoLibre[];
}) {
  const router = useRouter();
  const { avisar } = useAviso();
  const [elegido, setElegido] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const reprograma = modo === "reprogramar";

  // Si la lista se vuelve a leer y el horario elegido ya no está, se descarta la elección.
  useEffect(() => {
    if (elegido && !horarios.some((h) => h.inicio === elegido)) setElegido(null);
  }, [horarios, elegido]);

  const hueco = horarios.find((h) => h.inicio === elegido) ?? null;
  const advertencia = hueco ? advertenciaCancelacion(hueco.inicio) : null;

  function confirmar() {
    if (!hueco) return;
    setError(null);
    empezar(async () => {
      const base = { medico_id: medicoId, inicio: hueco.inicio, fin: hueco.fin };
      const resultado = reprograma
        ? await reprogramarCita({ cita_id: citaId, ...base })
        : await reservarCita({ paciente_id: pacienteId, ...base });
      if (resultado.ok) {
        avisar(`${reprograma ? "Cita reprogramada" : "Cita reservada"} para las ${horaLima(hueco.inicio)}.`);
        const dia = fechaYHoraLima(hueco.inicio).fecha;
        router.push(`/administrativo/agenda?fecha=${dia}&medico=${medicoId}`);
      } else {
        setError(resultado.mensaje);
        router.refresh();
      }
    });
  }

  if (horarios.length === 0) {
    return (
      <Alerta tono="informacion">
        No hay horarios libres ese día para este médico. Elija otro día: los días con un punto en el calendario tienen horarios.
      </Alerta>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SelectorHorario
        horarios={horarios.map((h) => ({ inicio: h.inicio, disponible: true }))}
        nombre="inicio"
        alElegir={setElegido}
        mostrarAdvertencia={false}
      />

      {hueco && advertencia ? (
        <section aria-label="Resumen de la cita" className="flex flex-col gap-3 rounded-lg border border-border bg-muted p-4">
          <h3 className="text-label-lg text-ink">Resumen</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-md">
            <dt className="text-muted-foreground">Paciente</dt>
            <dd>{pacienteNombre}</dd>
            <dt className="text-muted-foreground">Médico</dt>
            <dd>{medicoNombre}</dd>
            <dt className="text-muted-foreground">Servicio</dt>
            <dd>{servicio}</dd>
            <dt className="text-muted-foreground">Fecha</dt>
            <dd className="tabular-nums">{fechaLima(hueco.inicio)}</dd>
            <dt className="text-muted-foreground">Hora</dt>
            <dd className="tabular-nums">{horaLima(hueco.inicio)} (hora de Lima)</dd>
          </dl>
          <Alerta tono="aviso">{advertencia.texto}</Alerta>
        </section>
      ) : null}

      {error ? (
        <Alerta tono="error" titulo={reprograma ? "No se pudo reprogramar." : "No se pudo reservar."}>
          {error}
        </Alerta>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button asChild variant="secondary" size="sm">
          <Link href="/administrativo/agenda">Volver a la agenda</Link>
        </Button>
        <Button type="button" size="sm" disabled={!hueco || pendiente} onClick={confirmar}>
          {pendiente ? (reprograma ? "Reprogramando…" : "Reservando…") : reprograma ? "Reprogramar cita" : "Reservar cita"}
        </Button>
      </div>
    </div>
  );
}
