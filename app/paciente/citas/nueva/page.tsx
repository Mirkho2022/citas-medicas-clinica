import { auth } from "@clerk/nextjs/server";
import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Alerta } from "@/components/clinica/alerta";
import { TarjetaCita } from "@/components/clinica/tarjeta-cita";
import { Button } from "@/components/ui/button";
import { exigirPacienteRegistrado } from "@/lib/auth/accion-paciente";
import { advertenciaCancelacion as calcularAdvertencia } from "@/lib/citas/advertencia";
import { ejecutorAutenticado } from "@/lib/db/ejecutor-autenticado";
import { hoyLima } from "@/lib/fechas/lima";
import {
  citaPropiaPorId,
  diasDelMedico,
  horarioLibre,
  horariosDelDia,
  listarEspecialidades,
  medicoActivoPorId,
  medicosDeEspecialidad,
  todosLosMedicos,
  type MedicoDelPortal,
} from "@/lib/portal/consultas";
import {
  advertenciaCancelacion,
  AVISO_CITA_PROXIMA,
  MENSAJE_DEMASIADOS_INTENTOS,
  GUIA_DOBLE_RESERVA,
  MENSAJE_CITA_NO_ENCONTRADA,
  MENSAJE_DOBLE_RESERVA,
  MENSAJE_HORARIO_TOMADO,
  MENSAJE_MEDICO_NO_DISPONIBLE,
  MENSAJE_RESERVA_GUARDADA,
  MENSAJE_SIN_HORARIOS_EN_EL_DIA,
  MENSAJE_SIN_HORARIOS_EN_EL_PERIODO,
  MENSAJE_SIN_MEDICOS,
} from "@/lib/portal/mensajes";
import {
  hrefReserva,
  leerParametros,
  parametrosAtras,
  pasoDe,
  RUTA_MIS_CITAS,
  RUTA_RESERVAR,
  type ParametrosReserva,
} from "@/lib/portal/pasos-reserva";
import { superaElLimite } from "@/lib/seguridad/controles";
import { REGLAS } from "@/lib/seguridad/limites";
import { diaDeLaSemana, NOMBRES_DIA, textoFecha, textoFechaConDia } from "@/lib/ui/calendario";
import { fechaHoraLima, fechaLima, horaLima } from "@/lib/ui/formato";
import { CargandoReservar } from "./cargando";
import { ConfirmarReserva } from "./confirmar-reserva";
import { ElegirHorario } from "./elegir-horario";
import { TituloDelPaso } from "./titulo-del-paso";

type Consulta = Record<string, string | string[] | undefined>;

// «Reservar cita» (specs/busqueda-y-reserva-de-cita; design.md, D6 y D7; docs/diseno/BRIEF-DISENO.md, «Portal · Reservar cita»): un
// paso por pantalla con el estado en la dirección. El servidor decide el paso por los parámetros válidos (lib/portal/pasos-reserva.ts) y
// lee todo con la identidad del paciente: la RLS y `slots_disponibles()` deciden qué existe. Solo el último paso es un formulario.
export default async function PaginaReservar({ searchParams }: { searchParams: Promise<Consulta> }) {
  const { userId } = await auth.protect();
  const consulta = await searchParams;
  // Cada paso tiene su propio `Suspense` (clave = los parámetros): mientras se buscan los horarios se ve el esqueleto con «Buscando horarios…».
  // No se usa `loading.tsx`: ver docs/pruebas-e2e.md, «Cosas que aprendimos».
  return (
    <Suspense key={JSON.stringify(consulta)} fallback={<CargandoReservar />}>
      <PasoDeLaReserva userId={userId} consulta={consulta} />
    </Suspense>
  );
}

async function PasoDeLaReserva({ userId, consulta }: { userId: string; consulta: Consulta }) {
  // Límite de la búsqueda (60 / min por usuario y por IP), calculado ANTES de tocar la base de datos; con el almacén caído deja pasar.
  if (await superaElLimite(REGLAS.busqueda, userId)) {
    return (
      <>
        <TituloDelPaso key="limite">Reservar cita</TituloDelPaso>
        <Alerta tono="aviso">{MENSAJE_DEMASIADOS_INTENTOS}</Alerta>
      </>
    );
  }
  // Un rol distinto va a su área; un paciente sin ficha, a «Complete su registro».
  await exigirPacienteRegistrado();

  const hoy = hoyLima();
  const p = leerParametros(consulta, hoy);
  const paso = pasoDe(p);

  if (paso === "listo") return <PasoListo citaId={p.cita!} />;

  // Los pasos que dependen de un médico lo leen activo: uno dado de baja no se ofrece, aunque la dirección lo nombre.
  const medico = p.medico ? await medicoActivoPorId(ejecutorAutenticado, p.medico) : null;
  if (p.medico && !medico) return <PasoEspecialidades aviso={MENSAJE_MEDICO_NO_DISPONIBLE} />;

  switch (paso) {
    case "especialidades":
      return <PasoEspecialidades />;
    case "medicos":
      return <PasoMedicos especialidadId={p.especialidad!} hoy={hoy} />;
    case "todosLosMedicos":
      return <PasoTodosLosMedicos />;
    case "dias":
      return <PasoDias p={p} medico={medico!} hoy={hoy} />;
    case "horarios":
      return <PasoHorarios p={p} medico={medico!} />;
    case "confirmar":
      return <PasoConfirmar p={p} medico={medico!} />;
  }
}

// ---- Piezas ----

function Atras({ p, medico }: { p: ParametrosReserva; medico?: MedicoDelPortal | null }) {
  const atras = parametrosAtras(p, medico?.especialidadId);
  if (!atras) return null;
  return (
    <Button asChild variant="ghost" size="lg" className="-ml-3 self-start">
      <Link href={hrefReserva(atras)}>
        <ArrowLeft aria-hidden="true" />
        Atrás
      </Link>
    </Button>
  );
}

// Una opción de la lista de un paso: toda la fila es el enlace, de 56 px como mínimo.
function FilaEnlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-border-control bg-surface px-4 py-3 text-body-lg text-ink transition-colors hover:bg-primary-soft"
    >
      <span className="flex flex-col">{children}</span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

// Una opción que existe pero no se puede elegir: se ve deshabilitada y lo dice con texto, no solo con color.
function FilaDeshabilitada({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-disabled="true"
      className="flex min-h-14 cursor-not-allowed items-center rounded-md border border-border bg-muted px-4 py-3 text-body-lg text-muted-foreground"
    >
      <span className="flex flex-col">{children}</span>
    </span>
  );
}

function ContextoMedico({ medico }: { medico: MedicoDelPortal }) {
  return (
    <p className="text-muted-foreground">
      {medico.nombre} · {medico.especialidad}
    </p>
  );
}

const nombreDelDia = (dia: string) => {
  const nombre = NOMBRES_DIA[diaDeLaSemana(dia)];
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)}`;
};

// ---- Pasos ----

async function PasoEspecialidades({ aviso }: { aviso?: string }) {
  const especialidades = await listarEspecialidades(ejecutorAutenticado);
  return (
    <>
      <TituloDelPaso key="especialidades">Reservar cita</TituloDelPaso>
      {aviso ? <Alerta tono="aviso">{aviso}</Alerta> : null}
      {especialidades.length === 0 ? (
        <Alerta tono="informacion">{MENSAJE_SIN_MEDICOS}</Alerta>
      ) : (
        <>
          <p>Elija la especialidad de su consulta.</p>
          <ul className="flex flex-col gap-3">
            {especialidades.map((e) => (
              <li key={e.id}>
                <FilaEnlace href={hrefReserva({ especialidad: e.id })}>{e.nombre}</FilaEnlace>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3 border-t border-border pt-5">
            <p>¿Ya sabe con qué médico se atiende?</p>
            <Button asChild variant="secondary" size="lg">
              <Link href={hrefReserva({ modo: "medico" })}>Ya sé con qué médico</Link>
            </Button>
          </div>
        </>
      )}
    </>
  );
}

async function PasoMedicos({ especialidadId, hoy }: { especialidadId: string; hoy: string }) {
  const medicos = await medicosDeEspecialidad(ejecutorAutenticado, especialidadId, hoy);
  const p: ParametrosReserva = { especialidad: especialidadId };
  return (
    <>
      <Atras p={p} />
      <TituloDelPaso key="medicos">Elija un médico</TituloDelPaso>
      {medicos.length === 0 ? (
        <Alerta tono="informacion">{MENSAJE_SIN_MEDICOS}</Alerta>
      ) : (
        <>
          <p className="text-muted-foreground">{medicos[0]!.especialidad}</p>
          <ul className="flex flex-col gap-3">
            {medicos.map((m) => (
              <li key={m.id}>
                {m.proximoHorario ? (
                  <FilaEnlace href={hrefReserva({ especialidad: especialidadId, medico: m.id })}>
                    <span className="text-label-lg">{m.nombre}</span>
                    <span className="text-body-md text-muted-foreground tabular-nums">
                      Próximo horario: {fechaHoraLima(m.proximoHorario)}
                    </span>
                  </FilaEnlace>
                ) : (
                  <FilaDeshabilitada>
                    <span className="text-label-lg">{m.nombre}</span>
                    <span className="text-body-md">Sin horarios próximos</span>
                  </FilaDeshabilitada>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

async function PasoTodosLosMedicos() {
  const medicos = await todosLosMedicos(ejecutorAutenticado);
  const p: ParametrosReserva = { modo: "medico" };
  return (
    <>
      <Atras p={p} />
      <TituloDelPaso key="todos-los-medicos">Elija su médico</TituloDelPaso>
      {medicos.length === 0 ? (
        <Alerta tono="informacion">{MENSAJE_SIN_MEDICOS}</Alerta>
      ) : (
        <ul className="flex flex-col gap-3">
          {medicos.map((m) => (
            <li key={m.id}>
              <FilaEnlace href={hrefReserva({ modo: "medico", medico: m.id })}>
                <span className="text-label-lg">{m.nombre}</span>
                <span className="text-body-md text-muted-foreground">{m.especialidad}</span>
              </FilaEnlace>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

async function PasoDias({ p, medico, hoy }: { p: ParametrosReserva; medico: MedicoDelPortal; hoy: string }) {
  const dias = await diasDelMedico(ejecutorAutenticado, medico.id, hoy);
  const base: ParametrosReserva = { especialidad: p.especialidad, modo: p.modo, medico: medico.id };
  const hayHorarios = dias.some((d) => d.libres > 0);
  return (
    <>
      <Atras p={p} medico={medico} />
      <TituloDelPaso key="dias">Elija un día</TituloDelPaso>
      <ContextoMedico medico={medico} />
      {hayHorarios ? (
        <ul className="grid grid-cols-2 gap-3">
          {dias.map((d) => {
            const contenido = (
              <>
                <span className="text-label-lg">{nombreDelDia(d.dia)}</span>
                <span className="text-body-md tabular-nums">{textoFecha(d.dia)}</span>
                <span className="text-label-md">
                  {d.libres === 0 ? "Sin horarios" : d.libres === 1 ? "1 horario" : `${d.libres} horarios`}
                </span>
              </>
            );
            return (
              <li key={d.dia} className="flex">
                {d.libres > 0 ? (
                  <Link
                    href={hrefReserva({ ...base, dia: d.dia })}
                    className="flex min-h-14 flex-1 flex-col justify-center rounded-md border border-border-control bg-surface px-3 py-2 text-ink transition-colors hover:bg-primary-soft"
                  >
                    {contenido}
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="flex min-h-14 flex-1 cursor-not-allowed flex-col justify-center rounded-md border border-border bg-muted px-3 py-2 text-muted-foreground"
                  >
                    {contenido}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <Alerta tono="informacion">{MENSAJE_SIN_HORARIOS_EN_EL_PERIODO}</Alerta>
      )}
    </>
  );
}

async function PasoHorarios({ p, medico }: { p: ParametrosReserva; medico: MedicoDelPortal }) {
  const dia = p.dia!;
  const horarios = await horariosDelDia(ejecutorAutenticado, medico.id, dia, { tomados: p.tomado ? [p.tomado] : [] });
  const base: ParametrosReserva = { especialidad: p.especialidad, modo: p.modo, medico: medico.id, dia };
  const hayLibres = horarios.some((h) => h.disponible);
  return (
    <>
      <Atras p={p} medico={medico} />
      <TituloDelPaso key="horarios">Elija un horario</TituloDelPaso>
      <ContextoMedico medico={medico} />
      <p className="tabular-nums">{textoFechaConDia(dia)}</p>
      {/* El literal de la doble reserva va solo en su elemento; la guía, en otro (specs/busqueda-y-reserva-de-cita). */}
      {p.conflicto === "DOBLE_RESERVA" ? (
        <Alerta tono="error">
          <span className="block">{MENSAJE_DOBLE_RESERVA}</span>
          <span className="block">{GUIA_DOBLE_RESERVA}</span>
        </Alerta>
      ) : p.conflicto === "HORARIO_NO_DISPONIBLE" ? (
        <Alerta tono="error">{MENSAJE_HORARIO_TOMADO}</Alerta>
      ) : null}
      {horarios.length === 0 || !hayLibres ? (
        <Alerta tono="informacion">{MENSAJE_SIN_HORARIOS_EN_EL_DIA}</Alerta>
      ) : null}
      {horarios.length > 0 ? <ElegirHorario horarios={horarios} hrefBase={hrefReserva(base)} /> : null}
    </>
  );
}

async function PasoConfirmar({ p, medico }: { p: ParametrosReserva; medico: MedicoDelPortal }) {
  const dia = p.dia!;
  const hora = p.hora!;
  const base: ParametrosReserva = { especialidad: p.especialidad, modo: p.modo, medico: medico.id, dia };

  // Si el horario ya no existe (alguien lo tomó, entró en un bloqueo o ya pasó), se vuelve a los horarios con el aviso.
  const libre = await horarioLibre(ejecutorAutenticado, medico.id, hora);
  if (!libre) redirect(hrefReserva({ ...base, conflicto: "HORARIO_NO_DISPONIBLE", tomado: hora }));

  const advertencia = calcularAdvertencia(hora);
  return (
    <>
      <Atras p={p} medico={medico} />
      <TituloDelPaso key="confirmar">Confirme su cita</TituloDelPaso>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-border bg-surface p-4">
        <dt className="text-muted-foreground">Médico</dt>
        <dd>{medico.nombre}</dd>
        <dt className="text-muted-foreground">Especialidad</dt>
        <dd>{medico.especialidad}</dd>
        <dt className="text-muted-foreground">Fecha</dt>
        <dd className="tabular-nums">{fechaLima(hora)}</dd>
        <dt className="text-muted-foreground">Hora</dt>
        <dd className="tabular-nums">{horaLima(hora)}</dd>
      </dl>
      {/* Siempre antes del botón de confirmar. Con menos de 1 hora de margen, dice que ya no podrá cancelarla desde el portal. */}
      <Alerta tono="aviso">
        {advertencia.sePuedeCancelar ? advertenciaCancelacion(advertencia.horaLimite) : AVISO_CITA_PROXIMA}
      </Alerta>
      <ConfirmarReserva
        medicoId={medico.id}
        inicio={libre.inicio}
        hrefHorarios={hrefReserva(base)}
        hrefConfirmacion={hrefReserva({ ...base, hora })}
        hrefListo={`${RUTA_RESERVAR}?cita=`}
      />
    </>
  );
}

async function PasoListo({ citaId }: { citaId: string }) {
  const cita = await citaPropiaPorId(ejecutorAutenticado, citaId);
  if (!cita) {
    return (
      <>
        <TituloDelPaso key="listo-no-encontrada">Reservar cita</TituloDelPaso>
        <Alerta tono="error">{MENSAJE_CITA_NO_ENCONTRADA}</Alerta>
        <Button asChild size="lg">
          <Link href={RUTA_MIS_CITAS}>Ver mis citas</Link>
        </Button>
      </>
    );
  }
  return (
    <>
      <TituloDelPaso key="listo">Su cita quedó reservada</TituloDelPaso>
      <Alerta tono="exito">{MENSAJE_RESERVA_GUARDADA}</Alerta>
      <TarjetaCita cita={cita} />
      <div className="flex flex-col gap-3">
        <Button asChild size="lg">
          <Link href={RUTA_MIS_CITAS}>Ver mis citas</Link>
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link href={RUTA_RESERVAR}>Reservar otra cita</Link>
        </Button>
      </div>
    </>
  );
}
