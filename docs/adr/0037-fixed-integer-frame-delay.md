---
status: accepted
date: 2026-08-04
---

# Delay usa una cantidad fija y entera de frames

El `Delay` del MVP usa tiempo absoluto fijo convertido a una cantidad entera de frames,
feedback no negativo menor que uno y una mezcla dry/wet lineal. Cada canal conserva su
propio buffer inicialmente en cero.

## Opciones consideradas

- Delegar el delay a nodos distintos en navegador y Node.
- Incorporar desde el inicio delay fraccional, modulación y sincronización musical.
- Definir un delay entero mínimo dentro del núcleo DSP compartido.

Se eligió la tercera opción para disponer de un procesador con estado útil que ejercite
seek, loop, preroll y colas sin introducir interpoladores ni backends divergentes.

## Consecuencias

- `time` tiene default `250 ms` y debe resolverse a uno o más frames.
- `feedback` pertenece a `[0, 1)` y tiene default `0.3`.
- `mix` pertenece a `[0, 1]` y tiene default `0.25`.
- La salida es `input * (1 - mix) + delayed * mix`.
- El buffer recibe `input + delayed * feedback`.
- Los canales no comparten señal ni feedback.
- Automatización, delay fraccional, modulación y sync al tempo quedan fuera del MVP.
- La canonización de parámetros y las fronteras `Float32` de salida y buffer se fijan en el
  [ADR 0078](0078-explicit-float32-audio-boundaries.md).
