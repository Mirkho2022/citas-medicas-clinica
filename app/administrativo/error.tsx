"use client";

import { Alerta } from "@/components/clinica/alerta";
import { Button } from "@/components/ui/button";

// Límite de error de la consola del administrativo: si una página no puede leer sus datos, lo dice con palabras claras y deja
// reintentar en vez de mostrar un error técnico. No muestra el detalle del error (podría traer datos de pacientes): Next lo registra en
// el servidor con un identificador (`digest`) que ayuda a encontrarlo.
export default function ErrorConsola({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-headline-lg text-ink">No se pudo cargar la página</h1>
      <Alerta tono="error">
        Ocurrió un problema al leer los datos. Intente nuevamente; si continúa, avise a soporte
        {error.digest ? ` con este código: ${error.digest}` : ""}.
      </Alerta>
      <div>
        <Button type="button" size="sm" onClick={reset}>
          Reintentar
        </Button>
      </div>
    </div>
  );
}
