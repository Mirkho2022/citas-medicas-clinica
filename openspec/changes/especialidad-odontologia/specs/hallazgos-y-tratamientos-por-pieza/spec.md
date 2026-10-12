# Spec Delta

## Purpose

Que los hallazgos y los tratamientos por pieza salgan de catálogos gestionados por migración, que los tratamientos se registren
como indicados o realizados sin ninguna cifra de dinero, y que el contenido clínico inicial se reconozca como propuesta pendiente
de revisión por los odontólogos.

## ADDED Requirements

### Requirement: Catálogos de hallazgos y de tratamientos gestionados por migración
El sistema SHALL guardar los hallazgos y los tratamientos odontológicos en un catálogo con su tipo, código estable, nombre, alcance
(pieza, cara o ambos), si exige detalle y, en los hallazgos, si reemplazan las caras. El catálogo SHALL poder leerlo únicamente un
profesional, y ningún rol de usuario SHALL poder crear, modificar ni borrar una entrada: se gestiona por migración. Una entrada
SHALL retirarse marcándola como no vigente y nunca borrarse, y su significado SHALL NOT redefinirse.

#### Scenario: Lectura por un profesional
- **WHEN** un profesional consulta el catálogo
- **THEN** obtiene los hallazgos y los tratamientos con su alcance

#### Scenario: Otros roles (negativo)
- **WHEN** un administrativo, una enfermera, un paciente o una sesión sin rol intentan leer el catálogo
- **THEN** no obtienen ninguna fila

#### Scenario: Escritura por cualquier rol (negativo)
- **WHEN** cualquier rol de usuario intenta insertar, modificar o borrar una entrada
- **THEN** se rechaza y el catálogo no cambia

#### Scenario: Roles de servicio (negativo)
- **WHEN** `anonymous`, `cron_notificaciones` o `sync_identidad` intentan leer o escribir el catálogo
- **THEN** se les deniega el privilegio

#### Scenario: Redefinir el significado de una entrada (negativo)
- **WHEN** una migración intenta cambiar el código, el tipo, el alcance o la bandera de reemplazo de una entrada existente
- **THEN** la base de datos lo rechaza y el significado de los registros firmados no cambia

#### Scenario: Retirar una entrada
- **WHEN** una migración marca una entrada como no vigente
- **THEN** los registros firmados que la usan se conservan y los registros nuevos ya no pueden usarla

### Requirement: Un registro usa una entrada vigente del tipo y alcance correctos
El sistema SHALL exigir que cada registro de hallazgo use una entrada vigente de tipo hallazgo y cada tratamiento una entrada
vigente de tipo tratamiento. Una entrada de alcance pieza SHALL registrarse solo sobre la pieza completa, una de alcance cara solo
sobre una cara y una de alcance ambos sobre cualquiera. Una entrada que exige detalle SHALL rechazarse si el detalle falta o solo
tiene espacios o caracteres invisibles.

#### Scenario: Hallazgo de cara en una cara
- **WHEN** se registra «caries» sobre la cara distal de la pieza 46
- **THEN** el registro se guarda

#### Scenario: Hallazgo de pieza en una cara (negativo)
- **WHEN** se registra «implante» sobre la cara mesial de una pieza
- **THEN** se rechaza indicando que el hallazgo no se puede registrar en esa pieza o cara

#### Scenario: Hallazgo de cara en la pieza completa (negativo)
- **WHEN** se registra «caries» sobre la pieza completa
- **THEN** se rechaza

#### Scenario: Tratamiento usado como hallazgo (negativo)
- **WHEN** se registra como hallazgo una entrada del catálogo que es de tipo tratamiento
- **THEN** se rechaza

#### Scenario: Entrada retirada o inexistente (negativo)
- **WHEN** se registra un hallazgo no vigente o un código que no existe en el catálogo
- **THEN** se rechaza y no se guarda nada

#### Scenario: Entrada que exige detalle (negativo)
- **WHEN** se registra «otro hallazgo» sin detalle, o con un detalle de solo espacios
- **THEN** se rechaza indicando el campo

#### Scenario: El servidor no confía en el cliente
- **WHEN** el cliente envía un código de hallazgo
- **THEN** el servidor lo resuelve contra el catálogo vigente y valida contra él, sin aceptar una definición enviada por el cliente

### Requirement: Tratamientos indicados y realizados por pieza
El sistema SHALL permitir al odontólogo registrar, en una atención, tratamientos sobre una pieza (y una cara o la pieza completa)
con el estado indicado o realizado, y más de uno por pieza. Un tratamiento realizado SHALL poder apuntar a la indicación que cumple, y la base
de datos SHALL exigir que esa indicación sea del mismo paciente, pieza, cara y tratamiento, esté indicada, pertenezca a una
atención firmada distinta de la actual y no haya sido cumplida antes. Registrar un tratamiento SHALL NOT modificar los
hallazgos del odontograma.

#### Scenario: Indicar y luego realizar
- **WHEN** una atención firmada indica una restauración en la cara oclusal de la pieza 26 y una atención posterior registra esa restauración como realizada con su origen
- **THEN** la indicación deja de figurar como pendiente

#### Scenario: Realizar sin indicación previa
- **WHEN** el odontólogo registra un tratamiento realizado sin origen
- **THEN** se guarda, porque diagnosticar y tratar en la misma consulta es válido

#### Scenario: Origen de otro paciente, pieza o tratamiento (negativo)
- **WHEN** un tratamiento realizado apunta a una indicación de otro paciente, de otra pieza o de otro tratamiento
- **THEN** se rechaza indicando que no corresponde a una indicación pendiente de esa pieza

#### Scenario: Origen sin firmar o ya cumplido (negativo)
- **WHEN** el origen es una indicación de una atención sin firmar, de la propia atención o que otro tratamiento ya cumplió
- **THEN** se rechaza

#### Scenario: Indicado con origen (negativo)
- **WHEN** un tratamiento indicado trae un origen
- **THEN** se rechaza

#### Scenario: Lista de pendientes
- **WHEN** un profesional a cargo consulta los tratamientos pendientes de un paciente
- **THEN** ve las indicaciones firmadas que ningún tratamiento realizado firmado cumple

#### Scenario: El tratamiento no cambia el odontograma
- **WHEN** se firma una atención con un tratamiento realizado y sin un hallazgo nuevo
- **THEN** el odontograma actual no cambia

### Requirement: Sin presupuestos, cuotas ni cobros
El sistema SHALL NOT guardar, calcular ni mostrar precios, descuentos, monedas, presupuestos, cuotas, saldos ni estados de pago de
tratamientos, y SHALL NOT emitir recetas ni guardar medicamentos como parte de un tratamiento.

#### Scenario: Estructura sin dinero
- **WHEN** se revisa la lista exacta de columnas de los tratamientos
- **THEN** ninguna corresponde a precio, moneda, cuota, saldo o pago, y añadir una obliga a revisar la prueba

#### Scenario: Pantalla sin importes
- **WHEN** se revisan las pantallas de tratamientos
- **THEN** no muestran ningún importe ni totales

### Requirement: El contenido clínico inicial es una propuesta pendiente de revisión
El sistema SHALL tratar el contenido inicial de los catálogos, de las posiciones de cara y de la plantilla como propuesta pendiente
de revisión por los odontólogos, SHALL declararlo en el encabezado de las migraciones que lo cargan y SHALL NOT presentarlo como
reproducción de la NTS 188, cuyo contenido no se verificó.

#### Scenario: Encabezado de la migración del catálogo
- **WHEN** se revisa la migración de datos del catálogo
- **THEN** su encabezado declara que es una propuesta de ingeniería pendiente de revisión por los odontólogos y que no reproduce la NTS 188

#### Scenario: Cambio tras la revisión
- **WHEN** los odontólogos piden añadir, renombrar o retirar un hallazgo o un tratamiento
- **THEN** se hace con una migración de datos nueva, sin cambiar el esquema ni editar la migración aplicada
