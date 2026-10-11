# Saniape como referencia y marco legal peruano

Investigación del 2026-10-10. Insumo para las decisiones abiertas P-1 y P-5 de [TECH-DESIGN.md](TECH-DESIGN.md) y para la consulta con el asesor legal. **No es asesoría legal.**

## 0. Método y confiabilidad

| Nivel | Qué es | Fuentes |
|---|---|---|
| **A. Texto oficial leído por mí** | Descargué el PDF o la página oficial y busqué el numeral. | NTS 139-MINSA/2018 (RM 214-2018, PDF de gob.pe); DS 009-2017-SA (PDF de gob.pe); DS 020-2025-SA (El Peruano); Directiva 373-MINSA/OGTI-2025 (RM 164-2025, PDF de gob.pe); resumen oficial de la RM 188-2026-MINSA (gob.pe) |
| **B. Resumen de terceros** | Un estudio jurídico o un portal de normas. | DS 016-2024-JUS (CMS), Ley 31750 (LP Derecho) |
| **C. Solo lo que dice Saniape** | Afirmación comercial del proveedor. | Todo lo demás: Ley 27269, Ley 29414, DS 002-2019-SA, DS 014-2011-SA, DS 027-2015-SA, Ley 26842 |

No pude abrir el texto de la Ley 29733 ni del DS 016-2024-JUS, ni la Directiva 373 completa (17 mil líneas de anexos; busqué por términos, no la leí entera). Los sitios de BVS, INO y LP Derecho no respondieron o bloquearon la descarga.

## 1. Qué es Saniape

- Software de gestión para clínicas y consultorios del Perú. Titular: persona natural con RUC 10442471911, domicilio en Tacna. Marca «Sania».
- **Módulos:** agenda, historia clínica electrónica, odontograma, recetas, consentimientos, caja (Yape, Plin), recordatorios por WhatsApp, un agente de IA («Sani»), portal y app del paciente, importación desde Excel.
- **Especialidades:** fisioterapia, odontología, medicina general, estética, podología, psicología.
- **Planes:** Básico S/100, Premium S/299, Plus S/399 al mes, con 30 días de prueba sin tarjeta.
- Es un SaaS multi-clínica para consultorios pequeños. Nosotros hacemos una sola clínica con roles clínicos más estrictos.

## 2. Sus políticas (términos, privacidad, devoluciones, reclamos)

**Lo útil como patrón**
- **Roles:** la clínica es responsable del tratamiento y Sania es encargada. Cada clínica es dueña de sus datos y los derechos ARCO de un paciente se derivan a su clínica.
- **Medidas declaradas:** cifrado en tránsito, control de acceso por clínica y rol, aislamiento entre clientes.
- **Salida de datos:** exportación hasta 30 días después de cancelar.
- **Libro de Reclamaciones:** virtual, con código de registro, tipo reclamo o queja, y respuesta en 15 días hábiles (Ley 29571 y DS 011-2011-PCM, citados en su página).
- **Contrato:** suspensión tras 7 días de gracia y término por mora de más de 60 días. Aviso de 30 días para cambios de precio y de 15 días para cambios de términos.

**Lo flojo, y por eso no sirve de modelo de cumplimiento**
- Su política de privacidad **no declara base legal**, **no dice dónde se alojan los datos ni si hay transferencia internacional**, y **no menciona el registro del banco de datos ante la ANPD**. Nombra como subencargados a Supabase, Vercel, Resend y Meta (WhatsApp, solo si se activa).
- Sus términos no mencionan respaldos, ni SLA con porcentaje, ni propiedad intelectual. Sus guías tampoco citan la Ley 29733.
- Su página de recordatorios no describe el consentimiento previo del paciente ni qué datos viajan en el mensaje.
- Ninguna de sus páginas menciona la **acreditación del sistema de historias clínicas ante el MINSA** (sección 4.3), que según el DS 009-2017-SA es obligatoria para establecimientos privados con historia clínica electrónica.

Nuestro stack es otro: Vercel (aplicación), Neon (base de datos, región `aws-us-east-2`, Ohio), Clerk (sesión) y Resend (correo). A diferencia de Saniape, nosotros sí conocemos la región de la base de datos y está fuera del Perú: es exactamente el punto abierto de P-1.

## 3. Sus guías, contrastadas con el texto oficial

| Afirmación de Saniape | Texto oficial | Resultado |
|---|---|---|
| Archivo activo de 5 años y pasivo de 15 años (la guía lo resume como «unos 20 años») | NTS 139, 4.3.2 y literales k) y l) del procedimiento de archivo | **Correcto.** El plazo pasivo cuenta desde el traslado al archivo pasivo. |
| Número de historia: DNI, carné de extranjería, pasaporte o correlativo provisional | NTS 139, 4.2.23 | **Correcto**, incluido el correlativo provisional. |
| Diagnóstico CIE-10 marcado P, D o R; sin siglas en los diagnósticos | NTS 139, 4.2.9 y 4.2.7 | **Correcto.** |
| Copia autenticada al paciente en máximo 5 días | NTS 139, 4.2.14 y literal h) | **Correcto.** La «entrega en 48 horas» de la guía es promesa del producto, no norma. |
| La firma electrónica del paciente no vale para el consentimiento informado | NTS 139, 4.3.3 c | **Correcto**, textual. |
| La historia electrónica exige firma digital; sin ella es «informatizada» | NTS 139, definiciones, y DS 009-2017-SA, arts. 22.f y 37 | **Correcto.** |
| Con firma digital se puede dejar de imprimir | NTS 139, 4.3.3 | **Correcto**, pero es una exoneración, no una obligación. |
| Reclamos de salud: 30 días hábiles; resultado al paciente en 5 días; PAUS desde I-4 | DS 002-2019-SA | No verificado (nivel C). |
| Categorías I-1, I-2, I-3; categorización cada 3 años | NTS 021 y DS 013-2006-SA | No verificado (nivel C). |
| Receta: art. 56 del DS 014-2011-SA; sin imagen digital desde 2024 | DS 014-2011-SA | No verificado (nivel C). |

Conclusión: **como resumen de la NTS 139 es fiable en todo lo que pude contrastar.** Es una guía comercial y ella misma avisa que no reemplaza la norma.

## 4. Lo que dice la norma (nivel A)

### 4.1 NTS 139-MINSA/2018/DGAIN (RM 214-2018)

- **Conservación (4.3.2):** el archivo activo guarda las historias con atención en los últimos 5 años. Pasado ese plazo sin atención, pasan al pasivo, donde permanecen 15 años. Luego se proponen para eliminación ante el Archivo General de la Nación o el archivo regional, o para conservación. Si el paciente vuelve, la historia regresa al activo con su misma identificación. Para cáncer ocupacional el mínimo es de 40 años. Tras una eliminación parcial se custodian los consentimientos informados, las hojas de retiro voluntario y los informes quirúrgicos y registros de parto, entre otros.
- **Sistemas informáticos (4.3.3):** deben cumplir seguridad, confidencialidad, disponibilidad, integridad y autenticidad conforme a la *Directiva de Seguridad de la Información de Bancos de Datos Personales* (RD 019-2013-JUS/DGPDP). Los profesionales firman con firma digital (Directiva 221-MINSA/2016/OGTI). Los usuarios de salud usan «firma digital (incluyendo la firma electrónica)». Con eso se puede dejar de imprimir los formatos.
  - a) Se registra la atención en el momento en que se da.
  - b) Cada profesional entra con sus credenciales y el sistema asegura la trazabilidad de los datos registrados.
  - c) La firma electrónica del paciente **no** vale para el consentimiento informado.
  - d) En menores o personas con representante, firma el representante.
- **Definiciones:** la historia clínica electrónica está refrendada con firma digital. La informatizada es la soportada en medios electrónicos que no usa firma digital.

### 4.2 DS 009-2017-SA, reglamento de la Ley 30024 (RENHICE), publicado el 23/03/2017

- **Art. 13:** todo establecimiento público, privado o mixto con un sistema de información de historias clínicas electrónicas (SIHCE) **debe acreditarlo** ante el MINSA o la Autoridad Regional de Salud.
- **Art. 22, requisitos básicos de acreditación:**
  - a) Estar inscrito en el RENIPRESS y cumplir la NTS de historia clínica.
  - b) Estándares de datos de salud del DS 024-2005-SA.
  - c) Interoperar con los servicios de RENIEC.
  - e) Seguridad de la información (art. 30) y **registrar la base de datos ante la ANPD** (Ley 29733).
  - f) Incorporar **firma digital** (Ley 27269).
  - g) Separar los datos de filiación del paciente de la información clínica.
  - h) Registrar solo como consecuencia de la atención.
  - j) Un terminal en cada consultorio.
- **Art. 24:** quienes usan historias informatizadas deben implementar un SIHCE para acreditarlo.
- **Art. 26:** quien tenga historias electrónicas o informatizadas está obligado a formar parte del RENHICE. Debe adecuar y acreditar su sistema en 12 meses desde que el MINSA apruebe el procedimiento.
- **Seguridad mínima (art. 30, por remisión del 22.e):**
  - SGSI de la familia ISO/IEC 27000 (la NTP ISO/IEC 27001 es obligatoria solo para entidades públicas).
  - Ciclo de vida de software NTP ISO/IEC 12207.
  - Autenticación, cifrado y firma digital.
  - Acceso exclusivo de personas autorizadas, con firma y certificados digitales.
  - Registro histórico de todas las transacciones, con trazabilidad y auditoría.
- Las historias manuscritas pasan a electrónicas de forma progresiva, según disponibilidad presupuestal.

### 4.3 Directiva 373-MINSA/OGTI-2025 (RM 164-2025/MINSA, 11/03/2025) y RM 188-2026/MINSA

- **Alcance:** es de cumplimiento obligatorio también para las **IPRESS privadas y mixtas que utilicen un SIHCE**, en el marco de la Ley 30024.
- **Plazos (5.10 y 8.1):** quien ya usaba un sistema debe iniciar la acreditación en máximo 12 meses. La **RM 188-2026-MINSA (10/03/2026)** amplía esos plazos hasta por 12 meses adicionales.
- **Numeral 5.11:** quien empiece a usar historias electrónicas después de esos 12 meses debe asegurar que el SIHCE **ya haya aprobado la acreditación en otras IPRESS**. La RM 188-2026 amplía solo los numerales 5.10 y 8.1, no el 5.11.
- **Datos personales:** una IPRESS con SIHCE acreditado solo puede tratar datos de salud de pacientes que hayan dado **autorización previa** (modelo en el Anexo 07). Cita la RM 688-2020/MINSA (tratamiento de datos personales en salud). La acreditación verifica la **Resolución Directoral de la ANPD que acredita el registro del banco de datos**.
- **Formulario de verificación:** pregunta el país de la sede legal del proveedor, **«¿en qué país se almacenan los datos?»**, si hay redundancia geográfica y si el modelo es Cloud o SaaS. La búsqueda por «territorio», «extranjero» y «país» **no encontró una prohibición** de alojar fuera del Perú. Pregunta y exige declararlo.
- **Criterios técnicos** (en anexos): ISO/IEC 27001 o superior, HL7 FHIR, firma digital integrada, red privada virtual, entre otros.

### 4.4 DS 020-2025-SA (28/11/2025)

Modifica el DS 009-2017-SA solo para la investigación en salud (Ley 31750): acceso de instituciones académicas a datos disociados. **No añade obligaciones para las IPRESS privadas.**

### 4.5 Protección de datos personales (nivel B, sin leer el texto)

Según un resumen de CMS, el DS 016-2024-JUS reemplazó el reglamento de 2013 y rige desde el 30/03/2025:
- Notificación de incidentes a la ANPD en 48 horas.
- Oficial de datos personales obligatorio con datos sensibles.
- Criterios de nivel adecuado de protección para transferencias internacionales.
- Documento de seguridad con fecha cierta.
- Representante en el Perú para empresas extranjeras que ofrezcan servicios aquí.

Los documentos de 2017 y la NTS remiten al reglamento de 2013 y a la RD 019-2013. Hay que confirmar con el asesor cómo se leen esas remisiones hoy.

## 5. Qué aporta esto a las decisiones abiertas

| Decisión abierta | Lo que dice la fuente oficial | Sigue abierto |
|---|---|---|
| **P-1: plazo de retención** | 5 años en activo y 15 en pasivo (20 en total); 40 años para cáncer ocupacional; conservar consentimientos y similares tras la eliminación parcial. | Confirmar con el asesor si aplica a la clínica. |
| **P-5: firma lógica o certificada** | La historia **electrónica** exige firma digital (Ley 27269) del profesional. La «informatizada» no la usa, pero la exoneración de imprimir los formatos (4.3.3) se ata al uso de firma digital; sin ella la norma no la otorga (interpretación mía, a confirmar). El consentimiento informado **no admite firma electrónica del paciente**. | Qué categoría quiere la clínica (informatizada o electrónica acreditada). Es una decisión de negocio y legal. |
| **Alojamiento fuera de Perú** | No hallé prohibición expresa en la NTS 139, el DS 009-2017-SA ni la Directiva 373. El proveedor debe declarar el país donde se almacenan los datos. | Ley 29733 y su reglamento sobre transferencia internacional (no leídos). El asesor debe confirmarlo. |
| **Acreditación del sistema** | Obligatoria para IPRESS privadas con SIHCE (DS 009-2017-SA, art. 13; Directiva 373). No verifiqué qué sanción o efecto tiene operar sin acreditación. | Es un hallazgo nuevo: TECH-DESIGN solo habla de «acreditado» para el proveedor de firma (INDECOPI), no del sistema. |

## 6. Brechas de nuestro diseño que esta investigación sugiere revisar

Esto no cambia código ni documentos; es una lista para decidir.

1. **RENIPRESS, IPRESS y acreditación del SIHCE:** [TECH-DESIGN.md](TECH-DESIGN.md) no menciona RENHICE ni IPRESS. Habría que registrar el estado de la acreditación como riesgo y como puerta de salida a producción (hoy son P-1 y P-5).
2. **ANPD:** el registro del banco de datos de pacientes y la cláusula de autorización de tratamiento no aparecen en nuestros documentos, que ni siquiera nombran la Ley 29733 (solo piden incluir la protección de datos en la consulta legal de P-1). El Anexo 07 de la Directiva 373 trae un modelo.
3. **Identificación del paciente:** la NTS 139 (4.2.23) admite pasaporte y correlativo provisional además de DNI y carné de extranjería. [CLAUDE.md](../CLAUDE.md) y las specs de H3 validan solo DNI y CE. Hay que decidir si pacientes sin documento (menores sin DNI, extranjeros en tránsito) están dentro del alcance.
4. **Separación de datos:** el art. 22.g exige separar datos de filiación de información clínica. Conviene comprobarlo contra nuestro esquema de H2.
5. **Consentimiento informado:** no puede firmarse con firma electrónica del paciente (4.3.3 c). Afecta a cualquier diseño de firma de consentimientos en H6.
6. **Copia al paciente en 5 días:** la NTS 139 la exige; no hay una historia de usuario que la cubra.
7. **Marcas de diagnóstico:** presuntivo, definitivo o repetitivo (4.2.9) ya está en el diseño de H6.

## 7. Ideas de producto de Saniape que caben en nuestro alcance

- Aviso al agendar si la hora cae fuera del horario del profesional o sobre otra cita. Nosotros lo bloqueamos en la base.
- Estados de sala de espera del día (Llegó, Triaje, En consulta, Atendido). Alimenta la definición de «en espera» que H7 deja abierta.
- Las reservas en línea que nunca se confirman se cancelan solas al pasar la fecha. Es la pregunta 1 abierta de H3.
- El recordatorio de un menor va al apoderado.
- Botones de confirmar, reprogramar y cancelar en el recordatorio (nosotros, enlaces en el correo).
- **Fuera de nuestro alcance, aunque Saniape los tenga:** caja y pagos, Yape y Plin, comprobantes SUNAT, WhatsApp, agente de IA.

## 8. Pendiente de verificar

1. Texto de la Ley 29733 (arts. de transferencia transfronteriza) y del DS 016-2024-JUS.
2. RM 688-2020/MINSA (datos personales en salud) y el Anexo 07 de la Directiva 373.
3. Lectura completa de los anexos de la Directiva 373 (perfiles funcionales y requisitos técnicos).
4. Ley 29414 y DS 027-2015-SA (derechos del usuario), DS 002-2019-SA (reclamos), Ley 26842 art. 29 y DS 014-2011-SA, que solo conozco por Saniape.
5. Si el DS 009-2017-SA derogó el DS 039-2015-SA (publicado el 17/12/2015 con el mismo título).

## Fuentes

- NTS 139 (RM 214-2018/MINSA): https://cdn.www.gob.pe/uploads/document/file/187992/187487_R.M_214-2018-MINSA2.pdf20180823-24725-1ufma50.pdf
- DS 009-2017-SA: https://cdn.www.gob.pe/uploads/document/file/1039904/9-17.pdf
- DS 020-2025-SA: https://busquedas.elperuano.pe/dispositivo/NL/2463489-2
- RM 164-2025/MINSA y Directiva 373: https://www.gob.pe/institucion/minsa/normas-legales/6551375-164-2025-minsa
- RM 188-2026/MINSA: https://www.gob.pe/institucion/minsa/normas-legales/7845808-188-2026-minsa
- CMS sobre el DS 016-2024-JUS: https://cms.law/en/per/publication/nuevo-reglamento-de-proteccion-de-datos-personales
- Saniape: https://saniape.com (guías, términos, privacidad, devoluciones, libro de reclamaciones y páginas de funciones)
