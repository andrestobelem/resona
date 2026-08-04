# Resona

> Estado: exploración inicial. El repositorio todavía no contiene una implementación.

Resona busca ser **el Remotion de la música**: un framework code-first para definir,
previsualizar y renderizar composiciones musicales programables con audio, MIDI y
efectos.

La fuente del proyecto es una combinación versionable de código y datos declarativos, no
primariamente un archivo opaco controlado por una interfaz visual. Una misma definición
debería alimentar tanto la experiencia de desarrollo como el render final.

## Qué queremos construir

- Una API declarativa y componible para expresar estructura musical y procesamiento.
- Audio, MIDI, instrumentos y efectos como conceptos de primera clase.
- Un Studio para reproducir, inspeccionar y depurar composiciones durante el desarrollo.
- Un renderer para producir audio de manera reproducible desde una CLI o una API.
- Composiciones parametrizables, versionables y automatizables con herramientas de
  desarrollo normales.

## Ejemplo conceptual

La API todavía no está definida. Este ejemplo solo muestra la experiencia que buscamos:

```tsx
<Composition id="Demo" component={Demo} bpm={120} durationInBars={32} />

const Demo = () => (
  <MidiTrack instrument={<Synth preset="AnalogBass" />}>
    <MidiClip from="1:1:0" notes={bassline} />
    <Delay mix={0.2} />
  </MidiTrack>
);
```

La versión completa y sus supuestos están en la
[visión de producto](docs/product.md#interfaz-conceptual).

## Documentación

- [Visión de producto](docs/product.md)
- [Arquitectura propuesta](docs/architecture.md)
- [Estudio de Remotion aplicado a Resona](docs/research/remotion-study.md)
- [Lenguaje del dominio](CONTEXT.md)
- [ADR 0001: la fuente versionable es la única fuente de verdad](docs/adr/0001-versionable-source-as-source-of-truth.md)

## Licencia

[MIT](LICENSE)
