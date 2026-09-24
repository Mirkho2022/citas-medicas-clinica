# ADR 0005: Modelo de datos y prevención de doble reserva

## Estado

Aceptado

## Contexto

El PRD exige que la doble reserva del mismo horario/doctor se bloquee, y que esa validación sea "a
prueba de concurrencia" ([CLAUDE.md](../CLAUDE.md)): dos administrativos reservando el mismo slot
en el mismo instante no pueden pasar ambos. Un `SELECT` de disponibilidad seguido de un `INSERT` no
resuelve esto bajo concurrencia real (condición de carrera clásica). También hace falta un modelo
para pacientes, médicos, especialidades, disponibilidad, historias clínicas y turnos de
enfermería.

## Decisión

Entidades principales: `perfiles` (espejo de `auth.users` con rol), `pacientes`, `medicos`,
`enfermeras`, `especialidades`, `disponibilidades` (plantilla semanal recurrente),
`bloqueos_agenda`, `citas`, `historias_clinicas`, `atenciones`, `addendas`,
`asignaciones_paciente_medico`, `turnos_enfermeria`, `notificaciones`, `auditoria`,
`accesos_historia`.

La prevención de doble reserva se resuelve **en el motor de base de datos**, no en la aplicación,
con una restricción `EXCLUDE USING gist` sobre `citas` (columna `rango` = `tstzrange` generada) por
`medico_id` y separadamente por `paciente_id`, filtrada a estados vigentes (`reservada`,
`confirmada`). El mismo mecanismo protege `bloqueos_agenda` contra solapamientos por médico.
Documentos peruanos (DNI/CE) se validan por formato con `CHECK` (regex) sobre `pacientes`, y toda
fecha/hora se almacena en `timestamptz`, renderizada en `America/Lima` en la UI.

## Consecuencias

- La doble reserva es imposible de crear en la base de datos incluso bajo concurrencia real: el
  motor rechaza el segundo `INSERT` que solape con `SQLSTATE 23P01`, sin depender de que la
  aplicación haga el chequeo correctamente. La validación previa en aplicación solo sirve para
  mostrar un mensaje amable antes de intentar el insert, no para prevenir la condición de carrera.
- Los datos demográficos del paciente no existen como columnas en `atenciones`: la regla "los
  datos del registro del paciente no son editables desde la historia clínica" se cumple por
  estructura (no hay ruta de código que pueda escribir esas columnas porque no están ahí), en lugar
  de depender de una validación que alguien podría olvidar.
- **Trade-off:** las restricciones `EXCLUDE USING gist` requieren la extensión `btree_gist` y un
  índice GiST por tabla, más caro de mantener que un índice B-tree simple; y el mensaje de error
  que el motor produce (`SQLSTATE 23P01`, genérico de Postgres) debe mapearse explícitamente al
  texto exacto que pide el PRD (`Registro de cita ya agendado`) en la capa de Server Action — si ese
  mapeo se omite en un nuevo punto de inserción de citas, el usuario ve un error de Postgres crudo
  en vez del mensaje esperado.
