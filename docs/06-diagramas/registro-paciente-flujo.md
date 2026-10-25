# Registro del paciente y vinculación con su ficha

Qué pasa cuando una cuenta nueva completa sus datos en «Complete su registro». La función `registrar_paciente_portal` decide en la base de datos
si crea una ficha nueva o vincula una existente, y todos los rechazos de vinculación devuelven el mismo error para no revelar qué dato falló
([ADR-0037](../03-arquitectura/adrs/0037-verificacion-al-vincular-una-ficha-de-paciente.md)). Código:
[`migrations/1792536080588_portal-paciente-vinculacion.sql`](../../migrations/1792536080588_portal-paciente-vinculacion.sql) y
[`lib/portal/registro.ts`](../../lib/portal/registro.ts).

```mermaid
flowchart TD
    A[Cuenta nueva en Clerk] --> B[Webhook crea el perfil con rol paciente]
    B --> C[Complete su registro: documento, nombres, fecha de nacimiento, sexo]
    C --> D{¿El token trae un correo verificado?}
    D -- no --> E[PA004: la sesión no trae un correo]
    D -- sí --> F{¿Existe una ficha con ese documento?}
    F -- no --> G[Crea la ficha vinculada a la cuenta]
    F -- sí --> H{¿Es ya la ficha de esta cuenta?}
    H -- sí --> I[PA001: la cuenta ya está registrada]
    H -- no --> J{¿La ficha está libre y coinciden correo y fecha de nacimiento?}
    J -- sí --> K[Vincula la ficha existente]
    J -- no --> L[PA002: No se pudo registrar ese documento<br/>mismo mensaje para cualquier causa]
    G --> M[Inicio del portal]
    K --> M
```

Riesgo conocido, pendiente de decisión del cliente: la rama «no existe ficha» no comprueba que el documento pertenezca a quien se registra
(hallazgo SEC-02 del [informe de seguridad](../08-seguridad/SECURITY-REPORT.md)).
