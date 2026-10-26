import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Esqueleto } from "@/components/clinica/esqueleto";
import { JornadaDelMedico } from "@/components/clinica/jornada-del-medico";
import { tieneMfaActivo } from "@/lib/auth/mfa";
import { exigirRol } from "@/lib/auth/rol";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { jornadaDelMedico } from "@/lib/medico/jornada";

// Título de la pestaña fijo (specs/jornada-del-medico): nunca lleva datos de pacientes.
export const metadata: Metadata = { title: "Panel del médico" };

// «Panel del médico» con «Mi jornada» (specs/jornada-del-medico; design.md, D7): sus horarios de atención, sus bloqueos de agenda y sus
// citas confirmadas de hoy a los próximos 7 días, solo las suyas (la RLS de la base de datos lo garantiza) y sin datos clínicos. La
// guarda de sesión, rol y MFA es la de siempre y va ANTES de leer nada; la lectura va dentro de un `Suspense` propio (no `loading.tsx`:
// ver docs/07-testing/pruebas-e2e.md, «Cosas que aprendimos») para que el encabezado aparezca de inmediato.
export default async function PaginaMedico() {
  await auth.protect();
  await exigirRol("medico");
  if (!(await tieneMfaActivo())) {
    redirect("/configurar-mfa");
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-headline-lg text-ink">Panel del médico</h1>
      <Suspense fallback={<CargandoJornada />}>
        <JornadaCargada />
      </Suspense>
    </div>
  );
}

async function JornadaCargada() {
  const jornada = await jornadaDelMedico(ejecutorAutenticado);
  return <JornadaDelMedico jornada={jornada} />;
}

function CargandoJornada() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Cargando su jornada…</span>
      <Esqueleto className="h-6 w-40" />
      <Esqueleto className="h-4 w-2/3" />
      <Esqueleto className="h-24 w-full" />
      <Esqueleto className="h-24 w-full" />
    </div>
  );
}
