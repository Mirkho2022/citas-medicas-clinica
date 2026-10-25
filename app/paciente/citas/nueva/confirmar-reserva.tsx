"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Alerta } from "@/components/clinica/alerta";
import { Button } from "@/components/ui/button";
import { fallo as crearFallo, type Fallo } from "@/lib/acciones/resultado";
import { MENSAJE_SESION_VENCIDA_RESERVA } from "@/lib/portal/mensajes";
import { reservarCitaDelPortal } from "./acciones";

// Último paso de «Reservar cita» (specs/busqueda-y-reserva-de-cita; design.md, D7 y D8). El botón queda deshabilitado con «Reservando…»
// mientras se envía y después de reservar (hasta que la página cambia), y un segundo toque no envía nada: el servidor además reconoce
// el reintento de la misma reserva (doble clic o mala conexión) y devuelve la cita que ya existe.
//  - Reservada → pantalla de confirmación (`?cita=`).
//  - Horario tomado por otra persona o que ya no existe → vuelve a los horarios con ese instante en «No disponible» y la alerta arriba.
//  - Sesión vencida → mensaje y enlace a iniciar sesión que regresa a ESTA confirmación, con la selección intacta en la dirección.
export function ConfirmarReserva({
  medicoId,
  inicio,
  hrefHorarios,
  hrefConfirmacion,
  hrefListo,
}: {
  medicoId: string;
  inicio: string;
  // Dirección del paso de horarios (ya con `?`): se le agrega el choque y el instante tomado.
  hrefHorarios: string;
  // Dirección de este mismo paso, para volver tras iniciar sesión.
  hrefConfirmacion: string;
  // Dirección de la pantalla de confirmación de la reserva, sin el identificador de la cita (termina en `?cita=`).
  hrefListo: string;
}) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<Fallo | null>(null);
  const [terminado, setTerminado] = useState(false);
  const enCurso = useRef(false);

  function confirmar() {
    if (enCurso.current) return;
    // La sesión de Clerk ya terminó (venció o se cerró en otra pestaña): se dice con claridad y no se envía nada. Sin esto, el envío
    // llevaría a la pantalla de inicio de sesión sin explicar por qué.
    if (isLoaded && !isSignedIn) {
      setError(crearFallo("SESION_VENCIDA", MENSAJE_SESION_VENCIDA_RESERVA));
      return;
    }
    enCurso.current = true;
    setError(null);
    empezar(async () => {
      const resultado = await reservarCitaDelPortal({ medico_id: medicoId, inicio });
      if (resultado.ok) {
        setTerminado(true);
        router.push(`${hrefListo}${resultado.datos.id}`);
        return;
      }
      if (resultado.codigo === "DOBLE_RESERVA" || resultado.codigo === "HORARIO_NO_DISPONIBLE") {
        setTerminado(true);
        router.replace(`${hrefHorarios}&conflicto=${resultado.codigo}&tomado=${encodeURIComponent(inicio)}`);
        return;
      }
      enCurso.current = false;
      setError(resultado);
    });
  }

  const ocupado = pendiente || terminado;
  return (
    <div className="flex flex-col gap-4">
      <span role="status" className="sr-only">
        {ocupado ? "Reservando su cita…" : ""}
      </span>
      {error ? (
        <div className="flex flex-col gap-3">
          <Alerta tono="error">{error.mensaje}</Alerta>
          {error.codigo === "SESION_VENCIDA" ? (
            <Button asChild size="lg" className="w-full">
              <Link href={`/iniciar-sesion?redirect_url=${encodeURIComponent(hrefConfirmacion)}`}>Iniciar sesión</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
      <Button type="button" size="lg" className="w-full" disabled={ocupado} onClick={confirmar}>
        {ocupado ? "Reservando…" : "Confirmar cita"}
      </Button>
      <Button asChild variant="secondary" size="lg" className="w-full">
        <Link href={hrefHorarios} aria-disabled={ocupado} tabIndex={ocupado ? -1 : undefined}>
          Elegir otro horario
        </Link>
      </Button>
    </div>
  );
}
