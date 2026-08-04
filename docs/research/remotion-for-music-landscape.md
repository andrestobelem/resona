# Panorama de un “Remotion para música”

> Estado: investigación de fuentes primarias realizada el 2026-08-04. Se comparan
> herramientas abiertas o públicamente documentadas; la ausencia de un producto en este
> relevamiento no demuestra que no exista una solución privada o de nicho.

## Conclusión ejecutiva

Sí existen herramientas que se parecen a Remotion para música, pero no apareció un
equivalente **maduro y mantenido** que reúna en un solo producto:

1. autoría declarativa en un lenguaje general, idealmente TypeScript/JSX;
2. composiciones descubribles con inputs y metadata;
3. Studio y Player interactivos sobre el mismo modelo;
4. render offline determinista;
5. CLI y API para automatización.

El resultado depende de qué significa “parecido”:

- **Más literal:** [`codesong`][codesong-npm] declara exactamente el pipeline
  `song.tsx → ScoreIR → Web Audio → WAV/MP3`, componentes JSX (`Song`, `Section`, `Track`,
  `Pattern`, `Progression`), CLI, scaffolder y un Studio Vite que comparte engine con el
  renderer. Pero nació el 2026-05-31, está en `0.2.0`, tiene un único maintainer y el paquete
  ni siquiera declara repositorio o homepage. Es una prueba muy pertinente de que la idea ya
  está apareciendo, no todavía una dependencia confiable
  ([README publicado][codesong-npm], [metadata del registro][codesong-registry]).
- **Antecedente conceptual más cercano y verificable:** [Fluid Music][fluid-home] convierte
  scores JavaScript en audio realtime, WAV y sesiones de Reaper/Tracktion; modela audio,
  MIDI, routing, automatización y VST, y permite distribuir “techniques” por npm. También
  previó ejecución offline y headless. Sin embargo, su API sigue beta y el repositorio no
  muestra commits de código posteriores a marzo de 2022; su último push fue en 2023
  ([objetivos y arquitectura][fluid-about], [último commit][fluid-last-commit]).
- **Mejor pieza técnica JS actual:** [Elementary Audio][elementary-docs] aporta grafos DSP
  funcionales y declarativos, reconciliación, Playground, WebRenderer y OfflineRenderer para
  Node/browser. Le falta el modelo de canción, timeline, composiciones, inputs y CLI de
  producto ([renderer offline][elementary-offline], [Playground][elementary-playground]).
- **Mejor experiencia web de autoría musical:** [Strudel][strudel-repl] ofrece JavaScript,
  mininotation, patrones puros consultables por intervalos, REPL visual embebible y export de
  audio. Está orientado a live coding cíclico y no documenta un renderer musical headless con
  contratos de inputs al estilo Remotion ([arquitectura][strudel-repl], [export][strudel-faq],
  [paquetes][strudel-packages]).
- **Más cercano en flujo offline con UI:** [bellplay~][bellplay-intro] combina scripts,
  buffers, colocación temporal visible como notación y render offline multipass. Está activo,
  pero su aplicación standalone sigue publicada como pre-release, depende de una app/Max y
  la documentación no presenta una CLI headless ni un contrato de variantes
  ([instalación][bellplay-install], [repositorio][bellplay-repo]).

Por tanto, el hueco real no está en síntesis, secuenciación o render offline por separado:
esas piezas existen y algunas llevan décadas maduras. El hueco está en la **continuidad de
producto** que Remotion ofrece entre fuente versionable, composiciones parametrizadas,
preview visual, Player, renderer y CLI. El contrato de referencia está detallado en el
[estudio local de Remotion](remotion-study.md).

## Criterio de comparación

La palabra *render* es ambigua en audio. Algunas bibliotecas llaman `render()` a reconciliar
un grafo que seguirá sonando en tiempo real; este informe sólo marca **render offline** cuando
la herramienta puede producir muestras sin esperar el reloj de reproducción. “Reproducible”
exige además fijar código, seed, assets, sample rate, engine y plugins; disponer de un modo
offline no garantiza por sí solo igualdad byte a byte.

Se evaluaron estas capacidades:

- autoría declarativa o programática y lenguaje anfitrión;
- timeline, arreglo o composición temporal;
- preview interactivo y representación visual;
- render offline y posibilidad de reproducibilidad;
- CLI o API headless;
- inputs, configuración y producción de variantes;
- extensibilidad de instrumentos, DSP, plugins o outputs;
- madurez y mantenimiento observable.

## 1. Candidatos con forma de producto

| Proyecto | Autoría y composición | Preview | Offline y automatización | Variantes y extensión | Estado y ruptura con Remotion |
| --- | --- | --- | --- | --- | --- |
| [`codesong`][codesong-npm] | TypeScript/JSX declarativo; compila canción, secciones, tracks y patrones a una IR temporal | Studio Vite con transport, mapa de secciones y hot reload, según su README publicado | CLI `codesong render`; mismo engine Web Audio en Node/browser; WAV/MP3 y reporte de análisis | Props/componentes TS y presets; no documenta registry, schemas ni una matriz formal de inputs | Es la copia funcional más literal, pero `0.2.0`, un maintainer, sin repositorio declarado y con sólo dos publicaciones desde junio de 2026 ([registro][codesong-registry]) |
| [Fluid Music][fluid-home] | Objetos y funciones JavaScript en Node; score, audio/MIDI, tracks, routing, automatización y plugins | Audio realtime; la edición visual fina se delega a Reaper o Tracktion | WAV, offline y headless; también exporta proyectos de DAW | Techniques reutilizables por npm, VST y acceso al session model | Es el precursor conceptual más fuerte, pero beta y sin actividad reciente de código ([arquitectura][fluid-about], [commit][fluid-last-commit]) |
| [Strudel][strudel-start] | JavaScript más mininotation; patrones puros, transformables y potencialmente infinitos | REPL web, highlighting, pianoroll y otras visualizaciones | Pestaña Export para archivo de audio; no hay CLI headless de render musical documentada | Paquetes npm, custom parameters y outputs WebAudio/MIDI/OSC/Csound | Es un instrumento de live coding, no un catálogo de composiciones finitas con props. El repo GitHub se archivó porque el desarrollo migró a Codeberg, no porque el proyecto terminara ([aviso de migración][strudel-moved], [repo actual][strudel-codeberg]) |
| [bellplay~][bellplay-intro] | Scripts `bell`; generación de buffers, `transcribe()` a onsets y `render()` | Aplicación con GUI y representación de buffers como eventos de notación | Render offline, batch y multipass; no se documenta CLI headless | Lenguaje extensible y colección amplia de síntesis, proceso y análisis | Une más piezas que la mayoría, pero es un proyecto pequeño y pre-release, probado principalmente en macOS ([instalación][bellplay-install], [repo][bellplay-repo]) |
| [Shipwright Audio][shipwright-pypi] | Funciones Python decoradas y `RenderSpec` con tracks MIDI/audio, buses y efectos | `build --watch` y `--play`; no Studio/timeline visual | CLI, WAV/OGG/FLAC/MP3, stems, seed y builds paralelos | Config TOML con defaults/overrides; instrumentos Python, Faust, SoundFont y VST/AU | Buen “audio as build”, pero apareció en junio de 2026, se declara alpha y su repositorio aún no tiene adopción observable ([repo][shipwright-repo]) |
| [claw-daw][clawdaw-repo] | DSL de comandos para proyecto, tracks, patrones y clips; TUI | TUI y reproducción MIDI, sin Studio web compartido | CLI headless, JSON/MIDI/WAV/MP3/stems y diff; fija seed, versión y SoundFont para repetir | Scripts, JSON y flags; superficie musical más acotada que un host DSP general | Muy alineado con automatización/agentes, pero nació en 2026 y el repositorio sigue siendo diminuto |
| [beat-engine][beat-engine-pypi] | TOML o diccionarios Python; secciones, patrones, armonía y arreglos orientados a beats | No documenta editor o Player interactivo | CLI para WAV, stems, MIDI y validación | Config declarativa, samples/SoundFonts y efectos Pedalboard | `0.1.2` alpha de mayo de 2026, con breaking changes esperados; además, el repositorio indicado por PyPI no es público ([estado publicado][beat-engine-pypi]) |

Estos proyectos nuevos son evidencia de demanda, no de madurez. En particular, `codesong`,
Shipwright, claw-daw y beat-engine aparecieron durante 2026 y todavía no permiten evaluar
estabilidad de API, gobernanza, compatibilidad prolongada ni una comunidad de extensiones.

## 2. Piezas establecidas que cubren partes del problema

| Proyecto | Lo que resuelve bien | Preview / offline / CLI | Lo que falta para ser “Remotion para música” |
| --- | --- | --- | --- |
| [Tone.js][tone-repo] | API TypeScript/JavaScript, `Transport`, `Part`, `Sequence`, instrumentos y efectos; su Transport se inspira en el timeline de una DAW | Preview Web Audio y [`Tone.Offline()`][tone-offline], que ejecuta el Transport en un `OfflineAudioContext` y devuelve un buffer | No trae Studio, registry de composiciones, schemas/inputs, encoder ni CLI. Probabilidad y humanización obligan a definir una política de seed |
| [Elementary Audio][elementary-docs] | Grafo DSP funcional como función de estado, IR liviana y reconciliación incremental; adapters web y offline sobre el mismo core | Playground live; OfflineRenderer en Node/browser procesa buffers y expone tiempo en muestras | Es una capa DSP, no una semántica de canción: carece de clips, arreglo, tempo map, metadata, variantes y artefacto final codificado ([core][elementary-core], [offline][elementary-offline]) |
| [Csound][csound-home] | Separación clásica entre orchestra/instrumentos y score/eventos, DSP, plugins/opcodes y control explícito del azar | El mismo `.csd` puede sonar por DAC o escribirse a archivo desde la [CLI][csound-cli]; macros y [`seed`][csound-seed] ayudan a parametrizar y repetir | DSL propia y UX centrada en engine; no hay Studio/Player web ni contrato de composiciones e inputs comparable |
| [SuperCollider][sc-repo] | Lenguaje musical, servidor DSP y `Score` de mensajes OSC timestamped; ecosistema de UGens | Un `Score` puede probarse en realtime y [`recordNRT`][sc-nrt] produce WAV/AIFF; `scsynth -N` permite batch | NRT debe conocer los eventos por adelantado y no admite feedback del servidor; no ofrece una superficie web/JS ni un pipeline de variantes ([Score][sc-score]) |
| [DawDreamer][dawdreamer-repo] | Grafo Python de producción, MIDI/PPQN, automation audio-rate, VST, Faust, time-stretch y stems | Renderer offline y scripts Python, pensado para batch más que preview visual | Es un backend de DAW programable, no un sistema de composiciones, Studio y Player; PyPI lo clasifica alpha ([PyPI][dawdreamer-pypi]) |
| [Reactronica][reactronica-repo] | La analogía de interfaz más directa: `<Song><Track><Instrument><Effect>` y música como función de estado, sobre Tone.js | Preview en browser junto a UI React | Su propio README la llama “highly experimental”; no proporciona render offline, CLI ni pipeline de artefactos, y el repo no recibe commits desde 2023 |
| [Sonic Pi][sonic-pi] | DSL accesible y entorno de live coding con feedback inmediato | GUI con botón Record para capturar WAV y releases activas | Record es captura realtime; no es un renderer NRT/headless con inputs y artefactos reproducibles ([tutorial][sonic-pi-tutorial]) |
| [Faust][faust-overview] | Lenguaje funcional muy maduro para describir DSP y compilarlo a numerosos targets, plugins, WebAssembly o aplicaciones | IDE/FaustLive para experimentar; CLI de compilación y [`faust2sndfile`][faust-sndfile] para procesar archivos | Describe un procesador de señal, no una canción, arrangement o timeline |
| [Overtone][overtone-repo] | Clojure sobre SuperCollider, REPL, funciones musicales, metronome y secuenciación | Excelente exploración live; puede aprovechar la infraestructura de SuperCollider | El flujo NRT no es una superficie de producto de primer nivel y no hay Studio/render CLI propio, aunque el proyecto volvió a publicar releases ([releases][overtone-releases]) |
| [Gibber/Gibberish][gibber-site] | Live coding audiovisual en JavaScript, secuencias, synths/FX y scheduling de audio en browser | Playground con anotaciones visuales y preview inmediato | No se documenta renderer offline reproducible, CLI headless ni modelo de composiciones; el mantenimiento está repartido entre varios repos ([organización][gibber-org], [Gibberish][gibberish-repo]) |

Otros sistemas confirman la misma fragmentación:

- [ChucK][chuck-home] integra tiempo preciso como tipos y control de flujo, concurrencia y
  modificación de código en vivo; su fortaleza es el runtime musical interactivo, no una
  fuente declarativa con Studio y builds de variantes
  ([especificación temporal][chuck-time]).
- [Alda][alda-home] acerca una partitura textual, REPL y CLI a la composición por código,
  pero su salida principal es reproducción/MIDI y no un mix PCM con plugins y mastering
  ([tutorial][alda-tutorial]).
- [mutwo][mutwo-docs] ofrece un modelo Python genérico de eventos y converters a MIDI,
  LilyPond o scores Csound; deliberadamente es infraestructura extensible, no interfaz de
  composición ni Studio.
- [Pippi][pippi-home] es una biblioteca Python offline-first para construir, mezclar y
  escribir buffers; no ofrece preview realtime ni una superficie de proyecto/CLI equivalente.
- [Scribbletune][scribbletune-docs] aporta patrones, clips y CLI JavaScript, pero automatiza
  principalmente MIDI, no un render final de audio
  ([CLI][scribbletune-cli]).

## 3. Dónde se rompe la analogía con Remotion

### 3.1 Un frame es aislable; una señal de audio no

Remotion puede evaluar muchos frames como unidades independientes. Un motor musical mantiene
estado entre bloques de muestras: fase de osciladores, envolventes, voces, buffers de delay,
convolución, feedback y estado de plugins. El render offline puede correr más rápido que el
reloj, pero no puede repartir muestras arbitrarias sin reconstruir ese estado. Los modos NRT
de SuperCollider exigen una score conocida de antemano por esa razón
([guía NRT][sc-nrt]); Elementary expone `reset()` y tiempo de engine porque el estado del
grafo forma parte explícita del proceso ([OfflineRenderer][elementary-offline]).

### 3.2 “La composición” no significa lo mismo en todos los sistemas

Fluid Music, bellplay, Shipwright y Csound describen obras finitas. Strudel, Tidal, Sonic Pi,
Overtone y Gibber se optimizan para patrones vivos, potencialmente infinitos, que cambian
durante la ejecución. En Strudel, un patrón es una función pura consultada repetidamente por
el scheduler para producir eventos en el siguiente intervalo
([manual del REPL][strudel-repl]). Convertirlo en un artefacto exige añadir duración, seed,
estado externo, assets y política de tails; esos límites no son accesorios.

### 3.3 Preview y render pueden compartir semántica sin compartir backend

Tone.js y Elementary demuestran que un mismo programa puede dirigirse a Web Audio realtime y
a un contexto offline. Eso no garantiza identidad audible si cambian decoder, sample rate,
browser, implementación DSP o plugin. Csound y SuperCollider reducen esa diferencia al usar
el mismo engine para DAC y archivo, pero sacrifican la ergonomía web y el ecosistema TS. Un
producto equivalente a Remotion debe definir qué igualdad promete: misma estructura musical,
mismas muestras dentro de tolerancia o archivo bit-identical.

### 3.4 Los inputs musicales tienen más dependencias ocultas

Una variante no queda determinada sólo por `props`. Debe fijar al menos seed, assets y hashes,
tempo map, sample rate, layout de canales, versión del engine, instrumento/plugin y preset,
latencia, preroll y cola de efectos. claw-daw reconoce explícitamente que su reproducibilidad
depende de fijar script, seed, versión y SoundFont
([garantías][clawdaw-repo]); Shipwright expone seed y overrides por target en la configuración
de build ([configuración][shipwright-pypi]). Ninguno generaliza todavía esto a un schema de
composición que también genere controles de Studio.

## 4. El hueco de producto

La búsqueda permite afirmar algo más preciso que “no existe”:

- **No hay hueco de engines:** Csound, SuperCollider, Tone.js, Elementary, Faust y DawDreamer
  ya resuelven DSP realtime/offline con distintos tradeoffs.
- **No hay hueco de lenguajes musicales:** Strudel, Sonic Pi, ChucK, Alda, Overtone y Gibber
  ofrecen varias formas maduras de escribir música con código.
- **Sí hay un hueco de integración:** no apareció una opción activa y probada que convierta
  TypeScript/JSX en una composición musical finita y parametrizada, la descubra en Studio,
  previsualice e inspeccione su timeline, y renderice por CLI el mismo plan de forma
  reproducible.

`codesong` intenta llenar exactamente ese hueco, y Fluid Music ya describía gran parte de él,
pero ninguno permite concluir que el problema esté resuelto como producto estable. bellplay,
Shipwright, claw-daw y beat-engine muestran que el interés actual se desplaza hacia “audio as
code/build”, aunque todos son demasiado recientes o limitados para invalidar la oportunidad.

Para Resona, la oportunidad razonable no es crear otro lenguaje DSP. Es unir:

```text
TypeScript/JSX o API declarativa
        ↓
composición + inputs + metadata + assets fijados
        ↓
IR de eventos + grafo DSP + automatizaciones
   ┌──────────────┴──────────────┐
   ↓                             ↓
Studio/Player realtime       renderer offline + CLI
```

Las referencias más útiles serían Fluid Music para el dominio de producción, Strudel para
patrones puros y tooling de autoría, Elementary/Tone.js para la frontera realtime/offline,
Csound/SuperCollider para semántica NRT y Remotion para la continuidad del producto. Esto es
una **síntesis de diseño** del relevamiento, no una afirmación de esos proyectos.

[codesong-npm]: https://www.npmjs.com/package/codesong
[codesong-registry]: https://registry.npmjs.org/codesong/latest
[fluid-home]: https://fluid-music.github.io/
[fluid-about]: https://github.com/fluid-music/fluid-music/blob/main/docs/about.md
[fluid-last-commit]: https://github.com/fluid-music/fluid-music/commit/3965c40ea3b7276d78d4112787c63f858c4adde1
[strudel-start]: https://strudel.cc/learn/getting-started/
[strudel-repl]: https://strudel.cc/technical-manual/repl/
[strudel-faq]: https://strudel.cc/learn/faq/
[strudel-packages]: https://strudel.cc/technical-manual/packages/
[strudel-moved]: https://github.com/tidalcycles/strudel/blob/main/README.md
[strudel-codeberg]: https://codeberg.org/uzu/strudel
[bellplay-intro]: https://bellplay.net/docs/
[bellplay-install]: https://bellplay.net/docs/installation/
[bellplay-repo]: https://github.com/felipetovarhenao/bellplay
[shipwright-pypi]: https://pypi.org/project/shipwright-audio/
[shipwright-repo]: https://github.com/dinger086/shipwright-audio
[clawdaw-repo]: https://github.com/sdiaoune/claw-daw
[beat-engine-pypi]: https://pypi.org/project/beat-engine/
[tone-repo]: https://github.com/Tonejs/Tone.js
[tone-offline]: https://tonejs.github.io/docs/14.7.58/fn/Offline
[elementary-docs]: https://www.elementary.audio/docs
[elementary-core]: https://www.elementary.audio/docs/packages/core
[elementary-offline]: https://www.elementary.audio/docs/packages/offline-renderer
[elementary-playground]: https://www.elementary.audio/docs/playground_api
[csound-home]: https://csound.com/
[csound-cli]: https://csound.com/manual/invoke/the-csound-command/
[csound-seed]: https://csound.com/docs/manual/seed.html
[sc-repo]: https://github.com/supercollider/supercollider
[sc-nrt]: https://doc.sccode.org/Guides/Non-Realtime-Synthesis.html
[sc-score]: https://doc.sccode.org/Classes/Score.html
[dawdreamer-repo]: https://github.com/DBraun/DawDreamer
[dawdreamer-pypi]: https://pypi.org/project/dawdreamer/
[reactronica-repo]: https://github.com/unkleho/reactronica
[sonic-pi]: https://sonic-pi.net/
[sonic-pi-tutorial]: https://sonic-pi.net/tutorial.html
[faust-overview]: https://faustdoc.grame.fr/manual/overview/
[faust-sndfile]: https://faustdoc.grame.fr/manual/tools/#faust2sndfile
[overtone-repo]: https://github.com/overtone/overtone
[overtone-releases]: https://github.com/overtone/overtone/releases
[gibber-site]: https://gibber.cc/
[gibber-org]: https://github.com/gibber-cc
[gibberish-repo]: https://github.com/gibber-cc/gibberish
[chuck-home]: https://chuck.stanford.edu/
[chuck-time]: https://chuck.stanford.edu/doc/language/time.html
[alda-home]: https://alda.io/
[alda-tutorial]: https://alda.io/tutorial
[mutwo-docs]: https://mutwo-org.github.io/
[pippi-home]: https://pippi.world/
[scribbletune-docs]: https://scribbletune.com/documentation/
[scribbletune-cli]: https://scribbletune.com/documentation/cli
