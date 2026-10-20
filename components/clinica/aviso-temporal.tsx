"use client";

import { CircleCheck } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// Aviso temporal (docs/diseno/BRIEF-DISENO.md, sección 5; componente `toast` de DESIGN.md: fondo `ink`, texto `surface`).
// Confirma una acción hecha («Cita confirmada»). La región `role="status"` existe siempre, vacía, para que el lector de pantalla
// anuncie el texto cuando aparece sin quitarle el foco al usuario. Dura 5 s: no pide ninguna acción y no es el único camino
// para saber el resultado (la fila de la agenda cambia de estado).
const DURACION_MS = 5000;
const SALIDA_MS = 160;

interface Aviso {
  id: number;
  texto: string;
  saliendo: boolean;
}

const Contexto = createContext<{ avisar: (texto: string) => void } | null>(null);

export function useAviso(): { avisar: (texto: string) => void } {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error("useAviso debe usarse dentro de <ProveedorAvisos>");
  return contexto;
}

export function ProveedorAvisos({ children }: { children: React.ReactNode }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const temporizadores = useRef<number[]>([]);
  const siguiente = useRef(0);

  const limpiar = () => {
    temporizadores.current.forEach((t) => window.clearTimeout(t));
    temporizadores.current = [];
  };

  const avisar = useCallback((texto: string) => {
    limpiar();
    const id = ++siguiente.current;
    setAviso({ id, texto, saliendo: false });
    temporizadores.current.push(
      window.setTimeout(() => setAviso((a) => (a?.id === id ? { ...a, saliendo: true } : a)), DURACION_MS),
      window.setTimeout(() => setAviso((a) => (a?.id === id ? null : a)), DURACION_MS + SALIDA_MS),
    );
  }, []);

  useEffect(() => limpiar, []);

  const valor = useMemo(() => ({ avisar }), [avisar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:inset-x-auto sm:right-6 sm:bottom-6 sm:justify-end"
      >
        {aviso ? (
          <div
            key={aviso.id}
            data-saliendo={aviso.saliendo ? "" : undefined}
            className="aviso-temporal pointer-events-auto flex max-w-[25rem] items-center gap-3 rounded-md bg-ink px-4 py-3 text-body-md text-surface shadow-popover"
          >
            <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
            {aviso.texto}
          </div>
        ) : null}
      </div>
    </Contexto.Provider>
  );
}
