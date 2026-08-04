---
status: accepted
date: 2026-08-04
---

# Las referencias static-audio son objetos etiquetados

`staticAudio()` produce un objeto plano, congelado y versionado con
`type: "resona/static-audio"`, `version: 1` y un `path` relativo validado. Esa misma forma
puede cruzar como input JSON.

## Opciones consideradas

- Interpretar strings como paths cuando el schema espere audio.
- Usar URLs o paths absolutos en los inputs.
- Exigir un objeto explícito con discriminante y versión.

Se eligió la tercera opción para que el significado sobreviva a serialización, pueda
evolucionar y no otorgue acceso a archivos por inferencia contextual.

## Consecuencias

- Un string nunca se convierte implícitamente en recurso.
- El helper de Zod valida la forma y genera un campo `audio-resource` en `InputSchemaIR`.
- Studio restringe el selector al directorio estático del proyecto.
- CLI y API pueden recibir la misma forma mediante JSON.
- La versión permite rechazar o migrar formas futuras de manera explícita.
- Resolver la referencia continúa siendo responsabilidad de preparación.
