---
title: "Sistema de Gestión de Citas e Historias Clínicas Electrónicas"
---

# PRD: Sistema de Gestión de Citas e Historias Clínicas Electrónicas

## Problema

Hoy la clínica gestiona las citas en Excel y un formulario de Google Forms, y las historias
clínicas en papel. Esto genera pérdida de historiales, cruces de citas (doble reserva del mismo
horario/doctor), y falta de seguimiento de cancelaciones y reprogramaciones. El personal
administrativo es el más afectado: recibe las quejas de los pacientes por citas no agendadas
correctamente o por tiempos de espera de hasta 1 hora. El problema se vuelve urgente ahora por
la necesidad de mejorar procesos, ahorrar costos y tiempo, y porque la clínica está creciendo
en cantidad de pacientes y personal médico, lo cual el método actual (Excel/papel) no puede
sostener.

## Usuario objetivo

- **Administrativo** (perfil primario): agenda, reprograma y cancela citas; es quien recibe las
  quejas de los pacientes por errores de agenda o tiempos de espera.
- **Médico** (perfil primario): consulta sus turnos y citas confirmadas, y registra/consulta las
  historias clínicas de sus propios pacientes (acceso restringido solo a los pacientes a su
  cargo).
- **Enfermera** (perfil secundario, acceso limitado): consulta su turno y con qué médico o
  servicio le corresponde trabajar.
- **Paciente** (usuario directo vía portal de autoservicio): reserva y cancela su propia cita, y
  recibe notificaciones automáticas (recordatorio/confirmación de cita un día antes) por correo
  o mensaje. No accede a historias clínicas ni a otras funciones administrativas.

<!-- REVISAR: no se definió el canal exacto de notificación (email, SMS, WhatsApp) — queda como decisión de diseño/alcance técnico. -->

## Objetivo / resultado esperado

Si el sistema funciona como se espera, en un plazo de **4 a 5 meses** desde su puesta en uso:

- Mejora la satisfacción de los pacientes (menos quejas, menos tiempo de espera).
- Se reducen los cruces de citas y los reprocesos operativos.
- Se elimina la búsqueda de historias en papel a último momento — las historias están
  disponibles en tiempo real.
- Aumenta la cantidad de pacientes atendidos gracias a una gestión de agenda más eficiente.

## Alcance (qué sí incluye esta versión)

- Agendar, reprogramar y cancelar citas (por parte del administrativo).
- Portal de autoservicio para que el paciente reserve y cancele su propia cita.
- Historias clínicas electrónicas: registro y consulta, con acceso restringido al médico a
  cargo del paciente.
- Notificaciones automáticas al paciente (recordatorio/confirmación de cita un día antes).
- Dashboard operativo para visualizar citas y pacientes (vista de agenda y estado, no
  analítica avanzada).
- Gestión de turnos de enfermería (consulta de turno y asignación a médico/servicio).

<!-- REVISAR: no se identificaron dependencias externas (proveedor de email/SMS, sistema de facturación) al momento de cerrar esta sección; validar antes de diseño técnico. -->

## No alcance (qué explícitamente no incluye esta versión)

- No incluye pagos ni facturación en línea.
- No incluye telemedicina o consultas virtuales.
- No incluye integración con laboratorios o farmacias externas.
- No incluye gestión de inventario o insumos médicos.
- No incluye soporte multi-sede/sucursal.
- No incluye reportes o analítica avanzada de BI (el dashboard de esta versión es una vista
  operativa simple de citas y pacientes, no un módulo analítico).

## Criterios de éxito

- **75%** de las citas son reservadas o canceladas por el propio paciente a través del portal
  de autoservicio (vs. gestionadas por el administrativo), medido a los 4-5 meses de uso.
- **60%** de las historias clínicas están digitalizadas y disponibles en el sistema (vs. en
  papel), medido en el mismo plazo.
- El tiempo de espera del paciente se reduce a un **máximo de 20 minutos** (desde
  aproximadamente 1 hora actual).

## Casos borde a contemplar

- **Doble reserva:** el sistema valida disponibilidad al momento de agendar y bloquea el
  duplicado con la advertencia "Registro de cita ya agendado".
- **Cancelación tardía:** solo se permite cancelar hasta 1 hora antes de la cita; al momento de
  reservar, el sistema muestra una advertencia informando esta restricción.
- **Historia clínica incompleta o inválida:** no se permite guardar con campos vacíos o datos
  inválidos. Los datos ya cargados desde el registro del paciente no son editables desde la
  historia clínica.
- **Acceso indebido a historias clínicas:** un médico no puede acceder a historias de pacientes
  que no tiene a cargo. Se implementa mediante RLS (Row Level Security).
- **Doctor de baja o emergencia:** los pacientes agendados con ese doctor son reasignados y
  cubiertos por otro médico.

## Supuestos y riesgos abiertos

**Supuestos:**
- El paciente cuenta con acceso a internet, correo electrónico, y DNI o Carné de Extranjería
  válidos para su registro en el sistema.
- El personal (administrativo, médicos, enfermeras) migrará al 100% del Excel/papel al sistema,
  previa capacitación y con un manual de usuario.

**Riesgos:**
- Seguridad de las historias clínicas, al tratarse de información confidencial (riesgo
  principal del proyecto).
- Cumplimiento del marco legal peruano sobre manejo de historias clínicas electrónicas.

<!-- REVISAR: validar con un asesor legal el marco normativo peruano específico aplicable (ej. NTS de historia clínica electrónica del MINSA) antes de diseñar el módulo de historias clínicas. -->
