---
status: accepted
date: 2026-08-04
---

# CompositionIR usa tiempo racional canónico

`CompositionIR` distingue posiciones de duraciones y tiempo musical de tiempo absoluto. El
tiempo musical se expresa como una fracción exacta de notas negras y el absoluto como una
fracción exacta de segundos.

```ts
type RationalIR = Readonly<{
  numerator: string;
  denominator: string;
}>;

type PositionIR =
  | Readonly<{type: "musical-position"; quarterNotes: RationalIR}>
  | Readonly<{type: "absolute-position"; seconds: RationalIR}>;

type DurationIR =
  | Readonly<{type: "musical-duration"; quarterNotes: RationalIR}>
  | Readonly<{type: "absolute-duration"; seconds: RationalIR}>;
```

## Opciones consideradas

- Conservar todas las formas públicas, incluida una variante de frames, dentro de la IR.
- Convertir todo temprano a segundos de punto flotante.
- Normalizar a dos dominios racionales exactos y convertir a frames únicamente al compilar
  el plan.

Se eligió la tercera opción porque evita múltiples representaciones del mismo instante,
conserva la diferencia semántica entre tiempo musical y absoluto y elimina redondeos
intermedios al anidar secuencias.

## Consecuencias

- Barras, pulsos y subdivisiones se resuelven a fracciones de notas negras antes de emitir
  la IR.
- Segundos y frames acompañados por sample rate se resuelven a segundos racionales exactos.
- Numerador y denominador son strings decimales canónicos para no depender del límite de
  enteros seguros de JSON.
- Ambos son no negativos, el denominador es positivo y la fracción está reducida.
- Cero se escribe como `"0"`; no se permiten signos redundantes ni ceros a la izquierda.
- Posiciones y duraciones conservan tipos distintos y no son intercambiables.
- El planificador combina offsets racionales, aplica el tempo resuelto y redondea una sola
  vez a frames con nearest-even.
- `ExecutionPlan` no contiene estas uniones: todo su tiempo ya son frames enteros.
