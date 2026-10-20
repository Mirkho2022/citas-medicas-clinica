"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ABREVIATURAS_SEMANA,
  celdasDelMes,
  diaDeLaSemana,
  etiquetaFecha,
  mesDeFecha,
  sumarMeses,
  textoFechaConDia,
  textoMes,
} from "@/lib/ui/calendario";
import { cn } from "@/lib/utils";

// Selector de fecha (docs/diseno/BRIEF-DISENO.md, sección 5): un botón con la fecha elegida que abre un calendario. Menú flotante
// bajo el botón en escritorio y hoja inferior en móvil (el mismo elemento: cambia por CSS a 640 px, ver app/movimiento.css).
// Cada día es un enlace a la misma ruta con `?fecha=AAAA-MM-DD`: la fecha vive en la URL y la página se vuelve a leer en el
// servidor, sin estado de formulario. Domingos y días fuera de rango o sin horarios se ven deshabilitados (y así se anuncian);
// los días con horarios llevan un punto; hoy lleva borde; el elegido, el color de marca.
export function SelectorFecha({
  fecha,
  hoy,
  ruta,
  parametros = {},
  nombreParametro = "fecha",
  diasConHorarios,
  deshabilitarDomingos = false,
  desde,
  hasta,
  etiqueta = "Elegir la fecha",
}: {
  // Fecha elegida y fecha de hoy en Lima (`AAAA-MM-DD`).
  fecha: string;
  hoy: string;
  // Ruta a la que enlaza cada día y el resto de parámetros de la URL que se conservan (por ejemplo el médico).
  ruta: string;
  parametros?: Record<string, string | undefined>;
  nombreParametro?: string;
  // Si se da, solo estos días se pueden elegir y llevan punto; si no, todos (salvo domingos, si se pide, y el rango).
  diasConHorarios?: readonly string[];
  deshabilitarDomingos?: boolean;
  desde?: string;
  hasta?: string;
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState(() => mesDeFecha(fecha));
  const idPanel = useId();
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const conHorarios = diasConHorarios ? new Set(diasConHorarios) : null;

  function alternar() {
    setMes(mesDeFecha(fecha));
    setAbierto((a) => !a);
  }

  function cerrar(devolverFoco: boolean) {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }

  // Al abrir, el foco va al día elegido; Escape cierra y devuelve el foco al botón.
  useEffect(() => {
    if (!abierto) return;
    panel.current?.querySelector<HTMLElement>("[aria-current='date'], [data-dia]:not([aria-disabled='true'])")?.focus();
  }, [abierto, mes]);

  const hrefDe = (dia: string) => {
    const consulta = new URLSearchParams();
    for (const [clave, valor] of Object.entries(parametros)) if (valor) consulta.set(clave, valor);
    consulta.set(nombreParametro, dia);
    return `${ruta}?${consulta.toString()}`;
  };

  const habilitado = (dia: string) => {
    if (desde && dia < desde) return false;
    if (hasta && dia > hasta) return false;
    if (deshabilitarDomingos && diaDeLaSemana(dia) === 0) return false;
    if (conHorarios && !conHorarios.has(dia)) return false;
    return true;
  };

  const anteriorMes = sumarMeses(mes, -1);
  const siguienteMes = sumarMeses(mes, 1);
  const primerDia = ({ anio, mes: m }: { anio: number; mes: number }) => `${anio}-${String(m + 1).padStart(2, "0")}-01`;
  // No se navega a un mes entero fuera del rango permitido.
  const sinMesAnterior = desde ? primerDia(mes) <= desde : false;
  const sinMesSiguiente = hasta ? primerDia(siguienteMes) > hasta : false;

  return (
    <div className="relative">
      <Button
        ref={boton}
        type="button"
        variant="secondary"
        size="sm"
        className="min-w-[13.75rem] justify-between tabular-nums"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        onClick={alternar}
      >
        <span>{textoFechaConDia(fecha)}</span>
        <CalendarDays aria-hidden="true" />
      </Button>

      {abierto ? (
        <>
          {/* Velo transparente: un clic fuera cierra. En móvil además atenúa la página tras la hoja. */}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Cerrar el calendario"
            onClick={() => cerrar(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent max-sm:bg-ink/40"
          />
          <div
            ref={panel}
            id={idPanel}
            role="dialog"
            aria-label={etiqueta}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                cerrar(true);
              }
            }}
            className="calendario-flotante fixed inset-x-0 bottom-0 z-50 rounded-t-lg border border-border bg-surface p-4 shadow-popover sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:w-[21.5rem] sm:rounded-lg"
          >
            <div className="mb-3 flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Mes anterior"
                disabled={sinMesAnterior}
                onClick={() => setMes(anteriorMes)}
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <span aria-live="polite" className="text-label-lg capitalize text-ink">
                {textoMes(mes)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Mes siguiente"
                disabled={sinMesSiguiente}
                onClick={() => setMes(siguienteMes)}
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
            <div aria-hidden="true" className="mb-1 grid grid-cols-7 text-center text-label-sm text-muted-foreground">
              {ABREVIATURAS_SEMANA.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {celdasDelMes(mes).map((dia, i) => {
                if (!dia) return <span key={`vacio-${i}`} />;
                const numero = Number(dia.slice(8));
                const elegido = dia === fecha;
                const base =
                  "relative flex size-10 items-center justify-center justify-self-center rounded-md text-body-sm tabular-nums";
                if (!habilitado(dia)) {
                  return (
                    <span
                      key={dia}
                      data-dia
                      aria-disabled="true"
                      aria-label={`${etiquetaFecha(dia)}, no disponible`}
                      className={cn(base, "cursor-not-allowed text-muted-foreground opacity-50")}
                    >
                      {numero}
                    </span>
                  );
                }
                return (
                  <Link
                    key={dia}
                    data-dia
                    href={hrefDe(dia)}
                    aria-label={etiquetaFecha(dia)}
                    aria-current={elegido ? "date" : undefined}
                    onClick={() => setAbierto(false)}
                    className={cn(
                      base,
                      "transition-colors outline-none focus-visible:shadow-focus-ring",
                      elegido ? "bg-primary text-primary-foreground" : "text-ink hover:bg-primary-soft",
                      dia === hoy && !elegido ? "border border-primary" : null,
                    )}
                  >
                    {numero}
                    {conHorarios ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute bottom-1 size-1 rounded-full",
                          elegido ? "bg-primary-foreground" : "bg-primary",
                        )}
                      />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
