# Spec Delta

## Purpose

Que solo un profesional de una profesión autorizada, con el paciente a su cargo, pueda emitir una receta común completa,
numerada de forma correlativa y a prueba de concurrencia, guardada como datos estructurados e inmutable: un error se corrige
anulando la receta y emitiendo otra.

> **Nombres:** sujetos a ADR-0030 (propuesta). Si se rechaza, léase «médico» donde dice «profesional» y `medico` donde dice
> `profesional`.

## ADDED Requirements

### Requirement: Solo las profesiones autorizadas pueden emitir recetas
El sistema SHALL decidir si un profesional puede emitir recetas a partir de su profesión, leída de la base de datos
(`profesionales.profesion`) y contrastada con un catálogo de profesiones autorizadas gestionado por migración. La profesión SHALL
NO provenir del navegador ni del token de sesión. En esta versión el catálogo autoriza al médico, no autoriza al psicólogo
(confirmado por el usuario) y deja sin autorizar a odontólogo, fisioterapeuta y podólogo hasta que se confirmen. Cambiar el
permiso de una profesión SHALL requerir solo una migración de datos, sin cambios de código. Ningún rol de usuario SHALL poder leer
ni escribir el catálogo.

#### Scenario: Médico emite
- **WHEN** un médico con el paciente a su cargo emite una receta con datos completos
- **THEN** la receta queda emitida con su número y su fecha de emisión

#### Scenario: Psicólogo no emite (negativo)
- **WHEN** un psicólogo con el paciente a su cargo intenta emitir una receta, por la pantalla o directamente contra la base
- **THEN** se rechaza con un mensaje en español, no se guarda nada y no se consume ningún número

#### Scenario: Profesión aún no confirmada (negativo)
- **WHEN** un odontólogo, un fisioterapeuta o un podólogo intenta emitir una receta mientras el catálogo no la autorice
- **THEN** se rechaza igual que al psicólogo y la interfaz no le ofrece «Emitir receta»

#### Scenario: Autorizar una profesión es una migración de datos
- **WHEN** una migración marca una profesión como autorizada para recetar
- **THEN** los profesionales de esa profesión pueden emitir recetas y la interfaz les ofrece «Emitir receta», sin desplegar código nuevo

#### Scenario: La profesión no la dicta el cliente (negativo)
- **WHEN** una solicitud afirma que el profesional es médico, o llega con un token de sesión que lo dice, siendo su profesión otra en la base
- **THEN** manda la profesión guardada en la base y la receta se rechaza si esa profesión no está autorizada

#### Scenario: Toda profesión tiene decisión
- **WHEN** existe una profesión válida para un profesional que no figura en el catálogo
- **THEN** la verificación automática de la suite falla, de modo que no se puede añadir una profesión sin decidir si receta

#### Scenario: Catálogo cerrado a los roles de usuario (negativo)
- **WHEN** un administrativo, un profesional, una enfermera, un paciente, una sesión sin rol, `anonymous`, `cron_notificaciones` o `sync_identidad` intenta leer, insertar, actualizar o borrar el catálogo
- **THEN** la operación se rechaza y no obtiene ninguna fila

### Requirement: Solo emite el profesional que tiene al paciente a cargo, a su propio nombre
El sistema SHALL permitir emitir una receta únicamente al profesional con sesión válida, activo, de profesión autorizada y con
asignación vigente al paciente. La receta SHALL quedar siempre a nombre del profesional de la sesión: el emisor SHALL NO ser un
dato que envíe el cliente. Ningún otro rol SHALL poder emitir recetas.

#### Scenario: Profesional a cargo
- **WHEN** un profesional autorizado con asignación vigente al paciente emite una receta
- **THEN** la receta se guarda con ese profesional como emisor

#### Scenario: Sin asignación vigente (negativo)
- **WHEN** un profesional autorizado sin asignación vigente al paciente intenta emitir una receta para él
- **THEN** se rechaza sin revelar si el paciente o su historia existen

#### Scenario: Asignación vencida (negativo)
- **WHEN** la asignación del profesional venció ayer en Lima
- **THEN** no puede emitir la receta y el sistema indica que ya no tiene acceso a esa historia

#### Scenario: Profesional o perfil desactivado (negativo)
- **WHEN** un profesional dado de baja, o con el perfil desactivado, intenta emitir una receta aunque su asignación no haya vencido
- **THEN** se rechaza

#### Scenario: Atribuir la receta a otro profesional (negativo)
- **WHEN** una solicitud intenta que la receta figure a nombre de otro profesional
- **THEN** no existe forma de indicarlo: la receta queda a nombre de quien la emite

#### Scenario: Otros roles (negativo)
- **WHEN** un administrativo, una enfermera, un paciente, una sesión sin rol, `anonymous`, `cron_notificaciones` o `sync_identidad` intenta emitir una receta
- **THEN** se rechaza, no se guarda nada y no se consume ningún número

### Requirement: La receta contiene los datos mínimos y no se emite incompleta
El sistema SHALL guardar cada receta como datos estructurados con: número; nombre, colegiatura, profesión y especialidad del
profesional emisor; datos del establecimiento; lugar, fecha y hora de emisión y fecha hasta la que la receta es válida; el
paciente; y de uno a ocho medicamentos, cada uno con su denominación común internacional (DCI), concentración, forma
farmacéutica, vía de administración, dosis por toma, frecuencia y duración en días, con marca comercial, cantidad total e
indicaciones como datos opcionales. Los datos del emisor y la fecha SHALL fijarlos el servidor, ignorando cualquier valor enviado
por el cliente. Una receta con un dato obligatorio vacío, compuesto solo de espacios o de caracteres invisibles, o inválido SHALL
rechazarse completa. <!-- REVISAR: el contenido mínimo según el DS 014-2011-SA, art. 56 (nombre y colegiatura del profesional, datos del establecimiento, nombre y edad del paciente, medicamento por su DCI, concentración, forma farmacéutica, dosis por toma y por día, duración, vía, indicaciones, lugar, fecha de emisión y de vigencia, firma) se conoce solo por la guía comercial de Saniape; validar con el asesor. La cantidad total es un supuesto del diseño. -->

#### Scenario: Receta completa
- **WHEN** el profesional envía una receta con todos los datos obligatorios de cada medicamento
- **THEN** se guarda con el emisor, el establecimiento y la hora de emisión que fija el servidor

#### Scenario: Marca comercial opcional
- **WHEN** un medicamento llega sin marca comercial
- **THEN** se guarda sin ella y se identifica por su DCI

#### Scenario: Sin medicamentos (negativo)
- **WHEN** se intenta emitir una receta sin ningún medicamento
- **THEN** se rechaza y no se guarda cabecera alguna

#### Scenario: Demasiados medicamentos (negativo)
- **WHEN** se intenta emitir una receta con más de ocho medicamentos
- **THEN** se rechaza indicando el límite

#### Scenario: Campo obligatorio vacío o invisible (negativo)
- **WHEN** falta la DCI, la concentración, la forma, la vía, la dosis, la frecuencia o la duración de un medicamento, o contiene solo espacios, tabuladores o caracteres de ancho cero
- **THEN** se rechaza toda la receta y la respuesta indica el medicamento y el campo

#### Scenario: Duración fuera de rango (negativo)
- **WHEN** la duración de un medicamento es cero, negativa, mayor que 365 días o no es un número entero
- **THEN** se rechaza

#### Scenario: Valores de otro tipo no se convierten
- **WHEN** la duración llega como texto o un campo de texto llega como número
- **THEN** se rechaza en lugar de convertirse

#### Scenario: Claves ajenas
- **WHEN** un medicamento llega con una clave que el contrato no define
- **THEN** la clave se descarta y no se guarda

#### Scenario: Fecha y emisor no los dicta el cliente
- **WHEN** la solicitud trae una fecha de emisión del pasado o del futuro, o un nombre o colegiatura de emisor distintos de los del profesional
- **THEN** la receta se guarda con la hora del servidor y con el nombre, la colegiatura, la profesión y la especialidad que constan en la base

#### Scenario: Establecimiento incompleto (negativo)
- **WHEN** faltan datos del establecimiento en la configuración de la aplicación
- **THEN** no se emite la receta y la pantalla indica que el módulo no está disponible

#### Scenario: Fecha de validez
- **WHEN** se emite una receta con una vigencia de N días
- **THEN** su fecha de validez es la fecha de emisión en `America/Lima` más N días

### Requirement: La numeración es correlativa, única y a prueba de concurrencia
El sistema SHALL asignar a cada receta un número entero correlativo, único para toda la clínica, dentro de la misma transacción de
la emisión. Dos emisiones simultáneas SHALL NO recibir el mismo número, y una emisión que falla SHALL NO consumir uno: no habrá
huecos. Una receta anulada SHALL conservar su número y ese número SHALL NO reutilizarse. El cliente SHALL NO poder elegir el
número.

#### Scenario: Números consecutivos
- **WHEN** se emiten tres recetas seguidas
- **THEN** reciben tres números consecutivos en el orden de emisión

#### Scenario: Emisiones simultáneas
- **WHEN** veinte emisiones de profesionales distintos llegan a la vez
- **THEN** reciben veinte números distintos y consecutivos, sin repeticiones ni saltos

#### Scenario: Emisión fallida sin hueco
- **WHEN** una emisión falla después de haber calculado su número (por ejemplo, por un medicamento inválido o una caída de la transacción)
- **THEN** la siguiente emisión recibe ese mismo número y la serie no tiene huecos

#### Scenario: Anulada conserva su número
- **WHEN** se anula una receta y se emite otra
- **THEN** la anulada mantiene su número y la nueva recibe el siguiente

#### Scenario: Número elegido por el cliente (negativo)
- **WHEN** una solicitud intenta fijar el número de la receta
- **THEN** no existe forma de indicarlo y el número lo asigna el servidor

#### Scenario: Reintento del mismo envío
- **WHEN** el mismo envío de la receta llega dos veces (doble clic o reintento tras un corte de red)
- **THEN** se emite una sola receta, no dos, y el segundo envío recibe la receta ya emitida

#### Scenario: Servicio ocupado
- **WHEN** la numeración no se puede obtener en pocos segundos porque otra emisión retiene el turno
- **THEN** la emisión falla sin guardar nada y el profesional recibe un mensaje en español que le pide reintentar

### Requirement: Una receta emitida es inmutable
Una vez emitida, ninguna operación de usuario SHALL poder modificar el contenido de la receta ni de sus medicamentos, agregarles
medicamentos ni eliminarlos, ni siquiera el profesional que la emitió. El sistema SHALL guardar una huella del contenido al
emitir, que SHALL coincidir con su recálculo a partir del contenido guardado.

#### Scenario: Modificar una receta emitida (negativo)
- **WHEN** cualquier usuario, por la pantalla o directamente, intenta cambiar un dato de una receta emitida o de uno de sus medicamentos
- **THEN** la operación se rechaza con un mensaje que indica anular la receta y emitir otra

#### Scenario: Agregar un medicamento después (negativo)
- **WHEN** alguien intenta añadir un medicamento a una receta ya emitida
- **THEN** se rechaza

#### Scenario: Eliminar una receta (negativo)
- **WHEN** cualquier usuario intenta eliminar una receta, emitida o anulada, o uno de sus medicamentos
- **THEN** la operación se rechaza

#### Scenario: Huella verificable
- **WHEN** se recalcula la huella a partir del contenido guardado de una receta
- **THEN** coincide con la huella guardada al emitir, y deja de coincidir si se altera cualquier dato de la receta o de sus medicamentos (con la protección desactivada solo dentro de una prueba)

### Requirement: Una receta se anula y se corrige emitiendo otra
El sistema SHALL permitir al profesional que emitió una receta, mientras tenga al paciente a cargo, anularla con un motivo con
contenido real. La anulación SHALL registrar el motivo, quién anuló y la hora del servidor, y SHALL ser el único cambio posible
sobre una receta emitida. La receta anulada SHALL seguir visible como anulada. El sistema SHALL ofrecer corregir en un solo paso:
anular la receta y emitir otra vinculada a la anulada, de modo que si la nueva falla la original no quede anulada.

#### Scenario: El emisor anula
- **WHEN** el profesional que emitió la receta la anula indicando un motivo
- **THEN** la receta pasa a anulada con su motivo, su autor y la hora del servidor, y su contenido no cambia

#### Scenario: Anular sin motivo (negativo)
- **WHEN** el motivo está vacío o contiene solo espacios o caracteres invisibles
- **THEN** se rechaza y la receta sigue emitida

#### Scenario: Anular la receta de otro profesional (negativo)
- **WHEN** un profesional que no la emitió, aunque tenga al paciente a cargo, intenta anularla
- **THEN** se rechaza y la receta sigue emitida

#### Scenario: Anular sin tener ya al paciente a cargo (negativo)
- **WHEN** el emisor ya no tiene al paciente a cargo e intenta anular
- **THEN** se rechaza sin revelar información de la historia

#### Scenario: Anular dos veces (negativo)
- **WHEN** se intenta anular una receta ya anulada
- **THEN** se rechaza

#### Scenario: Otros roles (negativo)
- **WHEN** un administrativo, una enfermera, un paciente, una sesión sin rol, `anonymous`, `cron_notificaciones` o `sync_identidad` intenta anular una receta
- **THEN** se rechaza y la receta no cambia

#### Scenario: Corregir en un solo paso
- **WHEN** el profesional corrige una receta con datos válidos
- **THEN** la original queda anulada, la nueva queda emitida con su propio número y apunta a la anulada

#### Scenario: Falla la receta nueva
- **WHEN** al corregir, la receta nueva es inválida
- **THEN** no se guarda nada: la original sigue emitida y la serie numérica no cambia

#### Scenario: Corrección inválida (negativo)
- **WHEN** una receta pretende reemplazar a otra que no está anulada, que es de otro paciente o de otro profesional, o que ya fue reemplazada
- **THEN** se rechaza

### Requirement: La receta puede vincularse a la atención
El sistema SHALL permitir, sin exigirlo, vincular la receta a una atención. La atención SHALL ser del mismo paciente y del mismo
profesional que emite; en caso contrario la receta se rechaza.

#### Scenario: Receta sin atención
- **WHEN** el profesional emite una receta sin indicar atención
- **THEN** se emite normalmente

#### Scenario: Receta de una atención propia
- **WHEN** el profesional vincula la receta a una atención suya del mismo paciente, firmada o en borrador
- **THEN** se emite y queda vinculada

#### Scenario: Atención de otro profesional o de otro paciente (negativo)
- **WHEN** la atención indicada es de otro profesional o de otro paciente
- **THEN** se rechaza con un mensaje en español y no se guarda nada

### Requirement: Alcance de la receta común
El sistema SHALL emitir únicamente receta común impresa. El sistema SHALL NOT firmar digitalmente la receta, emitir receta
especial de estupefacientes y psicotrópicos, calcular ni mostrar alertas automáticas de interacción entre medicamentos, enviar
la receta a farmacias ni entregarla al paciente en formato digital. La pantalla de emisión SHALL advertir que el formulario no
sirve para estupefacientes ni psicotrópicos.

#### Scenario: Aviso en el formulario
- **WHEN** el profesional abre el formulario de emisión
- **THEN** ve la advertencia de que la receta común no sirve para estupefacientes ni psicotrópicos

#### Scenario: Sin alertas automáticas
- **WHEN** el profesional agrega medicamentos a una receta que coinciden o interactúan con otros vigentes del paciente
- **THEN** el sistema no genera ninguna alerta ni bloqueo: el profesional decide a partir de la lista que se le muestra

#### Scenario: Sin entrega digital
- **WHEN** se emite o se imprime una receta
- **THEN** el sistema no envía la receta por correo ni la expone al paciente en el portal
