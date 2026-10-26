"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { marcarAtendida } from "@/app/medico/acciones-cita";
import { useAviso } from "@/components/clinica/aviso-temporal";
import { Alerta } from "@/components/clinica/alerta";
import { Button } from "@/components/ui/button";

// «Marcar cita como atendida» (design.md, D13): botón SECUNDARIO y aparte que invoca la acción de la agenda (H3). Firmar NO cambia
// el estado de la cita y un fallo aquí no afecta a la atención ya firmada: se muestra el mensaje de la acción y se puede reintentar.
export function BotonMarcarAtendida({ citaId }: { citaId: string }) {
  const router = useRouter();
  const { avisar } = useAviso();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      {error ? <Alerta tono="error">{error}</Alerta> : null}
      <div>
        <Button
          type="button"
          variant="secondary"
          disabled={pendiente}
          onClick={() =>
            empezar(async () => {
              setError(null);
              const resultado = await marcarAtendida({ cita_id: citaId });
              if (resultado.ok) {
                avisar("Cita marcada como atendida");
                router.refresh();
              } else {
                setError(resultado.mensaje);
              }
            })
          }
        >
          {pendiente ? "Marcando…" : "Marcar cita como atendida"}
        </Button>
      </div>
    </div>
  );
}
