import { auth } from "@clerk/nextjs/server";
import { Search } from "lucide-react";
import Link from "next/link";
import { Alerta } from "@/components/clinica/alerta";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirPaginaAdministrativo } from "@/lib/auth/pagina-personal";
import { buscarPacientes, LIMITE_BUSQUEDA_PACIENTES } from "@/lib/citas/pacientes";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { hoyLima } from "@/lib/fechas/lima";
import { FormularioPaciente } from "./formulario-paciente";

// Pacientes del administrativo (specs/identificacion-de-pacientes; docs/02-diseno/BRIEF-DISENO.md, «Consola · Pacientes»): buscar por
// documento exacto o por el inicio de los apellidos (máximo 20, sin datos clínicos) y registrar un paciente nuevo. La búsqueda es
// un formulario GET: el texto vive en la URL (`?q=`), la página se lee en el servidor con la identidad del usuario y la RLS decide
// qué filas existen. La guarda de rol y MFA es la de la página; cada Server Action vuelve a comprobarla.
export default async function PaginaPacientes({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await auth.protect();
  await exigirPaginaAdministrativo();

  const { q } = await searchParams;
  const termino = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  const busqueda = termino ? await buscarPacientes(ejecutorAutenticado, { termino }) : null;
  const pacientes = busqueda?.ok ? busqueda.datos : [];

  const estado = !busqueda
    ? "Escriba un documento o el inicio de los apellidos."
    : !busqueda.ok
      ? ""
      : pacientes.length === 0
        ? "Sin resultados."
        : pacientes.length >= LIMITE_BUSQUEDA_PACIENTES
          ? `Se muestran ${LIMITE_BUSQUEDA_PACIENTES} resultados: afine el texto de búsqueda.`
          : `${pacientes.length} ${pacientes.length === 1 ? "resultado" : "resultados"}.`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-headline-lg text-ink">Pacientes</h1>
        <p className="text-body-sm text-muted-foreground">
          Busque por documento exacto o por el inicio de los apellidos. Máximo {LIMITE_BUSQUEDA_PACIENTES} resultados; sin datos clínicos.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_28rem]">
        <section aria-label="Buscar pacientes" className="flex min-w-0 flex-col gap-3">
          <form method="get" action="/administrativo/pacientes" role="search" className="flex flex-col gap-1.5">
            <Label htmlFor="busqueda">Buscar paciente</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-[1.125rem] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="busqueda"
                  name="q"
                  type="search"
                  defaultValue={termino}
                  placeholder="Documento o apellidos, por ejemplo: quis"
                  autoComplete="off"
                  maxLength={100}
                  aria-describedby="busqueda-estado"
                  className="h-9 pl-10"
                />
              </div>
              <Button type="submit" variant="secondary" size="sm">
                Buscar
              </Button>
            </div>
            <p id="busqueda-estado" role="status" className="text-body-sm text-muted-foreground">
              {estado}
            </p>
          </form>

          {busqueda && !busqueda.ok ? <Alerta tono="error">{busqueda.mensaje}</Alerta> : null}

          {busqueda?.ok && pacientes.length > 0 ? (
            <div className="rounded-lg border border-border bg-surface">
              <Table>
                <caption className="sr-only">Pacientes encontrados</caption>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">Documento</TableHead>
                    <TableHead scope="col">Apellidos y nombres</TableHead>
                    <TableHead scope="col">Teléfono</TableHead>
                    <TableHead scope="col">Correo</TableHead>
                    <TableHead scope="col">
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pacientes.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="tabular-nums">
                        {p.tipo_documento} {p.numero_documento}
                      </TableCell>
                      <TableCell className="whitespace-normal font-semibold">
                        {p.apellidos}, {p.nombres}
                      </TableCell>
                      <TableCell className="tabular-nums">{p.telefono ?? "—"}</TableCell>
                      <TableCell className="whitespace-normal text-muted-foreground">{p.email}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/administrativo/agenda/nueva?paciente=${p.id}`}>
                            Agendar<span className="sr-only"> cita para {p.nombres} {p.apellidos}</span>
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {busqueda?.ok && pacientes.length === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-6">
              <p className="text-title-md text-ink">Sin resultados para «{termino}»</p>
              <p className="text-body-md text-muted-foreground">
                Revise el documento o pruebe con el inicio de los apellidos. Si es un paciente nuevo, regístrelo en el formulario.
              </p>
              <Button asChild variant="secondary" size="sm">
                <Link href="/administrativo/pacientes">Limpiar búsqueda</Link>
              </Button>
            </div>
          ) : null}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="font-display text-headline-md text-ink">Registrar paciente</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormularioPaciente hoy={hoyLima()} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
