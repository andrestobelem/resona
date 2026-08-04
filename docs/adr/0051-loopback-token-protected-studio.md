---
status: accepted
date: 2026-08-04
---

# Studio se limita a loopback y exige token

El servicio local escucha solo en loopback, usa un puerto dinámico y genera un token
criptográfico por proceso. HTTP y WebSocket validan token, host y origen; no existe CORS
general ni acceso a recursos mediante paths físicos.

## Opciones consideradas

- Confiar únicamente en que el servicio escucha en localhost.
- Exponer el servicio en la red local para facilitar otros dispositivos.
- Combinar loopback con autenticación efímera y allowlists de recursos.

Se eligió la tercera opción para impedir que una página ajena controle un proceso local o
use sus endpoints como acceso indirecto al filesystem.

## Consecuencias

- El puerto se elige al iniciar y no implica exposición de red.
- Un token nuevo identifica cada proceso de Studio.
- HTTP y WebSocket rechazan sesión, host u origen inválidos.
- Las operaciones mutables exigen token y métodos HTTP apropiados.
- Los assets se sirven solo por hashes autorizados para la sesión o variante.
- Ningún endpoint acepta un path físico arbitrario.
- El código del proyecto sigue siendo código local confiable y no está sandboxeado.
