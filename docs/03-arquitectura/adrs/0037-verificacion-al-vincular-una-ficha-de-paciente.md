# ADR 0037: Verificación al vincular la cuenta de un paciente con una ficha existente

## Estado

Aceptado el 2026-10-20 por el cliente, que aceptó la propuesta de `openspec/changes/portal-del-paciente/design.md` (D3):
correo verificado de la cuenta más fecha de nacimiento. Afecta a la función `registrar_paciente_portal` y a la spec
`registro-del-paciente` del change `portal-del-paciente` (H4).

Relacionado con [ADR-0003](0003-control-de-acceso-a-historias-clinicas.md) (acceso a datos por rol),
[ADR-0022](0022-autenticacion-y-sesion-clerk.md) (identidad y claims de la sesión) y
[ADR-0023](0023-contexto-de-usuario-para-rls.md) (el contexto del usuario llega a la base por el JWT que Neon valida).

## Contexto

La mayoría de los pacientes ya existirá como ficha en `pacientes` sin cuenta (carga de Excel, ADR-0019, o registro hecho por
el administrativo). Cuando uno de ellos crea su cuenta en el portal hay que unir la cuenta con esa ficha, o crear una ficha
nueva si es la primera vez que la clínica lo ve. TECH-DESIGN decía solo «se vincula por `(tipo_documento, numero_documento)`».

El DNI y el Carné de Extranjería no son secretos: aparecen en documentos, recetas y trámites. Si el documento bastara, cualquier
persona con una cuenta podría reclamar la ficha de otra y ver sus citas (médico, servicio, fechas), un daño de privacidad en
un sistema de salud. Además el paciente no puede insertar ni leer una ficha sin cuenta, así que ninguna política de RLS resuelve
el alta ni la vinculación: hace falta una función con más alcance que el rol, y por eso la verificación debe vivir dentro de ella.

## Decisión

Una función `public.registrar_paciente_portal(...)`, `SECURITY DEFINER` con `search_path` vacío y `EXECUTE` solo para
`authenticated`, crea o vincula la ficha del paciente de la sesión:

- **Documento nuevo:** crea la ficha con `perfil_id` de la sesión y `email` del correo de la cuenta.
- **Documento existente sin cuenta:** la vincula **solo si coinciden el correo verificado de la cuenta y la fecha de
  nacimiento** de la ficha. No modifica ningún otro dato de la ficha.
- **Cualquier otro caso** (datos que no coinciden, ficha ya vinculada a otra cuenta, carrera por el mismo documento): error
  `PA002`, que la aplicación muestra siempre con el mismo texto genérico, sin decir cuál dato falló.

El correo sale del claim `email` del JWT que Neon valida (`auth.session() ->> 'email'`), nunca de un parámetro del formulario
ni de la aplicación. Requiere añadir el claim a la plantilla del JWT de Clerk y exigir correo verificado en el alta.

## Alternativas consideradas

- **Solo documento** (literal de TECH-DESIGN): descartada; permite reclamar la ficha de otra persona conociendo su documento.
- **Documento y fecha de nacimiento, sin correo:** descartada; la fecha de nacimiento es fácil de conocer o adivinar.
- **Vinculación solo por el administrativo:** descartada; elimina el autoservicio justo para los pacientes que ya existen y
  afecta la métrica de 75 % de citas por el portal.
- **Código enviado a la dirección registrada en la ficha:** descartada para esta versión; añade piezas de H5 y tiene el mismo
  problema si el correo de la ficha es erróneo o antiguo.

## Consecuencias

- Un paciente cuya ficha tiene un correo distinto del de su cuenta, o sin fecha de nacimiento, no se vincula solo: el mensaje
  genérico le indica acudir a la clínica, y el administrativo corrige la ficha. Se acepta porque es el fallo seguro.
- **Riesgo residual aceptado:** el mensaje genérico no oculta del todo que un documento existe (un documento nuevo se registra
  con éxito y uno existente con datos distintos no). Revelarlo a quien ya tiene una cuenta con correo verificado, que pasó la
  verificación anti-bots y respeta los límites de peticiones, cuesta menos que la opción «solo documento».
- La función es una autoridad por encima de RLS, así que es parte del alcance de la revisión explícita de seguridad (tarea 11.2
  del change) y tiene pruebas pgTAP negativas (`tests/pgtap/70_portal_registro.test.sql`) y de concurrencia.
- Mientras no se cierre el consentimiento de datos personales (Q3 del change) y la nota de identidad de P-1 de TECH-DESIGN, el
  portal solo se usa con datos sintéticos de demostración.
