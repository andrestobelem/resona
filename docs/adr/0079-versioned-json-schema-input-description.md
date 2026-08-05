---
status: accepted
date: 2026-08-05
---

# InputSchemaIR envuelve JSON Schema de forma versionada

`InputSchema<TInputs>` separa dos capacidades: validar un valor sin devolver un reemplazo y
describir su estructura como datos. `InputSchemaIR` usa un envelope propio de Resona con un
documento JSON Schema Draft 2020-12:

```ts
type InputSchemaIR = Readonly<{
  format: "resona/input-schema";
  schemaVersion: 1;
  jsonSchema: JsonObject;
}>;
```

El documento describe estructura, constraints y metadata editorial, pero no reemplaza al
validador ejecutable. Studio interpreta el subconjunto acordado y usa edición JSON para las
formas que no representa. Las extensiones `x-resona-ui` y `x-resona-resource` agregan hints
de controles y recursos sin crear otro vocabulario estructural.

## Opciones consideradas

- Definir una unión discriminada propia para cada forma editable.
- Transportar directamente una instancia o representación interna de Zod.
- Envolver JSON Schema con una versión y extensiones propias de Resona.

Se eligió la tercera opción porque reutiliza un formato estándar, conserva un protocolo
explícito de Resona y evita que Studio o el core dependan de internals de Zod.

## Consecuencias

- `InputSchema.validate()` solo acepta o rechaza; nunca devuelve un valor parseado.
- Resona clona defaults y overrides JSON, hace merge superficial, valida el objeto completo
  y congela profundamente exactamente ese candidato.
- Transformaciones, coerción, stripping y defaults de un adaptador nunca se convierten en
  inputs canónicos.
- JSON Schema sirve para inspección y controles; la validación autoritativa sigue ocurriendo
  mediante el `InputSchema` original dentro de Node.
- El adaptador oficial vive aislado en `@resona/zod`, con Zod 4 como peer dependency. El
  runtime de `@resona/engine` no depende de Zod.
- `fromZod()` usa la conversión oficial a JSON Schema y encapsula la detección de features
  incompatibles y el mapeo de errores.
- El envelope versiona las convenciones y extensiones de Resona independientemente del
  dialecto estándar.
- Referencias remotas y dialectos alternativos quedan fuera del primer alcance.
