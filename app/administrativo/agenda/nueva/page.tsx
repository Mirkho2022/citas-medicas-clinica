import { auth } from "@clerk/nextjs/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Alerta } from "@/components/clinica/alerta";
import { InsigniaEstado } from "@/components/clinica/insignia-estado";
import { SelectorFecha } from "@/components/clinica/selector-fecha";
import { Button } from "@/components/ui/button";
import { exigirPaginaAdministrativo } from "@/lib/auth/pagina-personal";
import { accionesVisibles, TEXTO_MENOS_DE_UNA_HORA } from "@/lib/citas/acciones-visibles";
import {
  citaVigentePorId,
  diasConHorarios,
  esUuid,
  horariosLibres,
  listarMedicos,
  pacientePorId,
} from "@/lib/citas/consultas";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { esFechaLima, hoyLima } from "@/lib/fechas/lima";
import { sumarDias } from "@/lib/ui/calendario";
import { fechaHoraLima } from "@/lib/ui/formato";
import { FiltroMedico } from "../filtro-medico";
import { ElegirPacienteUrl } from "./elegir-paciente-url";
import { FormularioReserva } from "./formulario-reserva";

const RUTA = "/administrativo/agenda/nueva";
const HORIZONTE_DIAS = 90;

type Consulta = { paciente?: string | string[]; medico?: string | string[]; fecha?: string | string[]; reprogramar?: string | string[] };
const una = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Agendar y reprogramar una cita (specs/gestion-de-citas; docs/diseno/BRIEF-DISENO.md, «Portal · Reservar cita» adaptado a la
// consola): tres pasos visibles en una sola página (paciente → médico y fecha → horario y confirmación). El estado de los pasos
// vive en la URL (`?paciente=`, `?medico=`, `?fecha=`) y se lee en el servidor con la identidad del usuario; solo la
// confirmación (último paso) es un componente de cliente. `?reprogramar=<cita>` reutiliza la pantalla: el paciente queda fijo y la
// acción es `reprogramarCita`, que cancela la original y crea la nueva en una transacción.
export default async function PaginaNuevaCita({ searchParams }: { searchParams: Promise<Consulta> }) {
  await auth.protect();
  await exigirPaginaAdministrativo();

  const q = await searchParams;
  const hoy = hoyLima();
  const reprogramarId = una(q.reprogramar);
  const reprograma = esUuid(reprogramarId);

  const [medicos, cita] = await Promise.all([
    listarMedicos(ejecutorAutenticado),
    reprograma ? citaVigentePorId(ejecutorAutenticado, reprogramarId) : Promise.resolve(null),
  ]);

  if (reprograma && !cita) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-headline-lg text-ink">Reprogramar cita</h1>
        <Alerta tono="error">La cita ya no está vigente: pudo cancelarse o atenderse mientras tanto.</Alerta>
        <div>
          <Button asChild variant="secondary" size="sm">
            <Link href="/administrativo/agenda">Volver a la agenda</Link>
          </Button>
        </div>
      </div>
    );
  }

  const paciente = cita
    ? { id: cita.paciente.id, nombre: `${cita.paciente.nombres} ${cita.paciente.apellidos}`, documento: `${cita.paciente.tipoDocumento} ${cita.paciente.documento}` }
    : await (async () => {
        const p = esUuid(una(q.paciente)) ? await pacientePorId(ejecutorAutenticado, una(q.paciente)!) : null;
        return p ? { id: p.id, nombre: `${p.nombres} ${p.apellidos}`, documento: `${p.tipo_documento} ${p.numero_documento}` } : null;
      })();

  const medicoPedido = una(q.medico);
  const medicoId =
    esUuid(medicoPedido) && medicos.some((m) => m.id === medicoPedido) ? medicoPedido : (cita?.medicoId ?? null);
  const medico = medicos.find((m) => m.id === medicoId) ?? null;
  const fechaPedida = una(q.fecha);
  const fecha = fechaPedida && esFechaLima(fechaPedida) && fechaPedida >= hoy ? fechaPedida : hoy;

  const [horarios, dias] =
    medicoId && paciente
      ? await Promise.all([
          horariosLibres(ejecutorAutenticado, medicoId, fecha),
          diasConHorarios(ejecutorAutenticado, medicoId, hoy, HORIZONTE_DIAS),
        ])
      : [[], undefined];

  // Parámetros que se conservan al cambiar un paso.
  const base = { reprogramar: reprograma ? reprogramarId : undefined, paciente: reprograma ? undefined : paciente?.id };
  const puedeReprogramar = !cita || accionesVisibles(cita, new Date()).reprogramar;
  const hrefAgenda = `/administrativo/agenda?fecha=${q.fecha && esFechaLima(una(q.fecha) ?? "") ? una(q.fecha) : hoy}${medicoId ? `&medico=${medicoId}` : ""}`;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href={hrefAgenda}>
            <ArrowLeft aria-hidden="true" />
            Volver a la agenda
          </Link>
        </Button>
        <h1 className="font-display text-headline-lg text-ink">{cita ? "Reprogramar cita" : "Agendar cita"}</h1>
        <p className="text-body-sm text-muted-foreground">Horas en hora de Lima. Solo se ofrecen los horarios libres.</p>
      </div>

      {cita ? (
        <section aria-label="Cita actual" className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-label-lg text-ink">Cita actual</h2>
          <p className="text-body-md tabular-nums">
            {fechaHoraLima(cita.inicio)} · {cita.medico} · {cita.servicio}
          </p>
          <div>
            <InsigniaEstado estado={cita.estado} />
          </div>
          {!puedeReprogramar ? <Alerta tono="aviso">{TEXTO_MENOS_DE_UNA_HORA}.</Alerta> : null}
        </section>
      ) : null}

      <ol className="flex flex-col gap-5">
        <li>
          <section aria-labelledby="paso-paciente" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <h2 id="paso-paciente" className="text-title-md text-ink">
              1. Paciente
            </h2>
            {paciente ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-3.5 py-2.5">
                <div>
                  <p className="text-label-md text-ink">{paciente.nombre}</p>
                  <p className="text-body-sm text-muted-foreground tabular-nums">{paciente.documento}</p>
                </div>
                {cita ? null : (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`${RUTA}?${new URLSearchParams(Object.entries({ medico: medicoId ?? "", fecha }).filter(([, v]) => v)).toString()}`}>
                      Cambiar<span className="sr-only"> paciente</span>
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <ElegirPacienteUrl ruta={RUTA} parametros={{ medico: medicoId ?? undefined, fecha }} />
            )}
          </section>
        </li>

        <li>
          <section aria-labelledby="paso-medico" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <h2 id="paso-medico" className="text-title-md text-ink">
              2. Médico y fecha
            </h2>
            {paciente ? (
              <div className="flex flex-wrap items-center gap-3">
                <FiltroMedico medicos={medicos} medicoId={medicoId} ruta={RUTA} parametros={{ ...base, fecha }} todos={false} />
                {medicoId ? (
                  <SelectorFecha
                    fecha={fecha}
                    hoy={hoy}
                    ruta={RUTA}
                    parametros={{ ...base, medico: medicoId }}
                    diasConHorarios={dias}
                    desde={hoy}
                    hasta={sumarDias(hoy, HORIZONTE_DIAS - 1)}
                  />
                ) : null}
              </div>
            ) : (
              <p className="text-body-md text-muted-foreground">Primero elija al paciente.</p>
            )}
          </section>
        </li>

        <li>
          <section aria-labelledby="paso-horario" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <h2 id="paso-horario" className="text-title-md text-ink">
              3. Horario y confirmación
            </h2>
            {!paciente ? (
              <p className="text-body-md text-muted-foreground">Primero elija al paciente.</p>
            ) : !medico || !medicoId ? (
              <p className="text-body-md text-muted-foreground">Elija un médico para ver sus horarios libres.</p>
            ) : !puedeReprogramar ? (
              <p className="text-body-md text-muted-foreground">Esta cita ya no puede reprogramarse.</p>
            ) : (
              <FormularioReserva
                key={`${medicoId}-${fecha}`}
                modo={cita ? "reprogramar" : "nueva"}
                citaId={cita?.id}
                pacienteId={paciente.id}
                pacienteNombre={paciente.nombre}
                medicoId={medicoId}
                medicoNombre={medico.nombre}
                servicio={medico.especialidad}
                horarios={horarios}
              />
            )}
          </section>
        </li>
      </ol>
    </div>
  );
}
