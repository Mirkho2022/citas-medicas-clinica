"use client";

import { CheckCheck, CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { marcarAtendida } from "@/app/medico/acciones-cita";
import { useAviso } from "@/components/clinica/aviso-temporal";
import { Button } from "@/components/ui/button";
import { ID_ENCABEZADO_JORNADA, mensajeDeResultado, siguienteFoco } from "@/lib/medico/marcar-atendida";

// Pasa el foco a la cita siguiente de la jornada (cada una es un `li` con `id="cita-<id>"` y `tabindex="-1"`) o, si no queda
// ninguna, al encabezado de la jornada. Se hace ANTES de que la cita atendida salga de la lista: así el foco nunca cae al `body`.
function moverFoco(citaId: string): void {
  const ids = Array.from(document.querySelectorAll<HTMLElement>("[data-cita-jornada]")).map((el) => el.dataset.citaJornada ?? "");
  const siguiente = siguienteFoco(ids, citaId);
  const destino = (siguiente ? document.getElementById(`cita-${siguiente}`) : null) ?? document.getElementById(ID_ENCABEZADO_JORNADA);
  destino?.focus();
}

// Botón «Marcar atendida» de una cita confirmada de la jornada del médico (specs/jornada-del-medico). Llama a la acción de la agenda
// (`marcarAtendida`, `confirmada → atendida`, solo en citas propias); la jornada no escribe en `citas`. Mientras se envía queda
// deshabilitado y un segundo clic se ignora (la cita queda atendida una sola vez y sin error). El éxito se anuncia con el aviso
// temporal (una región `role="status"` que existe siempre y no quita el foco); un rechazo se muestra debajo con icono y como alerta.
export function MarcarAtendida({ citaId, descripcion }: { citaId: string; descripcion: string }) {
  const { avisar } = useAviso();
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const enviando = useRef(false);

  function marcar() {
    if (enviando.current) return;
    enviando.current = true;
    setError(null);
    empezar(async () => {
      try {
        const mensaje = mensajeDeResultado(await marcarAtendida({ cita_id: citaId }));
        if (mensaje.tipo === "exito") {
          moverFoco(citaId);
          avisar(mensaje.texto);
        } else {
          setError(mensaje.texto);
        }
      } catch {
        // Fallo de red o del servidor: nunca se muestra el error técnico.
        setError("No se pudo completar la operación. Intente nuevamente.");
      } finally {
        enviando.current = false;
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" size="sm" variant="secondary" disabled={pendiente} onClick={marcar}>
        <CheckCheck aria-hidden="true" />
        {pendiente ? "Marcando…" : "Marcar atendida"}
        <span className="sr-only"> {descripcion}</span>
      </Button>
      {error ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p role="alert" className="flex items-start gap-2 text-body-sm text-error">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
          <Button type="button" size="xs" variant="ghost" onClick={() => router.refresh()}>
            Actualizar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
