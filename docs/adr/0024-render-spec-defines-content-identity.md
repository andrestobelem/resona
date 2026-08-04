---
status: accepted
date: 2026-08-04
---

# RenderSpec define la identidad de contenido del render

Un `RenderJob` separa una `RenderSpec` serializable y versionada de su payload de ejecución
en memoria. La spec contiene todo dato capaz de cambiar las muestras y determina un
fingerprint; el payload contiene el `ExecutionPlan` y los recursos preparados.

## Opciones consideradas

- Tratar todo argumento operativo de una ejecución como parte de su identidad.
- Identificar el trabajo solo por composición e inputs.
- Identificar su contenido mediante una spec completa y mantener aparte la ejecución local.

Se eligió la tercera opción porque composición e inputs no capturan assets, versiones,
planificación ni opciones, mientras que rutas, callbacks y cancelación no describen el
audio producido.

## Consecuencias

- `RenderSpec` contiene composición, versiones de motor e IR, inputs, seed, metadata y
  configuración resueltas, hashes de assets, IR y plan, rango, cola y opciones efectivas con
  su procedencia.
- El fingerprint se calcula desde una serialización canónica de `RenderSpec`.
- `RenderJob` agrega el plan inmutable y los recursos preparados que no son serializables.
- Ruta de salida, callbacks, progreso y `AbortSignal` quedan fuera del fingerprint.
- Dos trabajos con igual fingerprint comparten identidad de contenido dentro del entorno
  cubierto por el contrato de determinismo; el fingerprint no amplía ese contrato.
- El formato canónico y el algoritmo de hash deben definirse antes de estabilizar la spec.
