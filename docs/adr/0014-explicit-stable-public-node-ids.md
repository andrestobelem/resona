---
status: accepted
date: 2026-08-04
---

# Los nodos públicos tienen IDs explícitos y estables

Toda composición, pista, clip, instrumento, efecto y parámetro que pueda inspeccionarse,
automatizarse o referenciarse declara un ID público estable. La posición en un array y la
etiqueta mostrada al usuario no definen identidad.

## Opciones consideradas

- Derivar identidad de la posición producida por React.
- Usar nombres visibles como referencias.
- Exigir IDs explícitos para nodos públicos y generar IDs internos solo para estructura
  anónima.

Se eligió la tercera opción para que Studio, automatización, diagnósticos y referencias
conserven identidad a través de reordenamientos y cambios de presentación.

## Consecuencias

- Los nodos referenciables deben declarar un ID aunque su etiqueta visible sea opcional.
- Reordenar hermanos no cambia su identidad.
- El ID de composición es único dentro del proyecto.
- Cada otro ID público es único entre los hijos de su padre público; la identidad canónica
  es la ruta completa de IDs ancestrales.
- Las instancias de un componente reutilizable pueden repetir IDs internos bajo padres
  públicos diferentes.
- Los contenedores puramente estructurales pueden recibir IDs internos deterministas que no
  forman parte de la interfaz pública.
- La gramática, serialización y comparación de paths se fijan en el
  [ADR 0077](0077-canonical-node-paths-and-source-locations.md).
