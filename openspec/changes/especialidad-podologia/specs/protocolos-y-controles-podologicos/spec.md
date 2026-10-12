# Spec Delta

## Purpose

Dar a Podología un catálogo de protocolos por sesiones, cargado por migración y marcado como no validado, y permitir abrir con
él, o sin él, un plan de controles sobre los planes de sesiones comunes, con las mismas reglas de visibilidad que el resto de la
historia.

## ADDED Requirements

### Requirement: Catálogo de protocolos gestionado por migración con cuatro protocolos por validar
El sistema SHALL guardar los protocolos podológicos en un catálogo que solo se gestiona por migración y SHALL cargar
inicialmente exactamente cuatro: hongos en las uñas (6 sesiones, una cada 15 días), verruga plantar (4 sesiones, una por
semana), ortonixia (3 controles, sin frecuencia indicada) y pie diabético (controles mensuales, sin total indicado). Cada uno
SHALL registrar su fuente y estar marcado como «por validar» hasta que un podólogo de la clínica lo valide. El sistema SHALL NOT
inventar los valores que la fuente no da ni cargar ningún otro protocolo.

#### Scenario: Contenido inicial exacto
- **WHEN** se consulta el catálogo en una base recién migrada
- **THEN** contiene exactamente los cuatro protocolos con las cifras indicadas, los valores desconocidos vacíos y todos «por validar»

#### Scenario: Protocolo sin valor en la fuente
- **WHEN** se consulta ortonixia o pie diabético
- **THEN** ortonixia no trae frecuencia y pie diabético no trae total, y la interfaz no muestra un valor inventado

#### Scenario: Protocolo validado sin datos de validación (negativo)
- **WHEN** una migración marca un protocolo como validado sin indicar quién lo validó y cuándo
- **THEN** la base de datos rechaza la migración

### Requirement: Solo los profesionales leen el catálogo y nadie lo escribe
Los profesionales SHALL poder leer el catálogo de protocolos y ningún rol de usuario SHALL poder insertar, modificar ni borrar
un protocolo, incluido el podólogo. El administrativo, la enfermera, el paciente, una sesión sin rol, `anonymous`, el rol del
cron y el rol de sincronización SHALL NOT poder leerlo.

#### Scenario: Profesional lee el catálogo
- **WHEN** un podólogo, o cualquier otro profesional, consulta el catálogo
- **THEN** obtiene los protocolos vigentes

#### Scenario: Otros roles (negativo)
- **WHEN** el administrativo, una enfermera, un paciente, una sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización intentan leer el catálogo
- **THEN** no obtienen ninguna fila o se rechazan por falta de privilegios

#### Scenario: Escritura por cualquier rol (negativo)
- **WHEN** cualquier rol de usuario intenta insertar, modificar o borrar un protocolo
- **THEN** se rechaza y el catálogo no cambia

### Requirement: Un protocolo no validado nunca se presenta como validado ni sobrevive en modo real
El sistema SHALL mostrar junto a cada protocolo no validado una indicación «Por validar» con texto e icono, no solo con color. El
sistema SHALL impedir que una base de datos en modo de datos reales conserve protocolos «por validar»: la prueba que lo comprueba
SHALL fallar si el modo se cambia a real sin validarlos.

#### Scenario: Insignia en la interfaz
- **WHEN** un podólogo elige un protocolo no validado
- **THEN** ve la indicación «Por validar» con su texto y su icono

#### Scenario: Modo de demostración
- **WHEN** la base está en modo de demostración con los cuatro protocolos por validar
- **THEN** la prueba de la puerta de revisión pasa

#### Scenario: Modo real con protocolos sin validar (negativo)
- **WHEN** el modo de la base pasa a real mientras queda un protocolo por validar
- **THEN** la prueba de la puerta de revisión falla y obliga a validarlos o a retirarlos con una migración de datos

### Requirement: Abrir un plan de protocolo o de controles sobre los planes de sesiones
Un podólogo SHALL poder abrir, para un paciente que tiene a cargo, un plan de controles o un plan de un protocolo usando los
planes de sesiones comunes, con su contador de sesiones restantes y sin cobros ni saldos. Al elegir un protocolo, el formulario
SHALL prellenar el total y la frecuencia del catálogo, que el podólogo puede cambiar; los valores que el protocolo no trae SHALL
indicarse antes de abrir el plan. El plan SHALL conservar sus propios valores, la clave y el nombre del protocolo, de modo que un cambio
posterior del catálogo no altere un plan abierto. El total SHALL estar entre 1 y 60 sesiones y la frecuencia entre 1 y 90 días, los
límites de los planes de sesiones comunes. Un plan SHALL poder abrirse sin protocolo.

#### Scenario: Protocolo con total y frecuencia
- **WHEN** un podólogo elige hongos en las uñas para un paciente a cargo
- **THEN** el formulario propone 6 sesiones cada 15 días, el plan se abre con esos valores y muestra 6 sesiones restantes

#### Scenario: Protocolo con un valor vacío
- **WHEN** un podólogo elige ortonixia o pie diabético
- **THEN** el plan no se abre hasta que indique la frecuencia de ortonixia o el total de pie diabético

#### Scenario: Total o frecuencia fuera de los límites comunes (negativo)
- **WHEN** un podólogo indica un total de 0 o de más de 60 sesiones, o una frecuencia de 0 o de más de 90 días
- **THEN** se rechaza y no se crea el plan

#### Scenario: Plan de controles sin protocolo
- **WHEN** un podólogo abre un plan con su propia descripción, total y frecuencia
- **THEN** el plan se abre y se comporta como cualquier plan de sesiones

#### Scenario: El catálogo cambia después
- **WHEN** una migración cambia el total de un protocolo con un plan ya abierto
- **THEN** el plan abierto conserva los valores con que se abrió

#### Scenario: Paciente que el podólogo no tiene a cargo (negativo)
- **WHEN** un podólogo intenta abrir un plan para un paciente que no tiene a cargo
- **THEN** se rechaza y no se crea el plan

### Requirement: Los planes de Podología los lee todo profesional a cargo y los escribe solo un podólogo
Un plan de Podología SHALL poder leerlo todo profesional que tiene al paciente a cargo y SHALL poder crearlo y modificarlo
únicamente un podólogo. La restricción SHALL imponerla la base de datos. Ningún otro rol SHALL poder leer ni escribir los planes.

#### Scenario: Profesional de otra profesión a cargo
- **WHEN** un médico con el paciente a cargo consulta el plan de Podología del paciente
- **THEN** ve el plan y el contador de sesiones restantes, sin poder modificarlo

#### Scenario: Otra profesión escribe el plan (negativo)
- **WHEN** un médico, un odontólogo, un fisioterapeuta o un psicólogo intenta crear o modificar un plan de Podología
- **THEN** se rechaza y el plan no cambia

#### Scenario: Roles sin acceso (negativo)
- **WHEN** el administrativo, una enfermera, un paciente, una sesión sin rol, `anonymous`, el rol del cron o el rol de sincronización intentan leer un plan de Podología
- **THEN** no obtienen ninguna fila o se rechazan por falta de privilegios
