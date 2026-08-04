---
status: accepted
date: 2026-08-04
---

# La fuente canónica inicial tiene una frontera explícita

La fuente canónica inicial de Resona comprende módulos TypeScript/TSX,
`resona.config.ts`, archivos JSON importados explícitamente y validados mediante schema, y
referencias explícitas a recursos WAV del proyecto.

El bundle de autoría, `CompositionIR`, `ExecutionPlan`, `RenderSpec`, fingerprints, cachés,
previews y WAV renderizados son artefactos derivados. Sus formatos pueden estar versionados,
pero no constituyen una fuente editable ni una segunda verdad.

## Opciones consideradas

- Exigir que toda la composición esté escrita directamente en TSX.
- Aceptar como fuente cualquier archivo, consulta externa o sesión visual que el runtime
  pueda descubrir.
- Definir un conjunto inicial pequeño de fuentes explícitas y regenerar todos los artefactos
  de ejecución a partir de ellas.

Se eligió la tercera opción porque permite separar datos de código sin introducir estado
oculto, mantiene revisables las dependencias de una composición y da a personas y agentes
una frontera inequívoca entre lo que se edita y lo que se regenera.

## Consecuencias

- Los datos JSON deben importarse explícitamente y atravesar un schema antes de contribuir a
  `CompositionIR`.
- Los WAV se referencian mediante valores etiquetados del proyecto y sus bytes participan en
  la variante resuelta mediante un hash de contenido.
- YAML, bases de datos implícitas y formatos propietarios de sesión quedan fuera del alcance
  inicial.
- Serializar o versionar una IR, un plan o una spec sirve para compatibilidad e inspección;
  no autoriza su edición como fuente.
- Cachés, previews y renders pueden eliminarse y reconstruirse sin perder la composición.
- Studio, CLI, APIs y Agent Skills deben dirigir toda modificación durable hacia la fuente
  canónica, nunca hacia artefactos derivados.
