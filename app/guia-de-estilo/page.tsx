import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { Alerta } from "@/components/clinica/alerta";
import { AtencionFirmada } from "@/components/clinica/atencion-firmada";
import { Campo } from "@/components/clinica/campo";
import { CampoDocumento } from "@/components/clinica/campo-documento";
import { InsigniaEstado } from "@/components/clinica/insignia-estado";
import { SelectorHorario } from "@/components/clinica/selector-horario";
import { TablaAgenda } from "@/components/clinica/tabla-agenda";
import { TarjetaCita } from "@/components/clinica/tarjeta-cita";
import { Button } from "@/components/ui/button";
import { ESTADOS_CITA } from "@/lib/ui/estados-cita";
import {
  AHORA_EJEMPLO,
  ATENCION_EJEMPLO,
  CITAS_EJEMPLO,
  HORARIOS_EJEMPLO,
} from "@/lib/ui/ejemplos";
import { galeriaVisible } from "@/lib/ui/galeria";

function Seccion({
  id,
  titulo,
  children,
}: {
  id: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="font-display text-headline-md text-ink">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

// Galería de componentes (H2b): revisión visual y objetivo de las pruebas de accesibilidad. Solo con sesión y nunca en
// producción. Usa únicamente datos sintéticos de lib/ui/ejemplos.ts.
export default async function PaginaGuiaDeEstilo() {
  await auth.protect();
  if (!galeriaVisible(process.env)) {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-headline-lg text-ink">Guía de estilo</h1>
        <p className="text-body-md text-muted-foreground">
          Componentes del sistema de diseño con datos de ejemplo (sintéticos). Solo disponible en desarrollo y en los
          previews.
        </p>
      </header>

      <Seccion id="botones" titulo="Botones">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Reservar cita</Button>
          <Button variant="secondary">Reprogramar</Button>
          <Button variant="destructive">Cancelar cita</Button>
          <Button disabled>Reservando…</Button>
          <Button size="lg">Reservar cita (acción principal)</Button>
        </div>
      </Seccion>

      <Seccion id="insignias" titulo="Insignias de estado">
        <div className="flex flex-wrap gap-3">
          {ESTADOS_CITA.map((estado) => (
            <InsigniaEstado key={estado} estado={estado} />
          ))}
        </div>
      </Seccion>

      <Seccion id="alertas" titulo="Alertas">
        <div className="flex flex-col gap-3">
          <Alerta tono="aviso">Podrá cancelar esta cita hasta 1 hora antes, a las 13:30.</Alerta>
          <Alerta tono="error">Registro de cita ya agendado</Alerta>
          <Alerta tono="informacion">Le enviaremos un recordatorio por correo un día antes de su cita.</Alerta>
          <Alerta tono="exito">Su cita quedó reservada.</Alerta>
        </div>
      </Seccion>

      <Seccion id="campos" titulo="Campos de formulario">
        <div className="grid gap-5 md:grid-cols-2">
          <Campo
            id="g-nombres"
            etiqueta="Nombres"
            name="nombres"
            defaultValue="Rosa"
            ayuda="Tal como figura en su documento."
            requerido
          />
          <Campo
            id="g-dni"
            etiqueta="Documento (con error)"
            name="dni_error"
            defaultValue="1234567"
            inputMode="numeric"
            error="El DNI debe tener 8 dígitos. Revise que no falte ninguno."
          />
          <Campo
            id="g-registro"
            etiqueta="Nombres del registro"
            name="nombres_registro"
            defaultValue="Rosa Ejemplo Quispe"
            soloLectura
          />
          <Campo
            id="g-motivo"
            etiqueta="Motivo de consulta"
            name="motivo"
            multilinea
            ayuda="Cuéntenos brevemente qué siente."
          />
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <CampoDocumento id="g-doc-dni" nombreTipo="g_tipo_1" nombreNumero="g_numero_1" valorInicial="99000001" />
          <CampoDocumento
            id="g-doc-ce"
            nombreTipo="g_tipo_2"
            nombreNumero="g_numero_2"
            tipoInicial="CE"
            valorInicial="990000003"
          />
        </div>
      </Seccion>

      <Seccion id="selector-horario" titulo="Selector de horario">
        <p className="text-body-md text-muted-foreground">Miércoles 14/10/2026 con la Dra. Lucía Ejemplo Vargas.</p>
        <SelectorHorario horarios={HORARIOS_EJEMPLO} />
      </Seccion>

      <Seccion id="tarjetas" titulo="Tarjetas de cita">
        <div className="grid gap-4 md:grid-cols-2">
          {[CITAS_EJEMPLO[0], CITAS_EJEMPLO[5], CITAS_EJEMPLO[6]].map((cita) => (
            <TarjetaCita
              key={cita.id}
              cita={cita}
              ahora={AHORA_EJEMPLO}
              botonCancelar={<Button variant="destructive">Cancelar cita</Button>}
            />
          ))}
        </div>
      </Seccion>

      <Seccion id="tabla-agenda" titulo="Tabla de agenda">
        <TablaAgenda
          titulo="Agenda de ejemplo"
          citas={CITAS_EJEMPLO}
          acciones={() => (
            <>
              <Button size="sm" variant="secondary">
                Reprogramar
              </Button>
              <Button size="sm" variant="destructive">
                Cancelar
              </Button>
            </>
          )}
        />
        <TablaAgenda
          titulo="Agenda vacía"
          citas={[]}
          vacio="No hay citas para este filtro. Pruebe con otra fecha."
        />
      </Seccion>

      <Seccion id="atencion-firmada" titulo="Atención firmada">
        <AtencionFirmada id="g-atencion" atencion={ATENCION_EJEMPLO} />
      </Seccion>
    </main>
  );
}
