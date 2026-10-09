# Spec Delta

## Purpose

Impedir por construcción que el sistema reciba datos clínicos de pacientes reales mientras la decisión legal P-1 (NTS del
MINSA: retención, firma lógica o certificada, alojamiento fuera de Perú) siga abierta, permitiendo en cambio los datos
sintéticos de demostración, y sin mezclar nunca ambos tipos de datos.

## ADDED Requirements

### Requirement: El modo de datos clínicos es «demostración» por defecto y solo lo cambia una migración
El sistema SHALL mantener un modo de datos clínicos con dos valores, `demostracion` y `real`, almacenado en la base de datos.
El modo SHALL ser `demostracion` en toda base creada desde cero y SHALL cambiar únicamente por una migración versionada;
`real` SHALL exigir una referencia al documento que cierra la decisión legal. Ningún rol de usuario SHALL poder leer la
tabla de configuración ni modificarla, y la aplicación SHALL conocer el modo solo mediante una consulta de solo lectura.

#### Scenario: Base nueva
- **WHEN** se aplican todas las migraciones sobre una base vacía
- **THEN** el modo de datos clínicos es `demostracion`

#### Scenario: Modo real sin referencia legal (negativo)
- **WHEN** se intenta fijar el modo `real` sin referencia al documento que cierra P-1
- **THEN** la base de datos rechaza el cambio

#### Scenario: Cambiar el modo desde la aplicación (negativo)
- **WHEN** cualquier rol de usuario, incluido el administrativo, intenta leer, insertar, modificar o eliminar la configuración
- **THEN** la operación se rechaza

#### Scenario: Una migración futura que fije el modo real
- **WHEN** una migración posterior fija el modo `real`
- **THEN** la prueba que verifica el modo por defecto falla, obligando a revisar y actualizar esa prueba de forma consciente

### Requirement: En modo demostración solo se registran datos clínicos de pacientes de demostración
Mientras el modo sea `demostracion`, la base de datos SHALL rechazar cualquier atención, addenda, antecedente o adjunto de un
paciente que no sea de demostración. Un paciente SHALL considerarse de demostración cuando su correo pertenezca al dominio
reservado `demo.invalid`, que ningún paciente real puede tener. Los datos sintéticos de demostración SHALL seguir siendo
admisibles.

#### Scenario: Paciente de demostración
- **WHEN** el médico a cargo registra una atención de un paciente con correo `@demo.invalid`
- **THEN** la atención se guarda

#### Scenario: Paciente real (negativo)
- **WHEN** el médico a cargo intenta registrar una atención de un paciente cuyo correo no es de demostración
- **THEN** la base de datos rechaza la operación y el mensaje indica que el modo demostración solo admite pacientes ficticios

#### Scenario: Cada tipo de contenido clínico (negativo)
- **WHEN** se intenta registrar una addenda, un antecedente o un adjunto de un paciente real en modo demostración
- **THEN** la base de datos rechaza cada operación

#### Scenario: Siembra de datos de demostración
- **WHEN** se ejecuta el script de datos de demostración sobre una base en modo demostración
- **THEN** sus atenciones, addendas y antecedentes se guardan con normalidad

### Requirement: Los datos de demostración y los reales nunca se mezclan
En modo `real`, la base de datos SHALL rechazar cualquier dato clínico de un paciente de demostración, de modo que los
datos sintéticos no puedan contaminar una base con datos reales (incluido el script de siembra de demostración).

#### Scenario: Paciente de demostración en modo real (negativo)
- **WHEN** el modo es `real` y se intenta registrar una atención de un paciente `@demo.invalid`
- **THEN** la base de datos rechaza la operación

#### Scenario: Siembra sobre una base real (negativo)
- **WHEN** se ejecuta el script de siembra de demostración sobre una base en modo `real`
- **THEN** la siembra clínica se rechaza y no queda ningún dato de demostración nuevo

### Requirement: La aplicación y la base de datos deben coincidir en el modo
La aplicación SHALL tomar su modo esperado de una variable de entorno que, si falta o es inválida, equivale a
`demostracion`. Si el modo de la aplicación y el de la base de datos difieren, el módulo de historias clínicas SHALL quedar
no disponible y SHALL NO servir ni aceptar contenido clínico, de modo que apuntar un entorno de demostración a una base real
(o al revés) falle cerrado.

#### Scenario: Variable ausente
- **WHEN** la variable de entorno del modo no está definida
- **THEN** la aplicación opera como `demostracion`

#### Scenario: Valor inválido
- **WHEN** la variable tiene un valor distinto de `demostracion` y `real`
- **THEN** la aplicación opera como `demostracion`

#### Scenario: Aplicación en demostración apuntando a una base real (negativo)
- **WHEN** la aplicación espera `demostracion` y la base de datos está en `real`
- **THEN** el módulo de historias clínicas muestra «Módulo no disponible: configuración inconsistente» y no sirve ni acepta datos clínicos

#### Scenario: Aplicación en modo real apuntando a una base de demostración (negativo)
- **WHEN** la aplicación espera `real` y la base de datos está en `demostracion`
- **THEN** el módulo queda no disponible por la misma razón

### Requirement: El modo demostración es visible para el personal
Mientras el modo sea `demostracion`, toda pantalla que muestre o capture contenido clínico SHALL mostrar un aviso visible, con
icono y texto, que indique que solo deben usarse datos ficticios.

#### Scenario: Aviso en la historia
- **WHEN** un médico abre una historia o el formulario de una atención en modo demostración
- **THEN** ve el aviso «Modo demostración: use solo datos ficticios. No ingrese datos de pacientes reales.»

### Requirement: Este change no levanta el bloqueo
El change SHALL NO incluir ninguna migración ni configuración que fije el modo `real`, ni resolver la decisión legal P-1.
Levantar el bloqueo SHALL requerir un change posterior que documente que P-1 está cerrada y que se cumplen las condiciones
operativas listadas en el diseño.

#### Scenario: Revisión del contenido del change
- **WHEN** se revisan las migraciones y la configuración que introduce este change
- **THEN** ninguna fija el modo `real` y el modo por defecto de todos los entornos es `demostracion`
