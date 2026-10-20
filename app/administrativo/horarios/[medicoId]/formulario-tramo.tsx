"use client";

import { useState, useTransition } from "react";
import { Alerta } from "@/components/clinica/alerta";
import { Campo } from "@/components/clinica/campo";
import { Dialogo } from "@/components/clinica/dialogo";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { TramoListado } from "@/lib/citas/consultas";
import { guardarDisponibilidad } from "../acciones";

// Lunes primero, como la plantilla de la pantalla; el valor es el de la base de datos (0 = domingo).
export const DIAS: ReadonlyArray<{ valor: number; nombre: string }> = [
  { valor: 1, nombre: "Lunes" },
  { valor: 2, nombre: "Martes" },
  { valor: 3, nombre: "Miércoles" },
  { valor: 4, nombre: "Jueves" },
  { valor: 5, nombre: "Viernes" },
  { valor: 6, nombre: "Sábado" },
  { valor: 0, nombre: "Domingo" },
];

// Alta o modificación de un tramo de la plantilla semanal (specs/disponibilidad-y-slots). La validación de verdad es la del
// servidor: un campo inválido muestra su mensaje debajo y un horario que se cruza con otro del médico, el suyo propio
// («Este horario se cruza con otro ya definido para el médico»), nunca el de la doble reserva. Al guardar, el padre avisa de las
// citas que la plantilla ya no cubre (no se cancelan).
export function FormularioTramo({
  abierto,
  alCerrar,
  medicoId,
  tramo,
  alGuardar,
}: {
  abierto: boolean;
  alCerrar: () => void;
  medicoId: string;
  tramo: TramoListado | null;
  alGuardar: (fueraDelHorario: number) => void;
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
    if (tramo) entrada.id = tramo.id;
    empezar(async () => {
      const r = await guardarDisponibilidad(entrada);
      if (r.ok) {
        alGuardar(r.datos.fueraDelHorario.cantidad);
        cerrar();
        return;
      }
      setCampos(r.campos ?? {});
      setError(r.campos && Object.keys(r.campos).length > 0 ? null : r.mensaje);
    });
  }

  return (
    <Dialogo abierto={abierto} alCerrar={cerrar} titulo={tramo ? "Editar horario" : "Agregar horario"} bloqueado={pendiente} className="w-[min(36rem,calc(100vw-2rem))]">
      <form action={guardar} noValidate className="flex flex-col gap-4" key={tramo?.id ?? "nuevo"}>
        {error ? <Alerta tono="error">{error}</Alerta> : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tramo-dia">Día de la semana</Label>
          <select
            id="tramo-dia"
            name="dia_semana"
            defaultValue={tramo?.diaSemana ?? 1}
            aria-describedby={campos.dia_semana ? "tramo-dia-error" : undefined}
            className="h-11 w-full rounded-md border border-input bg-surface px-3.5 text-body-md text-foreground"
          >
            {DIAS.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.nombre}
              </option>
            ))}
          </select>
          {campos.dia_semana ? (
            <p id="tramo-dia-error" role="alert" className="text-body-sm text-error">
              {campos.dia_semana}
            </p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="tramo-inicio" name="hora_inicio" etiqueta="Hora de inicio" type="time" defaultValue={tramo?.horaInicio ?? "08:00"} error={campos.hora_inicio} />
          <Campo id="tramo-fin" name="hora_fin" etiqueta="Hora de fin" type="time" defaultValue={tramo?.horaFin === "24:00" ? "" : (tramo?.horaFin ?? "12:00")} error={campos.hora_fin} />
          <Campo
            id="tramo-duracion"
            name="duracion_slot_min"
            etiqueta="Minutos por cita"
            type="number"
            min={1}
            inputMode="numeric"
            defaultValue={tramo?.duracionSlotMin ?? 20}
            error={campos.duracion_slot_min}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            id="tramo-desde"
            name="vigente_desde"
            etiqueta="Vigente desde (opcional)"
            type="date"
            defaultValue={tramo?.vigenteDesde ?? ""}
            ayuda="Vacío: desde hoy."
            error={campos.vigente_desde}
          />
          <Campo
            id="tramo-hasta"
            name="vigente_hasta"
            etiqueta="Vigente hasta (opcional)"
            type="date"
            defaultValue={tramo?.vigenteHasta ?? ""}
            ayuda="Vacío: sin vencimiento."
            error={campos.vigente_hasta}
          />
        </div>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="sm" disabled={pendiente} onClick={cerrar}>
            Volver
          </Button>
          <Button type="submit" size="sm" disabled={pendiente}>
            {pendiente ? "Guardando…" : "Guardar horario"}
          </Button>
        </div>
      </form>
    </Dialogo>
  );
}
