# ADR 0026: Controles de borde: anti-bots y rate limiting

## Estado

Aceptado — reemplaza los controles de Cloudflare Turnstile y rate limiting de borde listados en
«Controles adicionales» de TECH-DESIGN.md, a partir de un cambio de stack decidido por el cliente.

## Contexto

Cloudflare daba, delante de toda la aplicación y sin código propio: WAF genérico (protección contra
escaneo/inyección a nivel de borde), Turnstile (anti-bots en registro y reserva) y rate limiting
(5 intentos / 15 min por IP en rutas de autenticación). Vercel no reemplaza estas tres cosas con un
único producto equivalente — hace falta decidir cada una por separado.

## Decisión

- **Anti-bots:** Vercel BotID en los formularios de registro (`/registro`) y de reserva
  (`citas/nueva`) — reemplaza Turnstile.
- **Rate limiting:** Upstash Ratelimit + Redis (Upstash), aplicado en el middleware de Next.js
  delante de las rutas de autenticación de Clerk: 5 intentos / 15 minutos por IP — mismo límite
  numérico que el diseño original.
- **WAF genérico:** no se reemplaza 1:1. Se acepta como riesgo conocido (ver Consecuencias) en vez
  de introducir un producto adicional solo para igualar esa capa.

## Alternativas consideradas

- **hCaptcha o reCAPTCHA** (en vez de Vercel BotID) — más maduros y probados a gran escala, pero son
  proveedores externos adicionales que afectan la UI del formulario (el widget visible de
  verificación); se descartó a favor de Vercel BotID por no agregar cuenta ni claves de terceros.
- **Vercel Firewall** (en vez de Upstash Ratelimit) — más cercano en espíritu a lo que daba
  Cloudflare (reglas de borde sin código propio), pero sus reglas más completas suelen requerir un
  nivel de plan a confirmar, y de cualquier forma no resuelve por sí solo el requisito puntual de
  límite de intentos en rutas de auth sin configuración adicional. Se descartó a favor de una
  solución de aplicación que cubre exactamente ese requisito de forma verificable en tests.
- **Arcjet** (para ambos) — librería de seguridad de aplicación más completa (rate limiting +
  detección de bots + reglas tipo WAF) en un solo paquete. Se descartó por ser un vendor adicional
  específico de seguridad con su propia curva de configuración, cuando BotID + Upstash ya cubren los
  dos requisitos concretos que el diseño necesita sin ese vendor extra.

## Consecuencias

- El anti-bots en registro/reserva y el límite de intentos en rutas de auth quedan cubiertos con el
  mismo nivel de protección numérica que el diseño original.
- **Trade-off aceptado:** ninguna de las opciones elegidas reemplaza la protección genérica de WAF
  que Cloudflare daba gratis delante de toda la aplicación (detección de patrones de escaneo,
  intentos de inyección a nivel de borde, etc.). Se acepta este riesgo porque construir o contratar
  un equivalente completo no es proporcional al tamaño del proyecto; si en producción se observa
  tráfico malicioso que un WAF de borde detendría, reconsiderar Vercel Firewall o Arcjet en ese
  momento, no antes.
