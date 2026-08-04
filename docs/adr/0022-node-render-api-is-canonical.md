---
status: accepted
date: 2026-08-04
---

# La API de render de Node es la capacidad canónica

El render offline tiene una sola implementación pública canónica: `renderAudio(job)` en
Node. La CLI y el botón de render de Studio son adaptadores finos que construyen o reciben
el mismo trabajo y delegan su ejecución a esa capacidad.

## Opciones consideradas

- Implementar caminos de render propios para API, CLI y Studio.
- Hacer de la CLI el renderer canónico y que las demás superficies lancen un proceso.
- Hacer canónica una API programática de Node y adaptar CLI y Studio sobre ella.

Se eligió la tercera opción porque permite automatización directa sin subprocesos y evita
que las superficies acumulen diferencias de resolución, ejecución o reporte.

## Consecuencias

- `renderAudio()` recibe un `RenderJob` inmutable ya resuelto y compilado.
- El renderer no vuelve a interpretar defaults, inputs, preparación ni TSX.
- La CLI se limita a adaptar argumentos, salida textual, progreso y cancelación.
- Studio delega mediante su servicio local de Node y no mantiene otro motor offline.
- Las tres superficies comparten diagnósticos y semántica de render.
- La precedencia y procedencia de opciones se definen en el
  [ADR 0023](0023-render-option-precedence-and-provenance.md).
- La identidad de contenido de `RenderJob` se define en el
  [ADR 0024](0024-render-spec-defines-content-identity.md).
