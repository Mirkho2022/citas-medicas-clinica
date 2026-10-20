-- Up Migration
-- H3 grupo 2, tarea 2.1 (agenda-y-reserva): la plantilla semanal no se solapa y los bloqueos quedan auditados.
-- Ver design.md, D1 y D2. No crea tablas.

-- Dos tramos del mismo médico, el mismo día de la semana, con horas que se cruzan y vigencias que se cruzan
-- duplicarían los slots. Es la misma filosofía de la doble reserva (ADR-0005): la integridad vive en el motor y
-- no en la Server Action, porque dos administrativos editando a la vez la saltarían. El tramo horario se
-- expresa como rango sobre una fecha fija porque `time` no tiene rango propio; la vigencia es inclusiva en
-- ambos extremos y `vigente_hasta` nulo significa «sin término». Un tramo contiguo (08:00-10:00 y 10:00-12:00)
-- no se cruza: tsrange es semiabierto. La violación es 23P01 y la aplicación la traduce por contexto.
alter table public.disponibilidades
  add constraint disponibilidades_sin_solape
  exclude using gist (
    medico_id with =,
    dia_semana with =,
    tsrange(date '2000-01-01' + hora_inicio, date '2000-01-01' + hora_fin) with &&,
    daterange(vigente_desde, vigente_hasta, '[]') with &&
  );

-- current_date depende del TimeZone del servidor (UTC en Neon): a las 19:00 de Lima ya sería «mañana». Mismo
-- defecto que H2 corrigió en las asignaciones; hoy_lima() fija la fecha de la clínica.
alter table public.disponibilidades alter column vigente_desde set default public.hoy_lima();

-- Un bloqueo es lo que habilita cancelar sin la ventana de 1 hora (validar_cancelacion(), ADR-0011), así que
-- crearlo, moverlo o borrarlo deja huella con autor y rol, como las citas. registrar_auditoria() es la misma de H2.
create trigger bloqueos_auditoria
  after insert or update or delete on public.bloqueos_agenda
  for each row execute function public.registrar_auditoria();

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
