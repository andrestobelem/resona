---
status: accepted
date: 2026-08-06
---

# Studio sirve un adaptador privado de AudioWorklet sobre la seam del motor

El primer playback de Studio usa dos módulos JavaScript browser-safe servidos por el mismo
servicio local: el adaptador `AudioWorkletProcessor` y el módulo que contiene `AudioEngine`.
Los módulos se obtienen por URLs same-origin protegidas por la validación de `Host` y
`Origin`; no incluyen código de autoría ni datos del proyecto y por eso no requieren el token
de sesión. Las operaciones que entregan datos continúan requiriendo el bearer token de T13.

La shell crea un `AudioContext` estéreo a 48 kHz, obtiene una variante y solicita cada recurso
por su hash autorizado. Convierte los samples JSON a `Float32Array` y envía un único comando
`load` con el `ExecutionPlan` mediante structured clone y esos buffers en la transfer list.
Después usa los comandos privados `play`, `pause` y `seek`. El worklet responde `ready`,
`snapshot`, `ended` o `error`; el snapshot contiene el cursor absoluto de frames. El cliente
habilita play y pause únicamente después de `ready` y de que el contexto confirme 48 kHz.

El adaptador procesa el quantum estándar de 128 frames y publica un snapshot por quantum. El
callback no hace red, filesystem, evaluación TSX ni crea buffers; usa un buffer interleaved
reservado al construir el processor y copia la señal a las salidas planares de Web Audio.
Playback se detiene al alcanzar la duración nominal del plan. Las colas explícitas pertenecen
al renderer offline y no se agregan a esta preview.

## Opciones consideradas

- Duplicar el DSP en un script inline de la shell y en Node.
- Agregar un bundler frontend y un protocolo público de Player antes del primer playback.
- Servir módulos browser-safe privados junto con el servicio local y reutilizar `AudioEngine`.

Se eligió la tercera opción porque conserva una sola semántica DSP, evita enviar o evaluar el
bundle de autoría y permite que la shell siga siendo un artefacto pequeño mientras el protocolo
público de Player permanece fuera del MVP.

## Consecuencias

- El módulo del worklet y `AudioEngine` son seams privadas de Studio; no forman todavía un
  paquete `@resona/player` ni un contrato público de transporte.
- La ruta de recursos JSON de T13 sigue siendo suficiente para el primer corte; una entrega
  binaria o streaming requiere otra decisión y no se introduce aquí.
- Un contexto con sample rate distinto de 48 kHz falla readiness; no se remuestrea de forma
  implícita.
- `requestAnimationFrame` solo dibuja snapshots. El cursor del motor dentro del worklet es el
  reloj autoritativo.
- Seek se deja disponible en el mensaje privado para reconstruir estado; los controles de
  transporte y loop completos pertenecen a T17.
