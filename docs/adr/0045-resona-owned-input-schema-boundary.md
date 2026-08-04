---
status: accepted
date: 2026-08-04
---

# Resona posee la frontera de schemas de inputs

El core acepta un `InputSchema<T>` propio que valida valores y produce una `InputSchemaIR`
serializable. El primer adaptador oficial es `fromZod()` para Zod 4; Studio consume la IR y
no inspecciona la representación interna de Zod.

## Opciones consideradas

- Aceptar directamente schemas Zod, como Remotion.
- Aceptar cualquier validador pero mantener metadata visual separada manualmente.
- Definir una seam propia y derivar validación y descripción desde adaptadores.

Se eligió la tercera opción para conservar validación, inferencia y controles derivados sin
acoplar el core y Studio a versiones o campos privados de una librería.

## Consecuencias

- `InputSchema<T>` es la interfaz que conoce `Composition`.
- `InputSchemaIR` cruza hacia Studio como datos serializables.
- `fromZod()` soporta Zod 4 inicialmente y encapsula su introspección.
- El core no depende de Zod en runtime.
- Campos válidos sin editor especializado usan un editor JSON y el mismo validador.
- Otros adaptadores no requieren cambiar el modelo de composición ni Studio.
- La política de validación y transforms se define en el
  [ADR 0046](0046-input-schemas-validate-without-transforming.md).
- El subconjunto visual inicial se define en el
  [ADR 0048](0048-explicit-minimal-input-controls.md).
