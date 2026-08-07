# Cantata de las Estaciones

Una cantata en seis movimientos para coro (SATB) y ensemble, compuesta en Resona como
ejemplo de un proyecto real de usuario del framework.

El texto (ver [`libretto.md`](./libretto.md)) sigue el ciclo de las cuatro estaciones
como metáfora del renacimiento. Resona hoy no sintetiza voz ni letra cantada — el único
instrumento es `PolySynth` —, así que las partes corales están escritas como líneas
sintetizadas (una `Track` por voz), no como audio cantado.

## Estructura

- `src/index.tsx` — composición raíz: registra `CantataDeLasEstaciones` y ubica los seis
  movimientos como `Sequence` anidadas dentro de la secuencia raíz.
- `src/movements/*.tsx` — un archivo por movimiento; cada uno exporta un componente que
  renderiza su propia `Sequence` con las `Track` activas en ese movimiento.
- `src/lib/pitch.ts` — convierte nombres de nota (`"F#4"`) a `semitonesFromA4`.
- `src/lib/time.ts` — expresa tiempos como beats/compases en vez de fracciones crudas.
- `src/lib/chords.ts` — tabla de acordes SATB y funciones que expanden una progresión
  armónica en líneas de coro, pad orquestal, bajo continuo o arpegios.
- `src/lib/instruments.tsx` — fábricas de `Track`+`PolySynth` por tipo de voz/instrumento
  (coro, cuerdas, continuo, motivo).

## Uso

Desde la raíz del monorepo, con las dependencias del workspace ya construidas:

```sh
pnpm --filter @resona/example-cantata-de-las-estaciones typecheck
pnpm --filter @resona/example-cantata-de-las-estaciones compositions
pnpm --filter @resona/example-cantata-de-las-estaciones studio
pnpm --filter @resona/example-cantata-de-las-estaciones render
```

El render produce `dist/cantata-de-las-estaciones.wav`.
