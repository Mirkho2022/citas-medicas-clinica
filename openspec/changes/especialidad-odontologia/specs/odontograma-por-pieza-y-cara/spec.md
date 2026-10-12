# Spec Delta

## Purpose

Que el odontólogo registre en cada atención el estado de las piezas dentales por pieza y cara, con numeración FDI y en dentición
adulta, infantil o mixta, y que el sistema derive el odontograma actual de lo último firmado sin perder ningún registro anterior.

## ADDED Requirements

### Requirement: Solo piezas FDI válidas
El sistema SHALL aceptar únicamente piezas con numeración FDI: de la dentición adulta 11 a 18, 21 a 28, 31 a 38 y 41 a 48, y de la
dentición infantil 51 a 55, 61 a 65, 71 a 75 y 81 a 85. Cualquier otro número SHALL rechazarse tanto al validar la solicitud en el
servidor como en la base de datos, y el mensaje SHALL indicar que la pieza no existe.

#### Scenario: Pieza adulta válida
- **WHEN** el odontólogo registra un hallazgo en la pieza 16
- **THEN** el registro se guarda en la atención

#### Scenario: Pieza infantil válida
- **WHEN** el odontólogo registra un hallazgo en la pieza 55 de un odontograma infantil
- **THEN** el registro se guarda en la atención

#### Scenario: Pieza inexistente (negativo)
- **WHEN** se envía una pieza 0, 9, 19, 29, 56, 86 o 90
- **THEN** se rechaza en el servidor y, si la solicitud llegara a la base de datos, esta también la rechaza; no se guarda nada

### Requirement: Un registro por pieza y cara en cada atención
El sistema SHALL guardar, en cada atención, como máximo un registro por pieza y cara, con un hallazgo del catálogo y un detalle
opcional. Las caras SHALL ser vestibular, lingual o palatina, mesial, distal, oclusal o incisal, y la pieza completa. Un segundo
registro de la misma pieza y cara en la misma atención SHALL rechazarse, y el odontólogo SHALL poder modificar el existente mientras
la atención no esté firmada.

#### Scenario: Hallazgo en una cara
- **WHEN** el odontólogo registra «caries» en la cara oclusal o incisal de la pieza 16
- **THEN** queda un registro con esa pieza, esa cara y ese hallazgo

#### Scenario: Registro duplicado (negativo)
- **WHEN** se intenta registrar otro hallazgo para la misma pieza y cara de la misma atención
- **THEN** se rechaza indicando que ya existe un registro y que debe modificarse ese

#### Scenario: Modificar un registro de un borrador
- **WHEN** el autor cambia el hallazgo de un registro de su atención sin firmar
- **THEN** el registro queda con el hallazgo nuevo y nada más cambia

#### Scenario: Quitar un registro de un borrador
- **WHEN** el autor elimina un registro mal puesto de su atención sin firmar
- **THEN** el registro desaparece y la acción queda en la auditoría sin su contenido

### Requirement: Dentición adulta, infantil y mixta
El sistema SHALL registrar, en la sección odontológica de cada atención, la dentición declarada por el odontólogo: adulta, infantil o
mixta. La dentición adulta SHALL admitir solo piezas de la dentición adulta, la infantil solo piezas de la infantil y la mixta
ambas. Cambiar la dentición de un borrador SHALL revalidar los registros ya cargados. El sistema SHALL NOT inferir la dentición de
la edad del paciente ni fijar umbrales de edad.

#### Scenario: Dentición mixta
- **WHEN** el odontólogo declara dentición mixta y registra hallazgos en las piezas 16, 55 y 36
- **THEN** los tres registros se guardan y cada pieza conserva su propio historial

#### Scenario: Pieza de otra dentición (negativo)
- **WHEN** en un odontograma de dentición adulta se registra la pieza 55
- **THEN** se rechaza indicando que la pieza no corresponde a la dentición elegida

#### Scenario: Cambiar la dentición con registros incompatibles (negativo)
- **WHEN** el autor cambia de mixta a adulta un borrador que ya tiene registros de la pieza 55
- **THEN** el cambio se rechaza y la dentición anterior se conserva

#### Scenario: Sustitución de una pieza temporal
- **WHEN** una pieza temporal cae y la definitiva ocupa su lugar
- **THEN** el odontólogo registra la temporal como ausente y la definitiva con sus hallazgos, sin que el sistema los vincule por su cuenta

#### Scenario: Continuidad entre denticiones
- **WHEN** un paciente se atiende primero con dentición infantil, luego mixta y luego adulta
- **THEN** el odontograma actual junta las piezas de todas las atenciones firmadas en un único historial

### Requirement: Pieza con hallazgo que reemplaza las caras
El sistema SHALL rechazar, dentro de una misma atención, registros por cara de una pieza que ya tiene un registro de pieza completa
cuyo hallazgo reemplaza las caras (por ejemplo, ausente o corona). Al derivar el odontograma actual, los registros por cara de esa
pieza firmados antes del último registro de pieza completa que reemplaza las caras SHALL NOT figurar.

#### Scenario: Pieza ausente con una cara marcada en la misma atención (negativo)
- **WHEN** en una misma atención se registra la pieza 16 como ausente y también caries en su cara mesial
- **THEN** se rechaza indicando que el hallazgo no se puede registrar en esa pieza o cara

#### Scenario: Pieza extraída después de una caries
- **WHEN** una atención firmada registró caries en la cara mesial de la pieza 16 y una atención posterior firmada la registra como ausente
- **THEN** el odontograma actual muestra la pieza 16 ausente y no muestra la caries anterior

#### Scenario: Cara registrada después del reemplazo
- **WHEN** tras registrar un implante en la pieza 36 una atención posterior firmada registra un hallazgo en una cara de la 36
- **THEN** el odontograma actual muestra ambos

### Requirement: Odontograma actual derivado de lo último firmado
El sistema SHALL derivar el odontograma actual de un paciente tomando, por cada pieza y cara, el registro firmado más reciente
(por fecha de firma de su atención, con el identificador de la atención como desempate), sin guardar una copia del estado. Las
atenciones sin firmar SHALL NOT contar. El sistema SHALL poder devolver el odontograma tal como estaba a una fecha dada, y cada
celda SHALL indicar la atención de origen, su fecha de firma y su autor. Una pieza y cara sin registro firmado SHALL presentarse
como «sin registro» y no como sana.

#### Scenario: Estado actual con varias atenciones
- **WHEN** la pieza 16 tiene un registro en una atención de enero y otro en una de marzo, ambos firmados
- **THEN** el odontograma actual muestra el de marzo y conserva el de enero en el historial

#### Scenario: Borrador no cuenta
- **WHEN** existe un registro de la pieza 16 en una atención sin firmar
- **THEN** el odontograma actual de ese paciente no lo muestra

#### Scenario: Odontograma a una fecha
- **WHEN** se pide el odontograma a la fecha de la atención de enero
- **THEN** se muestran los registros firmados hasta esa fecha y no los posteriores

#### Scenario: Sin registro frente a sana
- **WHEN** una pieza no tiene ningún registro firmado
- **THEN** se presenta como «sin registro», y solo un registro «sin hallazgo» la presenta como examinada sin hallazgos

#### Scenario: Paciente que no se tiene a cargo (negativo)
- **WHEN** un profesional que no tiene al paciente a cargo pide su odontograma actual
- **THEN** no recibe ninguna fila ni indicio de que el paciente tenga registros

### Requirement: Dos borradores simultáneos no se pisan
El sistema SHALL conservar los registros de dos atenciones que tocan al mismo paciente y se firman en cualquier orden, sin que
firmar una borre o altere lo registrado por la otra. Si ambas registran la misma pieza y cara, SHALL prevalecer en el odontograma
actual la atención firmada más tarde, y ambos registros SHALL seguir consultables.

#### Scenario: Piezas distintas
- **WHEN** dos odontólogos tienen borradores del mismo paciente, uno registra la pieza 16 y el otro la 26, y firman en cualquier orden
- **THEN** el odontograma actual muestra ambos hallazgos

#### Scenario: Misma pieza y cara
- **WHEN** dos borradores registran la misma pieza y cara y se firman en orden inverso al de su creación
- **THEN** el actual muestra el de la atención firmada más tarde y el otro sigue en el historial de su atención

### Requirement: Un registro firmado no se corrige editándolo
Una vez firmada la atención, sus registros SHALL NOT poder modificarse ni eliminarse por ningún rol. La corrección SHALL hacerse con
una addenda de texto sobre la atención original y con un registro nuevo de la misma pieza y cara en una atención posterior. La
interfaz SHALL avisar, en la celda que procede de una atención con addendas, que esa atención las tiene.

#### Scenario: Modificar tras la firma (negativo)
- **WHEN** cualquier rol, incluido el dueño de la base, intenta modificar o borrar un registro de una atención firmada
- **THEN** la operación se rechaza indicando que la atención ya no admite cambios y que debe usarse una addenda

#### Scenario: Corrección con una atención nueva
- **WHEN** un odontólogo a cargo registra en una atención nueva el hallazgo correcto de una pieza y cara y la firma
- **THEN** el odontograma actual muestra la corrección y la atención original permanece intacta con su addenda

### Requirement: El odontograma se presenta de forma accesible
La interfaz SHALL permitir operar cada pieza por teclado, SHALL ofrecer una vista en lista equivalente al dibujo, SHALL comunicar
cada estado con texto y símbolo además del color, y SHALL usar solo colores de los tokens del sistema de diseño.

#### Scenario: Operar solo con teclado
- **WHEN** un odontólogo recorre las piezas con el teclado y fija un hallazgo en una cara
- **THEN** puede completar el registro sin usar el ratón y cada pieza anuncia su nombre y los hallazgos de sus caras

#### Scenario: Vista en lista
- **WHEN** el profesional elige la vista en lista
- **THEN** ve las mismas piezas, caras y hallazgos que en el dibujo, en una tabla

#### Scenario: Estado sin depender del color
- **WHEN** se revisa una pieza con un hallazgo
- **THEN** el hallazgo se identifica por su texto y su símbolo y no solo por el color
