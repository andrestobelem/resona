---
status: accepted
date: 2026-08-04
---

# Los schemas de inputs validan sin transformar

Un `InputSchema` del MVP valida de forma sincrónica un objeto JSON sin devolver un valor
parseado. Los defaults pertenecen exclusivamente a `Composition.defaultInputs`; el schema no
coacciona, completa ni transforma el candidato canónico que conserva Resona.

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
- Un adaptador rechaza al registrarse toda asincronía que pueda detectar estructuralmente.
- JavaScript no permite demostrar que un callback arbitrario nunca devolverá una promesa
  para algún valor futuro. Por eso cada validación síncrona conserva además un guard contra
  thenables; si aparece uno, la variante falla antes de evaluar autoría o ejecutar DSP.
- Los refinements sincrónicos siguen admitidos. Esta defensa runtime no habilita validación
  asíncrona ni adopta su resultado.
- La representación serializable se fija en el
  [ADR 0079](0079-versioned-json-schema-input-description.md).
