"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { Alerta } from "@/components/clinica/alerta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PacienteEncontrado } from "@/lib/citas/pacientes";
import { buscarPacientes } from "../pacientes/acciones";

// Elegir al paciente de una cita por su documento (exacto) o el inicio de sus apellidos (specs/gestion-de-citas: «paciente por
// documento»). Busca con la acción `buscarPacientes` (la misma de la pantalla de Pacientes) y devuelve el elegido al padre con
// `alElegir`. Sin resultados, lleva a registrarlo: un paciente sin ficha no puede agendarse.
export function ElegirPaciente({
  elegido,
  alElegir,
  deshabilitado = false,
}: {
  elegido: PacienteEncontrado | null;
  alElegir: (paciente: PacienteEncontrado | null) => void;
  deshabilitado?: boolean;
}) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<PacienteEncontrado[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscando, empezar] = useTransition();

  function buscar() {
    const termino = texto.trim();
    if (!termino) {
      setError("Ingrese un documento o un apellido");
      return;
    }
    setError(null);
    empezar(async () => {
      const r = await buscarPacientes({ termino });
      if (!r.ok) {
        setResultados(null);
        setError(r.mensaje);
        return;
      }
      setResultados(r.datos);
      // Un solo resultado exacto se elige solo: es lo habitual al buscar por documento.
      if (r.datos.length === 1) {
        alElegir(r.datos[0]);
        setResultados(null);
      }
    });
  }

  if (elegido) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-label-md text-ink">
            {elegido.nombres} {elegido.apellidos}
          </p>
          <p className="text-body-sm text-muted-foreground tabular-nums">
            {elegido.tipo_documento} {elegido.numero_documento}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" disabled={deshabilitado} onClick={() => alElegir(null)}>
          Cambiar<span className="sr-only"> paciente</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-buscar`}>Documento del paciente</Label>
      <div className="flex gap-2">
        <Input
          id={`${id}-buscar`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              buscar();
            }
          }}
          placeholder="DNI, carné o inicio de apellidos"
          autoComplete="off"
          maxLength={100}
          disabled={deshabilitado}
          aria-describedby={`${id}-estado`}
          className="h-9 tabular-nums"
        />
        <Button type="button" variant="secondary" size="sm" disabled={buscando || deshabilitado} onClick={buscar}>
          {buscando ? "Buscando…" : "Buscar"}
        </Button>
      </div>
      <p id={`${id}-estado`} role="status" className="text-body-sm text-muted-foreground">
        {error
          ? ""
          : resultados && resultados.length === 0
            ? "No se encontró ningún paciente."
            : resultados && resultados.length > 1
              ? "Elija al paciente de la lista."
              : "Escriba el documento exacto o el inicio de los apellidos."}
      </p>
      {error ? <Alerta tono="error">{error}</Alerta> : null}
      {resultados && resultados.length === 0 ? (
        <p className="text-body-sm">
          <Link className="text-primary underline underline-offset-2" href="/administrativo/pacientes">
            Registrar un paciente nuevo
          </Link>
        </p>
      ) : null}
      {resultados && resultados.length > 1 ? (
        <ul className="flex max-h-48 flex-col divide-y divide-border overflow-auto rounded-md border border-border bg-surface">
          {resultados.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  alElegir(p);
                  setResultados(null);
                }}
                className="flex w-full flex-col items-start px-3.5 py-2 text-left hover:bg-primary-soft focus-visible:shadow-focus-ring"
              >
                <span className="text-label-md text-ink">
                  {p.apellidos}, {p.nombres}
                </span>
                <span className="text-body-sm text-muted-foreground tabular-nums">
                  {p.tipo_documento} {p.numero_documento}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
