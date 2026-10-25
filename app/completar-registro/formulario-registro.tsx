"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { Alerta } from "@/components/clinica/alerta";
import { Campo } from "@/components/clinica/campo";
import { CampoDocumento } from "@/components/clinica/campo-documento";
import { ControlSegmentado } from "@/components/clinica/control-segmentado";
import { Button } from "@/components/ui/button";
import { pacientePortalSchema, type DatosPacientePortal } from "@/lib/schemas/paciente-portal";
import { completarRegistro } from "./acciones";

// Formulario «Complete su registro» (specs/registro-del-paciente; DESIGN.md, «Campo de formulario»). La validación del navegador usa
// el MISMO esquema que el servidor (lib/schemas/paciente-portal.ts) para dar respuesta inmediata; la del servidor sigue siendo la que
// manda. El correo es un dato de la cuenta: se muestra de solo lectura y NO viaja en el envío. El número de documento viaja por POST
// (la acción), nunca por la URL.
interface Valores {
  tipo_documento: string;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  sexo: string;
  telefono: string;
  direccion: string;
}

const CAMPOS = [
  "tipo_documento",
  "numero_documento",
  "nombres",
  "apellidos",
  "fecha_nacimiento",
  "sexo",
  "telefono",
  "direccion",
] as const;

export function FormularioRegistro({
  correo,
  nombres,
  apellidos,
  hoy,
}: {
  correo: string;
  nombres: string;
  apellidos: string;
  hoy: string;
}) {
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<Valores, unknown, DatosPacientePortal>({
    resolver: zodResolver(pacientePortalSchema) as unknown as Resolver<Valores, unknown, DatosPacientePortal>,
    defaultValues: {
      tipo_documento: "DNI",
      numero_documento: "",
      nombres,
      apellidos,
      fecha_nacimiento: "",
      sexo: "",
      telefono: "",
      direccion: "",
    },
    // Al enviar se validan todos los campos; después, cada cambio revalida el campo (la persona ve cómo se resuelve su error).
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const alEnviar = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    const resultado = await completarRegistro(datos);
    // Si salió bien la acción redirige a «Inicio» y esta promesa no vuelve; solo se llega aquí con un fallo.
    if (resultado.ok) return;
    const campos = resultado.campos ?? {};
    const primero = CAMPOS.find((c) => campos[c]);
    for (const campo of CAMPOS) {
      if (campos[campo]) setError(campo, { type: "servidor", message: campos[campo] });
    }
    if (primero) setFocus(primero);
    else setErrorGeneral(resultado.mensaje);
  });

  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-5">
      {errorGeneral ? <Alerta tono="error">{errorGeneral}</Alerta> : null}

      <CampoDocumento
        id="reg-doc"
        registroTipo={register("tipo_documento")}
        registroNumero={register("numero_documento")}
        error={errors.numero_documento?.message ?? errors.tipo_documento?.message}
      />

      <Campo
        id="reg-nombres"
        etiqueta="Nombres"
        autoComplete="given-name"
        requerido
        error={errors.nombres?.message}
        {...register("nombres")}
      />
      <Campo
        id="reg-apellidos"
        etiqueta="Apellidos"
        autoComplete="family-name"
        requerido
        error={errors.apellidos?.message}
        {...register("apellidos")}
      />
      <Campo
        id="reg-nacimiento"
        etiqueta="Fecha de nacimiento"
        type="date"
        max={hoy}
        autoComplete="bday"
        requerido
        error={errors.fecha_nacimiento?.message}
        {...register("fecha_nacimiento")}
      />
      <ControlSegmentado
        nombre="sexo"
        etiqueta="Sexo"
        opciones={[
          { valor: "F", texto: "Femenino" },
          { valor: "M", texto: "Masculino" },
          { valor: "X", texto: "Otro o prefiero no indicarlo" },
        ]}
        error={errors.sexo?.message}
        registro={register("sexo")}
      />
      <Campo
        id="reg-telefono"
        etiqueta="Teléfono (opcional)"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        error={errors.telefono?.message}
        {...register("telefono")}
      />
      <Campo
        id="reg-direccion"
        etiqueta="Dirección (opcional)"
        autoComplete="street-address"
        error={errors.direccion?.message}
        {...register("direccion")}
      />
      <Campo
        id="reg-correo"
        etiqueta="Correo electrónico"
        type="email"
        soloLectura
        defaultValue={correo}
        ayuda="Es el correo de su cuenta. No se puede cambiar aquí."
      />

      <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Guardando…" : "Continuar"}
      </Button>
    </form>
  );
}
