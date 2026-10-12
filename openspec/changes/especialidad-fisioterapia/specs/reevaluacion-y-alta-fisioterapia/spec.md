# Spec Delta

## Purpose

Que el fisioterapeuta repita las mediciones de la evaluación inicial para saber si el paciente mejoró, vea la comparación en el tiempo
y el estado de sus objetivos sin que el sistema la interprete clínicamente, y cierre el tratamiento con un alta que no se entrega a
nadie por el momento.

## ADDED Requirements

### Requirement: La reevaluación repite las mediciones de la evaluación inicial
El sistema SHALL permitir al fisioterapeuta registrar una reevaluación de un episodio abierto, como una atención con la plantilla de
Fisioterapia y tipo de registro «reevaluación», de la misma zona que el episodio. Al firmarla, el sistema SHALL exigir que repita
todas las mediciones de la evaluación inicial (el mismo tipo, la misma clave y el mismo lado), salvo los tipos que declare no
evaluados con un motivo con contenido, y que incluya al menos una medición de dolor y, si la inicial tuvo test funcional, el mismo
instrumento. La reevaluación MAY fijar objetivos nuevos, cada uno con su propio valor inicial, que es el medido en esa reevaluación. La
pantalla SHALL precargar la lista de mediciones de la inicial. Cualquier fisioterapeuta con el paciente a cargo SHALL poder registrarla
con su propia autoría.

#### Scenario: Reevaluación completa
- **WHEN** el fisioterapeuta firma una reevaluación que repite todas las mediciones de la inicial
- **THEN** la atención queda firmada, su sección sellada y la comparación incluye ese momento

#### Scenario: Falta una medición de la inicial (negativo)
- **WHEN** firma una reevaluación sin repetir la flexión de rodilla izquierda que midió la inicial y sin declarar la goniometría como no evaluada
- **THEN** se rechaza la firma indicando que debe repetir las mediciones iniciales

#### Scenario: Tipo no evaluado con motivo
- **WHEN** declara la fuerza como no evaluada con un motivo y no registra fuerza
- **THEN** la reevaluación puede firmarse

#### Scenario: Medición nueva además de las iniciales
- **WHEN** la reevaluación agrega una medición que la inicial no tenía
- **THEN** se acepta, y la comparación la muestra sin valor inicial

#### Scenario: Otro instrumento (negativo)
- **WHEN** la reevaluación usa un test funcional distinto del de la inicial
- **THEN** se rechaza

#### Scenario: Sin episodio abierto de la zona (negativo)
- **WHEN** se intenta registrar una reevaluación de una zona sin episodio abierto, de un episodio cerrado o de un episodio de otro paciente
- **THEN** se rechaza

#### Scenario: Otra zona (negativo)
- **WHEN** la zona de la reevaluación no es la del episodio
- **THEN** se rechaza

#### Scenario: Motivo de alta en una reevaluación (negativo)
- **WHEN** la reevaluación trae un motivo de alta
- **THEN** se rechaza la firma

#### Scenario: Cobertura
- **WHEN** un fisioterapeuta distinto del responsable del episodio, con el paciente a cargo, registra la reevaluación
- **THEN** se acepta con su autoría

### Requirement: Comparación en el tiempo de las mediciones del episodio
El sistema SHALL ofrecer, para cada episodio, una comparación de cada medición entre la evaluación inicial, la evaluación anterior y
cada evaluación firmada posterior, con el valor, la diferencia respecto a la inicial y a la anterior, el sentido en que mejora ese
indicador y el cambio como «mejora», «sin cambio» o «empeora». La comparación SHALL considerar solo evaluaciones firmadas, SHALL
calcularse en la base de datos con una sola definición y SHALL heredar el control de acceso de las tablas de origen. El sentido de mejora
SHALL ser: el dolor, menor; la goniometría y la fuerza, mayor; una prueba especial, pasar de positiva a negativa; y el test funcional,
el de la escala de su instrumento. El sistema SHALL NOT aplicar umbrales ni interpretar clínicamente el cambio, ni emitir alertas.

#### Scenario: Mejora de dolor
- **WHEN** el dolor lumbar fue 7 en la inicial y 4 en la reevaluación
- **THEN** la comparación muestra la diferencia de -3 respecto a la inicial y el cambio «mejora»

#### Scenario: Mejora de grados
- **WHEN** la flexión de rodilla derecha fue 90 en la inicial y 110 en la reevaluación
- **THEN** la comparación muestra +20 y «mejora»

#### Scenario: Empeora
- **WHEN** la fuerza de un grupo muscular bajó de 4 a 3
- **THEN** el cambio es «empeora»

#### Scenario: Sin cambio
- **WHEN** el valor es igual al inicial
- **THEN** el cambio es «sin cambio»

#### Scenario: Prueba especial
- **WHEN** una prueba especial pasó de positiva en la inicial a negativa en la reevaluación
- **THEN** el cambio es «mejora»

#### Scenario: Test funcional con sentido propio
- **WHEN** el puntaje de un instrumento donde un puntaje menor es mejor bajó, o el de uno donde mayor es mejor subió
- **THEN** el cambio es «mejora» en ambos casos

#### Scenario: Compara con la anterior y con la inicial
- **WHEN** el episodio tiene una inicial y dos reevaluaciones firmadas
- **THEN** la segunda reevaluación muestra su diferencia respecto a la inicial y respecto a la primera reevaluación

#### Scenario: Borradores excluidos
- **WHEN** hay una reevaluación en borrador
- **THEN** la comparación no incluye sus mediciones

#### Scenario: Sin interpretación clínica
- **WHEN** se revisa lo que muestra la comparación
- **THEN** no hay umbrales, colores de gravedad ni alertas, y el cambio se dice con texto además de cualquier símbolo

#### Scenario: Aplicación anulada después de firmar
- **WHEN** la aplicación del test funcional de una evaluación firmada se anula después
- **THEN** la medición conserva su valor sellado y la comparación indica que la aplicación ya no está vigente

#### Scenario: Otro profesional a cargo (negativo)
- **WHEN** un profesional que no tiene al paciente a cargo, o una enfermera, un administrativo, un paciente, una sesión sin rol o `anonymous`, consulta la comparación
- **THEN** no recibe ninguna fila

### Requirement: Estado de los objetivos
El sistema SHALL mostrar, para cada objetivo de una evaluación firmada, su valor inicial, su meta, el último valor firmado del mismo
indicador en el episodio y si se logró, es decir, si ese valor alcanza la meta en el sentido del indicador. El estado SHALL derivarse
de los datos y no guardarse.

#### Scenario: Objetivo logrado
- **WHEN** la meta era bajar el dolor a 3 y la última reevaluación firmada midió 3 o menos
- **THEN** el objetivo figura como logrado

#### Scenario: Objetivo no logrado
- **WHEN** la última medición firmada no alcanza la meta
- **THEN** figura como no logrado, con el valor actual y la fecha de esa medición

#### Scenario: Sin reevaluación
- **WHEN** solo existe la evaluación inicial
- **THEN** el valor actual es el inicial y el objetivo figura como no logrado

#### Scenario: Objetivo fijado en una reevaluación
- **WHEN** una reevaluación fija un objetivo nuevo
- **THEN** su valor inicial es el medido en esa reevaluación y se evalúa contra las mediciones posteriores

### Requirement: El alta cierra el episodio
El sistema SHALL permitir al fisioterapeuta dar el alta como una atención con la plantilla de Fisioterapia y tipo de registro «alta», con
un motivo de una lista cerrada (objetivos cumplidos, abandono, derivación, a solicitud del paciente, sin respuesta al tratamiento u
otro) y un detalle obligatorio cuando es «otro». Al firmarla, el sistema SHALL exigir que repita las mediciones iniciales en las mismas
condiciones que una reevaluación, salvo cuando el motivo es abandono, y que no quede un plan de sesiones activo del episodio. Al firmarla,
el episodio SHALL pasar a cerrado. Un episodio cerrado SHALL NOT admitir reevaluaciones, altas, planes ni notas. Un nuevo tratamiento de
la misma zona SHALL ser una evaluación inicial nueva y por tanto un episodio nuevo.

#### Scenario: Alta por objetivos cumplidos
- **WHEN** el fisioterapeuta firma el alta con motivo «objetivos cumplidos», repitiendo las mediciones y sin plan activo
- **THEN** el episodio queda cerrado, con la fecha y la atención de alta

#### Scenario: Alta por abandono sin mediciones
- **WHEN** firma el alta con motivo «abandono» sin repetir las mediciones
- **THEN** se acepta, y el episodio queda cerrado

#### Scenario: Alta sin motivo (negativo)
- **WHEN** firma el alta sin motivo, o con motivo «otro» sin detalle
- **THEN** se rechaza la firma

#### Scenario: Plan activo (negativo)
- **WHEN** firma el alta mientras el plan de sesiones del episodio sigue activo
- **THEN** se rechaza la firma indicando que debe cerrar o completar el plan antes

#### Scenario: Cerrar el plan y dar el alta
- **WHEN** el fisioterapeuta cierra el plan activo y firma el alta en la misma operación
- **THEN** ambos quedan registrados, y si la firma falla el plan sigue activo

#### Scenario: Alta sin repetir las mediciones (negativo)
- **WHEN** firma un alta que no es por abandono sin repetir las mediciones iniciales ni declarar el tipo no evaluado
- **THEN** se rechaza

#### Scenario: Operaciones sobre un episodio cerrado (negativo)
- **WHEN** se intenta registrar una reevaluación, otra alta, un plan o una nota de un episodio cerrado
- **THEN** se rechaza

#### Scenario: Nuevo tratamiento
- **WHEN** el paciente vuelve a la misma zona después del alta y se firma una evaluación inicial
- **THEN** se abre un episodio nuevo y el anterior permanece cerrado y consultable

### Requirement: El resumen de alta es una pantalla y no se entrega a nadie
El sistema SHALL mostrar en el episodio cerrado un resumen de alta con el motivo, la comparación de las mediciones, el estado de los
objetivos y el número de sesiones. El resumen SHALL ser visible solo para los profesionales que tienen al paciente a cargo. El sistema
SHALL NOT imprimirlo, exportarlo ni enviarlo al paciente, a un médico derivante ni a ninguna otra persona: quién recibe un informe de
alta y en qué forma está pendiente de decisión. El paciente solo SHALL obtener su historia por la solicitud de copia con identidad
verificada.

#### Scenario: Resumen visible a un profesional a cargo
- **WHEN** un profesional que tiene al paciente a cargo abre el episodio cerrado
- **THEN** ve el resumen de alta

#### Scenario: Sin entrega (negativo)
- **WHEN** se revisan las acciones disponibles en el resumen
- **THEN** no existe ninguna para imprimir, exportar ni enviar el resumen

#### Scenario: Otros roles (negativo)
- **WHEN** un administrativo, una enfermera o un paciente intenta abrir el resumen por su dirección
- **THEN** recibe «no existe» y no se confirma la existencia
