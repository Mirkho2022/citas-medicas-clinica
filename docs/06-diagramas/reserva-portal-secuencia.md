# Reserva de una cita desde el portal del paciente

Secuencia de la Server Action `reservarCitaDelPortal`. Reglas que el diagrama deja visibles: el orden de los controles de borde (sesión, límite,
anti-bots), que el paciente sale de la sesión y no de la petición, y que la doble reserva la decide el motor de base de datos
([ADR-0005](../03-arquitectura/adrs/0005-modelo-de-datos-y-prevencion-de-doble-reserva.md)).
Código: [`lib/portal/reserva.ts`](../../lib/portal/reserva.ts), [`lib/auth/accion-paciente.ts`](../../lib/auth/accion-paciente.ts) y
[`app/paciente/citas/nueva/`](../../app/paciente/citas/nueva/).

```mermaid
sequenceDiagram
    autonumber
    actor P as Paciente
    participant UI as Portal (Reservar cita)
    participant A as Server Action
    participant D as Postgres (RLS + EXCLUDE)

    P->>UI: elige especialidad, médico, día, franja y horario
    UI-->>P: Confirme su cita + aviso: podrá cancelar hasta 1 hora antes
    P->>A: Confirmar cita (médico, inicio)
    A->>A: 1. sesión y rol paciente
    A->>A: 2. límite de peticiones (10 / 10 min)
    A->>A: 3. BotID
    A->>A: 4. validación del esquema (se descartan claves extra)
    A->>D: paciente_actual() (sale de la sesión, no del cliente)
    A->>D: ¿ya tiene esa cita vigente? (reintento o doble clic)
    alt es el reintento de la misma reserva
        D-->>A: cita existente
        A-->>UI: éxito con esa cita
    else no existe todavía
        A->>D: ¿el horario sigue libre? (slots_disponibles)
        alt el horario ya no existe
            A-->>UI: El horario elegido ya no está disponible. Elija otro horario.
        else el horario sigue libre
            A->>D: INSERT cita (reservada, origen portal)
            alt se crea
                D-->>A: id de la cita
                A-->>UI: Su cita quedó reservada
            else otra persona la tomó (23P01, EXCLUDE)
                A-->>UI: Registro de cita ya agendado + Elija otro horario.
            end
        end
    end
```
