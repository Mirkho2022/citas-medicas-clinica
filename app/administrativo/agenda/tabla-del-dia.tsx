"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Alerta } from "@/components/clinica/alerta";
import { useAviso } from "@/components/clinica/aviso-temporal";
import { InsigniaEstado } from "@/components/clinica/insignia-estado";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TEXTO_MENOS_DE_UNA_HORA } from "@/lib/citas/acciones-visibles";
import type { HuecoLibre } from "@/lib/citas/consultas";
import { horaLima } from "@/lib/ui/formato";
import { cn } from "@/lib/utils";
import { cancelarCita, confirmarCita, marcarNoAsistio } from "./acciones";
import { DialogoAgendar } from "./dialogo-agendar";
import { DialogoConfirmarAccion } from "./dialogo-confirmar-accion";
import type { CitaVista, FilaVista } from "./tipos";

type Contenido = { tipo: "cancelar" | "no_asistio"; cita: CitaVista } | { tipo: "agendar"; hueco: HuecoLibre };

// Tabla de la agenda del día (docs/02-diseno/BRIEF-DISENO.md, «Consola · Agenda del día»): las citas con los huecos libres
// intercalados. Cada fila ofrece solo lo que corresponde a su estado y hora (lib/citas/acciones-visibles.ts); la autoridad
// son los disparadores de la base de datos. «Confirmar» es directo (y avisa con un aviso temporal); «Cancelar» y «No asistió»
// piden confirmación en un diálogo; «Reprogramar» lleva a la pantalla de agendar con la cita elegida; «Agendar» abre un diálogo
// sobre el hueco. Tras cada acción la página se vuelve a leer en el servidor (la acción refresca la ruta).
export function TablaDelDia({ filas, titulo }: { filas: FilaVista[]; titulo: string }) {
  const { avisar } = useAviso();
  const [contenido, setContenido] = useState<Contenido | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [, empezar] = useTransition();

  const abrir = (c: Contenido) => {
    setContenido(c);
    setAbierto(true);
  };
  const cerrar = () => setAbierto(false);

  function confirmar(cita: CitaVista) {
    setError(null);
    setConfirmando(cita.id);
    empezar(async () => {
      const resultado = await confirmarCita({ cita_id: cita.id });
      setConfirmando(null);
      if (resultado.ok) avisar(`Cita de las ${horaLima(cita.inicio)} confirmada.`);
      else setError(resultado.mensaje);
    });
  }

  if (filas.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-6">
        <p className="text-title-md text-ink">No hay citas ni horarios para este día</p>
        <p className="text-body-md text-muted-foreground">
          El médico no atiende ese día, está de baja o ya pasó la hora de todos sus horarios. Pruebe con otro día u otro médico.
        </p>
      </div>
    );
  }

  const nombre = (c: CitaVista) => `${c.paciente.nombres} ${c.paciente.apellidos}`;

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alerta tono="error">{error}</Alerta> : null}

      <div className="overflow-auto rounded-lg border border-border bg-surface">
        <Table>
          <caption className="sr-only">{titulo}</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col" className="w-20">Hora</TableHead>
              <TableHead scope="col">Paciente</TableHead>
              <TableHead scope="col" className="w-36 hidden md:table-cell">Documento</TableHead>
              <TableHead scope="col" className="hidden md:table-cell">Médico y servicio</TableHead>
              <TableHead scope="col" className="md:w-36">Estado</TableHead>
              <TableHead scope="col" className="text-right md:w-[22rem]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((fila) =>
              fila.tipo === "hueco" ? (
                <TableRow key={`hueco-${fila.medicoId}-${fila.inicio}`} className="bg-canvas">
                  <TableCell className="tabular-nums font-semibold">{horaLima(fila.inicio)}</TableCell>
                  <TableCell className="text-muted-foreground">—</TableCell>
                  <TableCell className="hidden md:table-cell" />
                  <TableCell className="hidden md:table-cell whitespace-normal text-muted-foreground">
                    {fila.medico} · {fila.servicio}
                  </TableCell>
                  <TableCell className="text-muted-foreground">Libre</TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="secondary" size="sm" onClick={() => abrir({ tipo: "agendar", hueco: fila })}>
                      Agendar<span className="sr-only"> a las {horaLima(fila.inicio)} con {fila.medico}</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={fila.id} className={cn(fila.estado === "cancelada" && "text-muted-foreground")}>
                  <TableCell className="tabular-nums font-semibold">{horaLima(fila.inicio)}</TableCell>
                  <TableCell className="whitespace-normal">{nombre(fila)}</TableCell>
                  <TableCell className="hidden md:table-cell tabular-nums">
                    {fila.paciente.tipoDocumento} {fila.paciente.documento}
                  </TableCell>
                  <TableCell className="hidden md:table-cell whitespace-normal">
                    {fila.medico} · {fila.servicio}
                  </TableCell>
                  <TableCell>
                    <InsigniaEstado estado={fila.estado} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {fila.acciones.confirmar ? (
                        <Button type="button" variant="secondary" size="sm" disabled={confirmando === fila.id} onClick={() => confirmar(fila)}>
                          {confirmando === fila.id ? "Confirmando…" : "Confirmar"}
                          <span className="sr-only"> la cita de {nombre(fila)} a las {horaLima(fila.inicio)}</span>
                        </Button>
                      ) : null}
                      {fila.acciones.noAsistio ? (
                        <Button type="button" variant="secondary" size="sm" onClick={() => abrir({ tipo: "no_asistio", cita: fila })}>
                          No asistió<span className="sr-only"> la cita de {nombre(fila)} a las {horaLima(fila.inicio)}</span>
                        </Button>
                      ) : null}
                      {fila.acciones.reprogramar ? (
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/administrativo/agenda/nueva?reprogramar=${fila.id}`}>
                            Reprogramar<span className="sr-only"> la cita de {nombre(fila)} a las {horaLima(fila.inicio)}</span>
                          </Link>
                        </Button>
                      ) : null}
                      {fila.acciones.cancelar ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-error hover:bg-error-soft"
                          onClick={() => abrir({ tipo: "cancelar", cita: fila })}
                        >
                          Cancelar<span className="sr-only"> la cita de {nombre(fila)} a las {horaLima(fila.inicio)}</span>
                        </Button>
                      ) : null}
                      {fila.acciones.avisoMenosDeUnaHora ? (
                        <span className="max-w-[12rem] text-right text-body-sm text-muted-foreground">{TEXTO_MENOS_DE_UNA_HORA}</span>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      </div>

      {contenido?.tipo === "cancelar" ? (
        <DialogoConfirmarAccion
          abierto={abierto}
          alCerrar={cerrar}
          titulo="¿Cancelar esta cita?"
          descripcion={`${nombre(contenido.cita)} · ${horaLima(contenido.cita.inicio)}. El horario quedará libre.`}
          textoAccion="Cancelar cita"
          textoCarga="Cancelando…"
          destructivo
          ejecutar={() => cancelarCita({ cita_id: contenido.cita.id })}
          alExito={() => avisar("Cita cancelada. El horario quedó libre.")}
        />
      ) : null}
      {contenido?.tipo === "no_asistio" ? (
        <DialogoConfirmarAccion
          abierto={abierto}
          alCerrar={cerrar}
          titulo="Marcar «No asistió»"
          descripcion={`${nombre(contenido.cita)} · ${horaLima(contenido.cita.inicio)}. Esta marca no se puede deshacer.`}
          textoAccion="Marcar «No asistió»"
          textoCarga="Guardando…"
          ejecutar={() => marcarNoAsistio({ cita_id: contenido.cita.id })}
          alExito={() => avisar("Marcada como «No asistió».")}
        />
      ) : null}
      {contenido?.tipo === "agendar" ? (
        <DialogoAgendar
          key={`${contenido.hueco.medicoId}-${contenido.hueco.inicio}`}
          abierto={abierto}
          alCerrar={cerrar}
          hueco={contenido.hueco}
          alExito={avisar}
        />
      ) : null}
    </div>
  );
}
