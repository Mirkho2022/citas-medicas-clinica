# Spec Delta

## Purpose

Que el fisioterapeuta registre la evaluación inicial de un paciente como una atención clínica de Fisioterapia, con mediciones
estructuradas y comparables (escala de dolor, goniometría, fuerza, pruebas especiales y un test funcional según la zona) y con
objetivos medibles que parten de su valor inicial; que no pueda firmarla incompleta; que lo firmado quede sellado e inmutable; y
que al firmarla se abra el episodio de tratamiento.

## ADDED Requirements

### Requirement: La evaluación se registra como una atención con la plantilla de Fisioterapia
El sistema SHALL registrar la evaluación inicial, la reevaluación y el alta de Fisioterapia como una atención de la historia clínica
que usa la plantilla `Fisioterapia v1`, cuyos datos de especialidad son el tipo de registro (evaluación inicial, reevaluación o
alta), la zona tratada y, en el alta, el motivo. La atención SHALL conservar los campos genéricos obligatorios de la historia clínica
(motivo, anamnesis, examen físico, diagnóstico CIE-10 y plan). Solo un fisioterapeuta SHALL poder usar la plantilla de Fisioterapia: la plantilla SHALL llevar `exige_profesion = 'fisioterapeuta'` y la
regla común de la historia clínica (D15 de `historias-clinicas`) SHALL hacerla cumplir, sin disparador propio de este change.
Una atención sin plantilla SHALL seguir siendo posible para el fisioterapeuta (por ejemplo, una consulta de orientación).

#### Scenario: Evaluación inicial en borrador
- **WHEN** un fisioterapeuta con el paciente a cargo registra una atención con la plantilla de Fisioterapia, tipo de registro «evaluación inicial» y zona «lumbar»
- **THEN** la atención queda como borrador con esos datos de especialidad y puede completarse antes de firmar

#### Scenario: Tipo de registro o zona ausentes (negativo)
- **WHEN** se envía la atención con la plantilla sin el tipo de registro o sin la zona, o con una zona que no existe en el catálogo
- **THEN** no se guarda nada y la respuesta indica el campo

#### Scenario: Plantilla usada por otra profesión (negativo)
- **WHEN** un médico, un odontólogo, un psicólogo o un podólogo, aunque tengan al paciente a cargo, intenta registrar una atención con la plantilla de Fisioterapia
- **THEN** se rechaza por falta de permiso para esa profesión y no se guarda la atención

#### Scenario: Fisioterapeuta mal registrado en otra especialidad (negativo)
- **WHEN** un fisioterapeuta cuya especialidad registrada no es Fisioterapia intenta usar la plantilla
- **THEN** se rechaza porque la plantilla no es de su especialidad

### Requirement: Vocabularios cerrados para identificar cada medición
El sistema SHALL identificar cada medición con una clave de un catálogo cerrado gestionado por migración (zonas y localizaciones,
movimientos de goniometría con su rango de grados, grupos musculares y pruebas especiales), de modo que «la misma medición» tenga la
misma identidad en la evaluación inicial y en las posteriores. Una clave que no exista o no esté vigente SHALL ser rechazada. El
catálogo SHALL poder ser leído solo por un profesional y ningún rol de usuario SHALL poder crear, modificar ni borrar sus entradas;
el significado de una entrada (clave, lateralidad, rango de grados) SHALL ser inmutable aun para el dueño de la base.

#### Scenario: Clave del catálogo
- **WHEN** se registra una medición de goniometría con la clave de un movimiento vigente del catálogo
- **THEN** la medición se acepta

#### Scenario: Clave inexistente o retirada (negativo)
- **WHEN** se registra una medición con una clave que no existe o cuya entrada fue retirada del catálogo
- **THEN** se rechaza y no se guarda la medición

#### Scenario: Catálogo no editable (negativo)
- **WHEN** cualquier rol de usuario intenta insertar, modificar o borrar una entrada del catálogo, o el dueño intenta cambiar la clave o el rango de grados de una entrada existente
- **THEN** la operación se rechaza y el catálogo no cambia

#### Scenario: Catálogo no legible por otros roles (negativo)
- **WHEN** un administrativo, una enfermera, un paciente, una sesión sin rol o `anonymous` consulta el catálogo
- **THEN** no recibe ninguna fila o se le deniega el privilegio

#### Scenario: Retirar una entrada
- **WHEN** una migración marca una entrada como no vigente
- **THEN** las mediciones ya firmadas que la usan se conservan y las nuevas ya no pueden usarla

### Requirement: Escala de dolor EVA con localización
El sistema SHALL registrar la escala de dolor como un entero de 0 a 10 asociado a una localización (una región del catálogo) y, si
la localización es lateral, a un lado (derecho o izquierdo; un dolor bilateral son dos mediciones). La evaluación inicial SHALL
incluir al menos una medición de dolor y este tipo SHALL NOT poder omitirse.

#### Scenario: Dolor lumbar
- **WHEN** el fisioterapeuta registra un dolor de 7 en la localización «lumbar», que no es lateral
- **THEN** la medición queda guardada con lado «no aplica» y su valor 7

#### Scenario: Dolor lateral
- **WHEN** registra un dolor de 4 en «rodilla» con lado derecho
- **THEN** la medición queda guardada para la rodilla derecha

#### Scenario: Valor fuera de la escala (negativo)
- **WHEN** registra un dolor de 11 o de -1, o un valor no entero
- **THEN** se rechaza en el servidor y, si llegara a la base de datos, esta también lo rechaza

#### Scenario: Lado incoherente (negativo)
- **WHEN** registra una localización lateral sin lado, o una no lateral con lado derecho o izquierdo
- **THEN** se rechaza indicando el lado

#### Scenario: Medición repetida en la misma evaluación (negativo)
- **WHEN** registra dos veces el dolor de la misma localización y el mismo lado en una evaluación
- **THEN** la segunda se rechaza y se indica que ya existe

### Requirement: Goniometría por articulación, movimiento, lado y grados
El sistema SHALL registrar cada medición de goniometría con un movimiento del catálogo (que identifica la articulación y el movimiento),
un lado cuando el movimiento es lateral y los grados como un entero dentro del rango de plausibilidad de esa entrada del catálogo.

#### Scenario: Flexión de rodilla
- **WHEN** el fisioterapeuta registra 95 grados en el movimiento «rodilla, flexión» del lado izquierdo y ese valor está dentro del rango de la entrada
- **THEN** la medición queda guardada

#### Scenario: Grados fuera del rango del movimiento (negativo)
- **WHEN** registra grados por encima del máximo o por debajo del mínimo de la entrada del catálogo
- **THEN** se rechaza indicando el rango del movimiento

#### Scenario: Grados no enteros (negativo)
- **WHEN** registra un valor con decimales
- **THEN** se rechaza

### Requirement: Fuerza muscular de 0 a 5 por grupo muscular y lado
El sistema SHALL registrar la fuerza como un entero de 0 a 5 por grupo muscular del catálogo y por lado cuando el grupo es lateral.

#### Scenario: Fuerza válida
- **WHEN** el fisioterapeuta registra fuerza 4 en un grupo muscular lateral, lado derecho
- **THEN** la medición queda guardada

#### Scenario: Fuera de la escala (negativo)
- **WHEN** registra fuerza 6 o -1
- **THEN** se rechaza

#### Scenario: Grupo muscular sin lado cuando lo requiere (negativo)
- **WHEN** registra un grupo lateral sin indicar el lado
- **THEN** se rechaza indicando el lado

### Requirement: Pruebas especiales positivas o negativas por lado
El sistema SHALL registrar cada prueba especial del catálogo como positiva o negativa, por lado cuando la prueba es lateral. Una prueba
especial SHALL NOT llevar un valor numérico.

#### Scenario: Prueba positiva
- **WHEN** el fisioterapeuta registra la prueba «Lachman» como positiva en el lado derecho
- **THEN** la medición queda guardada como positiva en ese lado

#### Scenario: Sin resultado (negativo)
- **WHEN** se envía una prueba especial sin indicar si es positiva o negativa
- **THEN** se rechaza

#### Scenario: Valor numérico en una prueba (negativo)
- **WHEN** se envía una prueba especial con un valor numérico
- **THEN** se rechaza

### Requirement: Test funcional según la zona, con puntaje calculado por el sistema
El sistema SHALL asociar a cada zona, cuando exista, un test funcional del catálogo de instrumentos de evaluación del área de
Fisioterapia (lumbar: Oswestry; cuello: NDI; miembro superior: QuickDASH; rodilla: Lysholm) y SHALL exigirlo en la evaluación inicial
cuando la zona tiene un instrumento vigente. El puntaje registrado en la evaluación SHALL ser exactamente el calculado por el sistema
para una aplicación vigente de ese instrumento, del mismo paciente y de esa misma evaluación; nadie SHALL poder teclearlo. El sistema
SHALL NOT cargar ni reproducir los ítems de un instrumento cuya licencia de uso no esté verificada, y un instrumento sin licencia
verificada SHALL no estar disponible, lo que deja esa zona sin test funcional sin impedir la evaluación.
<!-- REVISAR: las licencias de Oswestry, NDI, QuickDASH y Lysholm no están verificadas (P-18); la condición de este requisito es la de H6i, no una comprobación hecha. -->

#### Scenario: Zona con instrumento vigente
- **WHEN** el fisioterapeuta evalúa una zona lumbar y el instrumento lumbar está vigente
- **THEN** la evaluación exige una aplicación del instrumento y registra su puntaje

#### Scenario: Puntaje de la aplicación
- **WHEN** el fisioterapeuta registra la medición del test funcional vinculada a una aplicación vigente de su evaluación
- **THEN** el valor guardado es el puntaje de la escala calculado por el sistema

#### Scenario: Puntaje tecleado o distinto (negativo)
- **WHEN** se intenta guardar una medición de test funcional con un valor distinto del puntaje de su aplicación, o sin aplicación
- **THEN** se rechaza y no se guarda

#### Scenario: Aplicación ajena o de otro instrumento (negativo)
- **WHEN** la medición se vincula a una aplicación de otro paciente, de otra evaluación, anulada, ya usada por otra medición, de un instrumento que no es el de la zona o de un área distinta de Fisioterapia
- **THEN** se rechaza

#### Scenario: Zona sin instrumento
- **WHEN** la zona no tiene un instrumento asociado, o su instrumento no está vigente
- **THEN** la evaluación no exige el test funcional

#### Scenario: Omisión declarada
- **WHEN** el fisioterapeuta declara el test funcional como no evaluado con su motivo
- **THEN** la evaluación puede firmarse sin él, y no puede haber una medición de test funcional en esa evaluación

#### Scenario: Instrumento sin licencia verificada
- **WHEN** la licencia de un instrumento no se ha verificado
- **THEN** no se carga en el catálogo de instrumentos y la zona correspondiente no exige test funcional

### Requirement: Objetivos medibles con su valor inicial
El sistema SHALL permitir fijar objetivos sobre un indicador medido en la misma evaluación (dolor, goniometría, fuerza o test
funcional), con una meta cuyo valor mejore el valor inicial en el sentido del indicador (el dolor baja, la goniometría y la fuerza
suben, y el test funcional según su escala). El valor inicial de un objetivo SHALL ser el de la medición de esa evaluación y no un
dato tecleado aparte. La evaluación inicial SHALL tener al menos un objetivo. No SHALL poder fijarse un objetivo sobre un indicador
que no se midió.

#### Scenario: Objetivo de dolor
- **WHEN** el fisioterapeuta fija como objetivo bajar el dolor lumbar de 7 a 3
- **THEN** el objetivo queda guardado y muestra 7 como valor inicial y 3 como meta

#### Scenario: Meta que no mejora (negativo)
- **WHEN** fija una meta de dolor igual o mayor al valor inicial, o una meta de fuerza o de grados igual o menor
- **THEN** se rechaza indicando que la meta debe mejorar el valor inicial

#### Scenario: Indicador no medido (negativo)
- **WHEN** fija un objetivo sobre un movimiento que no fue medido en esa evaluación
- **THEN** se rechaza y no se guarda el objetivo

#### Scenario: Medir y luego borrar (negativo)
- **WHEN** intenta borrar, en el borrador, una medición sobre la que hay un objetivo
- **THEN** se rechaza hasta quitar el objetivo

#### Scenario: Objetivo duplicado (negativo)
- **WHEN** fija dos objetivos sobre el mismo indicador y lado en una evaluación
- **THEN** el segundo se rechaza

### Requirement: Una evaluación completa antes de firmar, con omisiones declaradas
El sistema SHALL impedir firmar una evaluación inicial que no tenga: al menos una medición de dolor; para goniometría, fuerza y pruebas
especiales, al menos una medición cada una o su omisión declarada con un motivo con contenido; el test funcional o su omisión cuando la
zona lo exige; y al menos un objetivo. Una evaluación que no sea de alta SHALL NOT llevar motivo de alta. Esta comprobación SHALL
hacerse en la base de datos y no solo en la pantalla, y SHALL aplicarse también a quien firme con las credenciales del dueño.

#### Scenario: Evaluación completa
- **WHEN** el fisioterapeuta firma una evaluación inicial con dolor, goniometría, fuerza, pruebas especiales, test funcional y un objetivo
- **THEN** la atención queda firmada y la sección sellada

#### Scenario: Falta el dolor (negativo)
- **WHEN** firma una evaluación inicial sin ninguna medición de dolor
- **THEN** se rechaza la firma y la atención sigue en borrador

#### Scenario: Tipo sin mediciones ni omisión (negativo)
- **WHEN** firma una evaluación inicial sin fuerza y sin declarar la fuerza como no evaluada
- **THEN** se rechaza la firma indicando la evaluación incompleta

#### Scenario: Tipo omitido con motivo
- **WHEN** declara la fuerza como no evaluada con un motivo con contenido y no registra fuerza
- **THEN** la evaluación puede firmarse

#### Scenario: Omisión sin motivo (negativo)
- **WHEN** declara un tipo como no evaluado sin motivo o con un motivo de solo espacios
- **THEN** se rechaza

#### Scenario: Omitir el dolor (negativo)
- **WHEN** intenta declarar el dolor como no evaluado
- **THEN** se rechaza porque la escala de dolor no se puede omitir

#### Scenario: Sin objetivos (negativo)
- **WHEN** firma una evaluación inicial sin ningún objetivo
- **THEN** se rechaza la firma

#### Scenario: Atención con la plantilla y sin sección (negativo)
- **WHEN** se firma una atención con la plantilla de Fisioterapia que no tiene cabecera de evaluación
- **THEN** se rechaza la firma

#### Scenario: Firma con las credenciales del dueño (negativo)
- **WHEN** el dueño de la base intenta firmar una evaluación incompleta
- **THEN** la firma se rechaza igual

### Requirement: Lo firmado queda sellado e inmutable
Al firmar una evaluación, el sistema SHALL sellar su sección con una huella calculada sobre la cabecera, las omisiones declaradas, las
mediciones y los objetivos, y SHALL impedir, para todo rol incluido el dueño de la base, insertar, modificar o borrar esas filas.
Mientras la atención no esté firmada, solo su autor fisioterapeuta SHALL poder editar la sección, y solo en ese estado se SHALL poder
borrar una medición o un objetivo. Corregir algo firmado SHALL consistir en una addenda y en una evaluación nueva, nunca en editar la
fila. Una verificación SHALL poder detectar que una fila firmada fue alterada o eliminada.

#### Scenario: Sello al firmar
- **WHEN** se firma una evaluación completa
- **THEN** la cabecera queda con su huella y la hora de sello, y la verificación de la sección da conforme

#### Scenario: Editar tras la firma (negativo)
- **WHEN** cualquier rol, incluido el dueño, intenta modificar o borrar una medición, un objetivo o la cabecera de una evaluación firmada, o insertar una fila nueva
- **THEN** se rechaza

#### Scenario: Alteración detectada
- **WHEN** se altera un valor firmado con la protección desactivada solo dentro de una prueba y se recalcula la huella
- **THEN** la verificación indica que ya no coincide

#### Scenario: Desaparición detectada
- **WHEN** se elimina la cabecera y las filas de una evaluación firmada que declaraba su tipo de registro
- **THEN** la verificación lo detecta

#### Scenario: Edición en borrador
- **WHEN** el autor edita o borra una medición de su atención sin firmar
- **THEN** el cambio se acepta

#### Scenario: Atención ajena (negativo)
- **WHEN** un fisioterapeuta que no es el autor intenta editar la sección de una atención en borrador
- **THEN** se rechaza

#### Scenario: Edición contra firma concurrente
- **WHEN** el autor edita una medición mientras la misma atención se firma
- **THEN** la edición espera y se rechaza al ver la atención firmada, o la huella ya la incluye; nunca queda un sello que no corresponde al contenido

### Requirement: La evaluación inicial firmada abre el episodio de la zona
Al firmar una evaluación inicial, el sistema SHALL abrir un episodio de fisioterapia del paciente para la zona evaluada, con el
fisioterapeuta como responsable. SHALL existir como máximo un episodio abierto por paciente y zona, a prueba de concurrencia; un
paciente SHALL poder tener episodios abiertos en zonas distintas. Un borrador sin firmar SHALL NOT abrir ningún episodio. Nadie SHALL
poder crear, modificar ni borrar un episodio de forma directa.

#### Scenario: Apertura al firmar
- **WHEN** se firma una evaluación inicial de la zona «lumbar»
- **THEN** el paciente tiene un episodio abierto de esa zona, ligado a esa evaluación

#### Scenario: Borrador abandonado
- **WHEN** una evaluación inicial queda en borrador
- **THEN** no existe ningún episodio de esa zona y se puede iniciar otra evaluación

#### Scenario: Segunda evaluación inicial de la misma zona (negativo)
- **WHEN** ya hay un episodio abierto de la zona y se intenta crear o firmar otra evaluación inicial de esa zona
- **THEN** se rechaza indicando que ya existe un episodio abierto

#### Scenario: Dos firmas simultáneas (negativo)
- **WHEN** dos evaluaciones iniciales de la misma zona del mismo paciente se firman a la vez
- **THEN** una se firma y la otra se rechaza, y queda un solo episodio

#### Scenario: Otra zona
- **WHEN** hay un episodio abierto de la zona «lumbar» y se firma una evaluación inicial de «rodilla»
- **THEN** se abre un segundo episodio, de la rodilla

#### Scenario: Escritura directa del episodio (negativo)
- **WHEN** cualquier rol de usuario intenta insertar, modificar o borrar un episodio con una sentencia directa
- **THEN** se rechaza por falta de privilegios
