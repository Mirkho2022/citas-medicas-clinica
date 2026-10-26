# Acceso de revisión (profesor)

Guía para probar el sistema en producción con cuentas de demostración. Las contraseñas **no están en este repositorio**: se entregan por
separado (mensaje directo o correo) junto con el enlace.

- **Aplicación:** https://citas-medicas-clinica.vercel.app
- **Datos:** 100 % sintéticos (pacientes `99…`, médicos `CMP-DEMO-…`, correos `@demo.invalid`). No hay datos reales de personas. Se puede
  crear, reservar, cancelar y probar con libertad.
- **Zona horaria:** todas las fechas y horas se muestran en `America/Lima`.

## Las cuentas

Cuentas principales (una por rol):

| Rol | Usuario | Qué verá |
|---|---|---|
| Paciente | `profesor.paciente+clerk_test@example.com` | Portal de autoservicio: inicio, buscar y reservar cita, «Mis citas», cancelar |
| Administrativo | `profesor.administrativo+clerk_test@example.com` | Agenda del día, agendar, reprogramar y cancelar citas de cualquier paciente, pacientes, horarios, bajas médicas con reasignación y **turnos de enfermería** |
| Médico | `profesor.medico+clerk_test@example.com` | «Mi jornada» (horario, bloqueos y citas confirmadas, con «Marcar atendida»), «Mis pacientes», historia clínica de sus pacientes y registro y firma de atenciones |
| Enfermera | `profesor.enfermera+clerk_test@example.com` | «Mi turno»: su turno de hoy a 14 días y el médico y la especialidad con quien trabaja |

Cuentas ficticias adicionales, para comprobar que cada persona ve solo lo suyo (cada una está enlazada a una persona de demostración):

| Rol | Usuario | Persona de demostración |
|---|---|---|
| Médica | `medica.lucia.paredes+clerk_test@example.com` | Lucía Paredes Ruiz (CMP-DEMO-002), con **otros** pacientes a cargo que el médico principal |
| Paciente | `paciente.luis.fernandez+clerk_test@example.com` | Luis Fernández Mori (DNI 99000002) |
| Enfermera | `enfermera.elena.soto+clerk_test@example.com` | Elena Soto Cruz, con sus propios turnos |

Ideas de comparación: entrar como el médico principal y como la médica y comprobar que «Mis pacientes» difiere; entrar como las dos enfermeras y ver
turnos distintos; abrir una historia a mano con la dirección de un paciente que no es suyo y comprobar que responde «no encontrado» igual que si no existiera.

## Cómo iniciar sesión

1. Entrar a la aplicación y elegir «Iniciar sesión» con el correo y la contraseña de la cuenta.
2. Si Clerk pide verificar el dispositivo con un código, usar `424242` (las cuentas `+clerk_test` de la instancia de desarrollo lo aceptan siempre).
3. **Paciente:** entra directo al portal.
4. **Personal (administrativo, médico, enfermera):** la regla del proyecto exige un segundo factor. **Estas cuentas ya lo tienen configurado**: al iniciar sesión,
   Clerk pide un código de 6 dígitos. Para generarlo, añadir en una aplicación de autenticación (Google Authenticator, Microsoft Authenticator, Authy…) una
   cuenta con «Ingresar clave de configuración» y el secreto TOTP de cada usuario, que se entrega **por separado** junto con las contraseñas.
   Si un código es rechazado, esperar al siguiente (cambian cada 30 segundos).

## Qué conviene probar

**Como paciente**
- Reservar una cita: especialidad → médico → día → franja (Mañana, Tarde, Noche) → horario → confirmar. Antes de confirmar aparece la
  advertencia de que solo se puede cancelar hasta 1 hora antes.
- Entrar a «Mis citas», ver las próximas y las anteriores, y cancelar una.
- Probar un registro nuevo con otro correo (el sistema pide documento, nombres, fecha de nacimiento y sexo; acepta DNI de 8 dígitos o
  Carné de Extranjería y rechaza formatos inválidos).

**Como médico**
- Ver «Mi jornada» y marcar atendida una cita confirmada que ya empezó.
- Abrir «Mis pacientes», entrar a una historia (cada apertura queda auditada), registrar una atención con diagnósticos, guardarla como borrador, firmarla y agregar una addenda. Una atención firmada ya no se puede modificar.

**Como administrativo**
- Asignar un turno de enfermería (el sistema avisa si el médico tiene una baja ese día y rechaza un choque de turnos).
- Ver la agenda del día por médico, con las citas y los huecos libres.
- Agendar una cita a un paciente, reprogramarla y cancelarla.
- Registrar y buscar pacientes por documento.
- Gestionar los horarios de un médico y registrar una baja médica: el sistema propone la reasignación de las citas afectadas.

**Intentar romperlo (ideas, todas con una barrera real)**
- **Doble reserva:** con dos navegadores, reservar el mismo horario con el paciente y con el administrativo. Solo una cita queda; la otra
  recibe exactamente «Registro de cita ya agendado».
- **Cancelación tardía:** la base de datos rechaza cancelar una cita que empieza en menos de 1 hora, para todos los roles.
- **Acceso entre roles:** estando como paciente, abrir a mano `/administrativo`, `/medico` o `/enfermera`: el sistema te devuelve a tu área.
- **Datos ajenos:** un paciente no puede ver ni cancelar citas de otro; esa regla está en la base de datos (RLS), no solo en la pantalla.
- **Entradas inválidas:** documentos mal formados, fechas de nacimiento inválidas, campos vacíos.
- **Abuso:** hay límite de peticiones (por ejemplo, 5 registros por 15 minutos y 10 reservas por 10 minutos) y verificación anti-bots en el
  registro y en la reserva. Si una herramienta automatizada es rechazada por BotID, es el comportamiento esperado.

## Qué todavía no existe (para no buscarlo)

- Recordatorios por correo (H5), adjuntos escaneados, catálogo CIE-10 completo (hay un subconjunto de demostración), plantillas por especialidad,
  dashboard del administrativo, importación y respaldo (H8). Están especificados en [`openspec/changes/`](../../openspec/changes/).
- El bloqueo técnico de datos clínicos reales (P-1) no está construido: por eso las páginas del médico muestran el aviso «use solo datos ficticios».

## Dónde mirar el trabajo

| Quiero ver… | Dónde |
|---|---|
| El recorrido completo del proyecto | [`docs/README.md`](../README.md) |
| Las reglas de negocio y los casos borde | [PRD](../01-producto/PRD.md) |
| Las decisiones técnicas | [TECH-DESIGN](../03-arquitectura/TECH-DESIGN.md) y [ADRs](../03-arquitectura/adrs/) |
| Cómo se prueba | [Testing](../07-testing/README.md) |
| Qué se encontró en la revisión de seguridad | [SECURITY-REPORT](../08-seguridad/SECURITY-REPORT.md) |
| Cómo se despliega | [DEPLOY-PLAN](DEPLOY-PLAN.md) |

## Aviso sobre las cuentas

Son cuentas de una instancia de **desarrollo** de Clerk, creadas solo para esta revisión. Después de la evaluación conviene eliminarlas desde el
panel de Clerk y rotar sus contraseñas si se compartieron por un canal inseguro.
