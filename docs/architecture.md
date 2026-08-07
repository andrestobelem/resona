# Arquitectura y contratos

> Estado: arquitectura del prototipo ejecutable. El repositorio ya incluye motor, Studio,
> renderer, CLI y el proyecto de ejemplo; las decisiones aceptadas están enlazadas a sus ADRs
> y las extensiones futuras siguen siendo propuestas.

Los verbos normativos de este documento describen restricciones del MVP y de sus superficies
ejecutables. El [getting started](getting-started.md) documenta el recorrido práctico sin
duplicar estos contratos.

## Objetivo arquitectónico

La propuesta busca que una única composición programable alimente dos modos de ejecución:

- **Preview interactiva**, con baja latencia, transporte y feedback de desarrollo.
- **Render offline**, reproducible y capaz de avanzar más rápido que el tiempo real.

Ambos modos derivan de la misma fuente y comparten el núcleo DSP TypeScript del MVP. Deben
respetar el mismo contrato lógico de tiempo, instrumentos, efectos y mezcla, dentro de la
tolerancia numérica acordada entre runtimes.

## La diferencia esencial con el video

La idea de Remotion puede resumirse como una composición que produce una imagen para una
posición temporal. Esa abstracción no se traslada literalmente al audio:

- Un sintetizador conserva voces, envolventes, osciladores y filtros entre bloques.
- Un delay o una reverb depende de todo lo que recibió anteriormente.
- Un compresor puede necesitar lookahead y mantener detectores internos.
- Hacer seek exige reconstruir el estado previo relevante.
- El final musical y la cola audible de un efecto pueden no coincidir.

La hipótesis arquitectónica es que la capa declarativa no se ejecute muestra por muestra.
En cambio, describiría una composición que se normaliza a un grafo y una planificación
temporal; un motor especializado avanzaría ese estado en bloques de audio.

## Flujo de datos propuesto

```text
Código + datos declarativos + referencias de recursos
                         │
                         ▼
               Build / bundle del proyecto
                         │
                         ▼
          Registro y descubrimiento de composiciones
                         │
                         ▼
          Defaults + inputs + metadata calculada
                         │
                         ▼
          Evaluación declarativa → CompositionIR
                         │
                         ▼
     Resolución de recursos, tiempo, eventos y enrutamiento
                         │
                         ▼
          ExecutionPlan serializable e inmutable
                    ┌────┴──────────────┐
                    ▼                   ▼
     Servicio local → Studio       Renderer offline
           │                       Mezcla / artefactos
           ▼
     AudioWorklet en navegador
```

El bundle, `CompositionIR` y `ExecutionPlan` son artefactos distintos. El primero empaqueta
código y dependencias; la IR serializable y versionada captura lo declarado con IDs estables
y referencias al código; el plan serializable resuelve recursos, tiempo y enrutamiento para
ejecutar.

`CompositionIR` es la seam entre React y el resto del sistema. `ExecutionPlan` es la seam
entre el planificador y los adaptadores de tiempo real y offline. La decisión está registrada
en el [ADR 0013](adr/0013-versioned-ir-and-immutable-execution-plan.md).

En Studio, el adaptador de `AudioWorklet` mantiene el cursor autoritativo y reutiliza el mismo
`AudioEngine` que el renderer offline. `seek(frame)` reinicia el motor y hace preroll desde el
origen hasta el frame solicitado; `loop` repite ese mismo procedimiento en cada límite de la
duración nominal. Así PolySynth, automatización y efectos con memoria (como delay) no acumulan
estado entre iteraciones. Si el motor no produce todos los frames del quantum, el transporte se
pausa y publica el diagnóstico estructurado `audio.underrun`; la shell no avanza el playhead en
silencio.

### Fuente canónica y artefactos derivados

La fuente canónica inicial comprende módulos TypeScript/TSX, `resona.config.ts`, JSON
importado explícitamente y validado mediante schema, y referencias explícitas a recursos
WAV. Una referencia de audio se resuelve dentro del directorio estático y los bytes
correspondientes participan mediante su hash de contenido.

YAML, consultas a bases de datos y formatos propietarios de sesión no son entradas
implícitas del sistema inicial. El código de autoría puede transformar datos ya importados,
pero todo valor que contribuya a la composición debe atravesar una frontera explícita y
validable antes de producir la IR.

El bundle de autoría, `CompositionIR`, `ExecutionPlan`, `RenderSpec`, fingerprints, cachés,
previews y archivos renderizados son derivados. Versionar sus schemas permite comunicación
y compatibilidad; no los convierte en fuente editable ni autoritativa. Ante una diferencia,
Resona regenera esos artefactos desde la fuente canónica. Esta frontera está registrada en
el [ADR 0057](adr/0057-explicit-canonical-source-boundary.md).

## Responsabilidades por capa

### Build y bundling

- Compila el entry point y sus dependencias.
- Instrumenta JSX en desarrollo para capturar archivo, línea y columna sin props manuales.
- Hace disponible la fuente versionada y sus referencias de recursos.
- Produce un artefacto de autoría para Node, que descubre y evalúa composiciones.
- No incorpora el bundle del proyecto a la aplicación web de Studio.
- No ejecuta DSP ni sustituye la representación musical normalizada.

El servicio local de Node es la única autoridad que carga el bundle de autoría, ejecuta el
registro, valida inputs, prepara la variante, evalúa TSX y compila el plan. El bundle de la
UI de Studio es independiente y no contiene código del proyecto. Esta decisión está
registrada en el [ADR 0049](adr/0049-author-code-evaluates-only-in-node.md).

Cada compilación exitosa produce un bundle Node inmutable identificado por `buildId`. Crear
una variante inicia un worker nuevo que carga ese build, recibe configuración e inputs
congelados y devuelve exclusivamente descripciones, IR, plan y diagnósticos serializables.
El worker se destruye al completar o cancelar, por lo que módulos y globals no sobreviven a
otra variante.

Un error de build no sobrescribe el último artefacto válido, que puede conservarse para
comparación y diagnóstico; Studio lo marca obsoleto y no permite reproducirlo como si
correspondiera a la fuente actual. El worker limita ciclo de vida y facilita cancelación,
pero ejecuta código confiable y no es un sandbox. La decisión está registrada en el
[ADR 0052](adr/0052-fresh-worker-per-variant.md).

### Configuración del proyecto

Un proyecto puede declarar `resona.config.ts` y exportar mediante `defineConfig()` un objeto
plano, síncrono y validable. El MVP reconoce al menos `entry`, `staticDir` y defaults de
render. El módulo puede aprovechar TypeScript para construir el objeto, pero el valor
exportado no contiene callbacks, promesas ni instancias opacas.

Sin configuración se usan `src/index.tsx`, `public/` y los defaults de render de Resona bajo
la raíz de proyecto resuelta por la superficie. CLI y API pueden sobrescribir valores de
acuerdo con la precedencia ya definida. La configuración efectiva y la procedencia de cada
opción quedan congeladas al construir el trabajo. La decisión está registrada en el
[ADR 0043](adr/0043-optional-typed-project-config.md).

El CLI resuelve la raíz con una regla ordenada: el directorio del archivo indicado por
`--config`; si no se indicó, el primer `resona.config.ts` encontrado al ascender desde el
`cwd`; si no existe, el propio `cwd`. La API no hace esa búsqueda: `createProject({root})`
exige una ruta absoluta y puede recibir un config explícito.

Después de crear el proyecto, `entry`, `staticDir` y toda otra ruta relativa se resuelven
contra la raíz congelada. Cambiar el directorio de trabajo del proceso no altera una
operación existente. La política está registrada en el
[ADR 0044](adr/0044-explicit-stable-project-root.md).

### Capa de autoría declarativa

- Registra composiciones y sus metadatos.
- Evalúa componentes y abstracciones reutilizables.
- Recibe y valida inputs explícitos.
- Produce pistas, secuencias, clips, eventos, instrumentos, efectos, automatizaciones y
  enrutamiento.
- Reporta errores con referencias útiles al código del autor.

La interfaz pública inicial de esta capa se basa en React y TypeScript, como registra el
[ADR 0002](adr/0002-tsx-as-primary-authoring-interface.md). Su salida es un modelo musical
declarativo independiente de React, no audio.

La autoría admite componentes funcionales, fragments, condiciones, listas y hooks de solo
lectura provistos por Resona para inputs y contexto musical. Cada variante realiza una
evaluación pura y finita. `useState`, `useEffect`, DOM, refs y componentes async no forman
parte del contrato; I/O y trabajo asíncrono viven en preparación. Lint y diagnósticos de
runtime deben hacer accionables estas restricciones. La decisión está registrada en el
[ADR 0019](adr/0019-pure-declarative-react-authoring.md).

Siguiendo el patrón de Remotion, un entry point llama a `registerRoot()` y ese root declara
una o más composiciones. Cada composición tiene un ID estable, componente TSX, schema,
inputs por defecto y metadata musical. Studio, API y CLI descubren el mismo registro; no
existe un manifest paralelo. La decisión está registrada en el
[ADR 0010](adr/0010-explicit-root-registration.md).

### Resolución de inputs y metadata

El patrón de referencia es:

```text
defaults + inputs provistos
          │
          ▼
 merge superficial y validación
          │
          ▼
 cálculo de metadata
          │
          ▼
inputs y metadata finales
          │
          ▼
evaluación de la composición
```

Los inputs se limitan a valores JSON serializables y referencias explícitas a recursos. Una
composición parametrizada declara un schema de runtime que valida tanto sus defaults como
los valores provistos para cada ejecución; Studio puede derivar controles de ese mismo
contrato. Funciones, instancias de clases y estado global no cruzan esta frontera. La
decisión está registrada en el
[ADR 0011](adr/0011-serializable-validated-composition-inputs.md).

El core define `InputSchema<T>` como seam propia con dos capacidades: validar un valor
desconocido y producir una `InputSchemaIR` serializable para inspección y controles. El
primer adaptador oficial, `fromZod()`, acepta Zod 4 y encapsula cualquier introspección
necesaria; ni el core ni Studio leen `_def`, `_zod` u otros detalles privados de Zod.

Studio interpreta el subconjunto de `InputSchemaIR` que sabe representar. Un campo válido
pero sin control especializado permanece editable mediante JSON y usa el mismo validador;
la falta de UI específica no crea un segundo schema. Otras librerías podrán agregar
adaptadores sin cambiar `Composition` ni Studio. La decisión está registrada en el
[ADR 0045](adr/0045-resona-owned-input-schema-boundary.md).

En el MVP, `InputSchema` es sincrónico, exige un objeto en la raíz y solo valida: el valor
aceptado conserva la misma estructura JSON que recibió. Defaults existen únicamente en
`Composition.defaultInputs`; no hay otra capa de defaults dentro del schema. Constraints y
refinements sincrónicos pueden aceptar o rechazar sin transformar el resultado.

El adaptador Zod rechaza coerción, `transform`, `preprocess`, `catch`, defaults internos y
validación asíncrona. Esta restricción evita que el valor mostrado por Studio, el recibido
por preparación y el incluido en `RenderSpec` sean tres representaciones distintas. La
decisión está registrada en el
[ADR 0046](adr/0046-input-schemas-validate-without-transforming.md).

El panel de inputs del MVP interpreta estas formas de `InputSchemaIR`:

| Forma | Control inicial |
| --- | --- |
| boolean | Checkbox |
| number | Input numérico; usa min, max y step declarados |
| string | Input de texto o textarea mediante hint explícito |
| enum | Selector |
| audio-resource | Selector restringido a `staticDir` |
| object | Grupo anidado de campos soportados |

Arrays, unions y cualquier forma sin renderer específico se editan con el editor JSON y el
mismo `InputSchema`. Studio no elige widgets a partir del nombre del campo ni mantiene
validación paralela. Esta decisión está registrada en el
[ADR 0048](adr/0048-explicit-minimal-input-controls.md).

Los valores provistos reemplazan defaults por clave en un merge superficial. Una clave
ausente conserva su default; objetos y arrays presentes se reemplazan completos, `null` se
acepta solo si el schema lo permite y `undefined` no cruza la frontera. Después del merge se
valida el objeto completo.

Studio, Player y renderer resuelven una variante con la misma semántica, aunque no
necesariamente mediante la misma API.

La prop opcional se llama `prepare` y usa esta interfaz pública:

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

`PreparationResourceResolver` ofrece inicialmente `audio(reference)`, que devuelve metadata
serializable validada y el hash del contenido. No expone buffers, handles ni rutas físicas.
El resolver queda ligado al `AbortSignal` de la llamada y registra los recursos consultados
para que Resona pueda fijarlos en la variante.

La función no recibe si la superficie prepara para preview, validación o render. Tampoco
puede transformar inputs ni devolver opciones de render. Resona valida el resultado, resuelve
la precedencia con la declaración estática y construye internamente la `ResolvedVariant`; el
autor nunca fabrica ni muta esa estructura. El nombre y la firma están registrados en el
[ADR 0060](adr/0060-prepare-composition-public-contract.md).

La declaración estática es la base. Un `duration` o `tempo` presente en el retorno reemplaza
el campo estático correspondiente; si se omite, lo conserva. `metadata` se combina por claves
de primer nivel con precedencia dinámica. Objetos anidados y arrays se reemplazan completos;
no existe merge profundo, sentinel de borrado ni valor `undefined`. Resona valida y congela
el resultado final y conserva la procedencia estática o dinámica de cada campo resuelto. La
regla está registrada en el
[ADR 0061](adr/0061-shallow-preparation-metadata-merge.md).

La decisión base está registrada en el
[ADR 0012](adr/0012-prepare-an-immutable-resolved-variant.md) y la ausencia de modo público en
el [ADR 0059](adr/0059-mode-agnostic-public-preparation.md).

La preparación puede ser asíncrona para leer metadata de recursos explícitos mediante un
resolver de Resona. No puede usar libremente red, reloj, estado global ni aleatoriedad sin
seed. Los orquestadores conocen su modo para elegir adaptadores, diagnósticos y prioridades,
pero esa información no cruza a la función de autor y no puede cambiar la variante musical.

### Normalización y compilación

La evaluación de TSX produce una `CompositionIR` serializable y versionada con estructura
musical, IDs estables y, en desarrollo, archivo, línea y columna de sus nodos públicos.
Studio inspecciona este artefacto en lugar de inferir estructura desde audio renderizado.
La procedencia puede omitirse en producción y no forma parte de la identidad musical ni del
resultado determinista.

`CompositionIR` usa una forma jerárquica y semántica encabezada por
`format: "resona/composition-ir"` y `schemaVersion`. Su raíz es una secuencia y conserva
secuencias anidadas, pistas discriminadas por dominio de señal, clips, instrumentos, efectos
y automatizaciones. Cada nodo público conserva su ID y ruta canónica; una ubicación fuente
opcional sirve solo para diagnóstico.

El vocabulario v1 es una unión discriminada cerrada:

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

type IRNodeBase = Readonly<{
  id: string;
  path: NodePath;
  source?: SourceLocation;
}>;

type SequenceChildIR = SequenceIR | TrackIR;
type TrackIR = AudioTrackIR | InstrumentTrackIR;
type InstrumentIR = PolySynthIR;
type EffectIR = GainIR | DelayIR;
```

Los IDs públicos distinguen mayúsculas y cumplen
`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`. El primer segmento de todo `NodePath` coincide con
`compositionId`; el segundo es el ID de la secuencia raíz. El `id` de cada nodo es el último
segmento de su path y un hijo extiende exactamente el path de su padre. La representación
canónica es el array JSON: nunca se unen segmentos mediante `/`.

Los paths se comparan lexicográficamente, segmento por segmento y según orden ASCII; un
prefijo más corto precede a su extensión. Los nodos generados por el compilador usan el
namespace reservado `~<kind>:<ordinal>`, con forma
`^~[a-z][a-z0-9-]*:(0|[1-9][0-9]*)$`. La API pública rechaza ese prefijo y el compilador
asigna ordinales deterministas.

`SourceLocation.file` es un path lógico no vacío relativo a la raíz estable del proyecto.
Usa `/`, no comienza con `./`, no contiene backslashes, segmentos vacíos, `.` ni `..`. Línea
y columna son enteros seguros positivos basados en uno y señalan el comienzo del nodo. Si
falta un dato se omite el objeto `source` completo. Dos instancias pueden compartir ubicación
fuente y mantener paths distintos. `NodePath` participa en identidad y orden canónico;
`SourceLocation` nunca altera música, hashes ni fingerprints. La decisión está registrada en
el [ADR 0077](adr/0077-canonical-node-paths-and-source-locations.md).

La cabecera de `CompositionIR` contiene `format`, `schemaVersion`, `compositionId`,
`duration`, `tempo`, `metadata` y `root`. `root` es una `SequenceIR`; cada secuencia contiene
secuencias o pistas. Una `AudioTrackIR` contiene `AudioClipIR`. Una `InstrumentTrackIR`
contiene `EventClipIR` y exactamente un `PolySynthIR`. Ambas pistas conservan su cadena
ordenada de efectos `GainIR | DelayIR` y sus `AutomationLaneIR`.

Una automatización apunta a `{nodePath, parameterId}`. Las notas son valores densos dentro
de `EventClipIR` y no implementan `IRNodeBase`. `AudioClipIR` conserva la
`StaticAudioReference` explícita; el planificador la sustituye por identidad de contenido al
construir el plan. No existe un nodo genérico o payload de extensión en v1: un discriminante
nuevo requiere una versión de schema nueva. Esta decisión está registrada en el
[ADR 0063](adr/0063-closed-composition-ir-v1-vocabulary.md).

La IR normaliza las formas temporales públicas a este contrato JSON canónico:

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

Numerador y denominador son enteros decimales canónicos sin signo, el denominador es
positivo y cada fracción está reducida. Cero se serializa como `"0"` y no se admiten ceros a
la izquierda. Barras, pulsos y subdivisiones se resuelven a notas negras; segundos y frames
con sample rate explícito se resuelven a segundos exactos. La variante `frames` no cruza a la
IR porque sería otra codificación del mismo tiempo absoluto.

Al recorrer secuencias anidadas, el planificador combina los componentes racionales sin
redondeos intermedios. Convierte el tiempo musical mediante el tempo resuelto, suma el
componente absoluto y aplica nearest-even una sola vez al producir cada frame del plan. La
decisión está registrada en el
[ADR 0064](adr/0064-canonical-rational-time-in-composition-ir.md).

Los nodos estructurales v1 tienen estos payloads:

```ts
type SequenceIR = IRNodeBase & Readonly<{
  type: "sequence";
  from: PositionIR;
  duration?: DurationIR;
  children: readonly (SequenceIR | TrackIR)[];
}>;

type AudioTrackIR = IRNodeBase & Readonly<{
  type: "audio-track";
  clips: readonly AudioClipIR[];
  effects: readonly EffectIR[];
  automation: readonly AutomationLaneIR[];
}>;

type InstrumentTrackIR = IRNodeBase & Readonly<{
  type: "instrument-track";
  clips: readonly EventClipIR[];
  instrument: PolySynthIR;
  effects: readonly EffectIR[];
  automation: readonly AutomationLaneIR[];
}>;

type AudioClipIR = IRNodeBase & Readonly<{
  type: "audio-clip";
  from: PositionIR;
  resource: StaticAudioReference;
  offset: AbsoluteDurationIR;
  duration?: DurationIR;
  loop: boolean;
}>;

type EventClipIR = IRNodeBase & Readonly<{
  type: "event-clip";
  from: PositionIR;
  events: readonly NoteIR[];
}>;

type NoteIR = Readonly<{
  type: "note";
  at: PositionIR;
  duration: DurationIR;
  pitch: PitchIR;
  velocity: number;
}>;
```

Todos los arrays están presentes aunque estén vacíos y conservan orden canónico y semántico.
`offset`, `loop` y `velocity` ya incluyen sus defaults respectivos de cero, `false` y `1`.
Solo la procedencia y las duraciones realmente abiertas se omiten. La identidad de una nota
deriva de la ruta del `EventClipIR` y su índice en `events`; no se serializa otro ordinal.

La raíz comienza en cero y su duración coincide con la cabecera. Una pista de audio no puede
tener instrumento y una pista instrumental tiene exactamente uno. Estas invariantes se
validan aunque la IR provenga de una frontera serializada. El contrato está registrado en el
[ADR 0065](adr/0065-composition-ir-v1-structural-payloads.md).

La cabecera y los valores escalares musicales usan estas formas:

```ts
type CompositionIR = Readonly<{
  format: "resona/composition-ir";
  schemaVersion: 1;
  compositionId: string;
  duration: DurationIR;
  tempo: TempoIR;
  metadata: JsonObject;
  root: SequenceIR;
}>;

type TempoIR = Readonly<{
  type: "constant-tempo";
  bpm: RationalIR;
  timeSignature: Readonly<{
    beatsPerBar: number;
    beatUnit: number;
  }>;
}>;

type PitchIR = Readonly<{
  type: "twelve-tet";
  semitonesFromA4: number;
}>;
```

`bpm` es positivo y distinto de cero. `beatsPerBar` es un entero seguro positivo y
`beatUnit` es además potencia de dos. `semitonesFromA4` es un entero seguro con signo y no se
restringe al rango MIDI. `metadata` siempre es un objeto, incluso cuando está vacío. El único
tempo v1 es constante; agregar segmentos o cambios de métrica exige otra versión del schema.
La decisión está registrada en el
[ADR 0066](adr/0066-composition-ir-v1-header-tempo-and-pitch.md).

El planificador convierte cada pitch mediante
`440 * 2 ** (semitonesFromA4 / 12)`. La frecuencia resultante debe ser finita, estrictamente
positiva y menor que `sampleRate / 2`; con el perfil de 48&nbsp;kHz, el máximo entero válido es
`+69` semitonos respecto de A4. Frecuencias subaudibles siguen permitidas mientras la fórmula
no produzca cero. Una función compartida realiza la validación al planificar y la conversión
en el núcleo DSP. Los valores inválidos producen un diagnóstico sin clamp, folding ni
transposición implícita. La decisión está registrada en el
[ADR 0074](adr/0074-pitch-frequency-must-be-below-nyquist.md).

Instrumento y efectos usan payloads cerrados y resueltos:

```ts
type PolySynthIR = IRNodeBase & Readonly<{
  type: "poly-synth";
  maxVoices: number;
  oscillator: "sine" | "saw" | "square";
  envelope: Readonly<{
    attack: AbsoluteDurationIR;
    decay: AbsoluteDurationIR;
    sustain: number;
    release: AbsoluteDurationIR;
  }>;
}>;

type GainIR = IRNodeBase & Readonly<{
  type: "gain";
  gain: number;
}>;

type DelayIR = IRNodeBase & Readonly<{
  type: "delay";
  time: AbsoluteDurationIR;
  feedback: number;
  mix: number;
}>;
```

`maxVoices` es un entero seguro positivo. Attack, decay y release son no negativos;
`sustain` pertenece a `[0, 1]`. `gain` es finito, no negativo y su conversión a `Float32`
también debe ser finita. El tiempo de Delay es positivo, `feedback` pertenece a `[0, 1)` y
`mix` a `[0, 1]`. Todos los defaults están materializados.

El único parámetro automatizable v1 se identifica como `"gain"` sobre un `GainIR`. Delay no
acepta automatización. Ningún procesador contiene un diccionario abierto de parámetros: un
campo nuevo exige evolucionar su unión y schema. La decisión está registrada en el
[ADR 0067](adr/0067-closed-composition-ir-v1-processor-payloads.md).

La automatización v1 usa estas formas:

```ts
type AutomationLaneIR = IRNodeBase & Readonly<{
  type: "automation-lane";
  target: Readonly<{
    nodePath: NodePath;
    parameterId: "gain";
  }>;
  points: readonly AutomationPointIR[];
}>;

type AutomationPointIR = Readonly<{
  at: PositionIR;
  value: number;
  interpolation: "hold" | "linear";
}>;
```

Una lane pertenece a una pista y solo puede apuntar a un `GainIR` de su propia cadena. Existe
como máximo una lane por target y toda lane contiene al menos un punto. Los puntos conservan
el orden declarado en la IR; el planificador los ordena por tiempo exacto. Dos tiempos
exactamente iguales fallan antes de planificar y dos tiempos distintos que redondean al mismo
frame fallan al compilar el plan.

Antes del primer punto rige `GainIR.gain`; después del último, su valor. La interpolación de
cada punto describe el segmento hacia el siguiente. Los valores cumplen las restricciones de
`GainIR.gain`. No se admiten expresiones, callbacks ni curvas opacas. La decisión está
registrada en el [ADR 0068](adr/0068-explicit-gain-automation-lanes-in-composition-ir.md).

El módulo planificador recibe una `CompositionIR` y una variante resuelta, y oculta detrás
de su interfaz estas responsabilidades:

- resuelve IDs, recursos y referencias;
- convierte posiciones a frames de muestras enteros;
- ordena eventos y automatizaciones;
- construye y valida el grafo de señal;
- detecta recursos faltantes, ciclos no permitidos y parámetros incompatibles;
- devuelve un `ExecutionPlan` serializable, inmutable e independiente de React.

`ExecutionPlan` usa `format: "resona/execution-plan"` y su propia `schemaVersion`. Compila el
árbol a arrays densos de procesadores, rutas, regiones de audio, eventos de instrumento,
automatizaciones y recursos. Los procesadores aparecen en orden topológico y se referencian
por índices locales al plan; esos índices no son identidades estables entre compilaciones.
Todo tiempo ejecutable ya está expresado en frames enteros y todo recurso por hash. Buffers,
handles y estado DSP permanecen fuera del contrato serializable.

Una tabla opcional `trace` relaciona índices del plan con rutas estables de la IR para
diagnósticos, pero no altera la identidad musical. Los adaptadores de tiempo real y offline
consumen el mismo plan; nunca reconstruyen por su cuenta jerarquía, tiempo ni routing. Esta
separación está registrada en el
[ADR 0062](adr/0062-hierarchical-ir-and-dense-execution-plan.md).

La cabecera v1 del plan fija el formato ejecutable compartido por Studio y render offline:

```ts
type ProcessorIndex = number;

type ExecutionPlan = Readonly<{
  format: "resona/execution-plan";
  schemaVersion: 1;
  compositionId: string;
  sampleRate: 48_000;
  channels: 2;
  nominalDurationFrames: number;
  masterProcessor: ProcessorIndex;

  processors: readonly ProcessorPlan[];
  routes: readonly SignalRoute[];
  resources: readonly ResolvedResourcePlan[];
  audioRegions: readonly AudioRegionPlan[];
  events: readonly InstrumentEventPlan[];
  automation: readonly AutomationLanePlan[];

  trace?: readonly PlanTrace[];
}>;
```

Todos los frames e índices son enteros seguros no negativos y cada array ejecutable está
presente aunque esté vacío. Un índice de procesador es exclusivamente su posición en
`processors`; no se duplica dentro del payload. `masterProcessor` apunta al sumador terminal
del grafo. `trace` es diagnóstico, opcional y queda fuera de la identidad musical.

El plan siempre representa la composición nominal completa a 48&nbsp;kHz y dos canales. No
conserva tempo, posiciones musicales, jerarquía React, metadata editorial ni rutas físicas.
El rango solicitado, la política de colas, el formato de salida y los callbacks pertenecen a
`RenderSpec`; el tamaño de bloque y el estado vivo pertenecen al adaptador o al motor. La
decisión está registrada en el
[ADR 0069](adr/0069-execution-plan-v1-header-and-table-boundary.md).

Los procesadores y las rutas v1 usan payloads cerrados:

```ts
type ProcessorPlan =
  | Readonly<{type: "sum"}>
  | Readonly<{
      type: "poly-synth";
      maxVoices: number;
      oscillator: "sine" | "saw" | "square";
      attackFrames: number;
      decayFrames: number;
      sustain: number;
      releaseFrames: number;
    }>
  | Readonly<{type: "gain"; gain: number}>
  | Readonly<{
      type: "delay";
      delayFrames: number;
      feedback: number;
      mix: number;
    }>;

type SignalRoute = Readonly<{
  from: ProcessorIndex;
  to: ProcessorIndex;
}>;
```

`processors` está en orden topológico, toda ruta cumple `from < to` y no existen rutas
duplicadas. Un `poly-synth` no recibe rutas; cada `gain` o `delay` recibe exactamente una.
Cada pista de audio comienza en un `sum` que mezcla sus regiones y cada pista instrumental
comienza en su `poly-synth`. La salida atraviesa los efectos exactamente en el orden
declarado y luego llega al master. Sin efectos, la fuente de la pista llega directamente al
master. Todo procesador salvo el master tiene exactamente una ruta saliente, por lo que el
plan no introduce branching ni sends implícitos.

Existe exactamente un `sum` por pista de audio y un `sum` terminal compartido. Este último
es `masterProcessor`, ocupa la última posición de `processors`, no tiene rutas salientes y
recibe las salidas de todas las pistas. Todo procesador alcanza el master y no existen nodos
huérfanos. Los sumadores de pistas de audio reciben cero o más regiones, no rutas de otros
procesadores; el master recibe rutas, no regiones.

El orden de `routes` que entran a un sumador es semántico: determina el orden exacto de las
sumas `Float32`. Para canonizar índices y rutas, el planificador recorre `root.children` en
profundidad y en su orden estable; por cada pista emite primero su fuente y luego sus efectos
declarados, y agrega el master al final. Los procesadores no contienen IDs, paths ni índices
duplicados; `trace` conserva la relación diagnóstica con la IR. La decisión está registrada
en el [ADR 0070](adr/0070-closed-execution-plan-v1-processors-and-routing.md).

Los recursos resueltos y sus colocaciones usan estas formas:

```ts
type Sha256Hash = `sha256:${string}`;
type ResourceIndex = number;

type ResolvedResourcePlan = Readonly<{
  type: "wav";
  hash: Sha256Hash;
  channels: 1 | 2;
  sampleRate: 48_000;
  frameCount: number;
}>;

type AudioRegionPlan = Readonly<{
  type: "audio-region";
  resource: ResourceIndex;
  destination: ProcessorIndex;
  startFrame: number;
  durationFrames: number;
  sourceOffsetFrame: number;
  loop: boolean;
}>;
```

Antes de recortar, el planificador valida la `CompositionIR` completa y resuelve todas sus
referencias de audio. Un WAV faltante o incompatible, un offset inexistente y un loop sin
duración explícita positiva fallan aunque sus clips queden totalmente fuera de los rangos
activos o de la duración nominal. Solo después de completar esa validación se podan las
filas ejecutables. Así, mover un límite temporal no descubre defectos que estaban ocultos.
La decisión está registrada en el
[ADR 0072](adr/0072-validate-before-pruning-execution-plan.md).

`resources` contiene una sola entrada por hash referenciado después de recortar regiones y
se ordena lexicográficamente por `hash`. El hash cumple exactamente
`sha256:[0-9a-f]{64}`. `frameCount` es un entero seguro positivo; canales y sample rate
coinciden con el perfil WAV del MVP. El `ResourceIndex` es la posición dentro de esa tabla y
no es estable entre planes. Paths, URLs, bytes fuente y buffers decodificados permanecen
fuera del plan. Durante la preparación, el trabajo asocia el descriptor con el buffer
decodificado desde los bytes que produjeron ese hash; antes de ejecutar valida sus canales y
cantidad de frames sin volver a leer el path.

Cada región apunta a un recurso existente y al `sum` no master de una pista de audio. Inicio,
duración y offset son frames enteros seguros no negativos; el offset debe ser menor que
`frameCount`. Cada región conservada tiene duración positiva y su final no supera
`nominalDurationFrames` ni el rango de enteros seguros. El planificador intersecta el clip
con los rangos activos de sus secuencias y con `[0, nominalDurationFrames)`, ajusta su
colocación y omite resultados de cero frames. Por eso, un sumador de pista puede quedar sin
regiones después del recorte.

En un frame activo, una región sin loop lee
`sourceOffsetFrame + (frame - startFrame)` y aporta cero después de `frameCount`; la
planificación conserva la advertencia por duración excedente. Con loop, lee
`sourceOffsetFrame + ((frame - startFrame) % (frameCount - sourceOffsetFrame))`. El intervalo
se repite sin crossfade. No existe resampling: un frame del recurso corresponde a uno del
plan.

`audioRegions` se ordena por `destination`, luego por `startFrame` y finalmente por el
ordinal de encuentro en el recorrido en profundidad de la IR, respetando el orden de
`children` y `clips`. Regiones idénticas no se deduplican porque representan contribuciones
que deben sumarse por separado. Ese orden de tabla determina el orden exacto de suma de
regiones simultáneamente activas. La decisión está registrada en el
[ADR 0071](adr/0071-content-addressed-resources-and-audio-regions.md).

Las notas se expanden a este stream interno, cuyos nombres evitan confundirlo con mensajes
MIDI de borde:

```ts
type NoteOccurrenceIndex = number;

type InstrumentEventPlan =
  | Readonly<{
      type: "note-release";
      frame: number;
      instrument: ProcessorIndex;
      occurrence: NoteOccurrenceIndex;
    }>
  | Readonly<{
      type: "note-attack";
      frame: number;
      instrument: ProcessorIndex;
      occurrence: NoteOccurrenceIndex;
      semitonesFromA4: number;
      velocity: number;
    }>;
```

Toda `NoteIR` tiene duración racional estrictamente positiva y se valida antes de podarla.
El planificador calcula su intervalo absoluto y recorta la liberación al menor de su final
natural, los finales de sus secuencias activas y `nominalDurationFrames`. Una nota cuyo
inicio exacto queda fuera del intervalo activo se omite. Un release puede ocurrir en
`nominalDurationFrames` para iniciar la cola audible; un attack siempre ocurre antes.

Cada ocurrencia conservada produce exactamente un attack y un release dirigidos al mismo
`poly-synth`, con `attack.frame < release.frame`. Si un intervalo exacto positivo sobrevive
al recorte pero ambos extremos redondean al mismo frame, se omite el par completo y se emite
una advertencia agregada por clip. Nunca se serializa release antes de attack para una misma
ocurrencia.

Los índices de ocurrencia son enteros seguros densos desde cero, locales al plan. Se asignan
por el orden canónico de ruta de `EventClipIR` y ordinal original entre las notas que
sobreviven. `semitonesFromA4` conserva un entero seguro con signo y `velocity` es finita y
pertenece a `[0, 1]`; cero sigue siendo un ataque musical silencioso y no adopta semántica
MIDI.

`events` se ordena por `frame`, luego `note-release` antes de `note-attack` y finalmente por
`occurrence`. El motor conserva el orden de la tabla y aplica todos los eventos de un frame
antes de generar su muestra. Si el robo de voces eliminó la asociación de una ocurrencia, su
release posterior se ignora. El rango particular de un render no poda este plan nominal;
seek y renders parciales reconstruyen el estado mediante preroll. La decisión está
registrada en el [ADR 0073](adr/0073-dense-instrument-attack-release-events.md).

La automatización ejecutable conserva puntos resueltos, no segmentos serializados:

```ts
type AutomationPointPlan = Readonly<{
  frame: number;
  value: number;
  interpolation: "hold" | "linear";
}>;

type AutomationLanePlan = Readonly<{
  type: "gain";
  target: ProcessorIndex;
  points: readonly AutomationPointPlan[];
}>;
```

Cada `target` referencia un procesador `gain` y aparece como máximo en una lane. El valor
anterior al primer punto se obtiene de `ProcessorPlan.gain` y no se duplica. Cada lane
serializada contiene al menos un punto; si la curva compilada no produce ningún cambio
ejecutable respecto del valor base, se omite. `automation` se ordena por `target`.

Los puntos originales se validan antes de recortar: sus tiempos exactos son únicos y dos
tiempos que redondean al mismo frame producen un diagnóstico aunque luego queden fuera del
rango activo. En el plan, los frames son enteros seguros estrictamente crecientes dentro de
`[0, nominalDurationFrames]`; los valores son `Float32` canónicos, finitos y no negativos.

El planificador compila la curva completa contra el intervalo semiabierto efectivo de todos
los ancestros. Al cerrarse ese intervalo inserta un punto sintético `hold` con el límite
izquierdo de la curva ya resuelta. Para una rampa lineal es su valor interpolado en el
límite; para `hold`, el valor que regía inmediatamente antes. Cambios posteriores no se
ejecutan y ese valor queda congelado durante releases y colas, incluso después de
`nominalDurationFrames`. El último punto serializado siempre usa `hold`.

Entre dos puntos consecutivos, `hold` conserva el valor izquierdo. `linear` evalúa esta
expresión:

```text
left.value + (right.value - left.value)
  * (frame - left.frame) / (right.frame - left.frame)
```

El cálculo parte siempre del frame absoluto: no acumula una pendiente por bloque. Un motor
puede derivar segmentos al cargar el plan, pero no forman parte del contrato serializado. La
decisión está registrada en el
[ADR 0075](adr/0075-frame-resolved-gain-automation-points.md).

La procedencia diagnóstica opcional usa una unión cerrada por tabla:

```ts
type PlanTrace =
  | Readonly<{
      type: "processor";
      index: ProcessorIndex;
      origin: NodePath;
    }>
  | Readonly<{
      type: "route";
      index: number;
      from: NodePath;
      to: NodePath;
    }>
  | Readonly<{
      type: "resource";
      index: ResourceIndex;
      origins: readonly NodePath[];
    }>
  | Readonly<{
      type: "audio-region";
      index: number;
      origin: NodePath;
    }>
  | Readonly<{
      type: "instrument-event";
      index: number;
      origin: Readonly<{
        clipPath: NodePath;
        eventIndex: number;
      }>;
    }>
  | Readonly<{
      type: "automation-lane";
      index: number;
      origin: NodePath;
    }>;
```

`trace` puede omitirse por completo. Cuando está presente, contiene exactamente una entrada
por cada fila de `processors`, `routes`, `resources`, `audioRegions`, `events` y
`automation`; cada índice es válido y único dentro de su tipo. Las entradas se ordenan en
ese mismo orden de tablas y luego por índice ascendente.

El procesador master apunta a la secuencia raíz y el sumador de una pista, a esa pista. Una
entrada de recurso conserva todas las rutas de clips que originaron el hash deduplicado,
ordenadas canónicamente y sin repetidos. Attack y release de una ocurrencia apuntan al mismo
`clipPath` y `eventIndex` original. Una lane apunta a su nodo de IR; sus puntos sintéticos no
inventan otra procedencia.

`SourceLocation` no se duplica: Studio y los diagnósticos unen `NodePath` con
`CompositionIR`. Agregar o quitar `trace` no cambia hashes, fingerprints, identidad musical
ni resultado. Motor, routing y medidores deben comportarse igual sin esta tabla; cualquier
mapping operativo futuro tendrá otro contrato obligatorio. La decisión está registrada en
el [ADR 0076](adr/0076-complete-non-operational-execution-plan-trace.md).

Toda composición, pista, clip, instrumento, efecto y parámetro que pueda inspeccionarse,
automatizarse o referenciarse declara un ID público estable. Los contenedores sin identidad
pública pueden recibir IDs internos deterministas durante la compilación. Índices de arrays
y etiquetas visibles no forman parte de la identidad. La regla está registrada en el
[ADR 0014](adr/0014-explicit-stable-public-node-ids.md).

El ID de composición es único dentro del proyecto. Cada otro ID público es único entre los
hijos de su padre público y la identidad canónica se forma con la ruta completa de IDs
ancestrales. Así, dos instancias de un componente reutilizable pueden repetir IDs internos
si viven bajo padres distintos. La representación y comparación exactas están registradas
en el [ADR 0077](adr/0077-canonical-node-paths-and-source-locations.md).

### Diagnósticos

Todas las fases producen diagnósticos estructurados en lugar de depender de mensajes
arbitrarios. El contrato admite código, fase, severidad, mensaje, ID de composición, ruta de
nodo, ubicación fuente, causa y sugerencia accionable. Las fases iniciales son registro,
inputs, preparación, evaluación TSX, planificación, motor y encoding.

Studio enlaza estos diagnósticos al código y CLI los formatea como texto, pero ambos consumen
el mismo objeto serializable. Una fase puede devolver varios diagnósticos y distingue
advertencias de fallas que impiden ejecutar.

### Motor de audio

El MVP implementa un único núcleo DSP en TypeScript que recibe un `ExecutionPlan` y procesa
bloques `Float32`. No depende de DOM, Web Audio ni APIs de Node. Dos adaptadores satisfacen
su interfaz: Studio lo aloja en un `AudioWorklet` y Node lo avanza offline sin esperar tiempo
real. Web Audio conecta el resultado al dispositivo, pero sus nodos no implementan el
sintetizador, `Gain` ni `Delay`. La decisión está registrada en el
[ADR 0015](adr/0015-shared-typescript-block-dsp-core.md).

La interfaz acepta cualquier cantidad positiva de frames. Los adaptadores pueden usar
bloques de 128 inicialmente, pero particionar el mismo rango de otra forma no cambia las
muestras; eventos, automatizaciones y estado se procesan por posición absoluta.

#### Política numérica canónica

Después de validar la `CompositionIR`, el planificador convierte `gain`, `sustain`,
`feedback`, `mix`, velocity y los valores de automatización mediante una única operación:

```ts
const canonicalF32 = (value: number): number => {
  const rounded = Math.fround(value);
  return Object.is(rounded, -0) ? 0 : rounded;
};

const isCanonicalF32 = (value: number): boolean =>
  Number.isFinite(value) && Object.is(value, canonicalF32(value));
```

Después de convertirlos vuelve a validar que sean finitos y satisfagan su rango semántico.
Por ejemplo, un `feedback` menor que uno en `Float64` que redondee a `1` se rechaza. El
`ExecutionPlan` solo contiene esos parámetros DSP cuando satisfacen `isCanonicalF32()` y su
rango; esto también excluye `-0`.

Las entradas y salidas de cada procesador, los buffers de audio del `Delay` y las muestras
finales anteriores al encoder son `Float32` canónicos. Una fórmula DSP calcula sus términos
locales con la aritmética `Float64` de JavaScript y redondea una vez al escribir una salida o
estado de audio. Cada aporte de una voz, región o ruta se suma en el orden canónico mediante
`acc = canonicalF32(acc + sample)`, de modo que el acumulador vuelve a ser `Float32` después
de cada aporte. `PolySynth` recorre los slots audibles desde el índice cero hasta
`maxVoices - 1`; reutilizar un slot no lo reordena. Toda escritura canónica transforma `-0`
en `+0`.

La interpolación lineal de automatización usa el frame absoluto y calcula la fórmula en
`Float64`; su resultado se convierte a `Float32` antes de aplicarlo en `Gain`. La fase del
oscilador y el cálculo de la envolvente permanecen en `Float64`, entre otras cosas para que
frecuencias subaudibles no dejen de avanzar por cuantización prematura.

La preparación convierte cada muestra WAV decodificada a `Float32` canónico y rechaza
`NaN` o infinitos. El motor comprueba el resultado antes de cada escritura canónica. Ante un
valor no finito informa el primer frame absoluto afectado; los empates se resuelven por
índice de procesador, canal y ordinal de escritura dentro del procesador. El valor no finito
no se almacena: el motor descarta su estado y el bloque pendiente, no permite reanudar esa
ejecución y el render no publica un artefacto parcial. No se convierte a cero ni se limita.
Las muestras finitas fuera de `[-1, 1]` siguen siendo válidas.

Dentro de un mismo runtime y para un mismo plan, distintas particiones en bloques deben
producir los mismos bits. Entre navegador y Node rige el presupuesto de paridad, no la
igualdad bit a bit. La decisión completa está registrada en el
[ADR 0078](adr/0078-explicit-float32-audio-boundaries.md).

Durante playback, el cursor de frames de muestras del `AudioWorklet` es el reloj
autoritativo. Studio recibe snapshots para dibujar playhead y medidores;
`requestAnimationFrame` no programa eventos, MIDI ni DSP. La decisión está registrada en el
[ADR 0021](adr/0021-audio-sample-cursor-is-the-playback-clock.md).

- Procesa eventos y audio en bloques.
- Mantiene el estado de instrumentos y efectos.
- Mezcla pistas y buses siguiendo el enrutamiento declarado.
- Aplica automatizaciones con la precisión acordada.
- Expone primitivas comunes para ejecución en tiempo real y offline.

El callback de tiempo real no debería hacer I/O, esperar locks, evaluar componentes ni
realizar asignaciones impredecibles.

### Studio

Studio es una aplicación web servida localmente.

El navegador no importa ni evalúa el bundle TSX del proyecto. Su cliente solicita al
servicio local composiciones, `InputSchemaIR`, `CompositionIR`, `ExecutionPlan`, recursos
verificados y diagnósticos. El `AudioWorklet` ejecuta el plan recibido con el núcleo DSP
compartido. El renderer offline obtiene su plan mediante exactamente la misma evaluación en
Node.

El protocolo local reserva HTTP para operaciones finitas —descubrimiento, creación de
variantes, planes y recursos direccionados por hash— y WebSocket para una futura capa de
invalidaciones, progreso y diagnósticos incrementales. El primer corte implementa HTTP; cada
envelope declara versión de protocolo, `sessionId`, `requestId` y `variantId`. Un cambio
cancela la solicitud anterior y el cliente ignora toda respuesta que ya no corresponda a su
variante vigente.

El primer servicio HTTP expone `/api/v1/session`, `/api/v1/compositions`,
`/api/v1/static-resources`, `/api/v1/variants`, `/api/v1/variants/:variantId/plan`,
`/api/v1/variants/:variantId/render` y
`/api/v1/variants/:variantId/resources/:sha256-hash`. Las respuestas usan
`resona/studio-envelope` v1; los planes, IR y recursos viajan como payload serializable, y los
paths físicos y `sourcePaths` permanecen en Node. El cliente solo puede pedir hashes que la
variante ya autorizó.

El endpoint `POST /api/v1/variants/:variantId/render` recibe una variante existente y exige un
`outputPath` explícito. Una ruta relativa se resuelve desde la raíz del proyecto y una absoluta
se conserva; `overwrite` es `false` por defecto. También acepta `startFrame`, `endFrame`,
`tailFrames` y `blockFrames`, con los defaults del renderer (`0`, duración nominal, `0` y `128`).
El servicio no recompila ni crea otro trabajo: delega el mismo `RenderJob` a
`renderAudioToFile()`, devuelve `type: "render"` con el fingerprint/spec de la variante y
`effectiveOptions`, y deja la publicación atómica y el rechazo de destinos existentes al
renderer. Las rutas dentro del proyecto se redaccionan como `<project>` en el envelope.

`/api/v1/static-resources` devuelve únicamente rutas lógicas de archivos WAV bajo el
`staticDir` configurado, ordenadas y sin seguir symlinks. Studio usa esa lista para poblar el
selector de referencias `resona/static-audio`; la validación final continúa ocurriendo en el
`InputSchema` del proyecto.

La shell del primer corte carga además los módulos privados same-origin
`/studio/audio-worklet.js` y `/studio/audio-engine.js`. Tras obtener una variante, convierte
los samples JSON autorizados a `Float32Array` y transfiere sus buffers junto con el plan en un
comando `load`. Un `AudioContext` estéreo a 48 kHz y la respuesta `ready` del worklet son
precondiciones de play/pause; un sample rate distinto falla readiness sin remuestreo. El
worklet procesa el quantum estándar, mantiene el cursor de frames y publica snapshots,
medidores pico por processor y `ended`; la shell solo dibuja ese estado. El mensaje de medidores
reutiliza el buffer reservado al cargar el motor y no crea buffers dentro del callback. Esas rutas
no llevan datos del proyecto ni bundle de autoría,
por lo que exigen Host/Origin pero no el bearer token.

Studio transfiere `ExecutionPlan` al `AudioWorklet` mediante structured clone y entrega los
buffers decodificados como `ArrayBuffer` transferibles para no copiarlos por bloque. El
worklet nunca consulta HTTP ni WebSocket desde su callback. La decisión está registrada en
el [ADR 0050](adr/0050-versioned-local-studio-protocol.md) y el
[ADR 0081](adr/0081-studio-worklet-transport-and-module-delivery.md).

El servicio escucha exclusivamente en interfaces loopback y elige un puerto disponible. Al
iniciar genera un token criptográfico de sesión que el cliente debe presentar tanto en HTTP
como al abrir el WebSocket. Valida `Host` y `Origin`, no habilita CORS general y exige token
en toda operación que modifica estado.

Los endpoints de recursos aceptan solo hashes previamente autorizados para la sesión o
variante; nunca paths físicos. Estas medidas protegen el servicio frente a páginas web
ajenas, pero no sandboxean el bundle: abrir un proyecto Resona ejecuta código local y exige
la misma confianza que ejecutar sus scripts. La decisión está registrada en el
[ADR 0051](adr/0051-loopback-token-protected-studio.md).

- Descubre composiciones registradas.
- Permite seleccionar inputs y variantes.
- Controla play, pause, seek y loop.
- Muestra una timeline de solo lectura con secuencias, pistas, clips y playhead.
- Muestra la cadena de instrumento y efectos de cada pista.
- Mide niveles por pista y master.
- Inspecciona la `CompositionIR` y sus diagnósticos.
- Publica una variante preparada con un output path explícito mediante el renderer canónico.
- Enlaza diagnósticos a la identidad del nodo y a su ubicación fuente.
- Recarga cambios con un ciclo de feedback corto.

Studio no modifica la estructura musical ni persiste cambios de vuelta a la fuente en el
alcance inicial. Los controles de inputs y transporte cambian la variante o el estado de
preview, no crean un segundo formato canónico de proyecto. Formas de onda detalladas, piano
roll y mixer quedan fuera.

Playback solo se habilita cuando recursos validados y decodificados, `ExecutionPlan` y
`AudioWorklet` están listos. El MVP no reproduce mediante streaming. Un underrun pausa el
transporte y emite un diagnóstico estructurado; no descarta frames ni avanza el playhead
silenciosamente.

Cuando cambian código o inputs, Studio pausa y cancela preparación, compilación y motor de la
variante anterior. Pide al servicio de Node una variante nueva desde estado limpio, conserva
el playhead si sigue dentro del rango y reconstruye su estado mediante preroll. Si antes
estaba reproduciendo, continúa cuando la nueva variante queda lista; si falla, permanece
pausado y muestra los diagnósticos. Nunca presenta una variante anterior como si
correspondiera al código nuevo.

### Player

El Player embebible no forma parte del primer hito. Transporte, reloj de audio y adaptador
`AudioWorklet` no deben quedar acoplados a la UI de Studio, para que una superficie
embebible pueda reutilizarlos más adelante y respetar el mismo contrato lógico.

Esto sería una decisión propia de Resona, no una copia literal: el Player de Remotion recibe
un componente y metadata directamente, sin descubrir el root ni resolver automáticamente
la composición como lo hacen otras superficies.

### Renderer

El renderer inicial se ejecuta en Node. Su capacidad canónica es la API programática
`renderAudio(job)`, que recibe un trabajo inmutable cuya variante ya fue resuelta y cuyo
plan ya fue compilado. Renderizar no vuelve a evaluar defaults, inputs, preparación ni TSX.

- Parte de un estado limpio y conocido.
- Emite un rango finito semiabierto `[inicio, fin)`, por defecto
  `[0, duración nominal)`.
- Si el inicio es posterior a cero, hace preroll silencioso desde el inicio de la composición.
- Aplica la política de cola después del fin solicitado.
- Procesa la composición offline.
- Puede renderizar más rápido que el tiempo real cuando el backend lo permite.
- Define cómo manejar colas de efectos, resampling, latencia y progreso.
- Produce una mezcla final y, eventualmente, stems u otros artefactos.

Preparación, compilación y render aceptan `AbortSignal` y emiten eventos estructurados de
progreso por fase. La cancelación es idempotente y cierra motor, archivos temporales,
decoder y encoder. El renderer escribe a un temporal y publica el WAV final de forma atómica
solo después de completarlo; una cancelación o falla no presenta un artefacto parcial como
válido.

La API `renderAudioToFile(job, { outputPath, overwrite, signal, onProgress })` adapta el
render en memoria a publicación de filesystem. Relee y valida el WAV temporal antes de
publicarlo; el resultado exitoso solo se resuelve después de la publicación. La operación
conserva el destino existente sin `overwrite: true` y elimina el temporal ante cualquier
falla. El endpoint de render de Studio es un adaptador HTTP de esta misma operación: no
mantiene un renderer ni una variante paralelos.

La atomicidad depende de que el temporal y el destino estén en el mismo filesystem y de las
garantías de `link`/`rename` de la plataforma; no se promete publicación atómica entre
dispositivos. El `fsync` del archivo protege los bytes antes de publicar, pero la durabilidad
del nombre de directorio y la limpieza posterior pueden depender del filesystem y sus
permisos.

Si el destino ya existe, la operación falla salvo que la invocación haya resuelto
`overwrite: true`; el CLI lo expone como `--overwrite`. El temporal se crea en el mismo
directorio que el destino. Antes de renombrarlo, el encoder cierra el archivo y valida su
header, longitud declarada y tamaño real. Solo después de publicar el destino se emite el
resultado exitoso. Falla o cancelación cierran y eliminan el temporal. La decisión está
registrada en el [ADR 0053](adr/0053-explicit-atomic-output-publication.md).

### CLI y API programática

El CLI del primer corte vertical expone solo estas operaciones de producto:

```text
resona studio [entry]
resona compositions [entry]
resona validate [entry] --composition <id>
resona render <entry> <composition-id> <output.wav>
```

`studio` inicia el entorno local; `compositions` evalúa el registro y enumera sus
descripciones; `validate` construye y verifica una variante sin renderizar; `render` crea un
trabajo y lo entrega a `renderAudioToFile()`, que comparte la misma ruta de render y publicación
atómica de la API. Los cuatro comandos presentan los diagnósticos
estructurados compartidos y adaptan progreso y cancelación a la terminal.

Inputs y opciones se aceptan mediante flags o archivos JSON y usan los mismos descriptores,
schemas y reglas de precedencia que la API. Bundle, caché, plugins, benchmark y cloud quedan
fuera de ese corte. La superficie está registrada en el
[ADR 0025](adr/0025-minimal-explicit-cli.md).

Todos los comandos muestran texto para humanos por defecto y aceptan `--json` como contrato
de automatización. `compositions --json` y `validate --json` escriben un documento JSON
versionado. `render --json` escribe un stream JSON Lines de envelopes tipados para progreso,
diagnósticos y resultado final. Cada envelope incluye la versión del protocolo y un
discriminante `type`.

Cuando se usa `--json`, `stdout` queda reservado exclusivamente al protocolo. Los mensajes
incidentales del proceso van a `stderr`; los diagnósticos que forman parte del resultado se
mantienen como datos estructurados. Esta decisión está registrada en el
[ADR 0026](adr/0026-versioned-cli-json-protocol.md).

El proceso usa solo cuatro códigos de salida estables:

| Código | Significado |
| ---: | --- |
| `0` | Operación exitosa; puede contener advertencias |
| `1` | Falla de validación, compilación o render |
| `2` | Invocación inválida o configuración ilegible |
| `130` | Cancelación solicitada por el usuario |

Los consumidores usan los diagnósticos y eventos tipados para conocer el detalle; no se
asigna un código numérico diferente a cada error de dominio.

### Agent Skills

Agentes de código externos consumen las mismas capacidades de descubrimiento, schema,
diagnóstico, Studio y render que una persona o cualquier automatización. Resona no define
una API de agentes paralela ni ejecuta modelos dentro del runtime.

Como Remotion, el proyecto mantiene Agent Skills de primera parte junto al código. Cada
skill declara exactamente la versión del release de Resona cuyos workflows documenta, sin
un semver independiente. Las skills documentan workflows completos y pueden componer una
skill router con referencias especializadas. La distribución seguirá el estándar Agent
Skills y priorizará instalación local en `.agents/skills`, con adaptadores o symlinks de
compatibilidad para herramientas como Claude Code.

El corpus canónico inicial está publicado en `packages/skills/skills` y no bloquea el primer
corte vertical del motor. Sus workflows ya pasan el gate determinista y el fixture de
integración del mismo release. El conjunto inicial es:

- `resona-best-practices`: router que conduce a las instrucciones especializadas.
- `resona-compositions`: proyecto, inputs, timeline, pistas y clips.
- `resona-audio-midi`: recursos, eventos, instrumentos, efectos y routing.
- `resona-studio`: reproducción, inspección y diagnóstico.
- `resona-rendering`: variantes, CLI, API y entregables.

La fuente canónica de las skills vive dentro del monorepo, bajo
`packages/skills/skills`. La instalación interoperable usa la fuente publicada
`https://github.com/andrestobelem/resona/tree/main/packages/skills/skills` mediante
`npx skills add`. Los wrappers `resona skills add` y
`resona skills update` delegan en `skills@1.5.20`, instalan solo en el
directorio estándar `.agents/skills` y conservan el formato estándar de
`skills-lock.json`. No existe un formato paralelo ni una copia canónica dentro del
proyecto consumidor. `add` y `update` rechazan una instalación modificada o no confiable;
`--force` autoriza explícitamente el reemplazo.

`resona skills status` es una operación de solo lectura: distingue `missing`,
`current`, `outdated` y `modified` usando el release declarado, la identidad
oficial y los hashes de árbol registrados por el instalador estándar. La ausencia no bloquea ni
genera una actualización implícita. `update` solo ocurre por una invocación explícita y
rechaza cambios locales o estados cuyo hash/identidad no puede verificarse; `--force`
autoriza el reemplazo. Después de instalar, la CLI vuelve a ejecutar el gate determinista
de metadata y workflows publicado por `@resona/skills`.

El `skills-lock.json` que ya existe en el checkout registra una instalación de terceros y
no es la fuente de las skills oficiales de Resona. Las instalaciones oficiales agregan sus
entradas al mismo lockfile estándar sin tocar entradas no relacionadas.

El gate local `pnpm --filter @resona/skills validate` valida el frontmatter, la versión, los
enlaces del repositorio, los comandos y las referencias de cada skill. La suite de integración
ejecuta los workflows publicados en un proyecto fixture contra la CLI y Studio del mismo
release. Una falla determinista bloquea la publicación. Evals con Codex, Claude u otros
modelos se registran como métricas complementarias y no son inicialmente un gate, porque su
resultado no es reproducible.

La decisión de producto está registrada en el
[ADR 0054](adr/0054-versioned-agent-skills-for-coding-agents.md) y el contrato de distribución
en el [ADR 0055](adr/0055-standard-agent-skills-distribution.md).
La política de calidad está registrada en el
[ADR 0056](adr/0056-deterministic-quality-gate-for-agent-skills.md).

La CLI traduce argumentos a las operaciones programáticas y delega el trabajo terminado a
`renderAudio(job)`. El botón de render de Studio hace lo mismo a través de su servicio local
de Node. Ninguna de esas superficies implementa otro renderer ni reconstruye por su cuenta
una variante al comenzar el render. Esta decisión está registrada en el
[ADR 0022](adr/0022-node-render-api-is-canonical.md).

### Resolución de opciones de render

Cada opción se describe una sola vez mediante un descriptor compartido por API, CLI y
Studio. El descriptor expresa su tipo, validación y default; los adaptadores solo traducen
su representación para cada superficie. Al construir el `RenderJob`, Resona resuelve cada
valor con esta precedencia:

1. Valor explícito de la invocación.
2. Configuración del proyecto.
3. Default de Resona.

El resultado conserva tanto el valor como su procedencia. La metadata musical pertenece a
la variante resuelta y no constituye una capa oculta capaz de sobrescribir una opción de
render. Si una opción contradice un invariante musical, la creación del trabajo falla con un
diagnóstico estructurado. La política está registrada en el
[ADR 0023](adr/0023-render-option-precedence-and-provenance.md).

### Identidad de un trabajo de render

Un `RenderJob` inmutable separa la descripción que determina el audio de los recursos
operativos necesarios para ejecutarlo:

```ts
type RenderJob = Readonly<{
  spec: RenderSpec;
  plan: ExecutionPlan;
  resources: PreparedResources;
}>;
```

`RenderSpec` es serializable y versionada. Contiene el ID de composición, las versiones del
motor y de `CompositionIR`, los inputs validados, la seed, metadata y configuración
resueltas, hashes de contenido de los assets, hashes de la IR y del plan, rango, política de
cola y opciones efectivas con su procedencia. Una serialización canónica de esa spec produce
el fingerprint del trabajo.

El `ExecutionPlan`, buffers decodificados y handles permanecen en el payload en memoria. La
ruta de salida, callbacks, eventos de progreso y `AbortSignal` son controles operativos y no
forman parte del fingerprint porque no modifican las muestras. El algoritmo exacto de
serialización y hash debe definirse antes de estabilizar el formato. La frontera está
registrada en el [ADR 0024](adr/0024-render-spec-defines-content-identity.md).

## Modelo temporal

La API pública admite dos familias de coordenadas temporales:

1. **Posición musical**: barra, pulso y subdivisión.
2. **Posición absoluta**: segundos o frames de muestras a un sample rate concreto.

Toda posición pública lleva una unidad explícita; un número sin unidad no representa tiempo.
El mapa de tempo convierte posiciones musicales en posiciones absolutas. Antes de ejecutar,
el planificador ubica eventos y automatizaciones en frames de muestras enteros.

Posiciones y duraciones son tipos distintos, inmutables, discriminados y serializables. La
API de TypeScript los construye mediante helpers; no admite números o strings crudos en las
props temporales. Esta forma es ilustrativa y los nombres pueden ajustarse durante el
prototipo:

```tsx
<Sequence
  from={position.musical({bar: 5, beat: 1, subdivision: 0})}
  duration={duration.beats(8)}
/>
```

Las familias incluyen posiciones musicales, en segundos y en frames, y duraciones en
unidades musicales, segundos y frames. CLI y archivos de configuración pueden ofrecer una
sintaxis textual como `5:1:0`, pero la convierten al valor discriminado en el borde. Esta
decisión está registrada en el
[ADR 0027](adr/0027-typed-temporal-values-at-the-public-api.md).

El primer corte usa un BPM y una métrica fijos por composición. El modelo puede
representarlos como un mapa de tempo de un solo segmento para incorporar cambios más
adelante sin redefinir cada clip; BPM no es por sí mismo una posición temporal.

Después de resolver barras y pulsos, el núcleo representa cada posición musical como una
fracción exacta de notas negras. No usa segundos en punto flotante ni una grilla PPQ fija;
un adaptador MIDI convierte desde la resolución del archivo. La conversión a frames de
muestras sucede una sola vez al compilar el plan. Esta decisión está registrada en el
[ADR 0009](adr/0009-rational-musical-time.md).

Si una posición exacta cae entre frames de muestras, se redondea al entero más cercano; un
empate exacto elige el frame par. Inicios, finales, eventos, automatizaciones y rangos usan
la misma función de conversión.

### Tiempo local y anidamiento

Una secuencia establece un origen temporal local y, opcionalmente, un rango activo para sus
descendientes. Un
patrón colocado en la barra 17 puede seguir expresando internamente sus eventos desde la
barra 1, igual que una `Sequence` de Remotion desplaza el tiempo observado por sus hijos.

La normalización convierte después esos tiempos locales anidados en la planificación
absoluta. Esto permite encapsular y reutilizar patrones, secciones y arreglos sin sumar
offsets a mano.

El final de una secuencia deja de programar contenido nuevo, pero no se traduce en un
unmount de React ni destruye automáticamente voces o colas de efectos. La secuencia es una
abstracción de compilación y su semántica está registrada en el
[ADR 0018](adr/0018-sequences-define-local-time-not-react-lifecycle.md).

El rango de secuencia es semiabierto. En su final, ningún evento nuevo comienza, los clips
de audio dejan de aportar señal y las notas activas reciben un release. Instrumentos y
efectos siguen procesando ese release y su cola según las reglas generales de estado.

Las posiciones musicales comienzan en `1:1:0`: barras y pulsos se indexan desde 1,
subdivisiones desde 0 y frames de muestras absolutos desde 0. El MVP rechaza posiciones de
contenido anteriores a ese origen; un offset de clip recorta el recurso sin desplazar el
clip antes de cero. La decisión sobre las familias de coordenadas está registrada en el
[ADR 0005](adr/0005-explicit-temporal-coordinate-units.md).

## MIDI y representación musical interna

MIDI es una capacidad de primera clase y el modelo público puede ofrecer clips y pistas
MIDI, pero no es la representación musical interna. Los mensajes MIDI se normalizan a
eventos musicales propios antes de llegar al motor; MIDI también puede funcionar más
adelante como adaptador de exportación o hardware. La decisión está registrada en el
[ADR 0006](adr/0006-midi-is-a-boundary-format.md).

Reglas para el primer prototipo:

- Un importador MIDI se normaliza a eventos musicales y no produce audio por sí solo.
- En el primer hito, alimenta un instrumento y no produce una salida MIDI independiente.
- Los eventos simultáneos mantienen un orden definido cuando ese orden afecta el resultado.
- Importar, exportar archivos `.mid` y controlar hardware son capacidades separadas.

React declara la estructura gruesa —composición, secuencias, pistas y clips—, pero no crea
un componente por nota o mensaje de control. Un `EventClip` recibe una colección inmutable
de eventos musicales serializables. Funciones generadoras e importadores MIDI producen esa
misma representación, que luego se incorpora a `CompositionIR`.

Esta frontera evita árboles React proporcionales a la densidad de notas y permite probar un
generador musical sin renderizar TSX. Los nombres concretos se validarán en el prototipo; la
decisión está registrada en el
[ADR 0028](adr/0028-tsx-structures-typed-musical-event-data.md).

### Notas como intervalos

El evento musical público mínimo es una nota con `at`, `duration`, `pitch` y `velocity`. Su
inicio y duración positiva son valores temporales tipados; pitch también tiene una representación
tipada y velocity se normaliza al rango público que se defina. La autoría no crea pares
manuales `noteOn` y `noteOff`.

El planificador valida el intervalo y lo expande a eventos de ataque y liberación unidos por
una identidad de ocurrencia. Esa identidad sirve para que el instrumento libere la voz
correcta aunque haya notas iguales superpuestas. Un importador MIDI realiza el apareamiento
antes de producir notas públicas y emite diagnósticos para mensajes incompletos. La identidad
y su forma ejecutable se fijan en los ADR 0032 y 0073; la política exacta para mensajes MIDI
incompletos queda fuera de esta decisión. El modelo público está registrado en el
[ADR 0029](adr/0029-public-notes-are-interval-events.md).

El MVP define `Pitch` como un valor discriminado en afinación temperada de doce tonos con
`A4 = 440 Hz`. Su forma canónica almacena una cantidad entera de semitonos respecto de A4.
Helpers como `pitch.note("C4")`, usando notación científica, y `pitch.midi(60)` construyen el
mismo valor; strings y números MIDI no atraviesan el modelo interno. Frecuencias arbitrarias,
detune y sistemas microtonales quedan fuera del primer hito. La decisión está registrada en
el [ADR 0030](adr/0030-typed-twelve-tone-pitch.md).

`Velocity` usa un escalar normalizado en el intervalo cerrado `[0, 1]` y vale `1` cuando la
nota no lo declara. El sintetizador mínimo multiplica linealmente por velocity la amplitud
de su envolvente. El adaptador MIDI convierte valores `1…127` mediante `n / 127`; un
`note-on` con velocity `0` conserva la semántica MIDI de `note-off` y no crea una nota
pública nueva. Valores fuera del rango producen un diagnóstico de validación. La decisión
está registrada en el [ADR 0031](adr/0031-normalized-linear-note-velocity.md).

Al normalizar una colección, el planificador asigna a cada nota una identidad de ocurrencia
derivada de la ruta canónica de su `EventClip` y del ordinal original dentro de esa
colección. Es una identidad interna: el autor no declara un ID por nota y otras partes de la
composición no pueden referenciarla.

Los eventos que caen en el mismo frame siguen un orden total: primero liberaciones y luego
ataques; dentro de cada clase, ruta canónica del clip y ordinal original. Esto hace que un
retrigger libere antes de atacar y evita depender del orden de enumeración de objetos o del
recorrido accidental del árbol. La decisión está registrada en el
[ADR 0032](adr/0032-deterministic-note-occurrence-and-ordering.md).

El primer corte usa un sintetizador polifónico mínimo basado en osciladores con envolvente
ADSR, un `Gain` sin estado y un `Delay` con estado. Son implementaciones propias y
deterministas; el planificador entrega sus parámetros ya validados y convertidos al payload
cerrado del procesador correspondiente.

`PolySynth` tiene `maxVoices` configurable y un default de `32`. Un ataque usa primero la
voz libre de menor índice. Si no quedan voces libres, roba la voz que ya esté en release con
menor amplitud instantánea; si ninguna está en release, roba la voz activa cuyo ataque sea
más antiguo. Los empates se resuelven por índice interno de voz.

Los slots conservan índices estables desde cero hasta `maxVoices - 1`. Para producir cada
muestra, `PolySynth` suma los slots audibles por índice ascendente; liberar, atacar o robar
una voz cambia el estado del slot, pero nunca reordena el conjunto.

La voz robada se reinicializa exactamente en el frame del ataque nuevo y deja de responder
a la liberación de su ocurrencia anterior. El motor cuenta estos robos y emite una
advertencia agregada para el instrumento, sin generar diagnósticos dentro de cada muestra o
bloque. La política es idéntica en tiempo real y offline y está registrada en el
[ADR 0033](adr/0033-deterministic-polyphonic-voice-stealing.md).

Cada voz contiene un solo oscilador y `PolySynth` admite las formas `sine`, `saw` y
`square`. El ataque reinicia la fase normalizada en cero; no existe un oscilador global o de
fase libre. `saw` y `square` aplican una corrección PolyBLEP definida por el núcleo
compartido para reducir aliasing sin delegar el resultado al backend.

Todas las formas producen señal nominal en `[-1, 1]` antes de velocity y envolvente. Unison,
pulse width, ruido, modulación, fase configurable y `triangle` quedan fuera del MVP. La
decisión está registrada en el
[ADR 0034](adr/0034-single-deterministic-oscillator-per-voice.md).

La envolvente de amplitud tiene segmentos lineales y estos defaults: attack `10 ms`, decay
`100 ms`, sustain `0.8` y release `200 ms`. Attack, decay y release aceptan únicamente
duraciones absolutas; sustain pertenece a `[0, 1]`. Los tiempos se convierten a frames con
la política temporal común.

El ataque parte de cero y llega a uno; decay llega a sustain; la nota conserva sustain
hasta su liberación. Release parte del valor instantáneo, incluso si la nota termina durante
attack o decay, y llega a cero antes de liberar la voz. Un tiempo cero produce una transición
instantánea en el frame del cambio y un tiempo negativo falla la validación. Curvas no
lineales y envolventes sincronizadas al tempo quedan fuera del MVP. La decisión está
registrada en el [ADR 0035](adr/0035-linear-absolute-adsr-envelope.md).

## Grafo de audio y enrutamiento

El flujo mínimo es:

```text
AudioClip ────────────────────────┐
                                 ▼
EventClip → Eventos musicales → Instrumento → Efectos → Pista → Master
```

En el primer corte, cada pista atraviesa una cadena lineal de efectos y llega directamente a
un master implícito. Se aplican estas reglas:

- El enrutamiento es acíclico.
- El orden de los efectos es estable y significativo.
- Los clips superpuestos mezclan señales; no se sobrescriben implícitamente.
- Cada composición tiene un master implícito.
- Los IDs usados para inspección y enrutamiento son únicos dentro de la composición.

Todo el grafo ejecutable del MVP transporta dos canales. Una fuente mono, incluida la salida
del `PolySynth`, se duplica con la misma amplitud en izquierda y derecha al ingresar; una
fuente estéreo conserva sus canales. `Gain` y `Delay` procesan cada canal por separado, y
clips, voces y pistas se suman muestra a muestra.

El master no normaliza, limita ni recorta automáticamente. El WAV float puede contener
muestras fuera de `[-1, 1]`; medidores y diagnósticos pueden hacer visible esa condición sin
cambiarla. Pan, otros layouts y procesamiento multicanal quedan fuera del primer hito. La
decisión está registrada en el [ADR 0039](adr/0039-fixed-stereo-summing-graph.md).

### Semántica de AudioClip

`AudioClip` declara una posición `from`, un `offset` absoluto dentro del recurso con default
cero, una `duration` opcional y si aplica `loop`. Sin duración ni loop, termina cuando se
consume el WAV desde el offset. Una duración menor recorta la contribución; una mayor deja
silencio después del recurso y produce una advertencia.

Un clip con `loop` requiere una duración positiva y repite la región desde `offset` hasta el
final del WAV. El wrap no agrega crossfade. El offset debe resolver a un frame existente y
la región de loop no puede ser vacía. Cada frame de recurso corresponde a uno del motor
porque ambos usan 48 kHz; no hay interpolación ni resampling. La decisión está registrada en
el [ADR 0040](adr/0040-audio-clip-places-exact-resource-frames.md).

Buses, sends, stems, feedback, sidechain y compensación completa de latencia quedan fuera
hasta definir sus contratos.

### Interfaz de `Track`

La interfaz pública ofrece una sola `Track` con ID y tres slots: `source`, `instrument` y una
cadena `effects` creada mediante `chain()`. Sus props forman una unión discriminada:

- una fuente de audio prohíbe `instrument`;
- una fuente de eventos exige `instrument`;
- cada fuente contiene uno o más clips del mismo dominio;
- clips de audio superpuestos se mezclan antes de los efectos;
- clips de eventos superpuestos se combinan con orden determinista;
- `chain()` acepta efectos de audio y conserva su orden;
- la automatización del primer hito se declara sobre el `Gain` identificado.

Esta forma mantiene un solo concepto de pista y permite que TypeScript rechace combinaciones
de señal inválidas antes de compilar la `CompositionIR`. Los diagnósticos de runtime siguen
validando árboles producidos dinámicamente. Una pista que combine directamente una fuente
de audio y otra de eventos queda fuera del MVP. La decisión está registrada en el
[ADR 0020](adr/0020-single-track-with-typed-signal-slots.md).

## Estado, seek y colas

Los procesadores con estado obligan a definir comportamientos explícitos:

- Cada preview reiniciada y cada render comienzan desde un estado conocido.
- El estado no puede filtrarse accidentalmente entre dos renders.
- Hacer seek reinicia el motor y procesa en silencio desde el inicio de la composición hasta
  la posición solicitada.
- Al volver al inicio de un loop, el motor reconstruye el mismo estado que produciría un
  seek a esa posición; las vueltas no acumulan estado entre sí.
- La duración nominal termina con el contenido declarado y no incluye la cola audible de
  instrumentos o efectos.
- La política de cola corta al final nominal por defecto o acepta una duración absoluta
  explícita. No intenta detectar automáticamente cuándo la señal quedó en silencio.

El preroll desde el inicio prioriza corrección y determinismo; snapshots y cachés podrán
optimizarlo más adelante sin cambiar el resultado. El `Delay` del primer prototipo comprueba
estas reglas desde el inicio. La separación entre
duración nominal y cola audible está registrada en el
[ADR 0007](adr/0007-nominal-duration-excludes-audible-tail.md).

## Automatización

Una automatización referencia un parámetro existente y compatible. El plan de ejecución
conserva su target como índice de procesador y sus posiciones como frames enteros.

El primer hito automatiza únicamente el gain mediante puntos con valores escalares e
interpolación `hold` o lineal. El plan conserva esos puntos ya ordenados y resueltos; no
rerenderiza la capa declarativa por muestra ni serializa segmentos derivados. LFOs, curvas
Bézier, callbacks arbitrarios y automatización de tempo quedan fuera.

Cada punto declara una posición, un valor y la interpolación desde ese punto hacia el
siguiente. Antes del primer punto rige el valor base de `Gain`; en el frame exacto de un
punto comienza su valor; después del último, ese valor se mantiene. `hold` conserva el valor
izquierdo hasta el próximo punto y `linear` interpola por frame entre ambos extremos.

El planificador ordena puntos por su posición exacta y después los convierte a frames. Si
dos posiciones terminan en el mismo frame, la automatización falla con un diagnóstico en
lugar de depender del orden de declaración. La evaluación usa el frame absoluto y no el
tamaño ni el inicio del bloque DSP. La decisión está registrada en el
[ADR 0038](adr/0038-sample-accurate-gain-automation.md) y su forma ejecutable en el
[ADR 0075](adr/0075-frame-resolved-gain-automation-points.md).

El valor canónico de `Gain` es un multiplicador lineal finito, no negativo y representable
en `Float32`, con default `1`. Cero silencia; valores mayores que uno amplifican. El helper
`gain.db()` convierte dB al mismo multiplicador durante la planificación, por lo que los
puntos siempre se interpolan en el dominio lineal, incluso si fueron construidos desde dB.
El multiplicador resultante y cada valor de automatización se canonizan según el
[ADR 0078](adr/0078-explicit-float32-audio-boundaries.md).

`Gain` multiplica cada muestra y no aplica clipping ni limiting. Esas transformaciones, si
se agregan, serán procesadores explícitos. La decisión está registrada en el
[ADR 0036](adr/0036-gain-uses-a-linear-multiplier.md).

### Delay de referencia

`Delay` declara `time`, `feedback` y `mix`. `time` es una duración absoluta fija, con default
`250 ms`, que se convierte a una cantidad entera mayor o igual a un frame mediante la regla
temporal común. `feedback` pertenece a `[0, 1)` y vale `0.3` por defecto; `mix` pertenece a
`[0, 1]` y vale `0.25` por defecto.

Para cada canal, en el frame actual el efecto lee `delayed` de su buffer, produce
`input * (1 - mix) + delayed * mix` y escribe `input + delayed * feedback` en la posición de
retorno. Cada canal tiene un buffer inicialmente lleno de ceros y no existe feedback
cruzado. El MVP no ofrece automatización del efecto, delay fraccional, modulación ni tiempo
sincronizado al tempo. La decisión está registrada en el
[ADR 0037](adr/0037-fixed-integer-frame-delay.md); las fronteras de redondeo de sus fórmulas
y buffers se fijan en el [ADR 0078](adr/0078-explicit-float32-audio-boundaries.md).

## Determinismo

Dos renders offline deben producir exactamente las mismas muestras cuando coinciden la
versión de Resona, la plataforma, el backend, la fuente, los inputs, los assets, la seed y
la configuración de render. Este contrato depende, como mínimo, de:

- Código, datos declarativos, inputs y configuración explícitos.
- Versiones conocidas de recursos y procesadores.
- Una seed explícita cuando la aleatoriedad deba ser reproducible.
- Orden estable de eventos y efectos.
- Estado limpio al comenzar.
- Ausencia de dependencias implícitas del reloj, la red o estado global mutable.
- Política definida de resampling y precisión numérica.

La aleatoriedad es pura y direccionada: cada valor deriva de la seed de composición, la ruta
estable del nodo y una clave explícita. Un stream secuencial requiere su propia clave y no
existe un generador global mutable. El algoritmo se versiona y una regla de lint prohíbe
`Math.random()` en código que afecta la composición. La decisión está registrada en el
[ADR 0016](adr/0016-keyed-deterministic-randomness.md).

Studio debe conservar eventos, timing, enrutamiento, automatización y semántica de estado
respecto del renderer. La comparación exige igual cantidad de canales y frames, y ubica cada
evento y transición en el mismo frame. Sobre las muestras `Float32` alineadas antes del
encoder exige `max(abs(studio[i] - offline[i])) <= 1e-5` y
`rms(studio - offline) <= 1e-6`; cualquier `NaN` o infinito falla la paridad.

No se promete igualdad bit a bit entre navegador y Node ni entre plataformas diferentes.
Los umbrales pueden endurecerse a partir de evidencia; relajarlos requiere revisar
explícitamente el contrato. El principio está registrado en el
[ADR 0004](adr/0004-offline-determinism-and-preview-parity.md) y el presupuesto numérico en
el [ADR 0058](adr/0058-studio-render-numeric-parity-budget.md). Las fronteras que sí deben
ser reproducibles dentro de un mismo runtime se fijan en el
[ADR 0078](adr/0078-explicit-float32-audio-boundaries.md).

La prueba de integración `packages/renderer/src/studio-render-parity.integration.test.ts`
compara el `AudioWorklet` y `renderAudio()` sobre el fixture de referencia, que combina input
alternativo, MIDI normalizado, clip WAV, PolySynth, Gain, Delay y automatización. Verifica el
render completo, el seek con preroll y dos ciclos de loop sin definir una segunda expectativa
musical independiente.

## Recursos de audio

Un recurso de audio existe independientemente de sus clips. La capa de recursos debería
resolver, decodificar, cachear y convertirlos sin hacer I/O dentro del callback.

El primer hito admite recursos WAV y produce WAV. MP3, AAC, FLAC y otros contenedores o
codecs quedan fuera de este alcance.

El perfil técnico inicial es:

- sample rate fijo de 48 kHz;
- recursos WAV mono o estéreo a 48 kHz;
- master estéreo;
- señales y estado de audio en `Float32` canónico, con cálculos locales y estado de control
  según el [ADR 0078](adr/0078-explicit-float32-audio-boundaries.md);
- salida WAV IEEE float de 32 bits;
- sin resampling.

Una referencia serializable localiza el WAV, pero no identifica su contenido. Durante la
preparación, el resolver valida el perfil, calcula un hash y metadata, y los fija en la
variante resuelta. El cache usa el hash como clave. Si los bytes cambian antes de ejecutar,
la variante se invalida y la operación falla con un diagnóstico en lugar de continuar con
otro audio. La decisión está registrada en el
[ADR 0017](adr/0017-content-addressed-resolved-assets.md).

El helper `staticAudio("drums/loop.wav")` crea una referencia plana y serializable a una ruta
lógica dentro del directorio estático del proyecto, cuyo default es `public/`. El proyecto
resuelve esa raíz explícitamente; el significado de la referencia nunca depende del `cwd`
del proceso. El helper normaliza separadores y rechaza rutas absolutas, segmentos que
escapen mediante `..` y rutas vacías.

La forma serializada inicial es un objeto congelado con `type: "resona/static-audio"`,
`version: 1` y `path`. El adaptador Zod ofrece un helper dedicado que valida ese objeto y
produce un campo `audio-resource` en `InputSchemaIR`. Studio puede mostrar un selector cuya
raíz es `staticDir`; ningún string común se promueve implícitamente a referencia.

Studio sirve esa raíz localmente y Node lee la misma ubicación mediante el resolver. Ni la
URL del servidor ni la ruta física forman la identidad de contenido: después de preparar,
la variante usa el hash. Assets publicados por paquetes y resolvers personalizados quedan
fuera del MVP. Esta decisión está registrada en el
[ADR 0041](adr/0041-static-audio-project-resource-references.md). La representación como
input está registrada en el
[ADR 0047](adr/0047-versioned-static-audio-input-reference.md).

El identificador de contenido inicial usa SHA-256 sobre los bytes exactos del archivo WAV y
se serializa como `sha256:<hex minúsculo>`. No se calcula sobre PCM decodificado: dos
contenedores byte a byte distintos conservan identidades distintas aunque produzcan las
mismas muestras. Tamaño y `mtime` solo pueden servir como pistas de invalidación, nunca como
identidad.

El caché de decodificación usa la tupla de hash, versión del decoder y formato interno. La
preparación entrega al `RenderJob` buffers ya verificados, por lo que cambiar el archivo
después no muta un trabajo existente; la preparación siguiente recalcula y fija otro hash.
La decisión está registrada en el
[ADR 0042](adr/0042-sha256-identifies-source-asset-bytes.md).

Quedan por definir:

- Cache e invalidación durante desarrollo.
- Política futura de resampling.
- Layouts multicanal y otras conversiones de canales.

## Superficie pública candidata

La traducción conceptual del ecosistema de Remotion sugiere estas piezas:

| Pieza candidata | Responsabilidad |
| --- | --- |
| `resona` | Componentes, tipos y primitivas públicas de composición |
| `@resona/bundler` | Build del entry point, dependencias y referencias de recursos |
| `@resona/studio` | Entorno interactivo de desarrollo |
| `@resona/player` | Preview embebible |
| `@resona/renderer` | Render programático offline |
| `@resona/cli` | Comandos de Studio, inspección y render |
| `@resona/engine` | Planificación temporal, grafo de señal y procesamiento de audio |

Los nombres y la separación en paquetes no están decididos. Primero deben demostrar que
protegen la frontera entre autoría, ejecución y superficies de usuario.

La separación conceptual de la API programática adopta esta forma:

```ts
const job = await createRenderJob(request);
await renderAudio(job);
```

`createRenderJob()` concentra descubrimiento, validación, preparación, evaluación TSX y
planificación. `renderAudio()` solo ejecuta el trabajo resultante. La CLI y Studio son
adaptadores sobre esas mismas capacidades, por lo que listar, validar y renderizar no tienen
implementaciones divergentes.

## Invariantes propuestas para el prototipo

- Toda solicitud de render tiene una composición identificable y un rango finito, aunque la
  composición pueda generar contenido sin un final intrínseco.
- Todo clip de audio referencia un recurso resoluble.
- Todo evento musical que contribuya a audio llega a un instrumento.
- El orden de una cadena de efectos forma parte del resultado.
- Toda automatización referencia un parámetro válido.
- Todo nodo público referenciable tiene un ID explícito y estable.
- Preview y render derivan de la misma `CompositionIR` y del mismo contrato de
  `ExecutionPlan`.
- El tiempo de ejecución termina normalizado a frames de muestras.
- El resultado no depende de cómo se particiona un rango en bloques de procesamiento.
- El estado de instrumentos y efectos se inicializa explícitamente.
- La aleatoriedad que deba ser reproducible se controla mediante seed.
- El enrutamiento del primer corte es acíclico.

## Riesgos principales

### Dos motores con comportamientos distintos

Studio y Node comparten el núcleo DSP, pero sus adaptadores y runtimes todavía pueden
producir diferencias. La suite de paridad debe medirlas contra la tolerancia explícita.

### Edición visual bidireccional

Permitir que código y UI editen la composición a la vez exige round-trip de código,
resolución de conflictos o un modelo serializado adicional. Es casi otro producto y no
debería entrar implícitamente en el MVP.

### Seguridad de tiempo real

Una API cómoda puede ocultar trabajo no apto para el hilo de audio. La frontera de
compilación debe impedir que carga de recursos, I/O o evaluación dinámica lleguen al callback.

### Seek inconsistente

Saltar directamente a una posición sin reconstruir estado puede cambiar instrumentos,
delays, reverbs y automatizaciones. El comportamiento correcto debe probarse con casos con
estado desde el primer corte.

### Alcance de “MIDI”

Notas internas, archivos `.mid`, hardware y salida MIDI son problemas distintos. Usar un
solo término sin distinguirlos puede deformar el modelo público.

## Decisiones de Remotion que no se heredan

- No se hereda el modelo de evaluación independiente `frame → imagen`.
- No se paralelizan bloques arbitrarios sin preservar el estado de DSP.
- No se usa React ni otra capa declarativa dentro del callback de audio.
- No se adopta el frame de video como unidad temporal musical.
- No se asumen Chrome, Webpack o FFmpeg como piezas obligatorias del motor.
- No se asocia mount/unmount de un componente con cortar inmediatamente una voz o una
  cola de efecto.

La meta es trasladar la experiencia de autoría, parametrización y herramientas, pero
reemplazar el modelo de ejecución por uno diseñado para audio continuo y con estado.

## Validación del primer prototipo

La arquitectura queda validada inicialmente si una misma composición:

1. Contiene un clip de audio y un clip MIDI.
2. Convierte eventos musicales en audio mediante el sintetizador polifónico con ADSR.
3. Procesa la señal mediante `Gain` y `Delay` en un orden declarado.
4. Automatiza un parámetro.
5. Puede reproducirse, pausarse, buscarse y loopearse en Studio.
6. Se renderiza offline desde un estado limpio.
7. Mantiene sincronización, orden de procesamiento y estado coherentes entre ambos modos.

## Referencias de Remotion

- [Repositorio y visión](https://github.com/remotion-dev/remotion)
- [Fundamentos y composiciones](https://www.remotion.dev/docs/the-fundamentals)
- [`registerRoot()`](https://www.remotion.dev/docs/register-root)
- [`Composition`](https://www.remotion.dev/docs/composition)
- [`Sequence` y tiempo local](https://www.remotion.dev/docs/sequence)
- [Resolución de inputs](https://www.remotion.dev/docs/parameterized-rendering)
- [Metadata dinámica](https://www.remotion.dev/docs/dynamic-metadata)
- [Bundler](https://www.remotion.dev/docs/bundler)
- [Renderer](https://www.remotion.dev/docs/renderer)
- [`renderMedia()`](https://www.remotion.dev/docs/renderer/render-media)
- [CLI](https://www.remotion.dev/docs/cli)
- [Studio](https://www.remotion.dev/docs/studio)
- [Player](https://www.remotion.dev/docs/player)
- [Render determinista](https://www.remotion.dev/docs/flickering)
- [Aleatoriedad con seed](https://www.remotion.dev/docs/random)
