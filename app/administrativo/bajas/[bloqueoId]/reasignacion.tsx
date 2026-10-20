"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alerta } from "@/components/clinica/alerta";
import { useAviso } from "@/components/clinica/aviso-temporal";
import { InsigniaEstado } from "@/components/clinica/insignia-estado";
import { Button } from "@/components/ui/button";
import type { CitaAfectada } from "@/lib/citas/consultas";
import { fechaHoraLima } from "@/lib/ui/formato";
import { cn } from "@/lib/utils";
import { reasignarPorBaja } from "../../agenda/acciones";

// Reasignación por baja (specs/reasignacion-por-baja-medica; ADR-0011): cada cita afectada con hasta 3 propuestas de sustituto de la
// misma especialidad (el mismo horario, destacado, va primero). Solo se reasignan las filas que la recepción elige: no existe
// «reasignar todo» automático; «Elegir la mejor propuesta» solo rellena la elección para revisarla. Cada fila es una transacción
// aparte: una que falla no deshace las demás, dice por qué y se puede reintentar con las propuestas nuevas. Una cita sin propuestas
// muestra el contacto del paciente («Contactar al paciente»). El paciente no se entera por esta pantalla: los avisos son de H5.
export function Reasignacion({ bloqueoId, citas }: { bloqueoId: string; citas: CitaAfectada[] }) {
  const router = useRouter();
  const { avisar } = useAviso();
  const [elegidas, setElegidas] = useState<Record<string, number>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const filas = citas.filter((c) => elegidas[c.id] !== undefined && c.propuestas[elegidas[c.id]!]);
  const conPropuestas = citas.filter((c) => c.propuestas.length > 0);

  function elegirMejores() {
    setElegidas(Object.fromEntries(conPropuestas.map((c) => [c.id, 0])));
  }

  function reasignar() {
    setGeneral(null);
    setErrores({});
    const reasignaciones = filas.map((c) => {
      const p = c.propuestas[elegidas[c.id]!]!;
      return { cita_id: c.id, medico_id: p.medicoId, inicio: p.inicio, fin: p.fin };
    });
    empezar(async () => {
      const r = await reasignarPorBaja({ bloqueo_id: bloqueoId, reasignaciones });
      if (!r.ok) {
        setGeneral(r.mensaje);
        return;
      }
      const hechas = r.datos.filas.filter((f) => f.ok).length;
      const fallidas = r.datos.filas.filter((f) => !f.ok);
      setErrores(Object.fromEntries(fallidas.flatMap((f) => (!f.ok && f.citaId ? [[f.citaId, f.mensaje]] : []))));
      // Las hechas se quitan de la elección; las fallidas quedan elegidas para reintentar (la lista se vuelve a leer).
      setElegidas((anterior) => {
        const siguiente = { ...anterior };
        for (const f of r.datos.filas) if (f.ok) delete siguiente[f.citaId];
        return siguiente;
      });
      if (hechas > 0) avisar(`${hechas} ${hechas === 1 ? "cita reasignada" : "citas reasignadas"}.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {general ? <Alerta tono="error">{general}</Alerta> : null}

      <ul className="flex flex-col gap-3">
        {citas.map((c) => {
          const nombre = `${c.paciente.nombres} ${c.paciente.apellidos}`;
          const grupo = `cita-${c.id}`;
          return (
            <li key={c.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-label-lg text-ink">{nombre}</p>
                  <p className="text-body-sm text-muted-foreground tabular-nums">
                    {c.paciente.tipoDocumento} {c.paciente.documento} · Cita actual: {fechaHoraLima(c.inicio)}
                  </p>
                </div>
                <InsigniaEstado estado={c.estado} />
              </div>

              {errores[c.id] ? <Alerta tono="error">{errores[c.id]}</Alerta> : null}

              {c.propuestas.length === 0 ? (
                <Alerta tono="aviso" titulo="Contactar al paciente">
                  No hay un médico sustituto libre de la misma especialidad. Comuníquese con {nombre}:{" "}
                  <span className="tabular-nums">{c.paciente.telefono ?? "sin teléfono registrado"}</span> · {c.paciente.email}
                </Alerta>
              ) : (
                <fieldset className="flex flex-col gap-2" disabled={pendiente}>
                  <legend className="mb-1 text-label-md text-foreground">Reasignar a</legend>
                  {c.propuestas.map((p, i) => (
                    <label
                      key={`${p.medicoId}-${p.inicio}`}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-md border px-3.5 py-2.5 text-body-md",
                        elegidas[c.id] === i ? "border-primary bg-primary-soft" : "border-border-control bg-surface hover:bg-primary-soft",
                      )}
                    >
                      <input
                        type="radio"
                        name={grupo}
                        checked={elegidas[c.id] === i}
                        onChange={() => setElegidas((a) => ({ ...a, [c.id]: i }))}
                        className="size-4 accent-primary"
                      />
                      <span className="flex-1">
                        {p.medico} · <span className="tabular-nums">{fechaHoraLima(p.inicio)}</span>
                      </span>
                      {p.mismoHorario ? (
                        <span className="rounded-sm bg-success-soft px-2 py-0.5 text-label-sm text-success">Mismo horario</span>
                      ) : null}
                    </label>
                  ))}
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-3.5 py-1.5 text-body-sm text-muted-foreground">
                    <input
                      type="radio"
                      name={grupo}
                      checked={elegidas[c.id] === undefined}
                      onChange={() =>
                        setElegidas((a) => {
                          const siguiente = { ...a };
                          delete siguiente[c.id];
                          return siguiente;
                        })
                      }
                      className="size-4 accent-primary"
                    />
                    No reasignar todavía
                  </label>
                </fieldset>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {conPropuestas.length > 0 ? (
          <Button type="button" variant="secondary" size="sm" disabled={pendiente} onClick={elegirMejores}>
            Elegir la mejor propuesta en todas
          </Button>
        ) : null}
        <Button type="button" size="sm" disabled={filas.length === 0 || pendiente} onClick={reasignar}>
          {pendiente
            ? "Reasignando…"
            : filas.length === 0
              ? "Reasignar citas"
              : `Reasignar ${filas.length} ${filas.length === 1 ? "cita" : "citas"}`}
        </Button>
      </div>
    </div>
  );
}
