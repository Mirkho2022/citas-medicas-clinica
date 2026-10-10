"use client";

import { useState } from "react";
import { Campo } from "@/components/clinica/campo";
import { Label } from "@/components/ui/label";

export type TipoDocumento = "DNI" | "CE";

// Formato esperado de cada documento peruano (el mismo que valida la base de datos: DNI de 8 dígitos y Carné de
// Extranjería de 9 a 12 caracteres alfanuméricos). La validación de verdad vive en el servidor; aquí solo se muestra.
const FORMATOS: Record<
  TipoDocumento,
  { ayuda: string; maxLength: number; inputMode: "numeric" | "text" }
> = {
  DNI: { ayuda: "8 dígitos, por ejemplo 12345678.", maxLength: 8, inputMode: "numeric" },
  CE: { ayuda: "De 9 a 12 letras o números, sin espacios.", maxLength: 12, inputMode: "text" },
};

// Documento de identidad (DESIGN.md): selector DNI / Carné de Extranjería + número, con el formato esperado como ayuda.
// El selector es un <select> nativo con estilo: accesible por defecto y cómodo en móvil.
export function CampoDocumento({
  id,
  nombreTipo = "tipo_documento",
  nombreNumero = "numero_documento",
  tipoInicial = "DNI",
  valorInicial = "",
  error,
  soloLectura = false,
}: {
  id: string;
  nombreTipo?: string;
  nombreNumero?: string;
  tipoInicial?: TipoDocumento;
  valorInicial?: string;
  error?: string;
  soloLectura?: boolean;
}) {
  const [tipo, setTipo] = useState<TipoDocumento>(tipoInicial);
  const idTipo = `${id}-tipo`;
  const formato = FORMATOS[tipo];

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-1.5 text-label-md text-foreground">Documento de identidad</legend>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={idTipo}>Tipo de documento</Label>
        <select
          id={idTipo}
          name={nombreTipo}
          value={tipo}
          disabled={soloLectura}
          onChange={(e) => setTipo(e.target.value as TipoDocumento)}
          className="h-11 w-full rounded-md border border-input bg-surface px-3.5 text-body-md text-foreground disabled:bg-muted disabled:opacity-100"
        >
          <option value="DNI">DNI</option>
          <option value="CE">Carné de Extranjería</option>
        </select>
      </div>
      <Campo
        key={tipo}
        id={`${id}-numero`}
        etiqueta="Número de documento"
        name={nombreNumero}
        defaultValue={valorInicial}
        maxLength={formato.maxLength}
        inputMode={formato.inputMode}
        autoComplete="off"
        ayuda={formato.ayuda}
        error={error}
        soloLectura={soloLectura}
      />
    </fieldset>
  );
}
