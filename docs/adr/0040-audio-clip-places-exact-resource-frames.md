---
status: accepted
date: 2026-08-04
---

# AudioClip coloca frames exactos de un recurso

`AudioClip` coloca un WAV mediante `from`, un `offset` absoluto con default cero y una
`duration` opcional. Cada frame del recurso corresponde a un frame del motor; el MVP no
remuestrea ni interpola audio.

## Opciones consideradas

- Ajustar automáticamente el recurso a la duración declarada.
- Hacer loop implícito cuando la ventana exceda el recurso.
- Separar colocación, recorte y loop mediante reglas explícitas.

Se eligió la tercera opción para evitar que una duración cambie velocidad o repetición de
manera implícita y para mantener una relación de frames verificable.

## Consecuencias

- Sin duración, el clip termina al acabarse el recurso desde su offset.
- Una duración menor recorta; una mayor produce silencio posterior y una advertencia.
- `loop` exige una duración positiva.
- El loop repite desde `offset` hasta el final del WAV y no aplica crossfade.
- Un offset fuera del recurso o una región de loop vacía producen un error.
- Time-stretch, regiones de loop personalizadas, crossfade y resampling quedan fuera del MVP.
- La forma ejecutable de una colocación se fija en el
  [ADR 0071](0071-content-addressed-resources-and-audio-regions.md).
- Estas invariantes se validan antes de podar clips fuera de rango según el
  [ADR 0072](0072-validate-before-pruning-execution-plan.md).
