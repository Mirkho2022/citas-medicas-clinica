"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAviso } from "@/components/clinica/aviso-temporal";
import { Button } from "@/components/ui/button";
import type { BloqueoListado, TramoListado } from "@/lib/citas/consultas";
import { textoFecha } from "@/lib/ui/calendario";
import { fechaHoraLima } from "@/lib/ui/formato";
import { DialogoConfirmarAccion } from "../../agenda/dialogo-confirmar-accion";
import { eliminarBloqueo, eliminarDisponibilidad } from "../acciones";
import { FormularioAusencia } from "./formulario-ausencia";
import { DIAS, FormularioTramo } from "./formulario-tramo";

type Contenido =
  | { tipo: "tramo"; tramo: TramoListado | null }
  | { tipo: "borrar-tramo"; tramo: TramoListado }
  | { tipo: "ausencia"; ausencia: BloqueoListado | null }
  | { tipo: "borrar-ausencia"; ausencia: BloqueoListado };

const nombreDia = (d: number) => DIAS.find((x) => x.valor === d)?.nombre ?? "";
const textoTramo = (t: TramoListado) => `${nombreDia(t.diaSemana)} ${t.horaInicio}–${t.horaFin}`;
const vigencia = (t: TramoListado) =>
  `desde el ${textoFecha(t.vigenteDesde)}${t.vigenteHasta ? ` hasta el ${textoFecha(t.vigenteHasta)}` : ""}`;

// Plantilla semanal y ausencias de un médico (specs/disponibilidad-y-slots; design.md, D11). Agregar, editar y eliminar abren un
// diálogo; eliminar pide confirmación y deja claro que las citas ya agendadas no se cancelan. Después de cada cambio la página se
// vuelve a leer en el servidor: la sección «Citas fuera del horario» (9.3) y las ausencias con citas por reasignar se recalculan.
export function GestorHorarios({
  medicoId,
  tramos,
  ausencias,
  activo,
}: {
  medicoId: string;
  tramos: TramoListado[];
  ausencias: BloqueoListado[];
  activo: boolean;
}) {
  const { avisar } = useAviso();
  const [contenido, setContenido] = useState<Contenido | null>(null);
  const [abierto, setAbierto] = useState(false);
  const abrir = (c: Contenido) => {
    setContenido(c);
    setAbierto(true);
  };
  const cerrar = () => setAbierto(false);

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="titulo-plantilla" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="titulo-plantilla" className="font-display text-headline-md text-ink">
            Horario semanal
          </h2>
          <Button type="button" size="sm" disabled={!activo} onClick={() => abrir({ tipo: "tramo", tramo: null })}>
            <Plus aria-hidden="true" />
            Agregar horario
          </Button>
        </div>
        {activo ? null : <p className="text-body-sm text-muted-foreground">Este médico está de baja: no se ofrecen sus horarios.</p>}
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {DIAS.map((dia) => {
            const delDia = tramos.filter((t) => t.diaSemana === dia.valor);
            return (
              <li key={dia.valor} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-6">
                <h3 className="w-28 shrink-0 text-label-lg text-ink">{dia.nombre}</h3>
                {delDia.length === 0 ? (
                  <p className="text-body-sm text-muted-foreground">Sin horario</p>
                ) : (
                  <ul className="flex flex-1 flex-col gap-2">
                    {delDia.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-body-md tabular-nums">
                          <span className="font-semibold">
                            {t.horaInicio}–{t.horaFin}
                          </span>{" "}
                          · cada {t.duracionSlotMin} min · <span className="text-muted-foreground">{vigencia(t)}</span>
                        </p>
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="sm" onClick={() => abrir({ tipo: "tramo", tramo: t })}>
                            Editar<span className="sr-only"> el horario del {textoTramo(t)}</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-error hover:bg-error-soft"
                            onClick={() => abrir({ tipo: "borrar-tramo", tramo: t })}
                          >
                            Eliminar<span className="sr-only"> el horario del {textoTramo(t)}</span>
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="titulo-ausencias" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="titulo-ausencias" className="font-display text-headline-md text-ink">
            Ausencias
          </h2>
          <Button type="button" variant="secondary" size="sm" onClick={() => abrir({ tipo: "ausencia", ausencia: null })}>
            <Plus aria-hidden="true" />
            Agregar ausencia
          </Button>
        </div>
        {ausencias.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface p-4 text-body-md text-muted-foreground">
            Sin ausencias vigentes ni futuras.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {ausencias.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <p className="text-body-md tabular-nums">
                    <span className="font-semibold">{fechaHoraLima(a.desde)}</span> → <span className="font-semibold">{fechaHoraLima(a.hasta)}</span>
                  </p>
                  <p className="text-body-sm text-muted-foreground">{a.motivo}</p>
                  {a.porReasignar > 0 ? (
                    <p className="text-body-sm text-warning">
                      {a.porReasignar} {a.porReasignar === 1 ? "cita vigente cae" : "citas vigentes caen"} dentro de esta ausencia.{" "}
                      <Link className="font-semibold underline underline-offset-2" href={`/administrativo/bajas/${a.id}`}>
                        Reasignar
                      </Link>
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => abrir({ tipo: "ausencia", ausencia: a })}>
                    Editar<span className="sr-only"> la ausencia que empieza el {fechaHoraLima(a.desde)}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-error hover:bg-error-soft"
                    onClick={() => abrir({ tipo: "borrar-ausencia", ausencia: a })}
                  >
                    Eliminar<span className="sr-only"> la ausencia que empieza el {fechaHoraLima(a.desde)}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {contenido?.tipo === "tramo" ? (
        <FormularioTramo
          abierto={abierto}
          alCerrar={cerrar}
          medicoId={medicoId}
          tramo={contenido.tramo}
          alGuardar={(fuera) =>
            avisar(
              fuera > 0
                ? `Horario guardado. ${fuera} ${fuera === 1 ? "cita queda fuera" : "citas quedan fuera"} del horario: revíselas en «Citas fuera del horario».`
                : "Horario guardado.",
            )
          }
        />
      ) : null}
      {contenido?.tipo === "borrar-tramo" ? (
        <DialogoConfirmarAccion
          abierto={abierto}
          alCerrar={cerrar}
          titulo="¿Eliminar este horario?"
          descripcion={`${textoTramo(contenido.tramo)} · cada ${contenido.tramo.duracionSlotMin} min. Las citas ya agendadas no se cancelan.`}
          textoAccion="Eliminar horario"
          textoCarga="Eliminando…"
          destructivo
          ejecutar={() => eliminarDisponibilidad({ id: contenido.tramo.id, medico_id: medicoId })}
          alExito={() => avisar("Horario eliminado.")}
        />
      ) : null}
      {contenido?.tipo === "ausencia" ? (
        <FormularioAusencia
          abierto={abierto}
          alCerrar={cerrar}
          medicoId={medicoId}
          ausencia={contenido.ausencia}
          alGuardar={(n) =>
            avisar(n > 0 ? `Ausencia guardada. ${n} ${n === 1 ? "cita vigente cae" : "citas vigentes caen"} dentro: reasígnelas.` : "Ausencia guardada.")
          }
        />
      ) : null}
      {contenido?.tipo === "borrar-ausencia" ? (
        <DialogoConfirmarAccion
          abierto={abierto}
          alCerrar={cerrar}
          titulo="¿Eliminar esta ausencia?"
          descripcion={`${fechaHoraLima(contenido.ausencia.desde)} → ${fechaHoraLima(contenido.ausencia.hasta)} · ${contenido.ausencia.motivo}. El médico volverá a tener horarios libres en ese periodo.`}
          textoAccion="Eliminar ausencia"
          textoCarga="Eliminando…"
          destructivo
          ejecutar={() => eliminarBloqueo({ id: contenido.ausencia.id, medico_id: medicoId })}
          alExito={() => avisar("Ausencia eliminada.")}
        />
      ) : null}
    </div>
  );
}
