# Proposal

> **Nombres:** sujetos a [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (aún no aceptada). Este change escribe
> `profesional`, `profesionales` y `profesional_tiene_paciente()`; si la ADR se rechaza, léase `medico`, `medicos` y
> `medico_tiene_paciente()`.

## Why

La NTS 139-MINSA/2018 (numeral 4.2.14 y literal h, verificados en `docs/investigacion-marco-legal-y-saniape.md`) obliga a
entregar al paciente una **copia autenticada** de su historia clínica en un máximo de **5 días**. El PRD del 2026-10-11 lo
incorpora al alcance («copia al paciente o a su representante legal, con su identidad verificada y registrando quién la
emite») y al criterio de éxito (**100 %** de las solicitudes entregadas en 5 días o menos); la investigación legal lo marcó
como brecha sin historia de usuario (§6, punto 6). Hoy la copia es una fotocopia del papel; al digitalizar la historia hace
falta un proceso que se pueda cumplir, medir y auditar.

El obstáculo es de diseño, no de pantalla: la copia debe contener **toda** la historia, **incluida Psicología** (decisión del
usuario), pero recepción, que es quien atiende al solicitante, **no ve contenido clínico**; la enfermera tampoco; y un
profesional que no es psicólogo **no puede ver la información de Psicología «de ninguna otra forma»** (PRD, caso borde). Ningún
humano del personal puede entonces leer la copia completa. Este change propone cómo entregarla igualmente (design.md, D2,
con las alternativas evaluadas) y deja esa propuesta marcada para decisión del usuario.

## What Changes

**Este change toca acceso a historias clínicas y RLS, el riesgo principal del proyecto: abre una ventana controlada por la que el
rol administrativo, que hoy no obtiene ninguna fila clínica, hace generar a un proceso del servidor un documento con toda la
historia. Exige revisión aparte con el agente `code-review` (hay una tarea de revisión al final de cada grupo que lo toca y una
final sobre todo el diff) y verificación por mutación de sus pruebas negativas.**

- **Tabla nueva `solicitudes_copia_historia`** (dueño: este change; RLS + prueba pgTAP negativa por rol): solicitante
  (paciente, representante legal o autoridad judicial o del Ministerio Público), cómo se verificó su identidad y, si
  representa, cómo acreditó serlo; fecha de solicitud y vencimiento fijados por el servidor; estado (`solicitada`,
  `verificada`, `emitida`, `rechazada`; **`vencida` se deriva, no se almacena**); quién verificó, quién emitió y cuándo.
  Solo la lee y la gestiona el administrativo; solo-agregar; las transiciones las hacen funciones acotadas.
- **Verificación de identidad y de representación** con una propuesta de qué se acepta y cómo se acredita (marcada `REVISAR`
  para el asesor legal), rechazo registrado con motivo, menor de edad y solicitud duplicada.
- **Generación de la copia sin que nadie del personal la lea** (D2 y D3): una función de servidor acotada compila el contenido
  completo, deja el registro de acceso en la misma transacción y entrega el documento al servidor, que lo convierte en PDF
  cerrado para imprimir. Recepción lo imprime frente al solicitante y **confirma la entrega**; ninguna pantalla de la
  aplicación muestra contenido clínico. El alcance real de esta garantía se declara en D2.
- **Contenido de la copia** (D6): filiación, antecedentes, atenciones firmadas con sus addendas, adjuntos vigentes como
  anexos y, cuando existan, triajes, recetas, secciones de cada especialidad y **Psicología**. Los borradores sin firmar no
  entran y la copia lo declara. Una prueba de cobertura falla si se crea una tabla clínica que el compilado no contempla.
- **Qué autentica la copia** (D7): folio correlativo, huella `v1:` del contenido, sello del sistema y responsable de la clínica
  en cada página, detrás de una interfaz reemplazable. **No se declara que cumpla el requisito de «copia autenticada»**: eso lo
  decide el asesor legal (P-1, P-5).
- **Auditoría** (D8): cada generación deja un registro en `accesos_historia` (tipo de acceso nuevo `copia`) con quién, para qué
  solicitud, qué secciones y cuándo, **sin copiar el contenido**.
- **Seguimiento del plazo** (D5 y D10): lista de pendientes ordenada por fecha límite con etiquetas de texto («Vence hoy»,
  «Vencida hace 2 días»), conteo de vencidas y motivo de la demora si se emite fuera de plazo. Sin analítica.
- **Cambios en lo existente (no rompen a ningún usuario):** `accesos_historia` (de H6) admite el tipo `copia` y gana dos
  columnas (`solicitud_copia_id`, `huella_contenido`); la pantalla de revisión de accesos de H6 muestra esas filas.

## Capabilities

### New Capabilities

- `solicitud-de-copia-de-historia`: registrar y llevar cada solicitud por un ciclo cerrado, solo-agregar y visible solo para
  recepción; solicitudes duplicadas; aislamiento por rol.
- `verificacion-de-identidad-del-solicitante`: verificar la identidad y la representación contra documentos originales, rechazar
  con motivo registrado, y tratar al menor de edad y al paciente sin documento.
- `emision-de-copia-de-historia`: generar la copia completa (incluida Psicología) sin mostrar contenido en pantalla, auditarla
  sin copiarla, autenticarla y confirmar su entrega presencial.
- `seguimiento-del-plazo-de-copias`: vencimiento calculado por el servidor, lista de pendientes con fecha límite y registro de
  si cada copia se cumplió en plazo.

### Modified Capabilities

<!-- Ninguna en `openspec/specs/` (solo existe `autenticacion-roles`). La extensión de `accesos_historia` toca un requisito del
change `historias-clinicas` (`auditoria-de-accesos-clinicos`), que aún no está archivado: no hay delta posible; se coordina
en la tarea 0.6 y se declara en design.md, D8. -->

## Impact

- **Hito:** H6d de `docs/BACKLOG.md` (el orden fino lo fija el backlog). **Depende de** H2c `profesionales-de-la-salud`, H6
  `historias-clinicas` (tablas clínicas, `accesos_historia`, huella `v1`, guarda de modo), H6g `especialidad-psicologia` (para
  incluir Psicología) y H3 `agenda-y-reserva`, ítem 5 (registro de pacientes y filiación). El contenido de H6b (triaje), H6c
  (recetas) y H6e, H6f, H6h (especialidades) **entra en la copia** aunque no la bloquea: la recomendación es construir H6d al
  final del grupo H6 y, si no, que cada uno de esos changes añada su sección (D6, prueba de cobertura).
- **Decisión legal P-1 (retención, firma lógica vs. certificada, alojamiento fuera de Perú) y marco de la copia, abiertos: este
  change no los resuelve ni los presupone.** La copia contiene la historia completa: **no puede pasar a producción con datos
  reales** hasta cerrarlos (la guarda de modo de H6, D1, se aplica a toda operación de este change). Además quedan preguntas
  propias para el asesor (plazo hábil o calendario, quién puede solicitar y cómo acreditarlo, qué hace «autenticada» a la copia,
  Psicología, autoridades, retención, datos de terceros ante la ANPD): design.md, «Preguntas abiertas».
- **ADR a crear antes de implementar** (skill `architecture`; no se decide dentro de este proposal): *Emisión de la copia de la
  historia clínica* (D2 y D3: ventana controlada del rol administrativo y límite de la garantía). Se apoya en
  [ADR-0003](../../../docs/adrs/0003-control-de-acceso-a-historias-clinicas.md),
  [ADR-0013](../../../docs/adrs/0013-definicion-de-historia-clinica-digitalizada.md),
  [ADR-0016](../../../docs/adrs/0016-vigencia-de-asignacion-paciente-medico.md),
  [ADR-0023](../../../docs/adrs/0023-contexto-de-usuario-para-rls.md),
  [ADR-0028](../../../docs/adrs/0028-notificaciones-cron-unico-plan-hobby.md),
  [ADR-0030](../../../docs/adrs/0030-profesional-de-la-salud.md) (propuesta) y
  [ADR-0031](../../../docs/adrs/0031-aislamiento-de-la-informacion-de-psicologia.md) (propuesta); no reabre ninguna.
- **Código nuevo:** `migrations/*.sql`; `lib/historias/copias.ts`, `lib/copias/` (sellador, documento, errores),
  `lib/schemas/copia-historia.ts`; `app/administrativo/copias-historia/**`; `tests/pgtap/73_*` y `74_*`, `tests/historias/`,
  `tests/concurrencia/`, `e2e/copia-historia.spec.ts`. Una biblioteca de PDF (a elegir en la tarea 0.5, coordinada con H6c).
- **Base de datos:** una tabla nueva (`solicitudes_copia_historia`), funciones `SECURITY DEFINER` nuevas, columnas nuevas en
  `accesos_historia`, SQLSTATE `HC040` a `HC044` (`HC045` a `HC049` reservados), pruebas pgTAP 73 y 74.
- **Sin cron nuevo** (ADR-0028: el plan Hobby tiene un solo cron): el vencimiento se calcula al consultar.
- **Fuera de alcance:** que el paciente consulte o descargue su historia desde el portal (el PRD lo excluye); historia clínica
  en el portal; exportación masiva o por lote; **cobro de la reproducción** (pagos y cobros están fuera de alcance; si se
  registra el monto o se cobra fuera del sistema es una pregunta abierta); copia de los documentos que solo existen en papel
  (se atiende fuera del sistema); entrega a distancia (correo, mensajería, enlace); aviso al paciente de que se emitió su copia
  (propuesto, requiere decisión: sería una notificación nueva); pagos, telemedicina, laboratorios, inventario, multi-sede y
  analítica de BI.
