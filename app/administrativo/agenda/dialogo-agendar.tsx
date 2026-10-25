"use client";

import { useState, useTransition } from "react";
import { Alerta } from "@/components/clinica/alerta";
import { Campo } from "@/components/clinica/campo";
import { Dialogo } from "@/components/clinica/dialogo";
import { Button } from "@/components/ui/button";
import { advertenciaCancelacion } from "@/lib/citas/advertencia";
import type { HuecoLibre } from "@/lib/citas/consultas";
import type { PacienteEncontrado } from "@/lib/citas/pacientes";
import { fechaLima, horaLima } from "@/lib/ui/formato";
import { reservarCita } from "./acciones";
import { ElegirPaciente } from "./elegir-paciente";

// Agendar desde un hueco libre de la agenda del día (docs/02-diseno/BRIEF-DISENO.md, «Consola · Agenda del día»): se elige al
// paciente por su documento; el médico, la fecha y la hora vienen del hueco (solo lectura). Antes del botón se muestra la
// advertencia de la ventana de 1 hora con la hora límite. Un horario tomado entretanto da exactamente
// `Registro de cita ya agendado`, como alerta de error dentro del diálogo.
export function DialogoAgendar({
  abierto,
  alCerrar,
  hueco,
  alExito,
}: {
  abierto: boolean;
  alCerrar: () => void;
  hueco: HuecoLibre | null;
  alExito: (texto: string) => void;
}) {
  const [paciente, setPaciente] = useState<PacienteEncontrado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const advertencia = hueco ? advertenciaCancelacion(hueco.inicio) : null;

  function cerrar() {
    setError(null);
    setPaciente(null);
    alCerrar();
  }

  function reservar() {
    if (!hueco || !paciente) return;
    setError(null);
    empezar(async () => {
      const resultado = await reservarCita({
        paciente_id: paciente.id,
        medico_id: hueco.medicoId,
        inicio: hueco.inicio,
        fin: hueco.fin,
      });
      if (resultado.ok) {
        alExito(`Cita reservada para las ${horaLima(hueco.inicio)}.`);
        cerrar();
      } else {
        setError(resultado.mensaje);
      }
    });
  }

  return (
    <Dialogo
      abierto={abierto}
      alCerrar={cerrar}
      titulo="Agendar cita"
      descripcion={hueco ? `${fechaLima(hueco.inicio)} · ${horaLima(hueco.inicio)} · hora de Lima` : undefined}
      bloqueado={pendiente}
    >
      {hueco ? (
        <>
          <ElegirPaciente elegido={paciente} alElegir={setPaciente} deshabilitado={pendiente} />
          <Campo
            id="agendar-medico"
            etiqueta="Médico"
            soloLectura
            defaultValue={`${hueco.medico} · ${hueco.servicio}`}
            key={`${hueco.medicoId}-${hueco.inicio}`}
          />
          {advertencia ? <Alerta tono="aviso">{advertencia.texto}</Alerta> : null}
          {error ? (
            <Alerta tono="error" titulo="No se pudo reservar.">
              {error}
            </Alerta>
          ) : null}
        </>
      ) : null}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" size="sm" disabled={pendiente} onClick={cerrar}>
          Volver
        </Button>
        <Button type="button" size="sm" disabled={pendiente || !paciente} onClick={reservar}>
          {pendiente ? "Reservando…" : "Reservar cita"}
        </Button>
      </div>
    </Dialogo>
  );
}
