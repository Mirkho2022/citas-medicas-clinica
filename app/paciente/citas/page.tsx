import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Suspense } from "react";
import { TarjetaCita } from "@/components/clinica/tarjeta-cita";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { exigirPacienteRegistrado } from "@/lib/auth/accion-paciente";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { CITAS_ANTERIORES_POR_PAGINA, misCitas } from "@/lib/portal/consultas";
import { MENSAJE_SIN_CITAS } from "@/lib/portal/mensajes";
import { RUTA_MIS_CITAS, RUTA_RESERVAR } from "@/lib/portal/pasos-reserva";
import { BotonCancelarCita } from "./boton-cancelar";
import { CargandoMisCitas } from "./cargando";

const MAXIMO_ANTERIORES = 200;

// «Mis citas» (specs/mis-citas-y-cancelacion): las citas del paciente separadas en próximas y anteriores, cada una con su estado en
// texto e icono, y «Cancelar cita» solo mientras falte 1 hora o más. Lee con la identidad del paciente: la RLS decide qué citas existen
// para él. «Ver más» agrega otras 20 citas anteriores por la dirección (`?anteriores=`).
export default async function PaginaMisCitas({
  searchParams,
}: {
  searchParams: Promise<{ anteriores?: string | string[] }>;
}) {
  await auth.protect();
  const consulta = await searchParams;
  // `Suspense` propio en vez de `loading.tsx`: ver docs/07-testing/pruebas-e2e.md, «Cosas que aprendimos». La clave cambia en CADA lectura de la página (no solo
  // con la dirección): un `router.refresh()` (al cerrar el diálogo de una cancelación rechazada) tiene que montar un límite nuevo; sobre el mismo
  // límite, la pantalla anterior se quedaba a la vista aunque llegara la lista nueva.
  return (
    <Suspense key={`${JSON.stringify(consulta)}-${Date.now()}`} fallback={<CargandoMisCitas />}>
      <ListaDeCitas consulta={consulta} />
    </Suspense>
  );
}

async function ListaDeCitas({ consulta }: { consulta: { anteriores?: string | string[] } }) {
  // Un rol distinto va a su área; un paciente sin ficha, a «Complete su registro».
  await exigirPacienteRegistrado();

  const pedido = Number(Array.isArray(consulta.anteriores) ? consulta.anteriores[0] : consulta.anteriores);
  const limite =
    Number.isFinite(pedido) && pedido > CITAS_ANTERIORES_POR_PAGINA
      ? Math.min(Math.floor(pedido), MAXIMO_ANTERIORES)
      : CITAS_ANTERIORES_POR_PAGINA;

  const { proximas, anteriores, hayMasAnteriores } = await misCitas(ejecutorAutenticado, limite);
  const ahora = new Date();
  const sinCitas = proximas.length === 0 && anteriores.length === 0;

  return (
    <>
      <h1 className="font-display text-headline-lg text-ink sm:text-display-lg">Mis citas</h1>

      {sinCitas ? (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <p>{MENSAJE_SIN_CITAS}</p>
            <Button asChild size="lg">
              <Link href={RUTA_RESERVAR}>Reservar cita</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Button asChild size="lg">
            <Link href={RUTA_RESERVAR}>Reservar cita</Link>
          </Button>

          <section aria-labelledby="titulo-proximas" className="flex flex-col gap-4">
            <h2 id="titulo-proximas" className="font-display text-title-md text-ink">
              Próximas
            </h2>
            {proximas.length === 0 ? (
              <p className="text-muted-foreground">No tiene citas próximas.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {proximas.map((cita) => (
                  <li key={cita.id}>
                    <TarjetaCita
                      cita={cita}
                      ahora={ahora}
                      botonCancelar={<BotonCancelarCita citaId={cita.id} medico={cita.medico} inicio={cita.inicio} />}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {anteriores.length > 0 ? (
            <section aria-labelledby="titulo-anteriores" className="flex flex-col gap-4">
              <h2 id="titulo-anteriores" className="font-display text-title-md text-ink">
                Anteriores
              </h2>
              <ul className="flex flex-col gap-4">
                {anteriores.map((cita) => (
                  <li key={cita.id}>
                    <TarjetaCita cita={cita} ahora={ahora} />
                  </li>
                ))}
              </ul>
              {hayMasAnteriores ? (
                <Button asChild variant="secondary" size="lg">
                  <Link href={`${RUTA_MIS_CITAS}?anteriores=${limite + CITAS_ANTERIORES_POR_PAGINA}`} scroll={false}>
                    Ver más
                  </Link>
                </Button>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
