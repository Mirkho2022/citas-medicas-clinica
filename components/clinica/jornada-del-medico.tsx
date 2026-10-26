import { CalendarOff, Clock, Hourglass } from "lucide-react";
import { InsigniaEstado } from "@/components/clinica/insignia-estado";
import { MarcarAtendida } from "@/components/clinica/marcar-atendida";
import { Badge } from "@/components/ui/badge";
import { ID_ENCABEZADO_JORNADA } from "@/lib/medico/marcar-atendida";
import { textoHace, type CitaDeJornada, type DiaDeJornada, type Jornada } from "@/lib/medico/jornada";
import { sumarDias, textoFechaConDia } from "@/lib/ui/calendario";
import { horaLima } from "@/lib/ui/formato";

// «Hoy», «Mañana» o el nombre del día; siempre con la fecha `dd/MM/yyyy` (DESIGN.md) para no depender de que se lea «hoy».
function tituloDelDia(dia: DiaDeJornada, hoy: string): string {
  const fecha = textoFechaConDia(dia.fecha);
  if (dia.fecha === hoy) return `Hoy · ${fecha}`;
  return dia.fecha === sumarDias(hoy, 1) ? `Mañana · ${fecha}` : fecha;
}

function textoBloque(bloque: { inicio: string; fin: string }): string {
  return `${bloque.inicio} a ${bloque.fin}`;
}

function ItemDeCita({ cita, ahora }: { cita: CitaDeJornada; ahora: Date }) {
  const nombre = `${cita.paciente.nombres} ${cita.paciente.apellidos}`;
  const hora = `${horaLima(cita.inicio)} a ${horaLima(cita.fin)}`;
  // La acción de H3 solo deja marcar una cita cuya hora ya empezó: antes de eso no se ofrece el botón (la base de datos igual la rechazaría).
  const yaEmpezo = cita.minutosDesdeInicio !== null || new Date(cita.inicio).getTime() <= ahora.getTime();
  return (
    <li
      id={`cita-${cita.id}`}
      data-cita-jornada={cita.id}
      tabIndex={-1}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-body-md outline-none focus-visible:shadow-focus-ring sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-title-md font-heading tabular-nums">{hora}</span>
          <InsigniaEstado estado="confirmada" />
          {cita.minutosDesdeInicio !== null ? (
            <Badge variant="warning">
              <Hourglass aria-hidden="true" />
              {textoHace(cita.minutosDesdeInicio)}
            </Badge>
          ) : null}
        </p>
        <p className="font-semibold text-foreground">{nombre}</p>
        <p className="text-body-sm tabular-nums text-muted-foreground">
          {cita.paciente.tipoDocumento} {cita.paciente.documento}
        </p>
      </div>
      {yaEmpezo ? (
        <MarcarAtendida citaId={cita.id} descripcion={`de las ${horaLima(cita.inicio)}, paciente ${nombre}`} />
      ) : (
        <p className="text-body-sm text-muted-foreground">Podrá marcarla atendida desde las {horaLima(cita.inicio)}</p>
      )}
    </li>
  );
}

// «Mi jornada» (specs/jornada-del-medico): por cada día de hoy a los próximos 7, el horario de atención del médico (rótulo «Mi horario
// de atención»: no es un turno de enfermería), sus bloqueos de agenda y sus citas CONFIRMADAS con el nombre y el documento del
// paciente. Solo datos logísticos: sin motivo de la cita, sin diagnósticos, sin enlaces a la historia clínica mientras ese módulo no
// exista. Un día sin horario, sin bloqueo y sin citas no se muestra (salvo hoy). Es de servidor; solo «Marcar atendida» es de cliente.
export function JornadaDelMedico({ jornada, ahora = new Date() }: { jornada: Jornada; ahora?: Date }) {
  const dias = jornada.dias.filter((d) => d.esHoy || d.horarios.length > 0 || d.bloqueos.length > 0 || d.citas.length > 0);
  const sinHorarios = jornada.dias.every((d) => d.horarios.length === 0);

  return (
    <section aria-labelledby={ID_ENCABEZADO_JORNADA} className="flex flex-col gap-5">
      <h2 id={ID_ENCABEZADO_JORNADA} tabIndex={-1} className="font-display text-headline-md text-ink outline-none">
        Mi jornada
      </h2>

      {jornada.totalCitas === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-4 text-body-md text-muted-foreground">
          No tiene citas confirmadas en los próximos 7 días
        </p>
      ) : null}
      {sinHorarios ? (
        <p className="text-body-sm text-muted-foreground">No tiene un horario de atención vigente en los próximos días.</p>
      ) : null}

      {dias.map((dia) => (
        <section key={dia.fecha} aria-labelledby={`dia-${dia.fecha}`} className="flex flex-col gap-3">
          <h3 id={`dia-${dia.fecha}`} className="font-heading text-title-md text-ink">
            {tituloDelDia(dia, jornada.hoy)}
          </h3>
          <div className="flex flex-col gap-1.5 text-body-sm">
            <p className="flex flex-wrap items-center gap-x-2 text-foreground">
              <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="font-semibold">Mi horario de atención:</span>
              {dia.horarios.length > 0 ? (
                <span className="tabular-nums">{dia.horarios.map(textoBloque).join(" · ")}</span>
              ) : (
                <span className="text-muted-foreground">sin horario de atención</span>
              )}
            </p>
            {dia.bloqueos.map((b) => (
              <p key={`${b.inicio}-${b.fin}`} className="flex flex-wrap items-center gap-x-2 text-foreground">
                <CalendarOff className="size-4 shrink-0 text-warning" aria-hidden="true" />
                <span className="tabular-nums">
                  {b.todoElDia ? "Bloqueo de agenda todo el día" : `Bloqueo de agenda de ${b.inicio} a ${b.fin}`}
                </span>
              </p>
            ))}
          </div>
          {dia.citas.length > 0 ? (
            <ul aria-label={`Citas confirmadas · ${tituloDelDia(dia, jornada.hoy)}`} className="flex flex-col gap-3">
              {dia.citas.map((cita) => (
                <ItemDeCita key={cita.id} cita={cita} ahora={ahora} />
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </section>
  );
}
