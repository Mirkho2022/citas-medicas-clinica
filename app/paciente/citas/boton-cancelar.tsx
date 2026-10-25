"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alerta } from "@/components/clinica/alerta";
import { useAviso } from "@/components/clinica/aviso-temporal";
import { Dialogo } from "@/components/clinica/dialogo";
import { Button } from "@/components/ui/button";
import { MENSAJE_CITA_CANCELADA, MENSAJE_SESION_VENCIDA } from "@/lib/portal/mensajes";
import { RUTA_MIS_CITAS } from "@/lib/portal/pasos-reserva";
import { fechaLima, horaLima } from "@/lib/ui/formato";
import { cancelarMiCita } from "./acciones";

// «Cancelar cita» con confirmación (specs/mis-citas-y-cancelacion; design.md, D8): abre un diálogo nativo con médico, fecha y hora, deja
// claro que no se puede deshacer y que podrá reservar otra. El foco empieza en «No cancelar» (lo seguro). Mientras se envía no se puede
// cerrar y el botón dice «Cancelando…».
//  - Cancelada → avisa «Su cita fue cancelada.» y la lista se vuelve a leer: la cita pasa a «Anteriores».
//  - Rechazada (menos de 1 hora según el reloj del SERVIDOR, o ya estaba cancelada) → el motivo se dice dentro del diálogo, sin el botón de
//    cancelar, y al cerrarlo la lista se vuelve a leer para mostrar el estado real de la cita.
//  - Sesión terminada → se dice y se ofrece iniciar sesión; no se envía nada.
// La tarjeta decide si este botón se ofrece (solo con 1 hora o más de margen); esa decisión es de presentación, no de seguridad.
export function BotonCancelarCita({ citaId, medico, inicio }: { citaId: string; medico: string; inicio: string }) {
  const router = useRouter();
  const { avisar } = useAviso();
  const { isLoaded, isSignedIn } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, empezar] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [sesionVencida, setSesionVencida] = useState(false);

  function cerrar() {
    const habiaRechazo = mensaje !== null && !sesionVencida;
    setAbierto(false);
    setMensaje(null);
    setSesionVencida(false);
    if (habiaRechazo) router.refresh();
  }

  function cancelar() {
    setMensaje(null);
    // La sesión de Clerk ya terminó: se dice con claridad y no se envía nada (el envío llevaría a iniciar sesión sin explicar por qué).
    if (isLoaded && !isSignedIn) {
      setSesionVencida(true);
      setMensaje(MENSAJE_SESION_VENCIDA);
      return;
    }
    empezar(async () => {
      const resultado = await cancelarMiCita({ cita_id: citaId });
      if (resultado.ok) {
        setAbierto(false);
        avisar(MENSAJE_CITA_CANCELADA);
        router.refresh();
        return;
      }
      setMensaje(resultado.mensaje);
    });
  }

  return (
    <>
      <Button type="button" variant="destructive" size="lg" className="w-full sm:w-auto" onClick={() => setAbierto(true)}>
        Cancelar cita
      </Button>
      <Dialogo
        abierto={abierto}
        alCerrar={cerrar}
        titulo="¿Cancelar esta cita?"
        descripcion="Esta acción no se puede deshacer. Podrá reservar otra cita cuando lo desee."
        rol="alertdialog"
        bloqueado={pendiente}
      >
        <p className="tabular-nums">
          {medico} · {fechaLima(inicio)} {horaLima(inicio)}
        </p>
        {mensaje ? <Alerta tono="error">{mensaje}</Alerta> : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" size="lg" data-foco-inicial disabled={pendiente} onClick={cerrar}>
            {mensaje ? "Cerrar" : "No cancelar"}
          </Button>
          {sesionVencida ? (
            <Button asChild size="lg">
              <Link href={`/iniciar-sesion?redirect_url=${encodeURIComponent(RUTA_MIS_CITAS)}`}>Iniciar sesión</Link>
            </Button>
          ) : mensaje ? null : (
            <Button type="button" variant="destructive" size="lg" disabled={pendiente} onClick={cancelar}>
              {pendiente ? "Cancelando…" : "Cancelar cita"}
            </Button>
          )}
        </div>
      </Dialogo>
    </>
  );
}
