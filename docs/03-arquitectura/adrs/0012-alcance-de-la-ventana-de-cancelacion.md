# ADR 0012: Alcance de la ventana de cancelación de 1 hora

## Estado

Aceptado

## Contexto

El PRD enuncia la regla de forma general — "solo se permite cancelar hasta 1 hora antes de la
cita" — sin distinguir por rol. El diseño inicial implementó provisionalmente la restricción solo
para el rol `paciente`, dejando explícito que era un supuesto a confirmar con el cliente. El
trigger `validar_cancelacion()` necesita saber a qué roles aplicar la ventana antes de cerrarse.

## Decisión

La ventana de 1 hora aplica a **todos los roles**, incluido el administrativo: el trigger
`validar_cancelacion()` no distingue por rol y bloquea cualquier cancelación a menos de 1
hora de `inicio`, sin excepción de rol.

## Alternativas consideradas

- **Solo al paciente** (lo que proponía el borrador) — más simple de justificar (el administrativo
  puede necesitar cancelar por una emergencia real del médico), pero abre una vía: el paciente
  podría llamar a la clínica para que un administrativo cancele en su nombre después de la
  ventana, esquivando la regla que el PRD quiere hacer cumplir.
- **Dejar pendiente** — se descartó porque bloqueaba cerrar el trigger de cancelación (H2/H3 del
  plan de implementación) sin necesidad: el PRD ya da una base suficiente para decidir sin más
  información externa.

## Consecuencias

- La regla es uniforme y fácil de explicar en el mensaje de error: "no se puede cancelar con menos
  de 1 hora de anticipación" aplica igual sin importar quién la ejecute, y cierra la vía de
  esquivar la regla llamando al administrativo.
- **Trade-off:** una emergencia real del médico a menos de 1 hora de una cita ya no puede
  resolverse cancelando la cita directamente: debe resolverse por el flujo de reasignación por
  baja médica ([ADR 0011](0011-reasignacion-de-citas-por-baja-medica.md)) o marcando la cita como
  `no_asistio` después del hecho. Esto añade un paso operativo al personal administrativo en el
  escenario de emergencia de último minuto.
- **Riesgo técnico introducido por esta decisión (resuelto):** el propio flujo de reasignación por
  baja médica ([ADR 0011](0011-reasignacion-de-citas-por-baja-medica.md)) cancela la cita original
  actualizando su `estado` a `cancelada`, dentro de una transacción — la misma operación que el
  trigger `validar_cancelacion()` intercepta. Un trigger ciego al rol pero también ciego al
  *origen* de la cancelación bloquearía exactamente el caso que debe resolver: una emergencia
  médica detectada con menos de 1 hora de anticipación. La excepción no puede basarse en el rol
  (un chequeo de rol reabriría la vía de escalada que esta misma ADR cierra); se basa en una
  condición de **datos**: existe un `bloqueo_agenda` vigente para ese médico que cubre el rango de
  la cita.

  ```sql
  create or replace function public.validar_cancelacion()
  returns trigger language plpgsql security definer set search_path = ''
  as $$
  declare
    v_es_por_baja boolean;
  begin
    if new.estado = 'cancelada' and old.estado <> 'cancelada' then
      -- Excepción: si existe un bloqueo_agenda vigente que cubre el rango de la cita
      -- para este médico, la cancelación es parte del flujo de reasignación por baja
      -- médica (ADR-0011), no una cancelación discrecional, y no aplica la ventana de 1h.
      select exists (
        select 1 from public.bloqueos_agenda b
        where b.medico_id = old.medico_id
          and b.rango && old.rango
      ) into v_es_por_baja;

      if not v_es_por_baja and old.inicio - now() < interval '1 hour' then
        raise exception 'No es posible cancelar con menos de 1 hora de anticipación'
          using errcode = 'P0001';
      end if;
      new.cancelada_en  := now();
      new.cancelada_por := public.perfil_actual();
    end if;
    return new;
  end;
  $$;
  ```

  **Nota (2026-10-08, H2):** el SQL de arriba es el implementado y verificado con pgTAP. Dos diferencias respecto
  del borrador original: la función es `security definer` (si no, la consulta a `bloqueos_agenda` pasaría por la RLS
  de quien cancela y un paciente nunca vería el bloqueo: la excepción dependería del rol, justo lo que esta ADR
  descarta) y la ventana se mide contra `old.inicio` (con `new.inicio`, un `UPDATE` que cancela y a la vez mueve la
  cita al futuro esquivaría la ventana).

  Nota de diseño: esto no abre una vía de escalada porque un `bloqueo_agenda` solo lo puede crear
  el administrativo (política RLS de esa tabla), y crearlo tiene su propio costo operativo (bloquea
  la agenda futura del médico para nuevas reservas) — no es un atajo que un paciente o un médico
  puedan usar para esquivar la ventana de cancelación. Cubierto por un test de la suite pgTAP:
  cancelar una cita a 30 minutos de su inicio falla sin `bloqueo_agenda`, y tiene éxito cuando existe
  uno vigente que la cubre.

  **Riesgo residual aceptado (2026-09-23, revisión adversarial):** la condición de la excepción es
  "existe algún `bloqueo_agenda` vigente que se solapa con esta cita", no "esta cancelación es
  parte de una reasignación por baja médica en curso". Si en el futuro `bloqueos_agenda` se usa
  para otro propósito administrativo (por ejemplo, bloquear una franja sin reasignar todavía a
  nadie), cualquier cancelación dentro de esa franja también saltaría la ventana de 1 hora, aunque
  no sea una emergencia médica. Se acepta este riesgo sin rediseñar el trigger porque: (a) crear un
  `bloqueo_agenda` ya tiene el costo operativo mencionado arriba, y (b) es una decisión exclusiva
  del administrativo, no una vía explotable por paciente o médico. Mitigación operativa mientras
  tanto: evitar crear `bloqueos_agenda` por motivos que no sean baja médica mientras haya citas
  vigentes en el rango; si es inevitable, tratarlo como una excepción conocida, no como un bug.
