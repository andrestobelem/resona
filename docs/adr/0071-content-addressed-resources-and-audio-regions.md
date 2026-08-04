---
status: accepted
date: 2026-08-04
---

# ExecutionPlan v1 separa recursos direccionados y regiones de audio

Los WAV resueltos aparecen una sola vez en una tabla direccionada por contenido. Cada
colocación ejecutable los referencia por índice y expresa todo su tiempo en frames del plan.

```ts
type Sha256Hash = `sha256:${string}`;
type ResourceIndex = number;

type ResolvedResourcePlan = Readonly<{
  type: "wav";
  hash: Sha256Hash;
  channels: 1 | 2;
  sampleRate: 48_000;
  frameCount: number;
}>;

type AudioRegionPlan = Readonly<{
  type: "audio-region";
  resource: ResourceIndex;
  destination: ProcessorIndex;
  startFrame: number;
  durationFrames: number;
  sourceOffsetFrame: number;
  loop: boolean;
}>;
```

## Opciones consideradas

- Guardar el path o URL del WAV en cada clip y resolverlo durante la ejecución.
- Duplicar metadata o buffers del recurso dentro de cada región.
- Separar una tabla única por hash de una tabla densa de colocaciones por índice.

Se eligió la tercera opción. El plan conserva identidad y metadata suficientes para validar
su payload sin acoplar el motor al filesystem ni duplicar recursos reutilizados.

## Consecuencias

- `resources` contiene una entrada por hash utilizado por alguna región después del recorte.
- La IR y todas sus referencias se validan antes del recorte según el
  [ADR 0072](0072-validate-before-pruning-execution-plan.md).
- Las entradas se deduplican por hash y se ordenan lexicográficamente por él.
- El hash tiene la forma exacta `sha256:[0-9a-f]{64}` y representa los bytes fuente del WAV.
- `frameCount` es un entero seguro positivo; `channels` es `1 | 2` y `sampleRate` es
  `48_000`.
- Un `ResourceIndex` es una posición válida en `resources` y solo tiene significado dentro
  de ese plan.
- Paths, URLs, bytes fuente y buffers decodificados no forman parte del plan. La preparación
  asocia el descriptor con el buffer obtenido de los bytes hasheados; antes de ejecutar se
  validan canales y cantidad de frames sin volver a leer el path.
- Cada muestra del buffer decodificado se canoniza y valida según el
  [ADR 0078](0078-explicit-float32-audio-boundaries.md).
- Cada región referencia un recurso y el sumador no master de una pista de audio.
- Inicio, duración y offset son enteros seguros no negativos; cada región conservada tiene
  duración positiva, su offset es menor que `frameCount` y su final no supera
  `nominalDurationFrames`.
- El planificador intersecta cada clip con los rangos activos de sus secuencias y la duración
  nominal. Omite las regiones que quedan en cero frames, aunque conserva la cadena de la
  pista.
- Sin loop, el índice leído es `sourceOffsetFrame + (frame - startFrame)`; después de
  `frameCount` la contribución es cero y se conserva la advertencia de planificación.
- Con loop, el índice leído es
  `sourceOffsetFrame + ((frame - startFrame) % (frameCount - sourceOffsetFrame))` y se repite
  sin crossfade durante toda la duración de la región.
- No existe resampling: cada frame de recurso corresponde a uno del plan.
- `audioRegions` se ordena por destino, inicio y ordinal de encuentro en un recorrido en
  profundidad que respeta `children` y `clips`.
- Regiones idénticas no se deduplican: cada una conserva una contribución independiente.
- El orden de tabla determina la suma de regiones activas simultáneamente.
