import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { TarjetaCita } from "@/components/clinica/tarjeta-cita";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { exigirPacienteRegistrado } from "@/lib/auth/accion-paciente";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { nombreDelPaciente, proximaCita } from "@/lib/portal/consultas";
import { RUTA_MIS_CITAS, RUTA_RESERVAR } from "@/lib/portal/pasos-reserva";
import { BotonCancelarCita } from "./citas/boton-cancelar";

// «Inicio» del portal (specs/mis-citas-y-cancelacion; docs/02-diseno/BRIEF-DISENO.md, «Portal · Inicio»): saludo, la próxima cita y la
// acción principal «Reservar cita» (48 px). El encabezado «Portal del paciente» se conserva: lo usan las E2E de H1 y H2b.
export default async function PaginaPaciente() {
  await auth.protect();
  // Un rol distinto va a su área; un paciente sin ficha, a «Complete su registro».
  await exigirPacienteRegistrado();

  const [nombre, proxima] = await Promise.all([nombreDelPaciente(ejecutorAutenticado), proximaCita(ejecutorAutenticado)]);

  return (
    <>
      <h1 className="font-display text-headline-lg text-ink sm:text-display-lg">Portal del paciente</h1>
      {nombre ? <p className="text-title-md text-ink">Hola, {nombre}</p> : null}

      <Button asChild size="lg">
        <Link href={RUTA_RESERVAR}>Reservar cita</Link>
      </Button>

      <section aria-labelledby="titulo-proxima" className="flex flex-col gap-4">
        <h2 id="titulo-proxima" className="font-display text-title-md text-ink">
          Su próxima cita
        </h2>
        {proxima ? (
          <>
            <TarjetaCita
              cita={proxima}
              botonCancelar={<BotonCancelarCita citaId={proxima.id} medico={proxima.medico} inicio={proxima.inicio} />}
            />
            <Button asChild variant="secondary" size="lg">
              <Link href={RUTA_MIS_CITAS}>Ver mis citas</Link>
            </Button>
          </>
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-4">
              <p>No tiene citas próximas.</p>
              <Button asChild variant="secondary" size="lg">
                <Link href={RUTA_MIS_CITAS}>Ver mis citas</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}
