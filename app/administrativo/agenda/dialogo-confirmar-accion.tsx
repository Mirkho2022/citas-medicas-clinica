"use client";

import { useState, useTransition } from "react";
import { Alerta } from "@/components/clinica/alerta";
import { Dialogo } from "@/components/clinica/dialogo";
import { Button } from "@/components/ui/button";
import type { ResultadoAccion } from "@/lib/acciones/resultado";

// Confirmación de una acción sobre una cita (cancelar, «No asistió»): un diálogo con «Volver» (el foco empieza ahí) y la
// acción. Mientras se envía no se puede cerrar y el botón dice qué hace («Cancelando…»). Un rechazo de la base de datos
// (por ejemplo, la ventana de 1 hora) se muestra dentro del diálogo, con su mensaje, y la cita no cambia.
export function DialogoConfirmarAccion({
  abierto,
  alCerrar,
  titulo,
  descripcion,
  textoAccion,
  textoCarga,
  destructivo = false,
  ejecutar,
  alExito,
}: {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  descripcion: React.ReactNode;
  textoAccion: string;
  textoCarga: string;
  destructivo?: boolean;
  ejecutar: () => Promise<ResultadoAccion<unknown>>;
  alExito: () => void;
}) {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cerrar() {
    setError(null);
    alCerrar();
  }

  function aceptar() {
    setError(null);
    empezar(async () => {
      const resultado = await ejecutar();
      if (resultado.ok) {
        alExito();
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
      titulo={titulo}
      descripcion={descripcion}
      rol={destructivo ? "alertdialog" : "dialog"}
      bloqueado={pendiente}
    >
      {error ? <Alerta tono="error">{error}</Alerta> : null}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" size="sm" data-foco-inicial disabled={pendiente} onClick={cerrar}>
          Volver
        </Button>
        <Button type="button" variant={destructivo ? "destructive" : "default"} size="sm" disabled={pendiente} onClick={aceptar}>
          {pendiente ? textoCarga : textoAccion}
        </Button>
      </div>
    </Dialogo>
  );
}
