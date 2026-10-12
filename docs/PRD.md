---
title: "Sistema de Gestión de Citas e Historias Clínicas Electrónicas"
---

# PRD: Sistema de Gestión de Citas e Historias Clínicas Electrónicas

## Problema

Hoy la clínica gestiona las citas en Excel y un formulario de Google Forms, y las historias
clínicas en papel. Esto genera pérdida de historiales, cruces de citas (doble reserva del mismo
horario/doctor), y falta de seguimiento de cancelaciones y reprogramaciones. El personal
administrativo es el más afectado: recibe las quejas de los pacientes por citas no agendadas
correctamente o por tiempos de espera de hasta 1 hora.

La clínica atiende Medicina general, Odontología, Fisioterapia, Psicología y Podología, con
profesionales de distintas profesiones (médicos y otros profesionales de la salud colegiados). El
paso de un paciente por la clínica (cita, triaje, consulta y receta) no ocurre en un solo lugar:
el triaje y las recetas se hacen en papel, y las recetas escritas a mano no se entienden por la
letra.

El problema se vuelve urgente ahora por la necesidad de mejorar procesos, ahorrar costos y
tiempo, y porque la clínica está creciendo en cantidad de pacientes, personal y especialidades,
lo cual el método actual (Excel/papel) no puede sostener.
<!-- REVISAR: «y especialidades» es un añadido del agente; confirmar. -->

## Usuario objetivo

- **Administrativo** (perfil primario): agenda, reprograma y cancela citas; es quien recibe las
  quejas de los pacientes por errores de agenda o tiempos de espera.
- **Profesional de la salud** (perfil primario): reemplaza al perfil «Médico». Reúne a los
  médicos y a los demás profesionales colegiados que atienden (odontólogos, fisioterapeutas,
  psicólogos y podólogos), de 2 a 3 por especialidad. Consulta sus turnos y citas confirmadas, y
  registra y consulta las historias clínicas de los pacientes a su cargo. La profesión define la
  plantilla clínica que usa y si puede emitir recetas.
  <!-- REVISAR: quién puede recetar según la profesión no está definido (médico sí; psicólogo no, confirmado por el usuario; odontólogo, fisioterapeuta y podólogo por confirmar). -->
- Un mismo paciente puede atenderse en varias especialidades, y todo profesional que lo tiene a
  cargo ve su historia clínica completa, para evitar cruces de medicamentos y reacciones
  adversas. **Excepción: la información de Psicología (resultados y notas de las sesiones) queda
  aparte y solo la ven los psicólogos que tienen al paciente a cargo; los demás profesionales no
  la ven, pero sí ven los medicamentos del paciente.**
  <!-- REVISAR: se entiende que los psicólogos también ven los medicamentos que recetan otros profesionales; llevar la regla al asesor legal (datos de salud mental). -->
- **Enfermera** (perfil primario, antes secundario): realiza el triaje (registra los signos
  vitales) y deriva al paciente a la especialidad que corresponde; el profesional que atiende ve
  ese triaje en el sistema. Solo registra el triaje y deriva: no accede a historias clínicas.
  Consulta también su turno y con qué especialidad trabaja.
  <!-- REVISAR: «primario» es lectura del agente; el usuario confirmó que no lee historias. -->
- **Paciente** (usuario directo vía portal de autoservicio): reserva y cancela su propia cita, y
  recibe notificaciones automáticas (recordatorio/confirmación de cita un día antes) por correo
  electrónico. No accede a historias clínicas ni a otras funciones administrativas.

## Objetivo / resultado esperado

Si el sistema funciona como se espera, en un plazo de **4 a 5 meses** desde su puesta en uso:

- Mejora la satisfacción de los pacientes (menos quejas, menos tiempo de espera).
- Se reducen los cruces de citas y los reprocesos operativos.
- Se elimina la búsqueda de historias en papel: las historias están disponibles en tiempo real.
- Aumenta la cantidad de pacientes atendidos gracias a una gestión de agenda más eficiente.
- Las recetas dejan de escribirse a mano: se emiten desde el sistema con una plantilla y las
  imprime el profesional que receta, de modo que siempre se entienden.
- El paciente llega al profesional con su triaje ya registrado en el sistema, sin papel.
- El profesional ve los medicamentos del paciente antes de recetar, para evitar cruces de
  medicamentos con reacciones adversas.

## Alcance (qué sí incluye esta versión)

- Agendar, reprogramar y cancelar citas (por parte del administrativo), y portal de
  autoservicio para que el paciente reserve y cancele su propia cita.
- Atención de pacientes con y sin cita. Recepción (el perfil administrativo) registra al
  paciente nuevo y abre su historia clínica con el formato de filiación que exige la norma
  (NTS 139); después la enfermera hace el triaje.
  <!-- REVISAR: el usuario escribió «el receptor»; se interpreta como recepción, es decir, el perfil administrativo. -->
- Triaje por enfermería: registro de presión arterial, frecuencia cardíaca, frecuencia
  respiratoria, temperatura, saturación de oxígeno, peso y talla (IMC calculado) y derivación a
  la especialidad correspondiente, visible para el profesional que atiende. Un profesional
  también puede derivar al paciente a otra especialidad si lo requiere.
- Historias clínicas electrónicas: registro y consulta, con acceso restringido a los
  profesionales a cargo del paciente y compartidas entre especialidades, salvo la información de
  Psicología, que queda aparte.
- Entrega de la copia de la historia clínica al paciente o a su representante legal dentro de los
  5 días de la solicitud (NTS 139), con registro de quién la solicita, con su identidad
  verificada, y de quién la emite.
- Recetas: emisión desde el sistema con una plantilla, receta común impresa por el profesional
  que receta y guardada como datos estructurados.
  <!-- REVISAR: contenido mínimo según DS 014-2011-SA, art. 56 (conocido solo por una guía comercial); validar con el asesor. -->
- Cinco especialidades, entregadas juntas, con sus funciones propias:
  - Medicina general: plantilla de la primera consulta.
  - Odontología: odontograma (dentición adulta e infantil, piezas y caras), hallazgos y
    tratamientos por pieza, y radiografías como adjuntos.
    <!-- REVISAR: la norma que rige el odontograma (NTS 188) no se verificó; admitir imágenes como adjuntos es una decisión pendiente (el diseño de historias se hizo solo con PDF). -->
  - Fisioterapia: evaluación inicial (escala de dolor, goniometría, fuerza, pruebas especiales y
    test funcional), nota por sesión, plan de sesiones con contador de las restantes,
    reevaluación y alta.
  - Psicología: evaluación estructurada, tests con puntaje automático de uso libre, notas de
    sesión reservadas y sesiones recurrentes.
  - Podología: evaluación de pie, uñas, piel y pisada, plan de controles, protocolos por
    sesiones y fotos de evolución.
- Notificaciones automáticas (recordatorio un día antes), dashboard operativo (vista de agenda y
  estado, no analítica avanzada) y gestión de turnos de enfermería.

<!-- REVISAR: dependencias externas por validar antes del diseño técnico: proveedor de correo, acreditación del sistema ante el MINSA y registro del banco de datos ante la ANPD (ver Riesgos). -->

## No alcance (qué explícitamente no incluye esta versión)

- No incluye pagos, cobros ni facturación en línea, ni presupuestos y cuotas de tratamientos
  (como los de odontología).
- No incluye telemedicina o consultas virtuales.
- No incluye integración con laboratorios o farmacias externas.
- No incluye gestión de inventario o insumos médicos.
- No incluye soporte multi-sede/sucursal.
- No incluye reportes o analítica avanzada de BI (el dashboard de esta versión es una vista
  operativa simple de citas y pacientes, no un módulo analítico).
- No incluye receta electrónica con firma digital ni receta especial de estupefacientes y
  psicotrópicos: solo la receta común impresa.
- No incluye alertas automáticas de interacción entre medicamentos: el sistema muestra los
  medicamentos del paciente y el profesional decide.
- No incluye notificaciones por WhatsApp ni SMS: las notificaciones son solo por correo.
- No incluye dictado por voz ni asistentes de inteligencia artificial.
- No incluye la especialidad de Estética y Capilar: la clínica no la atiende.
- No incluye que el paciente consulte su historia clínica desde el portal: la recibe en copia
  mediante solicitud.

## Criterios de éxito

- **75%** de las citas son reservadas o canceladas por el propio paciente a través del portal
  de autoservicio (vs. gestionadas por el administrativo), medido a los 4-5 meses de uso. Los
  pacientes que llegan sin cita no cuentan para este porcentaje.
- **60%** de las historias clínicas están digitalizadas y disponibles en el sistema (vs. en
  papel), medido en el mismo plazo.
- El tiempo de espera del paciente se reduce a un **máximo de 20 minutos** (desde
  aproximadamente 1 hora actual).
- **90 % o más** de las recetas se emiten e imprimen desde el sistema (recetas emitidas sobre
  el total de atenciones con receta), medido en el mismo plazo.
- **90 % o más** de las atenciones tienen el triaje registrado en el sistema antes de la
  consulta, con y sin cita, medido en el mismo plazo.
- **100 %** de las solicitudes de copia de la historia clínica se entregan en 5 días o menos.

## Casos borde a contemplar

- **Doble reserva:** el sistema valida disponibilidad al momento de agendar y bloquea el
  duplicado con la advertencia "Registro de cita ya agendado".
- **Cancelación tardía:** solo se permite cancelar hasta 1 hora antes de la cita; al momento de
  reservar, el sistema muestra una advertencia informando esta restricción.
- **Historia clínica incompleta o inválida:** no se permite guardar con campos vacíos o datos
  inválidos. Los datos ya cargados desde el registro del paciente no son editables desde la
  historia clínica.
- **Acceso indebido a historias clínicas:** un profesional no puede acceder a historias de
  pacientes que no tiene a cargo. Se implementa mediante RLS (Row Level Security).
- **Profesional de baja o emergencia:** los pacientes agendados con ese profesional son
  reasignados y cubiertos por otro de la misma especialidad.
- **Paciente sin cita:** no tiene un profesional «a cargo». Cuando la enfermera lo deriva a una
  especialidad, los profesionales de esa especialidad pueden abrir su historia para atenderlo.
  Sin derivación, nadie la ve, y la enfermera no puede dar acceso a otra cosa.
- **Paciente nuevo repetido:** si el documento ya está registrado, no se abre una segunda
  historia: el sistema muestra la existente.
- **Paciente sin documento o extranjero en tránsito:** se abre la historia con pasaporte o con
  un número correlativo provisional hasta confirmar su identidad.
- **Información de Psicología:** un profesional que no es psicólogo no puede ver los resultados
  ni las notas de sesión, ni abriéndolos por la dirección directa ni de ninguna otra forma. La
  copia de la historia que se entrega al paciente sí incluye la información de Psicología.
  <!-- REVISAR: llevar al asesor legal (datos de salud mental). -->
- **Receta:** un profesional sin permiso para recetar no puede emitirla, y una receta emitida no
  se edita: se anula y se emite otra. Una receta con datos incompletos no se imprime.
- **Copia de la historia:** si no se puede verificar la identidad de quien la solicita, o un
  representante no acredita serlo, la solicitud se rechaza y queda registrada.

## Supuestos y riesgos abiertos

**Supuestos:**
- El paciente cuenta con acceso a internet y correo electrónico para el portal, y con DNI,
  Carné de Extranjería, pasaporte o un número provisional para su historia clínica.
- El personal (administrativo, profesionales, enfermeras) migrará al 100% del Excel/papel al
  sistema, previa capacitación y con un manual de usuario.
- Cada consultorio y el puesto de triaje cuentan con computadora.
  <!-- REVISAR: impresora e internet estable no se confirmaron (el usuario confirmó solo las computadoras); sin impresora no se pueden imprimir las recetas. -->
- Hay de 2 a 3 profesionales por especialidad, y la clínica no atiende Estética y Capilar.

**Riesgos:**
- Seguridad de las historias clínicas, al tratarse de información confidencial (riesgo
  principal del proyecto), ahora con acceso compartido entre especialidades y la información de
  Psicología aparte.
- Cumplimiento del marco legal peruano: un sistema de historia clínica electrónica en una
  clínica privada debe acreditarse ante el MINSA (DS 009-2017-SA y Directiva
  373-MINSA/OGTI-2025, con plazos ampliados por la RM 188-2026-MINSA), lo que incluye firma
  digital y el registro del banco de datos ante la ANPD. Además, la base de datos está en
  Estados Unidos y hay reglas de salud mental por confirmar. Todo se valida con un asesor legal
  antes de usar datos reales.
- Alcance grande: entregar las cinco especialidades completas juntas puede retrasar la puesta
  en uso, y los 4 a 5 meses de los criterios de éxito cuentan desde ese momento.
- Sin alertas automáticas de interacción: el cruce de medicamentos depende de que el
  profesional revise la lista que muestra el sistema.
- Un solo canal de notificación (correo): si se abre poco, el 75% de autogestión puede verse
  afectado. Se revisa en los primeros meses y se evalúa sumar otro canal como decisión nueva.
- Cambio de roles: pasar de «médico» a «profesional de la salud» toca el esquema de la base de
  datos ya en producción y exige revisión explícita.

<!-- REVISAR: validar con un asesor legal el marco normativo peruano específico aplicable (ej. NTS de historia clínica electrónica del MINSA, acreditación del sistema, datos de salud mental) antes de diseñar el módulo de historias clínicas. -->
