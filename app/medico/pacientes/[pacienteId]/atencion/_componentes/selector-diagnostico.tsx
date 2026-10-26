"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface OpcionDiagnostico {
  codigo: string;
  descripcion: string;
}

const RETRASO_MS = 200;
const MINIMO = 2;

// Selector de diagnóstico CIE-10 (specs/registro-de-atencion, «Carga rápida»; design.md, D9): combobox accesible con el patrón
// de lista (ARIA 1.2): el foco se queda en el campo y la opción activa se anuncia con `aria-activedescendant`. Se opera solo con el
// teclado (flechas, Enter, Escape). La búsqueda espera 200 ms desde la última tecla y cancela la anterior; el número de resultados
// se anuncia en una región `status`. El código elegido se guarda; la descripción oficial la pone la base de datos desde el catálogo.
export function SelectorDiagnostico({
  urlBusqueda,
  yaElegidos,
  alElegir,
  error,
}: {
  urlBusqueda: string;
  yaElegidos: readonly string[];
  alElegir: (opcion: OpcionDiagnostico) => void;
  error?: string;
}) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [opciones, setOpciones] = useState<OpcionDiagnostico[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(-1);
  const [estado, setEstado] = useState<"reposo" | "buscando" | "error">("reposo");
  const [anuncio, setAnuncio] = useState("");
  const controlador = useRef<AbortController | null>(null);

  const idLista = `${id}-lista`;
  const idOpcion = (i: number) => `${id}-op-${i}`;

  useEffect(() => {
    controlador.current?.abort();
    const termino = texto.trim();
    if (Array.from(termino).length < MINIMO) {
      setOpciones([]);
      setEstado("reposo");
      setAnuncio("");
      return;
    }
    const temporizador = window.setTimeout(async () => {
      const abortar = new AbortController();
      controlador.current = abortar;
      setEstado("buscando");
      try {
        const respuesta = await fetch(`${urlBusqueda}?q=${encodeURIComponent(termino)}`, { signal: abortar.signal, cache: "no-store" });
        if (!respuesta.ok) throw new Error("búsqueda rechazada");
        const { resultados } = (await respuesta.json()) as { resultados: OpcionDiagnostico[] };
        setOpciones(resultados);
        setActiva(resultados.length > 0 ? 0 : -1);
        setEstado("reposo");
        setAbierto(true);
        setAnuncio(
          resultados.length === 0
            ? "Sin resultados en el catálogo"
            : `${resultados.length} ${resultados.length === 1 ? "resultado" : "resultados"}. Use las flechas para elegir.`,
        );
      } catch (excepcion) {
        if ((excepcion as { name?: string }).name === "AbortError") return;
        setOpciones([]);
        setEstado("error");
        setAnuncio("No se pudo buscar en el catálogo");
      }
    }, RETRASO_MS);
    return () => {
      window.clearTimeout(temporizador);
      controlador.current?.abort();
    };
  }, [texto, urlBusqueda]);

  function elegir(opcion: OpcionDiagnostico | undefined) {
    if (!opcion) return;
    if (yaElegidos.includes(opcion.codigo)) {
      setAnuncio(`${opcion.codigo} ya está en la lista`);
      return;
    }
    alElegir(opcion);
    setTexto("");
    setOpciones([]);
    setAbierto(false);
    setActiva(-1);
    setAnuncio(`${opcion.codigo} agregado`);
  }

  function alPulsar(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      if (!abierto && opciones.length > 0) setAbierto(true);
      setActiva((i) => (opciones.length === 0 ? -1 : (i + 1) % opciones.length));
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setActiva((i) => (opciones.length === 0 ? -1 : (i <= 0 ? opciones.length - 1 : i - 1)));
    } else if (evento.key === "Enter") {
      // Con la lista abierta, Enter elige y NO envía el formulario.
      if (abierto && activa >= 0) {
        evento.preventDefault();
        elegir(opciones[activa]);
      } else {
        evento.preventDefault();
      }
    } else if (evento.key === "Escape" && abierto) {
      evento.preventDefault();
      setAbierto(false);
    }
  }

  const mostrarLista = abierto && opciones.length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-entrada`}>Buscar diagnóstico (código o nombre CIE-10)</Label>
      <div className="relative">
        <Input
          id={`${id}-entrada`}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={mostrarLista}
          aria-controls={idLista}
          aria-activedescendant={mostrarLista && activa >= 0 ? idOpcion(activa) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-ayuda${error ? ` ${id}-error` : ""}`}
          placeholder="Por ejemplo: J00 o cefalea"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
          }}
          onKeyDown={alPulsar}
          onBlur={() => setAbierto(false)}
        />
        <ul
          id={idLista}
          role="listbox"
          aria-label="Resultados del catálogo CIE-10"
          hidden={!mostrarLista}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-surface py-1 shadow-dialog"
        >
          {opciones.map((opcion, i) => (
            <li
              key={opcion.codigo}
              id={idOpcion(i)}
              role="option"
              aria-selected={i === activa}
              // `mousedown` (no `click`) para elegir antes de que el campo pierda el foco y cierre la lista.
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(opcion);
              }}
              onMouseEnter={() => setActiva(i)}
              className={cn(
                "flex cursor-pointer gap-3 px-3.5 py-2 text-body-md text-foreground",
                i === activa && "bg-primary-soft",
              )}
            >
              <span className="w-16 shrink-0 font-heading text-label-md tabular-nums">{opcion.codigo}</span>
              <span>{opcion.descripcion}</span>
              {yaElegidos.includes(opcion.codigo) ? <span className="ml-auto text-label-sm text-muted-foreground">Ya agregado</span> : null}
            </li>
          ))}
        </ul>
      </div>
      <p id={`${id}-ayuda`} className="text-body-sm text-muted-foreground">
        Escriba al menos {MINIMO} caracteres. Elija con las flechas y Enter.
        {estado === "buscando" ? " Buscando…" : ""}
        {estado === "error" ? " No se pudo buscar en el catálogo; intente de nuevo." : ""}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {anuncio}
      </p>
      {error ? (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-2 text-body-sm text-error">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
