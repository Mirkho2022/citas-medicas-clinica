# Spec Delta

## Purpose

Hacer visible a recepción el plazo de 5 días de cada solicitud de copia de la historia clínica, con su fecha límite calculada por
el servidor, y dejar registrado si cada copia se cumplió en plazo, para sostener la meta de 100 % sin construir analítica.

> Nombres: sujetos a ADR-0030 (aún no aceptada).

<!-- REVISAR: la regla de 5 días calendario contados desde el día de la solicitud es una propuesta del agente. El texto leído de la NTS 139 (4.2.14 y literal h) no precisa si son días hábiles o calendario; el asesor legal debe confirmarlo (design.md, D5). -->

## ADDED Requirements

### Requirement: El vencimiento lo calcula el servidor
El sistema SHALL fijar el vencimiento de cada solicitud al registrarla, con el reloj del servidor, como el último instante del
quinto día calendario posterior al día de la solicitud, en hora de `America/Lima`. El vencimiento SHALL NO poder fijarse ni
modificarse desde el cliente, y SHALL NO cambiar después aunque cambie la regla.

#### Scenario: Solicitud de lunes por la tarde
- **WHEN** se registra una solicitud un lunes a las 15:00 de Lima
- **THEN** su vencimiento es el sábado de la misma semana a las 23:59:59 de Lima

#### Scenario: Solicitud cerca de la medianoche
- **WHEN** se registra una solicitud el lunes a las 23:30 de Lima (ya martes en UTC)
- **THEN** su vencimiento es el sábado a las 23:59:59 de Lima, no el domingo

#### Scenario: Vencimiento enviado por el cliente (negativo)
- **WHEN** una solicitud llega con un vencimiento calculado por el cliente
- **THEN** el servidor lo ignora y guarda el suyo

#### Scenario: Cambio futuro de la regla
- **WHEN** más adelante se cambia la forma de calcular el vencimiento
- **THEN** las solicitudes ya registradas conservan el suyo

#### Scenario: Fines de semana y feriados
- **WHEN** el plazo incluye un domingo o un feriado
- **THEN** esos días cuentan igual, porque la regla propuesta son días calendario

### Requirement: Lista de pendientes con fecha límite
El sistema SHALL ofrecer al administrativo una lista de las solicitudes abiertas (`solicitada` y `verificada`) ordenada por fecha
límite ascendente, que muestre número, paciente (nombre y documento), tipo de solicitante, fecha de solicitud, fecha límite y una
etiqueta de plazo con texto e icono, nunca solo color: «Vence en N días», «Vence hoy» o «Vencida hace N días». La lista SHALL
mostrar el conteo de solicitudes abiertas y de vencidas, SHALL calcular «hoy» en hora de Lima y SHALL NO mostrar contenido
clínico. Ningún otro rol SHALL poder verla.

#### Scenario: Orden por urgencia
- **WHEN** hay tres solicitudes abiertas con distinta fecha límite
- **THEN** aparecen de la más próxima a vencer a la más lejana

#### Scenario: Vence hoy
- **WHEN** una solicitud vence el día de hoy en Lima
- **THEN** su etiqueta dice «Vence hoy», con icono y texto

#### Scenario: Vencida
- **WHEN** el vencimiento de una solicitud abierta pasó hace dos días
- **THEN** su etiqueta dice «Vencida hace 2 días» y se cuenta entre las vencidas

#### Scenario: Conteos del encabezado
- **WHEN** hay cinco solicitudes abiertas y dos vencidas
- **THEN** el encabezado muestra 5 abiertas y 2 vencidas

#### Scenario: Sin contenido clínico ni otros roles (negativo)
- **WHEN** un profesional, una enfermera o un paciente intenta abrir la lista, o recepción la recorre
- **THEN** los primeros son redirigidos o no reciben filas, y la lista nunca muestra datos clínicos

### Requirement: Una solicitud vencida sigue abierta y se atiende
El sistema SHALL tratar `vencida` como una condición derivada y SHALL NO cerrar, rechazar ni alterar una solicitud por haber
vencido. Una solicitud vencida SHALL poder verificarse, rechazarse o entregarse como cualquier otra. Si la entrega se confirma
después del vencimiento, el sistema SHALL exigir el motivo de la demora, con contenido, y SHALL registrarlo.

#### Scenario: Se entrega fuera de plazo
- **WHEN** recepción confirma la entrega de una solicitud cuyo vencimiento ya pasó e indica el motivo de la demora
- **THEN** la solicitud pasa a `emitida` con su motivo de demora y queda marcada «Fuera de plazo»

#### Scenario: Entrega fuera de plazo sin motivo (negativo)
- **WHEN** se intenta confirmar la entrega vencida sin motivo de demora o con un motivo vacío
- **THEN** la operación se rechaza pidiendo el motivo y la solicitud no cambia

#### Scenario: El vencimiento no cierra la solicitud
- **WHEN** pasan los días y nadie actúa sobre una solicitud abierta
- **THEN** sigue abierta, ahora como vencida, y no se cierra sola

#### Scenario: Rechazo de una vencida
- **WHEN** recepción rechaza una solicitud vencida porque el solicitante no volvió con los documentos
- **THEN** se rechaza con su motivo y no cuenta como entrega fuera de plazo

### Requirement: El cumplimiento de cada solicitud queda consultable
El sistema SHALL mostrar, para cada solicitud cerrada, si la copia se entregó en plazo o fuera de plazo (comparando la hora de
entrega con el vencimiento) y, en este último caso, el motivo de la demora, en una lista de cerradas separada de la de pendientes.
El sistema SHALL NO calcular ni mostrar porcentajes agregados, gráficos ni exportaciones.

#### Scenario: Entregada en plazo
- **WHEN** una copia se entregó antes de su vencimiento
- **THEN** la lista de cerradas la muestra como «En plazo»

#### Scenario: Entregada fuera de plazo
- **WHEN** una copia se entregó después de su vencimiento
- **THEN** la lista de cerradas la muestra como «Fuera de plazo» con el motivo de la demora

#### Scenario: Rechazadas
- **WHEN** una solicitud fue rechazada
- **THEN** la lista de cerradas la muestra como rechazada, con su motivo, y sin etiqueta de plazo

#### Scenario: Sin analítica
- **WHEN** el administrativo abre las listas
- **THEN** no hay porcentajes, gráficos ni opción de exportar
