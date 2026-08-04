---
status: accepted
date: 2026-08-04
---

# Los schemas de inputs validan sin transformar

Un `InputSchema` del MVP valida de forma sincrónica un objeto JSON y devuelve la misma
estructura. Los defaults pertenecen exclusivamente a `Composition.defaultInputs`; el schema
no coacciona, completa ni transforma valores.

## Opciones consideradas

- Admitir toda capacidad de transformación del validador elegido.
- Permitir transformations y defaults, registrando solo su resultado.
- Restringir la frontera a aceptación o rechazo de valores ya canónicos.

Se eligió la tercera opción para que Studio, preparación y `RenderSpec` observen el mismo
input y para evitar reglas de merge o normalización duplicadas.

## Consecuencias

- El schema raíz representa un objeto.
- Constraints y refinements sincrónicos pueden aceptar o rechazar.
- Coerción, `transform`, `preprocess`, `catch` y defaults de Zod son incompatibles.
- La validación asíncrona queda fuera del MVP.
- `defaultInputs` es la única fuente de defaults de composición.
- Un adaptador debe rechazar al registrarse cualquier schema que no pueda cumplir el
  contrato, no esperar a una ejecución particular.
