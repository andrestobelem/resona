---
status: accepted
date: 2026-08-04
---

# El MVP comparte un núcleo DSP TypeScript por bloques

Studio y renderer usan un único núcleo DSP escrito en TypeScript que consume un
`ExecutionPlan` y procesa bloques `Float32`. Un adaptador lo aloja en un `AudioWorklet` y otro
lo ejecuta offline en Node.

## Opciones consideradas

- Usar nodos Web Audio en Studio y otra implementación DSP en Node.
- Construir desde el inicio un núcleo nativo o Rust/WASM.
- Validar primero la semántica con un núcleo TypeScript compartido y dos adaptadores.

Se eligió la tercera opción para maximizar paridad y velocidad de aprendizaje en el corte
vertical sin introducir antes de medir la complejidad de una toolchain nativa.

## Consecuencias

- El núcleo no depende de DOM, Web Audio ni APIs de Node.
- Web Audio entrega la señal al dispositivo, pero no implementa el sintetizador ni los
  efectos del MVP.
- Node puede avanzar el mismo núcleo más rápido que tiempo real.
- El núcleo acepta cualquier cantidad positiva de frames y produce el mismo resultado para
  un rango independientemente de su partición en bloques.
- Las señales, el estado de audio y los cálculos locales respetan las fronteras numéricas
  del [ADR 0078](0078-explicit-float32-audio-boundaries.md).
- Las restricciones de tiempo real del `AudioWorklet` forman parte de la interfaz del
  módulo: no hay I/O, locks, evaluación TSX ni asignaciones impredecibles en el callback.
- WASM o un motor nativo pueden reemplazar el núcleo detrás de la seam de `ExecutionPlan` si
  las mediciones lo justifican.
