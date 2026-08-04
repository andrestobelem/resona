---
status: accepted
date: 2026-08-04
---

# Los recursos resueltos se fijan por hash de contenido

Una referencia de recurso localiza un WAV, pero la variante resuelta identifica sus bytes
mediante un hash de contenido y conserva la metadata validada. Una ruta mutable no puede
cambiar silenciosamente el audio de una ejecución ya preparada.

## Opciones consideradas

- Tratar la ruta como identidad y leer su contenido cada vez que se necesite.
- Invalidar solamente mediante fecha de modificación y tamaño.
- Resolver una referencia a hash y metadata y fijarlos en la variante.

Se eligió la tercera opción para que cache, Studio y renderer compartan una identidad de
contenido verificable y para detectar cambios entre preparación y ejecución.

## Consecuencias

- El resolver valida contenedor, sample rate y canales antes de compilar el plan.
- La variante resuelta conserva referencia, hash y metadata del recurso.
- El cache se direcciona por hash de contenido, no solamente por ruta.
- Si el contenido cambia antes de ejecutar, la variante se invalida y se informa un
  diagnóstico; no se mezclan bytes nuevos con metadata anterior.
- La referencia local inicial se define en el
  [ADR 0041](0041-static-audio-project-resource-references.md).
- El hash y el caché se definen en el
  [ADR 0042](0042-sha256-identifies-source-asset-bytes.md).
