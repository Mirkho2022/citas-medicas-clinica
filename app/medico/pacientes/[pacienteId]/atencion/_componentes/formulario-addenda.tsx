"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useAviso } from "@/components/clinica/aviso-temporal";
import { Alerta } from "@/components/clinica/alerta";
import { Campo } from "@/components/clinica/campo";
import { Button } from "@/components/ui/button";
import { LIMITE_TEXTO_CLINICO } from "@/lib/schemas/atencion";
import { agregarAddenda } from "../acciones";

// Addenda sobre una atención firmada (specs/firma-y-addendas): la única corrección posible. El texto es obligatorio y con
// contenido (la validación de verdad es la del servidor y la de la base de datos). Una addenda no se edita ni se elimina.
export function FormularioAddenda({ atencionId }: { atencionId: string }) {
  const router = useRouter();
  const { avisar } = useAviso();
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setErrorGeneral(null);
    empezar(async () => {
      const resultado = await agregarAddenda({ atencion_id: atencionId, texto });
      if (resultado.ok) {
        setTexto("");
        setAbierta(false);
        avisar("Addenda agregada");
        router.refresh();
        return;
      }
      if (resultado.campos?.texto) setError(resultado.campos.texto);
      else setErrorGeneral(resultado.mensaje);
    });
  }

  if (!abierta) {
    return (
      <div>
        <Button type="button" variant="secondary" onClick={() => setAbierta(true)}>
          Agregar addenda
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-3" aria-label="Agregar addenda">
      {errorGeneral ? <Alerta tono="error">{errorGeneral}</Alerta> : null}
      <Campo
        id="addenda-texto"
        etiqueta="Texto de la addenda"
        requerido
        multilinea
        maxLength={LIMITE_TEXTO_CLINICO * 2}
        ayuda="La addenda queda con su autor y su fecha y no podrá editarse ni eliminarse."
        error={error ?? undefined}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        autoFocus
      />
      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" disabled={pendiente} onClick={() => setAbierta(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar addenda"}
        </Button>
      </div>
    </form>
  );
}
