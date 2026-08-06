---
status: accepted
date: 2026-08-04
---

# Studio usa un protocolo local versionado

El servicio local usa HTTP para operaciones finitas y recursos por hash, y WebSocket para
invalidaciones, progreso y diagnósticos incrementales. Cada intercambio identifica versión
de protocolo, sesión, solicitud y variante.

## Opciones consideradas

- Exponer un RPC genérico bidireccional sobre WebSocket.
- Resolver todo mediante polling HTTP.
- Separar request-response, streams de estado y transferencia al worklet.

Se eligió la tercera opción para mantener explícitas las operaciones, aprovechar semántica
HTTP para contenido inmutable y controlar carreras durante rebuilds y cambios de inputs.

## Consecuencias

- HTTP enumera composiciones, crea variantes y entrega planes y assets por hash.
- WebSocket queda reservado para invalidaciones, progreso y diagnósticos; el primer corte de
  T13 implementa las operaciones finitas mediante HTTP y deja ese stream para una story de
  transporte posterior.
- Los envelopes incluyen protocolo, `sessionId`, `requestId` y `variantId`.
- Una solicitud nueva cancela la anterior y las respuestas obsoletas se descartan.
- Paths físicos no forman parte de URLs de assets.
- Plan y buffers llegan al `AudioWorklet` mediante structured clone y transferables.
- El callback del worklet no realiza red ni I/O.
- La protección de la sesión se define en el
  [ADR 0051](0051-loopback-token-protected-studio.md).
- El primer corte usa `resona/studio-envelope` v1 en `/api/v1/session`,
  `/api/v1/compositions`, `/api/v1/static-resources`, `/api/v1/variants`,
  `/api/v1/variants/:variantId/plan` y
  `/api/v1/variants/:variantId/resources/:sha256-hash`.
- Los payloads de variante omiten paths físicos y el acceso a recursos exige hashes ya
  resueltos para esa variante.
