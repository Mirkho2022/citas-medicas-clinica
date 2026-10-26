"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Alerta } from "@/components/clinica/alerta";
import { useAviso } from "@/components/clinica/aviso-temporal";
import { Campo } from "@/components/clinica/campo";
import { CampoSeleccion } from "@/components/clinica/campo-seleccion";
import { ControlSegmentado } from "@/components/clinica/control-segmentado";
import { Button } from "@/components/ui/button";
import type { ResultadoAccion } from "@/lib/acciones/resultado";
import { ETIQUETA_FRANJA, FRANJAS } from "@/lib/turnos/franjas";
import { actualizarTurno, asignarTurno, quitarTurno } from "./acciones";

const RUTA_SEMANA = "/administrativo/turnos";

export interface DatosFormularioTurno {
  modo: "nuevo" | "editar";
  // Solo al modificar: el turno que se edita (la enfermera y la fecha no cambian).
  turnoId?: string;
  enfermeras: Array<{ id: string; nombre: string }>;
  medicos: Array<{ id: string; nombre: string; especialidad: string }>;
  servicios: Array<{ id: string; nombre: string }>;
  hoy: string;
  valores: {
    enfermeraId: string;
    fecha: string;
    franja: string;
    destino: "medico" | "servicio";
    medicoId: string;
    servicioId: string;
  };
  // Solo al modificar: la enfermera y la fecha, de solo lectura.
  resumen?: { enfermera: string; fechaTexto: string; enfermeraDeBaja: boolean };
}

// Formulario de asignar y de modificar un turno (specs/turnos-de-enfermeria; design.md, D5: una ruta, no un diálogo). Se elige «Con un
// médico» o «En un servicio» y solo se muestra el selector de lo elegido: así se envía exactamente uno. La validación de verdad es la
// del servidor (Zod, personal activo, fecha, choque de turnos): un campo inválido muestra su mensaje junto al campo, con icono, asociado
// al campo y anunciado como alerta, y el foco pasa al primer campo con error; un rechazo general (p. ej. el choque de turnos) se
// muestra arriba como alerta y recibe el foco. Se envía con `onSubmit` y no con `<form action>`: React 19 vacía los campos tras una acción
// y el administrativo perdería lo que escribió.
export function FormularioTurno(props: DatosFormularioTurno) {
  const { modo, turnoId, enfermeras, medicos, servicios, hoy, valores, resumen } = props;
  const router = useRouter();
  const { avisar } = useAviso();
  const [pendiente, empezar] = useTransition();
  const [destino, setDestino] = useState<"medico" | "servicio">(valores.destino);
  const [resultado, setResultado] = useState<Extract<ResultadoAccion<unknown>, { ok: false }> | null>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const alertaGeneral = useRef<HTMLDivElement>(null);
  const campos = resultado?.campos ?? {};
  // Un rechazo sin campo propio (el choque de turnos, el turno que ya no existe, un error genérico) va arriba; el de `_` (médico o
  // servicio) va en su grupo.
  const mensajeGeneral = resultado && Object.keys(campos).filter((c) => c !== "_").length === 0 && !campos._ ? resultado.mensaje : null;

  // Foco: al primer campo con error o, si el error es general, a la alerta.
  useEffect(() => {
    if (!resultado) return;
    if (mensajeGeneral) {
      alertaGeneral.current?.focus();
      return;
    }
    formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"], fieldset[aria-describedby] input')?.focus();
  }, [resultado, mensajeGeneral]);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (pendiente) return;
    const datos = new FormData(evento.currentTarget);
    empezar(async () => {
      const r = modo === "nuevo" ? await asignarTurno(datos) : await actualizarTurno(datos);
      if (r.ok) {
        setResultado(null);
        avisar(modo === "nuevo" ? "Turno asignado." : "Turno actualizado.");
        const fecha = modo === "nuevo" ? String(datos.get("fecha") ?? "") : valores.fecha;
        router.push(fecha ? `${RUTA_SEMANA}?semana=${fecha}` : RUTA_SEMANA);
      } else {
        setResultado(r);
      }
    });
  }

  return (
    <form ref={formulario} onSubmit={enviar} noValidate className="flex max-w-[40rem] flex-col gap-4">
      {mensajeGeneral ? (
        <div ref={alertaGeneral} tabIndex={-1} className="outline-none">
          <Alerta tono="error">{mensajeGeneral}</Alerta>
        </div>
      ) : null}
      {modo === "editar" && turnoId ? <input type="hidden" name="id" value={turnoId} /> : null}

      {modo === "nuevo" ? (
        <>
          <CampoSeleccion
            id="turno-enfermera"
            name="enfermera_id"
            etiqueta="Enfermera"
            marcador="Seleccione una enfermera"
            opciones={enfermeras.map((e) => ({ valor: e.id, texto: e.nombre }))}
            defaultValue={valores.enfermeraId}
            error={campos.enfermera_id}
            requerido
          />
          <Campo
            id="turno-fecha"
            name="fecha"
            etiqueta="Fecha"
            type="date"
            min={hoy}
            defaultValue={valores.fecha}
            ayuda="Hoy o una fecha posterior."
            error={campos.fecha}
            requerido
          />
        </>
      ) : resumen ? (
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4 text-body-md">
          <p>
            <span className="text-muted-foreground">Enfermera: </span>
            <span className="font-semibold">{resumen.enfermera}</span>
          </p>
          <p className="tabular-nums">
            <span className="text-muted-foreground">Fecha: </span>
            <span className="font-semibold">{resumen.fechaTexto}</span>
          </p>
          <p className="text-body-sm text-muted-foreground">Para cambiar la enfermera o la fecha, quite este turno y asigne otro.</p>
          {resumen.enfermeraDeBaja ? <Alerta tono="aviso">La enfermera está dada de baja: quite el turno.</Alerta> : null}
        </div>
      ) : null}

      <ControlSegmentado
        nombre="turno"
        etiqueta="Franja"
        opciones={FRANJAS.map((f) => ({ valor: f, texto: ETIQUETA_FRANJA[f] }))}
        valorInicial={valores.franja}
        error={campos.turno}
      />

      <div className="flex flex-col gap-3" onChange={(e) => {
        const el = e.target as HTMLInputElement;
        if (el.name === "destino" && (el.value === "medico" || el.value === "servicio")) setDestino(el.value);
      }}>
        <ControlSegmentado
          nombre="destino"
          etiqueta="Trabajará"
          opciones={[
            { valor: "medico", texto: "Con un médico" },
            { valor: "servicio", texto: "En un servicio" },
          ]}
          valorInicial={valores.destino}
          error={campos._}
        />
        {destino === "medico" ? (
          <CampoSeleccion
            key="medico"
            id="turno-medico"
            name="medico_id"
            etiqueta="Médico"
            marcador="Seleccione un médico"
            opciones={medicos.map((m) => ({ valor: m.id, texto: `${m.nombre} · ${m.especialidad}` }))}
            defaultValue={valores.medicoId}
            error={campos.medico_id}
          />
        ) : (
          <CampoSeleccion
            key="servicio"
            id="turno-servicio"
            name="especialidad_id"
            etiqueta="Servicio"
            marcador="Seleccione un servicio"
            opciones={servicios.map((s) => ({ valor: s.id, texto: s.nombre }))}
            defaultValue={valores.servicioId}
            error={campos.especialidad_id}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pendiente || (modo === "editar" && resumen?.enfermeraDeBaja === true)}>
          {pendiente ? "Guardando…" : modo === "nuevo" ? "Asignar turno" : "Guardar cambios"}
        </Button>
        <Button asChild variant="secondary">
          <Link href={RUTA_SEMANA}>Volver a la semana</Link>
        </Button>
      </div>
    </form>
  );
}

// «Quitar turno» con confirmación en la misma página (sin diálogo: ver design.md, D5). Al pedirlo aparece la pregunta y el foco pasa a
// «No, conservar el turno» (la opción segura); mientras se envía no se puede repetir. Un rechazo (p. ej. «Los turnos de fechas pasadas no
// se modifican») se muestra como alerta y el turno no cambia.
export function QuitarTurno({ turnoId, descripcion, fecha }: { turnoId: string; descripcion: string; fecha: string }) {
  const router = useRouter();
  const { avisar } = useAviso();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const conservar = useRef<HTMLButtonElement>(null);
  const abrir = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmando) conservar.current?.focus();
  }, [confirmando]);

  function quitar() {
    setError(null);
    empezar(async () => {
      const r = await quitarTurno({ id: turnoId });
      if (r.ok) {
        avisar("Turno quitado.");
        router.push(`${RUTA_SEMANA}?semana=${fecha}`);
      } else {
        setError(r.mensaje);
      }
    });
  }

  return (
    <section aria-labelledby="titulo-quitar" className="mt-2 flex max-w-[40rem] flex-col gap-3 border-t border-border pt-4">
      <h2 id="titulo-quitar" className="font-heading text-title-md text-ink">
        Quitar el turno
      </h2>
      {error ? <Alerta tono="error">{error}</Alerta> : null}
      {confirmando ? (
        <div role="group" aria-label="Confirmar que se quita el turno" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <p className="text-body-md">¿Quitar el turno {descripcion}? La enfermera dejará de verlo.</p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="destructive" disabled={pendiente} onClick={quitar}>
              {pendiente ? "Quitando…" : "Sí, quitar turno"}
            </Button>
            <Button
              ref={conservar}
              type="button"
              variant="secondary"
              disabled={pendiente}
              onClick={() => {
                setConfirmando(false);
                setError(null);
                requestAnimationFrame(() => abrir.current?.focus());
              }}
            >
              No, conservar el turno
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button ref={abrir} type="button" variant="secondary" onClick={() => setConfirmando(true)}>
            Quitar turno
          </Button>
        </div>
      )}
    </section>
  );
}
