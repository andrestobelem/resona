---
status: accepted
date: 2026-08-04
---

# El CLI ofrece un protocolo JSON versionado

Todos los comandos muestran texto legible por defecto y aceptan `--json`. Las operaciones
finitas emiten un documento JSON versionado; el render emite envelopes JSON Lines tipados
para representar su naturaleza incremental.

## Opciones consideradas

- Mantener solo salida humana y permitir que cada automatización la interprete.
- Emitir JSON sin separar logs ni versionar su forma.
- Definir un modo JSON versionado cuyo `stdout` esté reservado al protocolo.

Se eligió la tercera opción porque la automatización es parte del producto y no debe
depender de mensajes destinados a personas ni de detalles accidentales del proceso.

## Consecuencias

- `compositions --json` y `validate --json` emiten un único documento.
- `render --json` emite JSON Lines con eventos de progreso, diagnóstico y resultado.
- Cada documento o envelope declara una versión; los eventos incluyen un `type`.
- En modo JSON, `stdout` no contiene texto informal.
- Los logs incidentales se escriben en `stderr`.
- Los diagnósticos del resultado conservan su representación estructurada.
- El código `0` representa éxito, aunque existan advertencias.
- El código `1` representa una falla de validación, compilación o render.
- El código `2` representa uso inválido o configuración ilegible.
- El código `130` representa cancelación por el usuario.
- El detalle de una falla vive en los datos estructurados, no en más códigos numéricos.
- La forma exacta y la política de compatibilidad del protocolo deben diseñarse antes de
  declararlo estable.
