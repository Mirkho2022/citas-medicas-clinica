"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Lock, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { useAviso } from "@/components/clinica/aviso-temporal";
import { Alerta } from "@/components/clinica/alerta";
import { Campo } from "@/components/clinica/campo";
import { Dialogo } from "@/components/clinica/dialogo";
import { Button } from "@/components/ui/button";
import type { ResultadoAtencion } from "@/lib/atencion/repositorio";
import {
  ETIQUETA_TIPO_DIAGNOSTICO,
  LIMITE_MOTIVO,
  LIMITE_TEXTO_CLINICO,
  MAXIMO_DIAGNOSTICOS,
  TIPOS_DIAGNOSTICO,
  formularioAtencionSchema,
  type ContenidoAtencion,
} from "@/lib/schemas/atencion";
import { actualizarBorrador, registrarAtencion } from "../acciones";
import { SelectorDiagnostico } from "./selector-diagnostico";

type Salida = ReturnType<typeof formularioAtencionSchema.parse>;
type Campos = "motivo_consulta" | "anamnesis" | "examen_fisico" | "plan_tratamiento";

// Orden del formulario: sirve para enfocar el primer error y para el resumen.
const ORDEN_CAMPOS: readonly Campos[] = ["motivo_consulta", "anamnesis", "examen_fisico", "plan_tratamiento"];

export interface DiagnosticoInicial {
  cie10: string;
  descripcion: string;
  tipo: string;
}

// Formulario de atención (specs/registro-de-atencion, «Carga rápida de una atención»; design.md, D9). Una sola pantalla: los cuatro
// textos, los diagnósticos y una barra fija con «Guardar borrador» y «Firmar atención» (el único botón primario, con confirmación).
//  - La validación del navegador usa el MISMO esquema que el servidor (lib/schemas/atencion.ts) para dar respuesta inmediata; la del
//    servidor sigue siendo la que manda. Un error del servidor se muestra junto al campo SIN vaciar lo escrito.
//  - El texto clínico NO se guarda en el navegador (ni localStorage, ni sessionStorage, ni borrador local): vive solo en memoria
//    mientras la pestaña esté abierta. Al abandonar con cambios sin guardar el navegador avisa.
//  - Los datos del paciente no están aquí: son de solo lectura y viven en la ficha lateral. El médico y el paciente no se envían.
export function FormularioAtencion({
  modo,
  pacienteId,
  citaId,
  atencionId,
  motivoInicial,
  inicial,
  urlFicha,
  urlBusqueda,
}: {
  modo: "nueva" | "editar";
  pacienteId: string;
  citaId: string | null;
  atencionId?: string;
  motivoInicial: string;
  inicial?: { anamnesis: string; examen_fisico: string; plan_tratamiento: string; diagnosticos: DiagnosticoInicial[] };
  urlFicha: string;
  urlBusqueda: string;
}) {
  const router = useRouter();
  const { avisar } = useAviso();
  const [errorGeneral, setErrorGeneral] = useState<{ mensaje: string; firmada: boolean } | null>(null);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [errorDialogo, setErrorDialogo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<"borrador" | "firma" | null>(null);
  const [terminado, setTerminado] = useState(false);
  // Descripciones solo para mostrar: la que se guarda es la del catálogo (la pone la base de datos).
  const [descripciones, setDescripciones] = useState<Record<string, string>>(
    Object.fromEntries((inicial?.diagnosticos ?? []).map((d) => [d.cie10, d.descripcion])),
  );

  const {
    register,
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isDirty },
  } = useForm<ContenidoAtencion, unknown, Salida>({
    resolver: zodResolver(formularioAtencionSchema) as unknown as Resolver<ContenidoAtencion, unknown, Salida>,
    defaultValues: {
      motivo_consulta: motivoInicial,
      anamnesis: inicial?.anamnesis ?? "",
      examen_fisico: inicial?.examen_fisico ?? "",
      plan_tratamiento: inicial?.plan_tratamiento ?? "",
      diagnosticos: (inicial?.diagnosticos ?? []).map((d) => ({ cie10: d.cie10, tipo: d.tipo as "presuntivo" })),
    },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const { fields, append, remove } = useFieldArray({ control, name: "diagnosticos" });

  // Aviso del navegador al abandonar con cambios sin guardar (no hay autoguardado: ver design.md, D9).
  useEffect(() => {
    if (!isDirty || terminado) return;
    const aviso = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [isDirty, terminado]);

  function aplicarFallo(resultado: Extract<ResultadoAtencion<unknown>, { ok: false }>) {
    const campos = resultado.campos ?? {};
    let primero: Campos | null = null;
    for (const campo of ORDEN_CAMPOS) {
      if (campos[campo]) {
        setError(campo, { type: "servidor", message: campos[campo] });
        primero ??= campo;
      }
    }
    const textoDiagnosticos = Object.entries(campos).find(([clave]) => clave === "diagnosticos" || clave.startsWith("diagnosticos."));
    if (textoDiagnosticos) setError("diagnosticos", { type: "servidor", message: textoDiagnosticos[1] });
    if (primero) setFocus(primero);
    // Un fallo sin campo asociado (sin acceso, atención ya firmada, cita…) se muestra arriba, con su mensaje.
    if (!primero && !textoDiagnosticos) {
      setErrorGeneral({ mensaje: resultado.mensaje, firmada: "causa" in resultado && resultado.causa === "firmada" });
    } else if (resultado.campos?.cita_id) {
      setErrorGeneral({ mensaje: resultado.mensaje, firmada: false });
    }
  }

  async function enviar(datos: Salida, firmar: boolean): Promise<boolean> {
    setErrorGeneral(null);
    setEnviando(firmar ? "firma" : "borrador");
    try {
      const contenido = {
        motivo_consulta: datos.motivo_consulta,
        anamnesis: datos.anamnesis,
        examen_fisico: datos.examen_fisico,
        plan_tratamiento: datos.plan_tratamiento,
        diagnosticos: datos.diagnosticos,
        firmar,
      };
      const resultado =
        modo === "nueva"
          ? await registrarAtencion({ paciente_id: pacienteId, cita_id: citaId, ...contenido })
          : await actualizarBorrador({ atencion_id: atencionId, ...contenido });
      if (!resultado.ok) {
        aplicarFallo(resultado);
        if (firmar) setErrorDialogo(resultado.mensaje);
        return false;
      }
      setTerminado(true);
      avisar(firmar ? "Atención firmada" : "Borrador guardado");
      router.push(urlFicha);
      return true;
    } finally {
      setEnviando(null);
    }
  }

  const guardarBorrador = handleSubmit((datos) => enviar(datos, false));
  // «Firmar» valida primero; solo con el formulario correcto se abre la confirmación.
  const pedirFirma = handleSubmit(() => {
    setErrorDialogo(null);
    setDialogoAbierto(true);
  });
  const confirmarFirma = handleSubmit(async (datos) => {
    const bien = await enviar(datos, true);
    if (!bien) setDialogoAbierto(false);
  });

  const enviandoAlgo = enviando !== null;
  const erroresCampos = ORDEN_CAMPOS.filter((c) => errors[c]);
  const errorDiagnosticos = errors.diagnosticos?.root?.message ?? errors.diagnosticos?.message;
  const hayErrores = erroresCampos.length > 0 || Boolean(errorDiagnosticos) || (errors.diagnosticos?.length ?? 0) > 0;

  return (
    <form onSubmit={guardarBorrador} noValidate className="flex flex-col gap-5 pb-24" aria-label="Atención clínica">
      {errorGeneral ? (
        <Alerta tono="error" titulo="No se pudo guardar">
          {errorGeneral.mensaje}
          {errorGeneral.firmada && atencionId ? (
            <>
              {" "}
              <Link className="underline underline-offset-2" href={`/medico/pacientes/${pacienteId}/atencion/${atencionId}`}>
                Ver la atención y agregar una addenda
              </Link>
            </>
          ) : null}
        </Alerta>
      ) : null}

      {hayErrores ? (
        <Alerta tono="error" titulo="Revise los datos ingresados">
          <ul className="list-disc pl-5">
            {erroresCampos.map((campo) => (
              <li key={campo}>
                <a className="underline underline-offset-2" href={`#at-${campo}`}>
                  {errors[campo]?.message}
                </a>
              </li>
            ))}
            {errorDiagnosticos ? <li>{errorDiagnosticos}</li> : null}
          </ul>
        </Alerta>
      ) : null}

      <Campo
        id="at-motivo_consulta"
        etiqueta="Motivo de consulta"
        requerido
        multilinea
        maxLength={LIMITE_MOTIVO * 2}
        ayuda={citaId && motivoInicial ? "Prellenado desde la cita; puede editarlo." : undefined}
        error={errors.motivo_consulta?.message}
        {...register("motivo_consulta")}
      />
      <Campo
        id="at-anamnesis"
        etiqueta="Anamnesis"
        requerido
        multilinea
        maxLength={LIMITE_TEXTO_CLINICO * 2}
        error={errors.anamnesis?.message}
        {...register("anamnesis")}
      />
      <Campo
        id="at-examen_fisico"
        etiqueta="Examen físico"
        requerido
        multilinea
        maxLength={LIMITE_TEXTO_CLINICO * 2}
        error={errors.examen_fisico?.message}
        {...register("examen_fisico")}
      />

      <fieldset className="flex flex-col gap-3" aria-describedby={errorDiagnosticos ? "at-diagnosticos-error" : undefined}>
        <legend className="mb-1 font-heading text-label-lg text-foreground">
          Diagnósticos <span className="font-normal text-muted-foreground">(obligatorio, de 1 a {MAXIMO_DIAGNOSTICOS})</span>
        </legend>
        <SelectorDiagnostico
          urlBusqueda={urlBusqueda}
          yaElegidos={fields.map((f) => f.cie10)}
          error={errorDiagnosticos}
          alElegir={(opcion) => {
            if (fields.length >= MAXIMO_DIAGNOSTICOS) return;
            setDescripciones((previas) => ({ ...previas, [opcion.codigo]: opcion.descripcion }));
            append({ cie10: opcion.codigo, tipo: "presuntivo" });
          }}
        />
        {fields.length > 0 ? (
          <ul className="flex flex-col gap-2" aria-label="Diagnósticos elegidos">
            {fields.map((campo, i) => {
              const errorFila = errors.diagnosticos?.[i]?.cie10?.message ?? errors.diagnosticos?.[i]?.tipo?.message;
              return (
                <li key={campo.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-3.5 py-2.5">
                  <span className="w-16 shrink-0 font-heading text-label-md tabular-nums">{campo.cie10}</span>
                  <span className="min-w-0 flex-1 basis-48 text-body-md">{descripciones[campo.cie10] ?? ""}</span>
                  <label className="flex items-center gap-2 text-label-md">
                    <span className="sr-only">Tipo del diagnóstico {campo.cie10}</span>
                    <select
                      className="h-9 rounded-md border border-border-control bg-surface px-2 text-body-md"
                      {...register(`diagnosticos.${i}.tipo`)}
                    >
                      {TIPOS_DIAGNOSTICO.map((tipo) => (
                        <option key={tipo} value={tipo}>
                          {ETIQUETA_TIPO_DIAGNOSTICO[tipo]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)} aria-label={`Quitar el diagnóstico ${campo.cie10}`}>
                    <X aria-hidden="true" />
                    Quitar
                  </Button>
                  {errorFila ? (
                    <p role="alert" className="flex w-full items-start gap-2 text-body-sm text-error">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {errorFila}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-body-sm text-muted-foreground">Aún no agregó diagnósticos.</p>
        )}
      </fieldset>

      <Campo
        id="at-plan_tratamiento"
        etiqueta="Plan de tratamiento"
        requerido
        multilinea
        maxLength={LIMITE_TEXTO_CLINICO * 2}
        error={errors.plan_tratamiento?.message}
        {...register("plan_tratamiento")}
      />

      {/* Barra fija: la acción de guardar siempre visible. Un solo botón primario: «Firmar atención». */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-4 py-3 md:left-60 md:px-8">
        <div className="mx-auto flex max-w-[80rem] flex-wrap items-center justify-end gap-3">
          <Button asChild variant="ghost">
            <Link href={urlFicha}>Cancelar</Link>
          </Button>
          <Button type="submit" variant="secondary" disabled={enviandoAlgo}>
            {enviando === "borrador" ? "Guardando…" : "Guardar borrador"}
          </Button>
          <Button type="button" disabled={enviandoAlgo} onClick={pedirFirma}>
            <Lock aria-hidden="true" />
            Firmar atención
          </Button>
        </div>
      </div>

      <Dialogo
        abierto={dialogoAbierto}
        alCerrar={() => setDialogoAbierto(false)}
        titulo="¿Firmar esta atención?"
        descripcion="Una vez firmada, la atención ya no podrá editarse. Si necesita corregirla, deberá agregar una addenda."
        rol="alertdialog"
        bloqueado={enviando === "firma"}
      >
        {errorDialogo ? <Alerta tono="error">{errorDialogo}</Alerta> : null}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-foco-inicial
            disabled={enviando === "firma"}
            onClick={() => setDialogoAbierto(false)}
          >
            Volver
          </Button>
          <Button type="button" size="sm" disabled={enviando === "firma"} onClick={confirmarFirma}>
            {enviando === "firma" ? "Firmando…" : "Firmar atención"}
          </Button>
        </div>
      </Dialogo>
    </form>
  );
}
