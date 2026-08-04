---
status: accepted
date: 2026-08-04
---

# La fuente versionable es la única fuente de verdad

Resona adopta el principio central de Remotion: una composición se define mediante una
fuente versionable de código y datos declarativos. Toda superficie debe interpretar esa
misma fuente, porque mantener una sesión visual o un formato opaco como segunda verdad
haría ambiguos los renders, la automatización y la revisión de cambios.

## Opciones consideradas

- Un DAW visual tradicional cuyo archivo de sesión sea canónico.
- Un DAW visual que además permita scripts auxiliares.
- Un framework code-first acompañado por superficies de preview e inspección.

Se eligió la tercera opción por ser la que conserva la propiedad que queremos trasladar
de Remotion al dominio musical.

## Consecuencias

- Los datos declarativos pueden vivir en archivos importados; code-first no exige escribir
  cada nota directamente en código ejecutable.
- Las funciones visuales no pueden introducir estado musical que la fuente versionable no
  represente.
- La edición visual bidireccional requerirá una decisión posterior sobre round-trip y
  conflictos; no se presume en el primer alcance.
- Esta decisión no obliga todavía a elegir React, TypeScript, una plataforma ni un motor
  de audio concretos.
- La frontera concreta elegida posteriormente está registrada en el
  [ADR 0057](0057-explicit-canonical-source-boundary.md).
