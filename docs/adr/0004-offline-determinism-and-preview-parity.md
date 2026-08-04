---
status: accepted
date: 2026-08-04
---

# Determinismo offline exacto y paridad semántica con Studio

Resona promete que dos renders offline equivalentes producen exactamente las mismas
muestras dentro de un mismo entorno de ejecución. Studio debe conservar la semántica de la
composición respecto del renderer, pero puede diferir numéricamente dentro de una tolerancia
documentada.

## Opciones consideradas

- Exigir solamente una equivalencia perceptual entre todas las ejecuciones.
- Exigir muestras idénticas entre renders offline equivalentes y paridad semántica entre
  Studio y renderer.
- Exigir resultados bit a bit entre navegador, Node y todas las plataformas.

Se eligió la segunda opción porque hace confiable la automatización sin convertir las
diferencias entre runtimes de audio y plataformas en una promesa prematura o inviable.

## Consecuencias

- Dos renders se consideran equivalentes cuando coinciden la versión de Resona, plataforma,
  backend, fuente, inputs, assets, seed y configuración de render.
- Studio y renderer deben conservar eventos, timing, enrutamiento, automatización y
  semántica de estado.
- La tolerancia numérica concreta entre preview y render está definida en el
  [ADR 0058](0058-studio-render-numeric-parity-budget.md).
- No se promete igualdad bit a bit entre navegador y Node ni entre plataformas diferentes.
- Cambiar cualquiera de las condiciones de equivalencia puede cambiar las muestras y debe
  quedar visible en la configuración o metadata del artefacto.
