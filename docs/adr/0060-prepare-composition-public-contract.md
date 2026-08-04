---
status: accepted
date: 2026-08-04
---

# La preparación pública usa la prop `prepare`

Una composición conecta preparación dinámica mediante la prop `prepare`, tipada como
`PrepareComposition<TInputs>`:

```ts
type PrepareComposition<TInputs extends JsonObject> = (
  context: Readonly<{
    compositionId: string;
    inputs: DeepReadonly<TInputs>;
    signal: AbortSignal;
    resources: PreparationResourceResolver;
  }>,
) => MaybePromise<
  Readonly<{
    duration?: Duration;
    tempo?: Tempo;
    metadata?: JsonObject;
  }>
>;
```

## Opciones consideradas

- Copiar el nombre `calculateMetadata` y el retorno amplio de Remotion.
- Exponer directamente la construcción de una `ResolvedVariant`.
- Usar una preparación acotada y dejar que Resona valide y construya la variante interna.

Se eligió la tercera opción porque la fase hace más que calcular metadata, pero no debe
permitir que el autor falsifique recursos resueltos, transforme inputs validados ni mezcle
opciones operativas de render con la configuración musical.

## Consecuencias

- `compositionId`, `inputs`, `signal` y `resources` son las únicas capacidades del contexto.
- Los inputs son profundamente inmutables y no pueden reemplazarse desde el retorno.
- El retorno solo puede declarar `duration`, `tempo` y metadata JSON serializable.
- `PreparationResourceResolver.audio(reference)` devuelve metadata validada y hash; no
  expone buffers, handles ni rutas físicas.
- El resolver está ligado a la cancelación y registra recursos consultados para fijarlos en
  la variante resuelta.
- Las opciones de render quedan fuera de esta API y conservan su propia precedencia.
- Resona valida el retorno y construye internamente la `ResolvedVariant` inmutable.
- La combinación de declaraciones estáticas y dinámicas se define en el
  [ADR 0061](0061-shallow-preparation-metadata-merge.md).
