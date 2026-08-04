---
status: accepted
date: 2026-08-04
---

# TSX y React son la interfaz principal de autoría

Resona adopta TSX y React como interfaz pública principal de autoría inicial. Esta elección
ofrece al músico-programador que ya trabaja con TypeScript una experiencia declarativa y
componible cercana a Remotion, sin convertir React en el modelo musical ni en el motor de
audio.

## Opciones consideradas

- Componentes TSX y React como interfaz pública de autoría.
- Una DSL de builders o datos en TypeScript como única interfaz pública.
- Una API imperativa acoplada directamente al motor de audio.

Se eligió la primera opción por su capacidad de encapsular y combinar estructura musical,
manteniendo una experiencia familiar para el usuario inicial. Las otras alternativas
siguen siendo posibles como frontends adicionales si producen el mismo modelo musical.

## Consecuencias

- La evaluación de componentes debe producir una representación normalizada independiente
  de React.
- El subconjunto React admitido está definido en el
  [ADR 0019](0019-pure-declarative-react-authoring.md).
- React no participa del callback de audio ni del procesamiento DSP.
- El código TSX puede importar datos declarativos; cada nota o evento no tiene que vivir
  directamente en componentes.
- Los nombres y contratos concretos de los componentes públicos todavía deben diseñarse.
