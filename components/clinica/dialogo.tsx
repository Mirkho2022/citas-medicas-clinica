"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

// Diálogo de confirmación (docs/diseno/BRIEF-DISENO.md, sección 5): el elemento nativo `<dialog>`, que ya resuelve el foco
// atrapado, el cierre con Escape y el resto del teclado sin añadir una dependencia (decisión de H3, design.md D11). El padre
// controla `abierto`; al cerrarse se reproduce la salida de DESIGN.md («Motion») antes de llamar a `close()`.
// - Escape y un clic sobre el velo piden cerrar con `alCerrar`, salvo que `bloqueado` (mientras se envía una acción).
// - Una acción destructiva usa `rol="alertdialog"` y marca «Volver» con `data-foco-inicial`: el foco empieza en lo seguro.
export function Dialogo({
  abierto,
  alCerrar,
  titulo,
  descripcion,
  rol = "dialog",
  bloqueado = false,
  className,
  children,
}: {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  descripcion?: React.ReactNode;
  rol?: "dialog" | "alertdialog";
  bloqueado?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const idDescripcion = useId();

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;

    if (abierto) {
      dialogo.removeAttribute("data-saliendo");
      if (!dialogo.open) {
        dialogo.showModal();
        // `autoFocus` de React solo actúa al montar; el foco inicial de cada apertura se marca con `data-foco-inicial`.
        dialogo.querySelector<HTMLElement>("[data-foco-inicial]")?.focus();
      }
      return;
    }
    if (!dialogo.open) return;

    // Salida: se marca, se espera a que termine SU animación (las de los hijos también burbujean) y se cierra. El temporizador
    // es la red de seguridad si el navegador no anima (p. ej. con las animaciones desactivadas).
    dialogo.setAttribute("data-saliendo", "");
    let cerrado = false;
    const cerrar = () => {
      if (cerrado) return;
      cerrado = true;
      dialogo.removeAttribute("data-saliendo");
      if (dialogo.open) dialogo.close();
    };
    const alTerminar = (evento: AnimationEvent) => {
      if (evento.target === dialogo) cerrar();
    };
    dialogo.addEventListener("animationend", alTerminar);
    const temporizador = window.setTimeout(cerrar, 400);
    return () => {
      dialogo.removeEventListener("animationend", alTerminar);
      window.clearTimeout(temporizador);
      cerrar();
    };
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      role={rol}
      aria-labelledby={idTitulo}
      aria-describedby={descripcion ? idDescripcion : undefined}
      onCancel={(evento) => {
        // Escape: el padre decide; el navegador no cierra por su cuenta.
        evento.preventDefault();
        if (!bloqueado) alCerrar();
      }}
      onClick={(evento) => {
        // Un clic sobre el velo cae sobre el propio <dialog> (el contenido ocupa todo su interior).
        if (evento.target === evento.currentTarget && !bloqueado) alCerrar();
      }}
      className={cn(
        "dialogo m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-foreground shadow-dialog",
        className,
      )}
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1.5">
          <h2 id={idTitulo} className="font-display text-title-md text-ink">
            {titulo}
          </h2>
          {descripcion ? (
            <p id={idDescripcion} className="text-body-md text-muted-foreground">
              {descripcion}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </dialog>
  );
}
