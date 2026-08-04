---
status: accepted
date: 2026-08-04
---

# El grafo del MVP es estéreo y suma sin procesamiento oculto

Todo el grafo ejecutable del MVP tiene dos canales. Las fuentes mono se duplican con igual
amplitud a izquierda y derecha, las estéreo conservan sus canales y todas las mezclas suman
muestras directamente.

## Opciones consideradas

- Propagar layouts variables y adaptar canales en cada conexión.
- Ejecutar internamente en mono y convertir solo al exportar.
- Normalizar todas las fuentes a un grafo estéreo fijo.

Se eligió la tercera opción porque cubre los recursos acordados y reduce el contrato de cada
procesador sin perder la información de fuentes estéreo.

## Consecuencias

- La salida mono del sintetizador se duplica a ambos canales.
- `Gain` y `Delay` mantienen estado y procesamiento independiente por canal.
- Voces, clips y pistas se suman muestra a muestra; los slots de voz usan índice ascendente.
- El master no normaliza, limita ni recorta automáticamente.
- El WAV float puede contener muestras fuera de `[-1, 1]`.
- Pan, surround y layouts adicionales quedan fuera del MVP.
- El orden y el redondeo de cada aporte a una suma se fijan en el
  [ADR 0078](0078-explicit-float32-audio-boundaries.md).
