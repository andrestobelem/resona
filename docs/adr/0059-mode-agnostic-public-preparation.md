---
status: accepted
date: 2026-08-04
---

# La preparación pública no conoce el modo de ejecución

La función pública que prepara una composición recibe el ID, los inputs ya combinados y
validados, un `AbortSignal` y un resolver restringido de recursos. No recibe un booleano como
`isRendering` ni un discriminante de preview, validación o render.

## Opciones consideradas

- Copiar `calculateMetadata()` de Remotion y exponer `isRendering`.
- Exponer un discriminante con todos los modos de Resona.
- Mantener el modo en los orquestadores y darle a la preparación pública el mismo contexto
  musical en todas las superficies.

Se eligió la tercera opción porque preview y render deben preparar la misma variante. Una
rama pública por modo permitiría divergir duración, tempo, recursos o metadata antes de que
la suite de paridad pudiera detectar el origen.

## Consecuencias

- Los orquestadores pueden elegir adaptadores, prioridades y diagnósticos según su modo.
- Ninguna de esas diferencias cruza a la función de autor ni altera su resultado musical.
- El `AbortSignal` permite cancelar trabajo obsoleto sin comunicar el motivo de la ejecución.
- Para el mismo release, composición, inputs y contenido de recursos, la preparación recibe
  el mismo contexto observable en Studio, validación y render.
- Esta decisión reemplaza la consecuencia provisional del
  [ADR 0012](0012-prepare-an-immutable-resolved-variant.md) que incluía el modo en la firma.
- El resto de la firma está definido en el
  [ADR 0060](0060-prepare-composition-public-contract.md).
