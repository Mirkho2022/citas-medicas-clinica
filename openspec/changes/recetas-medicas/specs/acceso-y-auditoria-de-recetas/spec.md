# Spec Delta

## Purpose

Que las recetas sean contenido clínico protegido como el resto de la historia: solo las lee el profesional que tiene al paciente
a cargo, cada lectura deja un registro escrito en la misma operación, la auditoría de escritura no copia su contenido y, mientras
la decisión legal P-1 siga abierta, solo admiten datos de demostración.

> **Nombres:** sujetos a ADR-0030 (propuesta). Si se rechaza, léase «médico» donde dice «profesional».

## ADDED Requirements

### Requirement: Solo los profesionales a cargo leen las recetas
El sistema SHALL permitir leer las recetas de un paciente, y los medicamentos que contienen, únicamente a los profesionales que
tienen a ese paciente a su cargo, cualquiera sea su profesión, incluyendo las recetas anuladas, que SHALL mostrarse como anuladas.
Ningún otro rol SHALL leer recetas. La restricción SHALL imponerla la base de datos.

#### Scenario: Profesional a cargo
- **WHEN** un profesional con el paciente a su cargo abre la lista de recetas del paciente o el detalle de una receta
- **THEN** ve las recetas emitidas y anuladas con sus medicamentos

#### Scenario: Receta de otro profesional
- **WHEN** un profesional a cargo abre una receta emitida por un colega
- **THEN** la ve completa en pantalla, sin poder anularla ni imprimirla

#### Scenario: Profesional sin el paciente a cargo (negativo)
- **WHEN** un profesional sin asignación vigente intenta abrir una receta por su dirección directa
- **THEN** recibe la misma respuesta que ante una receta inexistente

#### Scenario: Administrativo (negativo)
- **WHEN** el administrativo intenta leer recetas o medicamentos, por la pantalla o directamente
- **THEN** no recibe ninguna fila

#### Scenario: Enfermera (negativo)
- **WHEN** una enfermera intenta leer recetas o medicamentos
- **THEN** no recibe ninguna fila

#### Scenario: Paciente (negativo)
- **WHEN** un paciente intenta leer sus propias recetas o medicamentos desde el portal o directamente
- **THEN** no recibe ninguna fila: el portal no expone la historia

#### Scenario: Sesión sin rol, anónima y roles de servicio (negativo)
- **WHEN** una sesión sin rol, `anonymous`, `cron_notificaciones` o `sync_identidad` intenta leer recetas, medicamentos o impresiones
- **THEN** no recibe ninguna fila y no tiene privilegios sobre las tablas

#### Scenario: Sin escritura directa (negativo)
- **WHEN** cualquier rol de usuario, incluido el profesional emisor, intenta insertar, actualizar o borrar filas de las tablas de recetas sin pasar por las operaciones de emitir, anular e imprimir
- **THEN** la operación se rechaza

### Requirement: Toda lectura de recetas se registra antes de entregarse
Cada vez que el sistema entregue a un profesional el contenido de recetas de un paciente (la lista de recetas, el detalle de una
receta o la lista de medicamentos vigentes), SHALL registrar el acceso con el profesional, el paciente, el tipo de acceso
(`receta` o `medicamentos`), el identificador de la receta cuando corresponda y la hora, en la misma transacción de base de
datos que la lectura. Si el registro no puede escribirse, el contenido SHALL NO entregarse.

#### Scenario: Apertura de la lista de medicamentos
- **WHEN** el profesional a cargo abre la lista de medicamentos vigentes del paciente
- **THEN** queda un registro de acceso de tipo `medicamentos` con su identificador, el del paciente y la hora, y se entrega la lista

#### Scenario: Apertura de una receta
- **WHEN** el profesional abre el detalle de una receta
- **THEN** queda un registro de acceso de tipo `receta` con el identificador de esa receta

#### Scenario: El registro falla y no se entrega nada (negativo)
- **WHEN** el registro del acceso es rechazado (por ejemplo, porque el profesional ya no tiene al paciente a cargo)
- **THEN** la operación completa se revierte y no se devuelve ninguna receta ni medicamento

#### Scenario: Registro a nombre de otro (negativo)
- **WHEN** una solicitud intenta registrar un acceso de receta a nombre de otro profesional o de un paciente que no tiene a cargo
- **THEN** la base de datos lo rechaza

#### Scenario: Tipo de acceso con identificador ajeno (negativo)
- **WHEN** se intenta registrar un acceso de un tipo distinto de `receta` con un identificador de receta
- **THEN** la base de datos lo rechaza

#### Scenario: Cada solicitud cuenta
- **WHEN** el profesional recarga la lista de medicamentos
- **THEN** cada solicitud que devuelve contenido deja su propio registro

#### Scenario: El administrativo revisa sin ver contenido
- **WHEN** el administrativo revisa los accesos de un paciente tras lecturas de recetas
- **THEN** ve quién accedió, el tipo («Receta» o «Medicamentos») y la hora de Lima, y ningún medicamento ni dato de la receta

#### Scenario: Registro de accesos solo-agregar (negativo)
- **WHEN** cualquier usuario intenta modificar o eliminar un registro de acceso de receta
- **THEN** la operación se rechaza

### Requirement: La auditoría de escritura de recetas no copia contenido
Los registros de escritura sobre recetas, medicamentos e impresiones SHALL contener quién, cuándo, qué acción y el identificador
del registro, sin copiar su contenido, de modo que el administrativo que lee la auditoría no acceda a medicamentos, dosis ni datos
del paciente por esa vía.

#### Scenario: Emisión de una receta
- **WHEN** un profesional emite una receta
- **THEN** la auditoría registra al actor, la acción y el identificador, sin DCI, dosis, indicaciones ni nombre del paciente

#### Scenario: Anulación e impresión
- **WHEN** un profesional anula o imprime una receta
- **THEN** la auditoría registra al actor, la acción y el identificador, sin el motivo de anulación ni el contenido

#### Scenario: Administrativo lee la auditoría
- **WHEN** el administrativo consulta la auditoría tras actividad con recetas
- **THEN** no encuentra ningún texto clínico de recetas en ella

#### Scenario: Profesional, enfermera y paciente (negativo)
- **WHEN** un profesional, una enfermera o un paciente consultan la auditoría de escritura
- **THEN** no reciben ninguna fila

### Requirement: Las recetas solo admiten datos de demostración mientras P-1 siga abierta
Toda operación sobre recetas SHALL aplicar la misma guarda de modo de datos clínicos que el resto del módulo de historias: SHALL
emitir recetas únicamente para pacientes de demostración mientras el modo sea de demostración, y SHALL fallar cerrada si el modo
de la aplicación no coincide con el de la base de datos.

#### Scenario: Paciente real en modo demostración (negativo)
- **WHEN** se intenta emitir una receta para un paciente que no es de demostración con la base en modo de demostración
- **THEN** se rechaza con el mensaje de modo demostración

#### Scenario: Paciente de demostración
- **WHEN** se emite una receta para un paciente de demostración con la base en modo de demostración
- **THEN** se emite normalmente

#### Scenario: Configuración inconsistente (negativo)
- **WHEN** el modo configurado en la aplicación difiere del de la base de datos
- **THEN** ninguna operación de recetas entrega ni guarda contenido y la pantalla indica que el módulo no está disponible

#### Scenario: Aviso visible
- **WHEN** el modo es de demostración y se abre cualquier pantalla de recetas
- **THEN** se ve el aviso de modo demostración del módulo de historias

### Requirement: Un único punto de acceso a las tablas de recetas
Todo el código de la aplicación que lea o escriba recetas, medicamentos, impresiones o la lista de medicamentos vigentes SHALL
hacerlo a través del módulo único de acceso a datos clínicos, y la verificación automática de ese módulo SHALL cubrir también
estos objetos.

#### Scenario: Consulta de recetas fuera del módulo
- **WHEN** un archivo de la aplicación ajeno al módulo contiene una consulta a las tablas o a la vista de recetas
- **THEN** la verificación automática falla y señala el archivo

#### Scenario: Cambio legítimo
- **WHEN** todo el acceso a recetas se concentra en el módulo
- **THEN** la verificación automática pasa
