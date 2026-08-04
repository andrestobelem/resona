---
status: accepted
date: 2026-08-04
---

# NodePath es jerárquico y SourceLocation es solo diagnóstica

Los nodos de `CompositionIR` se identifican mediante arrays de segmentos canónicos. La
ubicación de código se conserva por separado y puede cambiar sin modificar identidad ni
resultado musical.

```ts
type NodePath = readonly [
  compositionId: string,
  rootNodeId: string,
  ...descendantNodeIds: string[],
];

type SourceLocation = Readonly<{
  file: string;
  line: number;
  column: number;
}>;
```

## Opciones consideradas

- Serializar paths como strings unidos por `/` y escapar separadores cuando sea necesario.
- Usar UUIDs globales sin conservar jerarquía en la identidad.
- Usar arrays JSON de IDs validados y mantener la ubicación fuente como metadata separada.

Se eligió la tercera opción. Evita reglas de escaping, conserva la estructura que Studio y
diagnósticos necesitan y permite comparar paths sin depender de presentación o filesystem.

## Consecuencias

- Los IDs públicos distinguen mayúsculas y cumplen
  `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`.
- El primer segmento de todo path es `compositionId` y el segundo es el ID de la secuencia
  raíz.
- El `id` de un nodo coincide con el último segmento de su path.
- El path de un hijo es el path de su padre seguido por su propio ID.
- La forma canónica es el array JSON; una representación unida por `/` es solo presentación.
- La comparación es lexicográfica por segmentos según orden ASCII. Un prefijo más corto se
  ordena antes que su extensión.
- Los segmentos internos cumplen `^~[a-z][a-z0-9-]*:(0|[1-9][0-9]*)$`; la API pública
  rechaza `~` y el compilador asigna ordinales deterministas.
- `SourceLocation.file` es un path lógico no vacío, relativo a la raíz estable del proyecto
  y escrito con `/`.
- El archivo no comienza con `./` ni contiene backslashes, segmentos vacíos, `.` o `..`.
- `line` y `column` son enteros seguros positivos basados en uno y señalan el comienzo del
  nodo.
- Si algún dato de ubicación no está disponible, se omite `source` completo.
- Instancias diferentes pueden compartir ubicación fuente y conservar paths distintos.
- `NodePath` participa en identidad y orden canónico. `SourceLocation` queda fuera de música,
  hashes y fingerprints.
