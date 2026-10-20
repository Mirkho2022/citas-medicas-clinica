"use client";

import { useState, useTransition } from "react";
import { Alerta } from "@/components/clinica/alerta";
import { Campo } from "@/components/clinica/campo";
import { Dialogo } from "@/components/clinica/dialogo";
import { Button } from "@/components/ui/button";
import type { BloqueoListado } from "@/lib/citas/consultas";
import { fechaYHoraLima } from "@/lib/fechas/lima";
import { actualizarBloqueo, crearBloqueo } from "../acciones";

// `2026-10-20T08:00`: el valor de un campo `datetime-local` a partir de un instante, en hora de Lima.
const aCampoLocal = (instante: string) => {
  const { fecha, hora } = fechaYHoraLima(instante);
  return `${fecha}T${hora}`;
};

// Alta o modificación de una ausencia del médico (vacaciones, licencia, emergencia): inicio y fin escritos en hora de Lima y un
// motivo. Es lo que habilita cancelar sin la ventana de 1 hora y reasignar las citas que alcanza (ADR-0011). Al guardar, el padre
// avisa de cuántas citas vigentes caen dentro: la lista las enlaza a Bajas médicas para reasignarlas.
export function FormularioAusencia({
  abierto,
  alCerrar,
  medicoId,
  ausencia,
  alGuardar,
}: {
  abierto: boolean;
  alCerrar: () => void;
  medicoId: string;
  ausencia: BloqueoListado | null;
  alGuardar: (citasAfectadas: number) => void;
}) {
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function cerrar() {
    setCampos({});
    setError(null);
    alCerrar();
  }

  function guardar(datos: FormData) {
    setError(null);
    setCampos({});
    const entrada: Record<string, string> = { medico_id: medicoId };
    for (const [clave, valor] of datos.entries()) if (typeof valor === "string") entrada[clave] = valor;
    if (ausencia) entrada.id = ausencia.id;
    empezar(async () => {
      const r = ausencia ? await actualizarBloqueo(entrada) : await crearBloqueo(entrada);
      if (r.ok) {
        alGuardar(r.datos.citasAfectadas);
        cerrar();
        return;
      }
      setCampos(r.campos ?? {});
      setError(r.campos && Object.keys(r.campos).length > 0 ? null : r.mensaje);
    });
  }

  return (
    <Dialogo
      abierto={abierto}
      alCerrar={cerrar}
      titulo={ausencia ? "Editar ausencia" : "Agregar ausencia"}
      descripcion="Fechas y horas en hora de Lima. Durante la ausencia no se ofrecen horarios de este médico."
      bloqueado={pendiente}
      className="w-[min(36rem,calc(100vw-2rem))]"
    >
      <form action={guardar} noValidate className="flex flex-col gap-4" key={ausencia?.id ?? "nueva"}>
        {error ? <Alerta tono="error">{error}</Alerta> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            id="ausencia-inicio"
            name="inicio"
            etiqueta="Desde"
            type="datetime-local"
            defaultValue={ausencia ? aCampoLocal(ausencia.desde) : ""}
            error={campos.inicio}
          />
          <Campo
            id="ausencia-fin"
            name="fin"
            etiqueta="Hasta"
            type="datetime-local"
            defaultValue={ausencia ? aCampoLocal(ausencia.hasta) : ""}
            error={campos.fin}
          />
        </div>
        <Campo
          id="ausencia-motivo"
          name="motivo"
          etiqueta="Motivo"
          autoComplete="off"
          placeholder="Vacaciones, licencia, emergencia…"
          defaultValue={ausencia?.motivo ?? ""}
          error={campos.motivo}
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="sm" disabled={pendiente} onClick={cerrar}>
            Volver
          </Button>
          <Button type="submit" size="sm" disabled={pendiente}>
            {pendiente ? "Guardando…" : "Guardar ausencia"}
          </Button>
        </div>
      </form>
    </Dialogo>
  );
}
