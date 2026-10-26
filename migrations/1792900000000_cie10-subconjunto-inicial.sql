-- Up Migration
-- historias-clinicas, grupo 2 (parcial): subconjunto inicial del catálogo CIE-10, SOLO para que la validación de
-- diagnósticos (siguiente migración) tenga contra qué comprobar y las pruebas existentes (que usan `R51`) sigan
-- pasando en una base sin datos de demostración, como el branch efímero de CI.
--
-- NO es el catálogo oficial (ADR-0014): son los 12 códigos que ya siembra `scripts/sembrar-datos-demo.ts`, con el mismo
-- texto y el capítulo `DEMO`. La carga del catálogo completo desde la fuente MINSA/SUSALUD u OMS es la tarea 2.2 del
-- change `historias-clinicas` y se hará con `on conflict (codigo) do nothing` o `do update` según se decida entonces.
-- Idempotente: aplicar de nuevo o sembrar la demostración después no duplica ni falla.
insert into public.cie10 (codigo, descripcion, capitulo) values
  ('A09',   'Diarrea y gastroenteritis de presunto origen infeccioso', 'DEMO'),
  ('E11.9', 'Diabetes mellitus tipo 2 sin complicaciones', 'DEMO'),
  ('I10',   'Hipertensión esencial (primaria)', 'DEMO'),
  ('J00',   'Rinofaringitis aguda (resfriado común)', 'DEMO'),
  ('J06.9', 'Infección aguda de las vías respiratorias superiores', 'DEMO'),
  ('J45.9', 'Asma, no especificada', 'DEMO'),
  ('K29.7', 'Gastritis, no especificada', 'DEMO'),
  ('M54.5', 'Lumbago no especificado', 'DEMO'),
  ('N39.0', 'Infección de vías urinarias, sitio no especificado', 'DEMO'),
  ('R50.9', 'Fiebre, no especificada', 'DEMO'),
  ('R51',   'Cefalea', 'DEMO'),
  ('Z00.0', 'Examen médico general', 'DEMO')
on conflict (codigo) do nothing;

-- Down Migration
-- Solo hacia adelante (ADR-0027): un defecto se corrige con una migración nueva, nunca con una marcha atrás.
