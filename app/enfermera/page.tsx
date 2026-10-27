import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Esqueleto } from "@/components/clinica/esqueleto";
import { TarjetaTurno } from "@/components/clinica/tarjeta-turno";
import { tieneMfaActivo } from "@/lib/auth/mfa";
import { mfaExigidoPara } from "@/lib/auth/mfa-requerido";
import { exigirRol } from "@/lib/auth/rol";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { DIAS_HACIA_ADELANTE, misTurnos } from "@/lib/turnos/mis-turnos";

export const metadata: Metadata = { title: "Panel de enfermería" };

// «Panel de enfermería» (specs/turnos-de-enfermeria, «La enfermera ve su turno y con quién trabaja, y nada más»; design.md, D7): su turno
// de hoy y los de los próximos 14 días, con el médico y su especialidad o el servicio con el que trabaja. NADA más: ni pacientes, ni
// citas, ni historias clínicas, ni turnos de otras enfermeras, ni enlaces a funciones administrativas (la RLS de la base de datos lo
// garantiza). La guarda de sesión, rol y MFA va ANTES de leer nada; la lectura, dentro de un `Suspense` propio (no `loading.tsx`).
export default async function PaginaEnfermera() {
  await auth.protect();
  await exigirRol("enfermera");
  if (mfaExigidoPara("enfermera") && !(await tieneMfaActivo())) {
    redirect("/configurar-mfa");
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-headline-lg text-ink">Panel de enfermería</h1>
      <Suspense fallback={<CargandoTurnos />}>
        <MiTurno />
      </Suspense>
    </div>
  );
}

async function MiTurno() {
  const { hoyTurnos, proximos } = await misTurnos(ejecutorAutenticado);

  if (hoyTurnos.length === 0 && proximos.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface p-4 text-body-lg text-muted-foreground">
        No tiene turnos asignados en los próximos {DIAS_HACIA_ADELANTE} días
      </p>
    );
  }

  return (
    <div className="flex max-w-[40rem] flex-col gap-6">
      <section aria-labelledby="titulo-hoy" className="flex flex-col gap-3">
        <h2 id="titulo-hoy" className="font-display text-headline-md text-ink">
          Hoy
        </h2>
        {hoyTurnos.length === 0 ? (
          <p className="text-body-lg text-muted-foreground">No tiene turno hoy</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {hoyTurnos.map((t) => (
              <li key={t.id}>
                <TarjetaTurno turno={t} destacado />
              </li>
            ))}
          </ul>
        )}
      </section>

      {proximos.length > 0 ? (
        <section aria-labelledby="titulo-proximos" className="flex flex-col gap-3">
          <h2 id="titulo-proximos" className="font-display text-headline-md text-ink">
            Próximos días
          </h2>
          <ul className="flex flex-col gap-3">
            {proximos.map((t) => (
              <li key={t.id}>
                <TarjetaTurno turno={t} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CargandoTurnos() {
  return (
    <div role="status" className="flex max-w-[40rem] flex-col gap-4">
      <span className="sr-only">Cargando su turno…</span>
      <Esqueleto className="h-6 w-24" />
      <Esqueleto className="h-32 w-full" />
      <Esqueleto className="h-6 w-40" />
      <Esqueleto className="h-32 w-full" />
    </div>
  );
}
