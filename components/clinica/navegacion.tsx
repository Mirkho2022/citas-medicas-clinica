"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Rol } from "@/lib/auth/rol";
import { NAVEGACION, destinoActivo } from "@/lib/ui/navegacion";
import { cn } from "@/lib/utils";

const RAIZ: Record<Rol, string> = {
  paciente: "/paciente",
  administrativo: "/administrativo",
  medico: "/medico",
  enfermera: "/enfermera",
};

// Navegación inferior del portal del paciente: tres destinos, objetivos táctiles de al menos 48 px (DESIGN.md).
export function NavegacionInferior({ rol }: { rol: Rol }) {
  const ruta = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface"
    >
      <ul className="mx-auto flex max-w-[40rem]">
        {NAVEGACION[rol].map((destino) => {
          const Icono = destino.icono;
          const activo = destinoActivo(destino, ruta, RAIZ[rol], NAVEGACION[rol]);
          const contenido = (
            <>
              <Icono className="size-6" aria-hidden="true" />
              <span className="text-label-md">{destino.etiqueta}</span>
              {destino.disponible ? null : (
                <span className="text-label-sm font-normal">Próximamente</span>
              )}
            </>
          );
          return (
            <li key={destino.ruta} className="flex-1">
              {destino.disponible ? (
                <Link
                  href={destino.ruta}
                  aria-current={activo ? "page" : undefined}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-0.5 px-2 py-2",
                    activo ? "bg-primary-soft text-primary-text" : "text-ink-muted hover:bg-primary-soft",
                  )}
                >
                  {contenido}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex min-h-16 flex-col items-center justify-center gap-0.5 px-2 py-2 text-ink-muted opacity-70"
                >
                  {contenido}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Barra lateral de la consola del personal (240 px en escritorio; en pantallas estrechas se muestra como lista horizontal).
export function NavegacionLateral({ rol }: { rol: Rol }) {
  const ruta = usePathname();
  const lista = useRef<HTMLUListElement>(null);
  // En una pantalla estrecha la lista se desplaza en horizontal y el destino actual (Horarios, Bajas médicas) podía quedar fuera de
  // vista: se centra en la lista al cambiar de página. Solo mueve la lista, nunca la página, y no hace nada si todo cabe.
  useEffect(() => {
    const contenedor = lista.current;
    const actual = contenedor?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!contenedor || !actual || contenedor.scrollWidth <= contenedor.clientWidth) return;
    const izquierda = actual.getBoundingClientRect().left - contenedor.getBoundingClientRect().left + contenedor.scrollLeft;
    contenedor.scrollLeft = izquierda - (contenedor.clientWidth - actual.offsetWidth) / 2;
  }, [ruta]);
  return (
    <nav aria-label="Principal" className="px-3 py-2 md:py-4">
      <ul ref={lista} className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {NAVEGACION[rol].map((destino) => {
          const Icono = destino.icono;
          const activo = destinoActivo(destino, ruta, RAIZ[rol], NAVEGACION[rol]);
          const contenido = (
            <>
              <Icono className="size-5 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">{destino.etiqueta}</span>
              {/* «Próximamente» va debajo de la etiqueta: con nombres largos («Notificaciones») no cabe al lado en 240 px. */}
              {destino.disponible ? null : (
                <span className="basis-full whitespace-nowrap pl-7 text-label-sm font-normal">Próximamente</span>
              )}
            </>
          );
          return (
            <li key={destino.ruta}>
              {destino.disponible ? (
                <Link
                  href={destino.ruta}
                  aria-current={activo ? "page" : undefined}
                  className={cn(
                    "flex min-h-9 items-center gap-2 rounded-md px-3 py-2 text-label-md",
                    activo ? "bg-primary-soft text-primary-text" : "text-ink-muted hover:bg-primary-soft",
                  )}
                >
                  {contenido}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex min-h-9 flex-wrap items-center gap-x-2 rounded-md px-3 py-2 text-label-md text-ink-muted opacity-70"
                >
                  {contenido}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
