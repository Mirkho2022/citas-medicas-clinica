"use client";

import { Alerta } from "@/components/clinica/alerta";
import { Button } from "@/components/ui/button";

// Límite de error de las pantallas clínicas del médico: dice con palabras claras que no se pudo cargar y deja reintentar. NO muestra
// el detalle del error (podría traer datos del paciente) ni lo escribe en la pantalla: Next lo registra en el servidor con un
// identificador (`digest`) que ayuda a encontrarlo, y el repositorio solo registra la operación y el SQLSTATE, nunca contenido.
export default function ErrorClinico({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
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
