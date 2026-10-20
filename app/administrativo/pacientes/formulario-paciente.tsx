"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alerta } from "@/components/clinica/alerta";
import { Campo } from "@/components/clinica/campo";
import { CampoDocumento, type TipoDocumento } from "@/components/clinica/campo-documento";
import { ControlSegmentado } from "@/components/clinica/control-segmentado";
import { Button } from "@/components/ui/button";
import type { ResultadoAccion } from "@/lib/acciones/resultado";
import { registrarPaciente } from "./acciones";

// Formulario de registro de un paciente (specs/identificacion-de-pacientes; DESIGN.md, «Campo de formulario»). Cada campo muestra
// su error debajo y, arriba, un resumen enlazado a los campos (formulario largo). Un documento duplicado ofrece abrir al paciente
// existente en la búsqueda. Lo escrito se conserva si hay errores y se limpia si el registro sale bien. La validación de verdad
// es la del servidor (Zod y las restricciones de la base de datos); aquí solo se muestra.
interface Estado {
  resultado: ResultadoAccion<{ id: string }> | null;
  valores: Record<string, string>;
}

const INICIAL: Estado = { resultado: null, valores: {} };

// Campo del formulario → id del control, para enlazar desde el resumen de errores.
const IDS: Record<string, string> = {
  numero_documento: "pac-doc-numero",
  tipo_documento: "pac-doc-tipo",
  nombres: "pac-nombres",
  apellidos: "pac-apellidos",
  fecha_nacimiento: "pac-nacimiento",
  sexo: "sexo",
  email: "pac-email",
  telefono: "pac-telefono",
  direccion: "pac-direccion",
};

async function enviar(_anterior: Estado, datos: FormData): Promise<Estado> {
  const valores: Record<string, string> = {};
  for (const [clave, valor] of datos.entries()) if (typeof valor === "string" && !clave.startsWith("$ACTION_")) valores[clave] = valor;
  const resultado = await registrarPaciente(datos);
  // Registrado: el formulario queda vacío para el siguiente. Con errores: se conserva lo escrito.
  return { resultado, valores: resultado.ok ? {} : valores };
}

export function FormularioPaciente({ hoy }: { hoy: string }) {
  const [estado, accion, enviando] = useActionState(enviar, INICIAL);
  const { resultado, valores } = estado;
  const fallo = resultado && !resultado.ok ? resultado : null;
  const campos = fallo?.campos ?? {};
  // Un fallo sin campos (sin permiso, error interno) se muestra tal cual; con campos, el resumen los enlaza.
  const hayCampos = Object.keys(campos).length > 0;
  const duplicado = fallo?.codigo === "DOCUMENTO_DUPLICADO";
  const mensajeDe = (campo: string) => (campo === "numero_documento" && duplicado ? "Ya existe un paciente con ese documento" : campos[campo]);

  return (
    <form action={accion} noValidate className="flex flex-col gap-4" aria-describedby={fallo ? "pac-resumen" : undefined}>
      {resultado?.ok ? (
        <Alerta tono="exito" titulo="Paciente registrado">
          <Link className="underline underline-offset-2" href={`/administrativo/agenda/nueva?paciente=${resultado.datos.id}`}>
            Agendar una cita para este paciente
          </Link>
        </Alerta>
      ) : null}

      {fallo ? (
        <div id="pac-resumen">
          <Alerta tono="error" titulo={duplicado ? "Ya existe un paciente con ese documento" : hayCampos ? "Revise los datos ingresados" : "No se pudo registrar"}>
            {duplicado ? (
              <Link
                className="underline underline-offset-2"
                href={`/administrativo/pacientes?q=${encodeURIComponent(valores.numero_documento ?? "")}`}
              >
                Abrir el paciente existente
              </Link>
            ) : hayCampos ? (
              <ul className="list-disc pl-5">
                {/* En el orden del formulario (no en el que los devuelve la validación). */}
                {Object.entries(campos)
                  .sort(([a], [b]) => Object.keys(IDS).indexOf(a) - Object.keys(IDS).indexOf(b))
                  .map(([campo, mensaje]) => (
                    <li key={campo}>
                      {IDS[campo] ? (
                        <a className="underline underline-offset-2" href={`#${IDS[campo]}`}>
                          {mensaje}
                        </a>
                      ) : (
                        mensaje
                      )}
                    </li>
                  ))}
              </ul>
            ) : (
              fallo.mensaje
            )}
          </Alerta>
        </div>
      ) : null}

      <CampoDocumento
        id="pac-doc"
        tipoInicial={(valores.tipo_documento as TipoDocumento | undefined) ?? "DNI"}
        valorInicial={valores.numero_documento ?? ""}
        error={mensajeDe("numero_documento")}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="pac-nombres" name="nombres" etiqueta="Nombres" autoComplete="off" defaultValue={valores.nombres ?? ""} error={mensajeDe("nombres")} />
        <Campo id="pac-apellidos" name="apellidos" etiqueta="Apellidos" autoComplete="off" defaultValue={valores.apellidos ?? ""} error={mensajeDe("apellidos")} />
      </div>

      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Campo
          id="pac-nacimiento"
          name="fecha_nacimiento"
          etiqueta="Fecha de nacimiento"
          type="date"
          max={hoy}
          defaultValue={valores.fecha_nacimiento ?? ""}
          error={mensajeDe("fecha_nacimiento")}
        />
        <ControlSegmentado
          nombre="sexo"
          etiqueta="Sexo"
          opciones={[
            { valor: "M", texto: "M" },
            { valor: "F", texto: "F" },
            { valor: "X", texto: "X" },
          ]}
          valorInicial={valores.sexo}
          error={mensajeDe("sexo")}
        />
      </div>

      <Campo
        id="pac-email"
        name="email"
        etiqueta="Correo electrónico"
        type="email"
        autoComplete="off"
        placeholder="paciente@ejemplo.com"
        defaultValue={valores.email ?? ""}
        error={mensajeDe("email")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id="pac-telefono"
          name="telefono"
          etiqueta="Teléfono (opcional)"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          defaultValue={valores.telefono ?? ""}
          error={mensajeDe("telefono")}
        />
        <Campo id="pac-direccion" name="direccion" etiqueta="Dirección (opcional)" autoComplete="off" defaultValue={valores.direccion ?? ""} error={mensajeDe("direccion")} />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={enviando} className="w-full sm:w-auto">
          {enviando ? "Registrando…" : "Registrar paciente"}
        </Button>
      </div>
    </form>
  );
}
