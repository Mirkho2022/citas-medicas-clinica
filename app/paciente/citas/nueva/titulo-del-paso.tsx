"use client";

import { useEffect, useRef } from "react";

// Título de un paso de «Reservar cita» (design.md, D7): al llegar al paso, el foco pasa al `<h1>` para que el lector de pantalla anuncie
// dónde está la persona y el teclado siga desde ahí. La página lo monta con `key={paso}`: cada paso lo vuelve a montar y vuelve a
// enfocar. No es una trampa de foco: `tabIndex={-1}` solo permite enfocarlo por programa.
export function TituloDelPaso({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className="font-display text-headline-lg text-ink outline-none sm:text-display-lg">
      {children}
    </h1>
  );
}
