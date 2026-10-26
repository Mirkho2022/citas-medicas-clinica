import { auth } from "@clerk/nextjs/server";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AvisosDeTurnos } from "@/components/clinica/avisos-de-turnos";
import { EsqueletoTabla } from "@/components/clinica/esqueleto";
import { SemanaDeTurnos } from "@/components/clinica/semana-de-turnos";
import { Button } from "@/components/ui/button";
import { exigirPaginaAdministrativo } from "@/lib/auth/pagina-personal";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { hoyLima } from "@/lib/fechas/lima";
import { avisosDeTurnos, semanaDeTurnos } from "@/lib/turnos/consultas";
import { diasDeLaSemana, semanaPedida } from "@/lib/turnos/semana";
import { sumarDias, textoFecha } from "@/lib/ui/calendario";

export const metadata: Metadata = { title: "Turnos de enfermería" };

const RUTA = "/administrativo/turnos";

// Turnos de enfermería (specs/turnos-de-enfermeria; design.md, D4 y D5): la semana (tabla enfermeras × días, empieza el lunes) con los
// turnos asignados, los avisos de turnos afectados por la ausencia de un médico o la baja de personal, y el acceso a asignar y modificar.
// La semana va en la dirección (`?semana=AAAA-MM-DD`, cualquier fecha de esa semana) y se lee en el servidor con la identidad del usuario:
// la RLS decide qué filas existen. Los datos van dentro de un `Suspense` propio (no `loading.tsx`) para que el encabezado y los enlaces
// de la semana aparezcan de inmediato.
export default async function PaginaTurnos({ searchParams }: { searchParams: Promise<{ semana?: string | string[] }> }) {
  await auth.protect();
  await exigirPaginaAdministrativo();

  const q = await searchParams;
  const hoy = hoyLima();
  const lunes = semanaPedida(Array.isArray(q.semana) ? q.semana[0] : q.semana, hoy);
  const domingo = sumarDias(lunes, 6);
  const esEstaSemana = diasDeLaSemana(lunes).includes(hoy);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-headline-lg text-ink">Turnos de enfermería</h1>
          <p className="text-body-sm text-muted-foreground">
            Quién trabaja con qué médico o en qué servicio, por franja (mañana, tarde o noche).
          </p>
        </div>
        <Button asChild size="sm">
          <Link href={`${RUTA}/nuevo${esEstaSemana ? "" : `?fecha=${lunes >= hoy ? lunes : hoy}`}`}>
            <Plus aria-hidden="true" />
            Asignar turno
          </Link>
        </Button>
      </div>

      <Suspense key={lunes} fallback={<CargandoTurnos />}>
        <AvisosCargados />
      </Suspense>

      <nav aria-label="Semana" className="flex flex-wrap items-center gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link href={`${RUTA}?semana=${sumarDias(lunes, -7)}`}>
            <ChevronLeft aria-hidden="true" />
            Semana anterior
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href={RUTA} aria-current={esEstaSemana ? "date" : undefined}>
            Hoy
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href={`${RUTA}?semana=${sumarDias(lunes, 7)}`}>
            Semana siguiente
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
        <h2 className="ml-1 font-heading text-title-md text-ink tabular-nums">
          Semana del {textoFecha(lunes)} al {textoFecha(domingo)}
        </h2>
      </nav>

      <Suspense key={lunes} fallback={<CargandoTurnos />}>
        <SemanaCargada lunes={lunes} hoy={hoy} />
      </Suspense>
    </div>
  );
}

async function AvisosCargados() {
  const avisos = await avisosDeTurnos(ejecutorAutenticado);
  return <AvisosDeTurnos avisos={avisos} />;
}

async function SemanaCargada({ lunes, hoy }: { lunes: string; hoy: string }) {
  const { enfermeras, turnos } = await semanaDeTurnos(ejecutorAutenticado, lunes);
  return <SemanaDeTurnos lunes={lunes} hoy={hoy} enfermeras={enfermeras} turnos={turnos} />;
}

function CargandoTurnos() {
  return <EsqueletoTabla filas={5} texto="Cargando turnos…" />;
}
