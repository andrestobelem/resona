---
status: accepted
date: 2026-08-04
---

# La envolvente ADSR es lineal y usa tiempo absoluto

La envolvente de `PolySynth` usa segmentos lineales en amplitud. Attack, decay y release son
duraciones absolutas; sustain es un escalar en `[0, 1]`. Sus defaults respectivos son
`10 ms`, `100 ms`, `0.8` y `200 ms`.

## Opciones consideradas

- Exigir todos los parámetros y dejar curvas y unidades abiertas.
- Permitir tiempos musicales y absolutos con curvas configurables desde el inicio.
- Fijar una envolvente absoluta, lineal y con defaults reproducibles.

Se eligió la tercera opción para que notas cortas, límites de gate y colas tengan una
semántica completa sin incorporar todavía otro sistema de curvas y sincronización.

## Consecuencias

- Attack va de cero a uno y decay de uno a sustain.
- Release parte del nivel instantáneo alcanzado y termina en cero.
- La voz queda libre cuando finaliza release.
- Una duración cero es una transición instantánea en el frame correspondiente.
- Duraciones negativas y sustain fuera de `[0, 1]` fallan la validación.
- Los defaults forman parte del resultado y deben quedar resueltos en el plan.
- Curvas exponenciales y tiempos sincronizados al tempo quedan fuera del MVP.
