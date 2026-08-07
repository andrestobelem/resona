# Resona

> Estado: prototipo ejecutable. El repositorio incluye motor, Studio, renderer, CLI y un
> proyecto de ejemplo reproducible.

Resona busca ser **el Remotion de la música**: un framework code-first para definir,
previsualizar y renderizar composiciones musicales programables con audio, eventos de nota
tipados y efectos.

La fuente del proyecto es una combinación versionable de código y datos declarativos. La
misma composición alimenta la inspección en Studio y el render offline; no es necesario
mantener una sesión de DAW separada para reproducirla.

## Inicio rápido

Desde la raíz del repositorio, sigue [la guía de inicio](docs/getting-started.md). El camino
canónico es:

```sh
pnpm install
pnpm check:environment
pnpm build
pnpm resona -- compositions --config examples/cantata-de-las-estaciones/resona.config.ts
pnpm resona -- validate --config examples/cantata-de-las-estaciones/resona.config.ts \
  --composition CantataDeLasEstaciones
pnpm resona -- studio --config examples/cantata-de-las-estaciones/resona.config.ts
pnpm resona -- render --config examples/cantata-de-las-estaciones/resona.config.ts \
  CantataDeLasEstaciones examples/cantata-de-las-estaciones/dist/cantata-de-las-estaciones.wav \
  --overwrite
```

El comando de Studio mantiene el proceso abierto y muestra una URL loopback. Ábrela en el
navegador y detén el proceso con `Ctrl-C` antes de continuar con el render.

El wrapper `pnpm resona -- ...` no instala binarios globales ni compila silenciosamente. Usa
el CLI construido por `pnpm build` y rechaza un Node o pnpm incompatibles antes de ejecutar.

## Proyecto de ejemplo

[`CantataDeLasEstaciones`](examples/cantata-de-las-estaciones/README.md) es una obra en seis
movimientos con una sola composición pública. Demuestra:

- secuencias anidadas y pistas declarativas;
- eventos de nota tipados con inicio, duración, pitch y velocity;
- líneas sintetizadas con `PolySynth`;
- una cadena explícita `Gain → Delay`;
- descubrimiento, validación, Studio y render WAV desde la misma fuente.

El ejemplo no importa archivos MIDI, no sintetiza voces cantadas y no requiere un WAV externo.
MIDI queda como formato de borde del modelo musical; las notas del ejemplo son datos tipados.

## Qué queremos construir

- Una API declarativa y componible para expresar estructura musical y procesamiento.
- Audio, MIDI, instrumentos y efectos como conceptos de primera clase.
- Un Studio para reproducir, inspeccionar y depurar composiciones durante el desarrollo.
- Un renderer para producir audio de manera reproducible desde una CLI o una API.
- Composiciones parametrizables, versionables y automatizables con herramientas de desarrollo
  normales.

## Documentación

- [Guía de inicio](docs/getting-started.md)
- [Visión de producto](docs/product.md)
- [Arquitectura y contratos](docs/architecture.md)
- [Estudio de Remotion aplicado a Resona](docs/research/remotion-study.md)
- [Lenguaje del dominio](CONTEXT.md)
- [ADR 0001: la fuente versionable es la única fuente de verdad](docs/adr/0001-versionable-source-as-source-of-truth.md)

## Licencia

[MIT](LICENSE)
