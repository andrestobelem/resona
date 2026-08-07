# Visión de producto

> Estado: borrador inicial, 2026-08-04. Este documento separa lo confirmado en la
> conversación de las hipótesis que todavía requieren validación.

## Resumen

Resona busca ser **el Remotion de la música**: un framework code-first para definir,
previsualizar y renderizar composiciones musicales programables con capacidades propias
de un DAW, especialmente audio, MIDI y efectos.

La promesa no es “otro DAW tradicional” ni “Ableton hecho con React”. La promesa es que
una producción musical pueda expresarse mediante código y datos declarativos, componibles,
parametrizables y versionables, y que esa misma fuente alimente tanto la experiencia
interactiva como el render final.

## Lo que ya está acordado

- Remotion es la referencia conceptual y de experiencia de desarrollo.
- El dominio de Resona es la música y la producción de audio.
- Audio, MIDI y efectos deben ser capacidades centrales, no integraciones periféricas.
- Esas capacidades deben adoptar el enfoque de Remotion: una composición programable
  es la fuente de verdad.
- La fuente canónica inicial se limita a TypeScript/TSX, `resona.config.ts`, JSON importado y
  validado explícitamente, y referencias explícitas a recursos WAV.
- La promesa inicial es definir una composición mediante código, parametrizarla con inputs
  y una seed, escuchar una variante concreta y renderizarla de forma reproducible.
- TSX y React forman la interfaz pública principal de autoría inicial, pero el modelo
  musical y el motor de audio son independientes de React.
- Studio comienza como superficie de preview, inspección y diagnóstico; no edita la
  estructura musical ni persiste cambios de vuelta a la fuente.
- La primera versión ofrece Studio como aplicación web servida localmente y render offline
  mediante una API y una CLI de Node; desktop y cloud quedan fuera de este alcance.
- Dos renders offline equivalentes producen las mismas muestras en un mismo entorno de
  ejecución; Studio preserva su semántica, pero no promete igualdad numérica bit a bit.
- La API temporal admite posiciones musicales y absolutas con unidades explícitas; antes
  de ejecutar, ambas se resuelven a frames de muestras enteros.
- Posiciones y duraciones son valores discriminados, serializables y distintos, creados por
  helpers tipados. TSX no acepta tiempos como números o strings crudos; CLI puede parsear
  una sintaxis textual únicamente en el borde.
- TSX declara la estructura de composiciones, secuencias, pistas y clips; las notas y otros
  eventos densos se expresan como colecciones de datos tipados. Generadores e importadores
  MIDI producen el mismo modelo de eventos musicales.
- Una nota pública declara inicio, duración, pitch y velocity como un intervalo completo. El
  planificador la expande a eventos internos de inicio y fin con una identidad de ocurrencia
  común; la autoría no manipula pares `noteOn` y `noteOff`.
- El pitch del MVP es un valor tipado en 12-TET con `A4 = 440 Hz`, representado canónicamente
  como semitonos enteros respecto de A4. Nombres científicos y notas MIDI son adaptadores de
  entrada, no el modelo interno.
- Al planificar, ese pitch debe producir una frecuencia finita, positiva y menor que Nyquist.
  A 48&nbsp;kHz, el mayor valor admitido es `+69` semitonos; no se aplica rango MIDI, clamp,
  folding ni transposición implícita.
- Velocity es un escalar normalizado entre `0` y `1`, con default `1`; en el sintetizador
  inicial escala linealmente la amplitud de la envolvente. MIDI adapta su escala en el borde.
- El planificador identifica cada nota por la ruta de su clip y su orden original. En un
  mismo frame procesa liberaciones antes que ataques y desempata por ruta canónica y orden
  de evento, sin exigir IDs manuales por nota.
- `PolySynth` admite `maxVoices`, con default `32`; si se agota, roba de forma determinista
  una voz en release de menor amplitud o, en su defecto, la voz activa más antigua, y emite
  una advertencia agregada.
- Cada voz ocupa un slot de índice estable y `PolySynth` suma los slots audibles por índice
  ascendente. Su oscilador reinicia la fase en el ataque y usa `sine`, `saw` o `square`; las
  dos formas discontinuas comparten la misma corrección PolyBLEP determinista en Studio y
  render.
- La envolvente ADSR usa tiempos absolutos y segmentos lineales, con defaults de `10 ms`,
  `100 ms`, `0.8` y `200 ms`; el release parte del nivel instantáneo y libera la voz al
  llegar a cero.
- `Gain` usa un multiplicador lineal finito y no negativo, con default `1`; `gain.db()` es un
  helper de conversión y no cambia el dominio lineal de automatización. El procesador no
  recorta ni limita su salida.
- `Delay` usa tiempo absoluto fijo con default `250 ms`, feedback `0.3` y mix `0.25`; mezcla
  dry/wet linealmente y mantiene un buffer independiente por canal, sin modulación ni delay
  fraccional.
- La automatización de `Gain` usa puntos con posición, valor e interpolación hacia el
  siguiente. Conserva el valor base antes del primero y el último valor después del final;
  se evalúa por frame y rechaza colisiones producidas por redondeo temporal.
- El grafo ejecutable es estéreo: fuentes mono se duplican, fuentes estéreo conservan sus
  canales y toda mezcla suma muestras sin normalización, limiting ni prevención automática
  de clipping.
- El plan canoniza parámetros de amplitud y mezcla con `Math.fround()` y normaliza `-0` a
  `+0`. El DSP redondea al escribir señales o estado de audio `Float32` y después de cada
  aporte a una suma, siempre en orden canónico; mantiene en `Float64` los cálculos locales,
  la fase y la envolvente. Un valor no finito falla y las muestras finitas fuera de
  `[-1, 1]` se conservan sin clamp implícito.
- `AudioClip` coloca un WAV desde un offset absoluto, sin resampling. Su duración opcional
  limita la contribución; un loop exige duración y repite hasta el final del recurso sin
  crossfade.
- `staticAudio("ruta.wav")` crea una referencia serializable relativa al directorio estático
  del proyecto, `public/` por default. No acepta paths absolutos ni escapes; el resolver fija
  metadata y hash durante preparación.
- La referencia usa un objeto etiquetado y versionado de tipo `resona/static-audio`; el
  adapter de schema la describe como recurso y Studio limita su selector al directorio
  estático. Los strings comunes nunca se interpretan implícitamente como assets.
- Un asset se identifica como `sha256:<hex>` sobre los bytes exactos del WAV. El caché de
  audio decodificado agrega versión de decoder y formato interno a su clave; cada trabajo
  conserva buffers verificados que no cambian si luego se modifica el archivo.
- Las posiciones musicales comienzan en `1:1:0`: barras y pulsos se indexan desde 1,
  subdivisiones desde 0 y frames de muestras absolutos desde 0.
- El núcleo representa el tiempo musical como fracciones exactas de notas negras; no usa
  flotantes ni una grilla PPQ fija antes de convertir a frames de muestras.
- La conversión a frames de muestras redondea al entero más cercano y, en empates exactos,
  elige el frame par mediante una función compartida por todas las fronteras temporales.
- El primer hito usa un BPM y una métrica fijos por composición; los cambios de tempo o
  métrica quedan para una extensión posterior.
- El motor consume eventos musicales propios; MIDI es una capacidad de primera clase en
  los bordes, pero no define la representación musical interna.
- En el primer hito, los eventos musicales alimentan instrumentos internos y el único tipo
  de artefacto renderizado es audio; las salidas MIDI quedan fuera del alcance.
- El primer hito importa recursos WAV y renderiza WAV; otros contenedores y codecs quedan
  fuera del alcance.
- El perfil inicial es 48 kHz, master estéreo y procesamiento y salida WAV en 32 bits float;
  los recursos son WAV mono o estéreo a 48 kHz y no se realiza resampling.
- El primer corte usa un sintetizador polifónico mínimo con ADSR, un procesador `Gain` sin
  estado y un `Delay` con estado, todos propios y deterministas.
- El routing inicial mezcla cada pista, después de su cadena lineal de efectos, directamente
  en un master implícito; no incluye buses, sends, sidechain ni stems.
- La automatización inicial controla el gain mediante puntos escalares con interpolación
  `hold` o lineal, compilados antes de ejecutar.
- VST, AU y otros plugins externos se diseñarán después de estabilizar instrumentos,
  efectos, estado y parámetros propios; no condicionan la arquitectura del MVP.
- La duración nominal termina con el contenido declarado y no incluye la cola audible de
  instrumentos o efectos; la política de render decide cuánto audio posterior emitir.
- La política de cola inicial corta al final nominal por defecto o agrega una duración
  absoluta explícita; no detecta automáticamente el silencio.
- Seek reconstruye el estado procesando en silencio desde el inicio; snapshots y cachés
  futuros solo podrán optimizar ese resultado.
- Cada vuelta de un loop reconstruye el estado correspondiente a su inicio, por lo que las
  iteraciones equivalentes producen el mismo comportamiento.
- Todo render emite un rango finito semiabierto, por defecto desde cero hasta la duración
  nominal; un inicio posterior usa preroll y la cola se agrega después del fin solicitado.
- El MVP rechaza posiciones anteriores a `1:1:0`; los offsets de un clip recortan su recurso
  sin crear contenido negativo.
- Un entry point registra un root que declara composiciones con IDs estables, componente
  TSX, schema, inputs por defecto y metadata musical; Studio, API y CLI usan ese registro.
- Los inputs son valores serializables validados por el schema de la composición; el mismo
  contrato valida defaults, ejecuciones y controles derivados por Studio.
- El core recibe un `InputSchema<T>` propio. El adaptador oficial `fromZod()` soporta Zod 4
  y produce también una `InputSchemaIR` serializable; Studio nunca inspecciona internals de
  Zod y ofrece un editor JSON cuando no puede representar un control visual.
- Los schemas de inputs son sincrónicos y no transformadores, con objeto en la raíz. Los
  defaults pertenecen a la composición; coerción, transforms, preprocess, catch, defaults
  del schema y validación asíncrona quedan fuera del MVP.
- Studio deriva controles solo para boolean, number, string, enum, audio-resource y objetos
  anidados. Arrays, unions y otras formas usan el editor JSON validado; no se infieren
  widgets desde nombres de campos.
- Los inputs provistos reemplazan defaults por clave en un merge superficial; objetos y
  arrays se reemplazan completos y el resultado entero vuelve a validarse.
- Una fase opcional de preparación recibe inputs validados y resuelve metadata, recursos,
  duración, tempo y configuración en una variante inmutable usada por todas las superficies.
- La preparación pública no conoce si se ejecuta para Studio, validación o render, evitando
  que el modo produzca variantes musicales diferentes.
- La prop pública se llama `prepare` y recibe ID, inputs profundamente inmutables,
  cancelación y un resolver restringido. Solo puede devolver duración, tempo y metadata; no
  transforma inputs, define opciones de render ni fabrica la variante interna.
- `duration` y `tempo` dinámicos reemplazan los estáticos cuando están presentes. La metadata
  se combina superficialmente con precedencia dinámica; valores anidados y arrays se
  reemplazan completos, sin `undefined`, sentinels ni merge profundo.
- La preparación solo consulta recursos referenciados mediante el resolver de Resona; red,
  reloj, estado global y aleatoriedad sin seed no pueden alterar la variante.
- Evaluar TSX produce una `CompositionIR` serializable y versionada; un planificador la
  convierte en un `ExecutionPlan` serializable e inmutable que consumen los motores sin
  depender de React.
- `CompositionIR` conserva una jerarquía semántica legible para Studio; `ExecutionPlan`
  compila esa jerarquía a arrays densos, rutas topológicas y tiempo expresado en frames para
  los motores. Ninguno intenta servir simultáneamente como modelo editorial y bytecode DSP.
- La IR v1 usa un vocabulario cerrado de secuencias, pistas de audio o instrumento, clips de
  audio o eventos, `PolySynth`, `Gain`, `Delay` y automatizaciones. Las notas densas son datos
  dentro de un clip, no nodos públicos ni componentes React.
- El tiempo de la IR se normaliza a posiciones y duraciones distintas que contienen
  fracciones canónicas de notas negras o segundos. Los frames de entrada no sobreviven como
  una tercera representación; el planificador redondea una sola vez al compilar.
- Secuencias, pistas y clips conservan arrays ordenados siempre presentes. Defaults como
  `offset`, `loop` y `velocity` ya están materializados; una nota se identifica internamente
  por la ruta de su clip y su índice en `events`.
- La cabecera de la IR fija duración, metadata, tempo racional constante y métrica explícita.
  Pitch conserva semitonos enteros respecto de A4 sin adoptar identidad ni rango MIDI.
- `PolySynth`, `Gain` y `Delay` tienen payloads cerrados con todos sus defaults resueltos. No
  exponen bolsas genéricas de parámetros; solo `Gain.gain` es automatizable en la IR v1.
- Una lane de automatización apunta explícitamente al parámetro `gain` de un efecto de su
  propia pista, contiene puntos `hold` o `linear` y nunca callbacks ni curvas opacas.
- `ExecutionPlan` describe la composición nominal completa mediante tablas densas a
  48&nbsp;kHz estéreo. El rango solicitado, las colas, el formato de salida, los callbacks, el
  tamaño de bloque y el estado vivo del DSP permanecen fuera del plan.
- La tabla de procesadores del plan es una unión cerrada de sumador, `PolySynth`, `Gain` y
  `Delay`. Cada pista forma una cadena lineal hasta un único sumador master; las rutas son
  acíclicas y su orden al entrar a un sumador fija el orden de suma `Float32`.
- Los recursos WAV del plan se deduplican por SHA-256 y no conservan paths. Cada región de
  audio usa índices y frames resueltos, apunta al sumador de su pista y conserva una posición
  canónica cuyo orden fija la mezcla de clips superpuestos.
- La composición completa se valida antes de podar contenido temporalmente invisible. Un
  recurso, offset o loop inválido falla aunque su clip quede totalmente fuera del plan.
- Las notas públicas de duración positiva se compilan a pares internos de attack y release
  dirigidos por índice a `PolySynth`. Una identidad densa enlaza ambos eventos y un orden
  total resuelve de forma determinista liberaciones, retriggers y robo de voces.
- La automatización ejecutable conserva puntos de gain ya resueltos a frames e índices, no
  segmentos redundantes. Al finalizar su secuencia congela el límite izquierdo de la curva
  durante releases y colas.
- Un `trace` opcional y completo relaciona cada fila densa del plan con sus rutas de IR. Es
  exclusivamente diagnóstico: no modifica hashes ni puede ser requerido por el motor, el
  routing o los medidores.
- El servicio local de Node es la única superficie que carga el bundle del autor, registra,
  prepara, evalúa TSX y planifica. Studio recibe IR y planes serializados; el navegador no
  importa ni reevalúa código del proyecto.
- Studio usa HTTP para snapshots, variantes, planes y recursos por hash, y WebSocket para
  invalidaciones, progreso y diagnósticos. Cada intercambio identifica protocolo, sesión,
  solicitud y variante para cancelar o descartar respuestas obsoletas.
- El servicio escucha solo en loopback, exige un token criptográfico por proceso, valida
  host y origen y sirve únicamente hashes autorizados. El proyecto se considera código
  local confiable y no se promete sandbox en el MVP.
- Cada build genera un bundle Node inmutable y cada variante se evalúa en un worker nuevo
  que se destruye al finalizar o cancelar. Un build anterior puede conservarse para
  diagnóstico, pero nunca reproducirse como si correspondiera al código actual.
- Composiciones, pistas, clips, instrumentos, efectos y parámetros tienen IDs públicos
  explícitos y estables; nunca se referencian por índice ni por etiqueta visible.
- El ID de composición es único en el proyecto; los demás forman rutas jerárquicas a partir
  de IDs únicos dentro de cada padre público.
- Las rutas de nodo se serializan como arrays que comienzan por composición y raíz, usan IDs
  ASCII validados y tienen comparación lexicográfica canónica. Los segmentos internos viven
  en un namespace que la API pública no acepta.
- En desarrollo, el bundler adjunta archivo, línea y columna a los nodos públicos para que
  Studio y los errores enlacen al código; esa procedencia no altera identidad ni música.
- Compilador, Studio, CLI y renderer comparten diagnósticos estructurados con código, fase,
  severidad, identidad del nodo, ubicación fuente, causa y sugerencia.
- Preparación, compilación y render aceptan cancelación y emiten progreso estructurado;
  cancelar limpia todos los recursos y nunca publica un WAV parcial como válido.
- Render falla si el destino existe salvo `overwrite` explícito. Escribe un temporal en el
  mismo directorio y solo informa éxito después de validar y publicar atómicamente el WAV.
- `renderAudio(job)` es la capacidad canónica de render en Node. La CLI y el botón de
  render de Studio son adaptadores sobre ella y entregan el mismo trabajo inmutable ya
  resuelto y compilado, sin volver a interpretar inputs ni mantener motores paralelos.
- Studio inicia ese render desde una variante preparada mediante
  `POST /api/v1/variants/:variantId/render`. El usuario debe indicar un output path; la
  respuesta conserva el fingerprint/spec de la variante y expone las opciones efectivas sin
  cambiar su identidad.
- Las opciones de render se resuelven una vez con precedencia de invocación explícita,
  configuración del proyecto y default de Resona. El trabajo conserva el origen de cada
  valor y todas las superficies comparten sus descriptores, validación y semántica.
- Un proyecto puede exportar un objeto plano y síncrono desde `resona.config.ts` mediante
  `defineConfig()`. Configura entry point, directorio estático y defaults de render; sin él
  se usan `src/index.tsx`, `public/` y los defaults de Resona.
- El CLI descubre la raíz desde `--config`, el config más cercano hacia arriba o, como
  fallback, su `cwd`. La API exige una raíz absoluta; una vez resuelta, ninguna ruta depende
  de cambios posteriores del directorio de trabajo.
- Cada trabajo separa una `RenderSpec` serializable con todos los datos que determinan las
  muestras de su payload de ejecución en memoria. La spec produce un fingerprint estable;
  rutas de salida, progreso, callbacks y cancelación no forman parte de esa identidad.
- El primer corte vertical del CLI ofrece únicamente `studio`, `compositions`, `validate` y
  `render`; todos delegan en las mismas capacidades programáticas y aceptan inputs y opciones
  mediante los contratos compartidos.
- Todos los comandos ofrecen `--json`: las consultas devuelven un documento versionado y el
  render emite eventos JSON Lines tipados. En ese modo, `stdout` nunca mezcla texto informal
  con datos de automatización.
- El MVP comparte un núcleo DSP TypeScript que transporta bloques de señales `Float32`
  canónicas y mantiene en `Float64` los cálculos locales y el estado de control acordados:
  Studio lo aloja en un `AudioWorklet` y Node lo ejecuta offline mediante adaptadores
  separados.
- Particionar un mismo rango en bloques de distinto tamaño no cambia las muestras producidas.
- La aleatoriedad deriva cada valor de la seed, la ruta estable del nodo y una clave explícita;
  no usa un generador global mutable ni `Math.random()`.
- Una ruta localiza un WAV, pero su hash identifica el contenido; preparación fija hash y
  metadata en la variante e invalida esa variante si los bytes cambian antes de ejecutar.
- Una `Sequence` establece tiempo local y un rango activo; su final deja de programar
  contenido nuevo, pero no desmonta React ni destruye automáticamente voces o colas.
- Al terminar una `Sequence`, los clips dejan de aportar señal y las notas activas reciben
  release; instrumentos y efectos siguen procesando ese estado y su cola.
- La autoría admite un subconjunto puro de React: componentes funcionales, composición,
  listas y hooks de solo lectura; no admite estado, efectos, DOM, refs ni componentes async.
- La interfaz usa una sola `Track` con slots tipados de fuente, instrumento y cadena de
  efectos; una unión discriminada impide combinar fuentes de audio con instrumentos.
- Una pista admite uno o más clips de un único dominio de fuente; solapamientos de audio se
  mezclan y solapamientos de eventos se ordenan de forma determinista.
- El primer hito no publica un Player embebible; transporte y reproducción se diseñan como
  módulos reutilizables para incorporarlo después de validar Studio y renderer.
- Studio muestra selector e inputs, transporte, timeline de solo lectura, cadenas por pista,
  medidores, inspector de IR y diagnósticos, y permite publicar una variante preparada; no
  incluye waveform, piano roll ni mixer.
- Un cambio de código o inputs pausa y cancela la variante anterior, recompila desde estado
  limpio y restaura playhead y reproducción solo si la variante nueva queda lista.
- Durante playback, el cursor de frames de muestras del `AudioWorklet` gobierna el tiempo;
  la UI lo observa, pero nunca programa música mediante `requestAnimationFrame`.
- Playback solo comienza en estado `ready`, después de resolver, decodificar, compilar e
  inicializar el `AudioWorklet`; un underrun pausa y emite un diagnóstico.

## Interpretación de trabajo

Las siguientes ideas completan la visión, pero todavía deben validarse mediante diseño y
prototipos:

- Pistas, clips, instrumentos, efectos y automatizaciones son módulos reutilizables.

## Problema y oportunidad

Los DAWs están optimizados alrededor de la manipulación visual de una sesión. Ese modelo
es excelente para muchos flujos creativos, pero dificulta tratar una pieza como software:
parametrizarla con datos, generar variantes, revisar cambios, reutilizar abstracciones y
automatizar renders.

Las librerías de audio programático suelen resolver síntesis, planificación temporal o DSP,
pero no necesariamente ofrecen un modelo integrado de composición, una experiencia de
desarrollo interactiva y una ruta coherente hasta el artefacto final.

Resona intenta ocupar ese espacio intermedio: **capacidades de producción musical con el
modelo de trabajo de un framework de software**.

## Principios del producto

### La fuente del proyecto es versionable

La composición no vive primariamente en un archivo opaco controlado por una UI. Código,
datos declarativos y referencias de recursos forman una fuente canónica que todas las
superficies deben interpretar. Esto no exige escribir cada nota directamente en TSX.

El alcance inicial reconoce como fuente TypeScript/TSX, `resona.config.ts`, archivos JSON
importados explícitamente y validados mediante schema, y recursos WAV referenciados desde el
proyecto. No descubre YAML, bases de datos ni un formato propietario de sesión como entradas
implícitas.

El bundle, `CompositionIR`, `ExecutionPlan`, `RenderSpec`, fingerprints, cachés, previews y
WAV renderizados son artefactos derivados. Sus contratos pueden estar versionados y algunos
pueden persistirse para inspección o rendimiento, pero se regeneran desde la fuente y nunca
se editan como una segunda verdad.

El principio está registrado en el
[ADR 0001](adr/0001-versionable-source-as-source-of-truth.md) y su frontera concreta en el
[ADR 0057](adr/0057-explicit-canonical-source-boundary.md).

### La composición es declarativa

El autor expresa qué elementos existen, cuándo ocurren, cómo se conectan y cómo se
procesan. No controla directamente cada muestra desde la capa declarativa.

La interfaz pública inicial expresa esa declaración mediante componentes TSX y React. Su
evaluación produce un modelo musical independiente; React no participa del procesamiento
de audio. La decisión está registrada en el
[ADR 0002](adr/0002-tsx-as-primary-authoring-interface.md).

### Audio, MIDI y efectos son conceptos de primera clase

Un clip de audio, una secuencia de eventos MIDI, un instrumento y una cadena de
efectos pertenecen al mismo modelo de composición.

### La componibilidad es una capacidad musical

Una introducción, un patrón rítmico, una cadena de mastering o un instrumento configurado
pueden encapsularse, reutilizarse y combinarse como componentes.

### Preview y render comparten semántica

Lo que se escucha durante el desarrollo debe conservar estructura, sincronización,
enrutamiento, automatización y semántica de estado cuando se renderiza offline. Dos renders
offline producen las mismas muestras si coinciden la versión de Resona, plataforma, backend,
fuente, inputs, assets, seed y configuración. Studio puede diferir numéricamente dentro de
una tolerancia documentada: conserva canales, frames y transiciones exactamente, con error
máximo por muestra de `1e-5` y error RMS de `1e-6` sobre la salida `Float32` anterior al
encoder. No se promete igualdad bit a bit entre runtimes o plataformas. El principio está
registrado en el [ADR 0004](adr/0004-offline-determinism-and-preview-parity.md) y la tolerancia
concreta en el [ADR 0058](adr/0058-studio-render-numeric-parity-budget.md). Las fronteras
numéricas compartidas se fijan en el
[ADR 0078](adr/0078-explicit-float32-audio-boundaries.md).

### La variación es explícita

Inputs, recursos, configuración y seeds forman parte del contrato de una composición.
El reloj de pared, la red o un estado global oculto no deberían cambiar un render.

### La interfaz visual no crea una segunda verdad

Studio permite elegir inputs, controlar el transporte e inspeccionar timeline, enrutamiento,
niveles, eventos y errores. La estructura musical se edita en la fuente versionable; una
timeline, un piano roll o un mixer editables quedan fuera del alcance inicial.

## Equivalencias conceptuales con Remotion

| Remotion | Resona |
| --- | --- |
| Composición visual + metadata | Composición musical + configuración temporal |
| Frames y FPS | Posiciones musicales, frames de muestras y sample rate |
| `Sequence` | Secuencia que desplaza o limita contenido en el tiempo |
| Componentes visuales | Pistas, clips, instrumentos, efectos y automatizaciones |
| Player | Reproductor embebible de una composición |
| Studio | Entorno inicial de preview, inspección y diagnóstico |
| Renderer | Motor de render offline de audio |
| CLI y APIs de Node | CLI y APIs programáticas de Resona |
| Input props | Inputs y seeds de una composición |
| Render de video | Render de mezcla, stems u otros artefactos |

La equivalencia es de producto y experiencia, no una copia literal del motor. Un frame de
video puede evaluarse como una imagen en un instante; el audio requiere avanzar estado de
instrumentos y efectos de forma continua.

La fila de Studio describe el alcance inicial imaginado para Resona, no todas las
capacidades actuales del Studio de Remotion.

### Patrones concretos que tomamos como referencia

Además del principio general code-first, Resona adopta estos patrones de Remotion:

- `registerRoot()` registra un root y ese root declara una o más composiciones.
- Cada composición puede combinar un componente, metadata, defaults y un schema de inputs.
- Las secuencias anidadas trabajan con tiempo local para poder encapsular escenas; el
  equivalente musical permitiría encapsular patrones, secciones y clips.
- Inputs validados y metadata calculada permiten generar variantes sin duplicar código.
- Studio y Player son superficies distintas: una para desarrollar y otra para embeber.
- El bundler separa el código del autor del artefacto consumido por el renderer.
- La CLI actúa como superficie de una API de render programática, no como un motor aparte.

El registro explícito de composiciones está definido en el
[ADR 0010](adr/0010-explicit-root-registration.md).

Remotion también permite que ciertas ediciones visuales persistan de vuelta al código. Es
una referencia valiosa para una futura edición visual de Resona, pero no resuelve por sí
sola el round-trip de una timeline musical, un piano roll o un mixer.

## Experiencia objetivo

### Autoría

1. El autor registra una composición con identidad, duración y configuración temporal.
2. Declara pistas y coloca clips o secuencias en posiciones musicales.
3. Conecta eventos a instrumentos y señales a efectos.
4. Expone inputs validados para parametrizar la composición.
5. Reutiliza componentes musicales propios o de terceros.

### Preview

1. Studio descubre las composiciones registradas.
2. El autor selecciona una composición y configura sus inputs.
3. Puede hacer play, pause, seek y loop.
4. Inspecciona estructura, tiempo, enrutamiento, niveles, eventos y errores.
5. Los cambios de código se reflejan con un ciclo de feedback corto.

### Render

1. El autor selecciona una composición y sus inputs desde la CLI, Studio o una API.
2. Resona valida recursos, grafo, duración y parámetros.
3. La superficie construye un trabajo inmutable resuelto y compilado.
4. La API canónica de Node parte de un estado limpio y procesa la composición offline.
5. Produce el artefacto solicitado y reporta errores o progreso de forma estructurada.

### CLI

El primer hito expone cuatro recorridos explícitos:

- `resona studio [entry]`
- `resona compositions [entry]`
- `resona validate [entry] --composition <id>`
- `resona render <entry> <composition-id> <output.wav>`

Inputs y opciones adicionales pueden provenir de flags o archivos JSON, pero conservan la
misma validación y precedencia que la API. Bundle, caché, plugins, benchmark y cloud no son
comandos del MVP.

Cada comando produce texto legible por defecto y acepta `--json`. `compositions` y
`validate` emiten un único documento JSON versionado; `render` usa JSON Lines con eventos
tipados de progreso, diagnóstico y resultado final. En modo JSON, `stdout` queda reservado
al protocolo y no contiene logs informales. Los códigos de salida son `0` para éxito, `1`
para fallas de dominio o ejecución, `2` para uso o configuración inválidos y `130` para
cancelación.

### Automatización

Un sistema puede renderizar muchas variaciones de la misma composición cambiando inputs,
recursos o seeds, sin duplicar manualmente el proyecto.

## Interfaz conceptual

La forma de `Track`, sus slots y la separación entre estructura TSX y eventos como datos son
decisiones aceptadas. Los nombres de los helpers temporales y las props concretas de
instrumentos y efectos todavía son ilustrativos:

```tsx
export const ResonaRoot = () => (
  <Composition
    id="Demo"
    component={Demo}
    prepare={prepareDemo}
    bpm={120}
    timeSignature={[4, 4]}
    durationInBars={32}
    sampleRate={48_000}
    defaultInputs={{intensity: 0.7, seed: "demo"}}
  />
);

const Demo = ({intensity}: {intensity: number}) => (
  <>
    <Track
      id="bass"
      source={
        <EventClip
          id="notes"
          from={position.musical({bar: 1, beat: 1, subdivision: 0})}
          events={bassPattern({intensity})}
        />
      }
      instrument={<PolySynth id="synth" oscillator="saw" />}
      effects={chain(
        <Gain id="level" automation={intensityCurve(intensity)} />,
        <Delay id="echo" mix={0.1 + intensity * 0.2} />,
      )}
    />

    <Track
      id="drums"
      source={
        <AudioClip
          id="loop"
          src={drums}
          from={position.musical({bar: 1, beat: 1, subdivision: 0})}
          loop
        />
      }
      effects={chain(<Gain id="level" value={0.8} />)}
    />
  </>
);
```

Los nombres concretos de `position.musical()` y `EventClip` se validarán con el prototipo;
sus fronteras conceptuales ya están definidas.

## Usuario inicial y casos de uso

La primera versión se optimiza para un músico-programador que ya trabaja con TypeScript y
quiere definir una composición parametrizable, escucharla y renderizar variantes de forma
automatizada. No busca todavía reemplazar el flujo visual de un DAW para músicos no técnicos.

Los agentes de código como Codex, Claude Code, Cursor o Kimi pueden operar un proyecto
Resona igual que operan un proyecto Remotion: modifican su fuente y usan CLI, Studio y APIs
existentes. Resona publica Agent Skills versionadas que les enseñan sus contratos y flujos;
no incorpora un agente ni un modelo de IA dentro del runtime musical. Esta decisión está
registrada en el [ADR 0054](adr/0054-versioned-agent-skills-for-coding-agents.md).

Las primeras skills forman parte de la primera versión utilizable del producto. El corpus
canónico inicial ya vive en `packages/skills/skills` y sus workflows pasan un gate
determinista contra un proyecto fixture. El conjunto cubre buenas prácticas, composición,
audio y MIDI, Studio y render. Cada skill declara exactamente la versión del release de
Resona cuyos workflows documenta; no tiene un ciclo de versiones independiente.

La instalación interoperable usa `npx skills add https://github.com/andrestobelem/resona/tree/main/packages/skills/skills`.
Los wrappers `resona skills add`, `resona skills status` y
`resona skills update` delegan en la versión fijada `skills@1.5.20`, conservan el
formato estándar de `skills-lock.json` y escriben en `.agents/skills`. `status`
es de solo lectura y distingue skills ausentes, vigentes, desactualizadas y modificadas a
partir de su identidad, release y hash. Ninguna actualización ocurre automáticamente:
`add` y `update` rechazan una skill modificada o no confiable, y solo
`--force` autoriza sobrescribirla. Después de instalar, la CLI vuelve a ejecutar el gate
determinista de metadata y workflows. La ausencia de skills no afecta autoría, reproducción
ni render. El lockfile
estándar puede contener además skills de terceros; esas entradas no se modifican.

Una skill oficial solo se publica si sus metadatos, referencias, comandos, ejemplos y
workflows pasan pruebas deterministas contra el mismo release de Resona. Las evaluaciones
con agentes concretos sirven para medir calidad y descubrir mejoras, pero inicialmente no
bloquean una publicación por su variabilidad.

Otros públicos que podrían beneficiarse más adelante incluyen:

- Equipos que generan música o audio a partir de datos.
- Productos que necesitan muchas variantes de una misma pieza.
- Diseñadores sonoros con flujos técnicos.
- Herramientas no inteligentes que necesitan modificar una composición estructurada.

Casos de uso posibles:

- Música generativa o parametrizada.
- Identidad sonora reutilizable como un sistema de diseño.
- Bandas sonoras adaptadas a datos o contenido.
- Jingles, cortinas y piezas con muchas variantes.
- Automatización de catálogos, stems o entregables.
- Herramientas musicales construidas sobre un Player o renderer embebible.

## Primer corte vertical propuesto

El primer hito debería demostrar una sola historia observable:

1. Definir una composición con audio, MIDI, un instrumento y una cadena de efectos.
2. Escucharla en una superficie de desarrollo con transporte básico.
3. Renderizar la misma composición desde una interfaz automatizable.
4. Cambiar un input y obtener una variante sin duplicar el proyecto.
5. Repetir la ejecución desde un estado limpio y obtener el comportamiento acordado.

Los casos técnicos que debe validar ese experimento están detallados en
[Arquitectura propuesta](architecture.md#validación-del-primer-prototipo).

## No objetivos iniciales

- Reemplazar Ableton Live, Logic Pro, Pro Tools u otro DAW generalista.
- Grabación multipista o edición destructiva de audio.
- Hosting de plugins VST, AU u otros formatos externos.
- MIDI hardware o interpretación en vivo.
- Exportación de archivos `.mid` o pistas con salida MIDI independiente.
- Importación o render de MP3, AAC, FLAC u otros formatos distintos de WAV.
- Resampling, layouts multicanal y perfiles de salida configurables.
- Detección automática del final de colas audibles.
- Optimización de seek mediante snapshots o cachés de estado.
- Posiciones de contenido anteriores a `1:1:0`.
- Piano roll, mixer y timeline como editores visuales completos.
- Formas de onda detalladas en la timeline inicial.
- Player embebible como paquete público.
- Routing arbitrario con feedback.
- Buses, sends, sidechain y render de stems.
- Cambios de tempo o métrica dentro de una composición.
- Colaboración en tiempo real o render distribuido en la nube.
- Garantizar resultados bit a bit entre runtimes o plataformas diferentes.
- Ejecutar la capa declarativa una vez por muestra de audio.

Estos límites acotan el primer experimento; no son una renuncia permanente.

## Criterio de éxito del primer hito

> Una composición definida mediante fuentes versionables contiene audio, MIDI, un
> instrumento y efectos con y sin estado; puede escucharse durante el desarrollo y
> renderizarse mediante una interfaz automatizable sin mantener dos versiones del proyecto.

Si ese flujo funciona, existe el núcleo distintivo de Resona. Las superficies avanzadas
pueden crecer alrededor sin redefinir el producto.

## Referencia principal

La referencia de producto es [Remotion](https://github.com/remotion-dev/remotion), en
particular su principio de que React es la fuente de verdad. Resona adapta ese principio a
una fuente versionable que puede combinar código y datos declarativos, junto con superficies
separadas para autoría, preview y render programático.

- [Composiciones y registro](https://www.remotion.dev/docs/the-fundamentals)
- [Secuencias y tiempo local](https://www.remotion.dev/docs/sequence)
- [Render parametrizado](https://www.remotion.dev/docs/parameterized-rendering)
- [Studio](https://www.remotion.dev/docs/studio)
- [Player](https://www.remotion.dev/docs/player)
- [Edición visual que persiste al código](https://www.remotion.dev/docs/visual-editing)
