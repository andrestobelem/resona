# Resona

Resona modela composiciones musicales programables que combinan estructura temporal,
audio, MIDI y procesamiento de señal. Este archivo fija el significado de los términos
cuando aparecen en el proyecto; que un término esté definido no confirma que pertenezca
al primer alcance.

## Organización

**Fuente del proyecto**:
Conjunto versionable de módulos TypeScript/TSX, `resona.config.ts`, JSON importado y validado
explícitamente, y referencias a recursos WAV. No exige que cada nota o parámetro esté escrito
directamente en el código ejecutable.
_Evitar_: Archivo de sesión

**Artefacto derivado**:
Representación regenerable desde la fuente del proyecto y los inputs explícitos, como el
bundle de autoría, `CompositionIR`, `ExecutionPlan`, `RenderSpec`, un fingerprint, una caché,
una preview o un WAV renderizado. Que su schema tenga versión no lo convierte en fuente de
verdad.
_Evitar_: Fuente, archivo editable

**Proyecto**:
Fuente, configuración y recursos que pueden declarar una o más composiciones.

**Proyecto de ejemplo**:
Proyecto versionado y autocontenido que demuestra el contrato público de Resona y sirve como
punto de partida reproducible para una persona nueva.
_Evitar_: Demo, fixture

**Configuración del proyecto**:
Objeto plano, síncrono y validado exportado opcionalmente por `resona.config.ts`. Define el
entry point, el directorio estático y defaults de render sin contener lógica ejecutable en
el valor resultante.

**Raíz de proyecto**:
Directorio absoluto y congelado contra el que se resuelven configuración, entry point y
recursos. El CLI puede descubrirlo; la API lo recibe explícitamente.

**Bundle de autoría**:
Artefacto de Node que contiene el entry point y sus dependencias para registrar, preparar y
evaluar composiciones. No se carga en el navegador de Studio.

**Build de autoría**:
Bundle inmutable identificado por `buildId`. Puede producir muchas variantes, pero cada una
lo evalúa desde cero en un worker propio.

**Worker de variante**:
Worker efímero que evalúa un build con inputs congelados y devuelve artefactos serializables.
Evita fugas de estado entre variantes, pero no sandboxea código malicioso.

**Servicio local de Studio**:
Proceso Node que observa el proyecto y entrega al navegador schemas, IR, planes, recursos y
diagnósticos serializables. Es la autoridad de evaluación de la autoría.

**Sesión de Studio**:
Ejecución local identificada por un token criptográfico y limitada a loopback. Autoriza
solicitudes y hashes de recursos, pero no constituye un sandbox para el proyecto.

**Variante de Studio**:
Snapshot identificado de inputs, metadata, IR, plan y recursos que el navegador considera
vigente. Respuestas de otra variante se descartan aunque hayan terminado después.

**Paridad Studio/render**:
Contrato por el que preview y render conservan canales, frames y transiciones exactamente,
y sus muestras `Float32` anteriores al encoder difieren como máximo `1e-5` por muestra y
`1e-6` de error RMS. Un `NaN` o infinito siempre viola la paridad.

**Composición**:
Unidad identificable que puede previsualizarse o renderizarse para un rango temporal
solicitado. No tiene que ser necesariamente una canción ni ser finita por naturaleza.
_Evitar_: Canción

**Secuencia**:
Contenedor que establece un rango y un origen temporal local para sus descendientes. Una
secuencia puede contener clips, pistas u otras secuencias. Su final no implica destruir
automáticamente voces ni colas de procesamiento.

**Pista**:
Contenedor de contenido temporal y procesamiento con una ubicación definida en el flujo
de señal. Una pista no es lo mismo que un canal de audio o un canal MIDI.

**Clip**:
Colocación temporal acotada de contenido dentro de una pista.
_Evitar_: Bloque

**Evento de nota**:
Intervalo musical tipado con inicio, duración, pitch y velocity que alimenta un instrumento;
su representación pública no separa ataques y liberaciones.
_Evitar_: Par note-on/note-off, evento MIDI cuando no se habla del formato de borde

## Tiempo

**Timeline**:
Orden temporal común en el que se ubican los elementos de una composición.

**Barra**:
Unidad musical que agrupa una cantidad de pulsos según la métrica vigente. En una posición
como `1:1:0`, el primer campo representa una barra.

**Métrica**:
Patrón que organiza los pulsos de una barra, por ejemplo `4/4` o `6/8`.
_Evitar_: Compás, cuando pueda confundirse con una barra

**Posición musical**:
Ubicación expresada en barras, pulsos y subdivisiones, independiente de su conversión a
tiempo absoluto. Barras y pulsos comienzan en 1; subdivisiones comienzan en 0, por lo que
`1:1:0` es el inicio de la composición. En TypeScript se representa como un valor
discriminado creado por un helper; la forma textual se limita a adaptadores de borde.

**Posición absoluta**:
Ubicación temporal independiente del mapa de tempo, expresada con una unidad explícita
como segundos o frames de muestras.
_Evitar_: Tiempo, cuando no indique la coordenada ni la unidad

**Duración temporal**:
Extensión sin un origen propio, expresada como un valor discriminado en unidades musicales,
segundos o frames de muestras. No es intercambiable con una posición.

**Frame de muestras**:
Una muestra simultánea por cada canal de audio en una posición absoluta del motor. El
término evita confundir una unidad temporal con un recurso de audio muestreado.
Los frames de muestras comienzan en 0.
_Evitar_: Sample

**Duración nominal**:
Extensión temporal declarada del contenido de una composición o rango. No incluye la señal
que instrumentos o efectos puedan producir después de su final.

**Cola audible**:
Señal producida después de la duración nominal debido al estado de instrumentos o efectos,
como el release de una voz o las repeticiones de un delay.
_Evitar_: Tail

**Rango de render**:
Intervalo finito semiabierto cuya señal se emite en un render. El preroll anterior y la cola
audible posterior se procesan con reglas propias y no forman parte del rango.

**Mapa de tempo**:
Relación que convierte posiciones musicales en tiempo absoluto a partir del tempo y la
métrica vigentes.

**Transporte**:
Estado coordinado de una preview, incluido el playhead, la reproducción y el loop. No
forma parte por sí mismo del contenido musical. Durante playback, su posición autoritativa
proviene del cursor de frames de muestras del motor.

## Contenido y procesamiento

**Señal de audio**:
Secuencia multicanal de valores de muestra que circula entre fuentes, instrumentos,
efectos y destinos de mezcla.

**Grafo estéreo**:
Contrato ejecutable de dos canales del MVP. Las fuentes mono se duplican a ambos canales y
las fuentes estéreo se conservan antes de mezclar muestra a muestra.

**Recurso de audio**:
Fuente de audio reutilizable antes de ser colocada en una composición. Una vez resuelto, su
contenido queda identificado por hash y acompañado por metadata validada.

**Hash de recurso**:
Identidad `sha256:<hex>` calculada sobre los bytes exactos del WAV. No representa su path ni
afirma equivalencia entre archivos diferentes que decodifiquen al mismo PCM.

**Referencia de recurso**:
Valor serializable que permite localizar un recurso declarado. Una ruta es una referencia,
no la identidad de los bytes resueltos. En el MVP, `staticAudio()` crea una referencia
relativa al directorio estático del proyecto mediante un objeto etiquetado y versionado; un
string común no es una referencia.

**Directorio estático**:
Raíz local explícita para recursos del proyecto, `public/` por default. No depende del
directorio de trabajo del proceso y ninguna referencia puede escapar de ella.

**Clip de audio**:
Colocación temporal de frames de un recurso de audio. Puede recortar mediante offset y
duración o repetir hasta el final del recurso dentro de una duración explícita; no estira ni
remuestrea el contenido en el MVP.

**Pista de audio**:
Pista cuyo contenido principal ya produce señales de audio, por ejemplo mediante clips de
audio, antes de atravesar su cadena de efectos.

**Evento musical**:
Unidad temporal normalizada que representa una acción musical, como el inicio o fin de una
nota, sin depender de su codificación en un protocolo de transporte.

**Nota musical**:
Evento público expresado como un intervalo completo con inicio, duración, pitch y velocity.
El planificador lo convierte en ataque y liberación internos.

**Pitch**:
Altura musical tipada. En el MVP representa semitonos enteros en afinación temperada de doce
tonos respecto de `A4 = 440 Hz`; no es un número MIDI ni un string de nota.

**Velocity**:
Escalar de intensidad de una nota en el intervalo `[0, 1]`. Su default es `1`; el
sintetizador del MVP lo aplica linealmente a la amplitud de la envolvente.

**Identidad de ocurrencia**:
Identidad interna que vincula el ataque y la liberación compilados de una nota concreta. No
es el pitch y permite distinguir notas iguales superpuestas. En el MVP se deriva de la ruta
canónica del clip y del orden original de la nota en su colección; no es referenciable por
la autoría.

**Colección de eventos musicales**:
Datos tipados, serializables e inmutables que agrupan eventos densos generados por código o
normalizados desde un formato como MIDI. No es un árbol de componentes React.

**Clip de eventos**:
Colocación temporal acotada de una colección de eventos musicales. En el MVP alimenta un
instrumento y no produce audio por sí solo.

**Pista de eventos**:
Pista cuya fuente contiene clips de eventos y que requiere un instrumento para producir
señal de audio.

**Evento MIDI**:
Mensaje temporal expresado según MIDI. Cuando ingresa al motor se convierte en uno o más
eventos musicales; si se incorpora esa capacidad, también puede dirigirse a una salida MIDI.

**Clip MIDI**:
Representación de borde para contenido proveniente de MIDI. Una vez normalizado, Resona lo
trata como un clip de eventos musicales.

**Pista MIDI**:
Nombre de borde para una pista importada desde MIDI. El modelo normalizado la trata como una
pista de eventos; una salida MIDI independiente es una capacidad posterior.

**Instrumento**:
Procesador que consume eventos musicales y produce una señal de audio.

**Voz**:
Estado independiente con el que un instrumento polifónico reproduce una ocurrencia de nota.
Puede estar libre, activa o en release. En `PolySynth` ocupa un slot de índice estable que
también determina el orden de suma.

**Oscilador de voz**:
Fuente periódica única de una voz de `PolySynth`. En el MVP reinicia su fase en cada ataque
y produce `sine`, `saw` o `square`.

**Envolvente ADSR**:
Control de amplitud de una voz mediante attack, decay, sustain y release. En el MVP usa
tiempos absolutos y segmentos lineales; release comienza desde el nivel instantáneo.

**Robo de voz**:
Reasignación determinista de una voz todavía audible cuando un nuevo ataque supera el
límite de polifonía del instrumento.

**Efecto de audio**:
Procesador que transforma una señal de audio en otra. Los efectos de eventos o MIDI, si se
incorporan, deben nombrarse explícitamente para no confundir ambos dominios.
_Evitar_: Efecto, cuando el tipo de señal sea ambiguo

**Gain**:
Efecto sin estado cuyo parámetro canónico multiplica linealmente cada muestra. No recorta ni
limita la señal; los dB son una representación de entrada que se convierte al planificar.

**Delay**:
Efecto con estado que mezcla la entrada con una copia retrasada y realimenta parte de esta
última. En el MVP usa una cantidad fija y entera de frames y buffers separados por canal.

**Float32 canónico**:
Número redondeado con `Math.fround()` y con cero negativo normalizado a cero positivo. El
plan lo usa para parámetros de amplitud y mezcla; el motor lo usa en fronteras de señal,
estado de audio y después de cada aporte a una suma ordenada. Esos parámetros del plan solo
aceptan valores finitos idénticos a su propia canonización.

**Cadena de efectos**:
Secuencia ordenada de efectos de audio; el orden forma parte del resultado.

**Parámetro**:
Valor controlable de una composición, pista, instrumento, efecto o etapa de mezcla.
_Evitar_: Prop

**Automatización**:
Variación programada de un parámetro a lo largo del tiempo.
_Evitar_: Animación

**Punto de automatización**:
Par formado por una posición temporal y un valor de parámetro. La transición desde un punto
al siguiente sigue una interpolación `hold` o lineal declarada. El valor del punto comienza
en su frame exacto.
_Evitar_: Keyframe

## Mezcla y salida

**Bus**:
Destino que recibe y mezcla señales provenientes de una o más pistas u otros buses.

**Master**:
Destino terminal que representa la mezcla final de una composición.

**Preview**:
Evaluación interactiva de una composición para escucharla e inspeccionarla durante el
desarrollo.

**Render**:
Evaluación offline de un rango de una composición que produce un artefacto reproducible.

**Stem**:
Artefacto renderizado que aísla una pista, un bus o un grupo explícito de señales.

**Input**:
Dato serializable y validado que parametriza una composición y permite generar una
variante. Puede incluir una referencia explícita a un recurso, pero no funciones, instancias
de clases ni estado global.

**InputSchema**:
Contrato genérico propio de Resona que valida inputs y produce una descripción serializable.
Zod y otras librerías se conectan mediante adaptadores. En el MVP valida de forma sincrónica
y no transforma el valor.

**InputSchemaIR**:
Descripción serializable de la estructura y metadata editorial de un `InputSchema`. Studio
la usa para controles explícitos y recurre a edición JSON cuando no representa un campo
visualmente. No infiere controles desde nombres de propiedades.

**CompositionIR**:
Representación serializable, versionada, jerárquica y semántica producida al evaluar TSX.
Conserva la estructura musical, IDs y rutas estables que Studio inspecciona; puede incluir
procedencia de código que no afecta el resultado musical. Su schema v1 usa un vocabulario
cerrado; las notas densas son datos de un clip y no nodos públicos.

**NodePath**:
Array JSON no vacío que identifica un nodo mediante `compositionId`, ID de raíz y IDs
descendientes. Es canónico, jerárquico y comparable sin unir segmentos en un string.

**SourceLocation**:
Ubicación diagnóstica opcional con archivo lógico relativo al proyecto y línea y columna
basadas en uno. No participa en identidad musical ni hashes.

**Tiempo racional de IR**:
Forma canónica de una posición o duración musical o absoluta. Usa una fracción reducida con
enteros decimales serializados como strings; expresa notas negras o segundos y nunca frames.
Posiciones y duraciones conservan discriminantes distintos.

**TempoIR**:
Tempo constante y serializable de `CompositionIR` v1. Expresa BPM como fracción racional y
la métrica mediante cantidad de pulsos por barra y una unidad de pulso potencia de dos.

**PitchIR**:
Pitch serializable de doce tonos expresado como un entero de semitonos respecto de A4. No es
un número de nota MIDI ni está limitado por su rango.

**Frecuencia ejecutable**:
Resultado de `440 * 2 ** (semitonesFromA4 / 12)`. Debe ser finito, positivo y menor que
Nyquist; a 48&nbsp;kHz admite como máximo `+69` semitonos respecto de A4.

**Procesador de IR**:
Instrumento o efecto con discriminante y payload cerrado, defaults materializados e
invariantes validadas. En v1 es `PolySynthIR`, `GainIR` o `DelayIR`; no admite una bolsa
genérica de parámetros.

**AutomationLaneIR**:
Lane pública que apunta al parámetro `gain` de un `GainIR` de su propia pista. Contiene uno o
más puntos temporales con valor e interpolación `hold` o `linear`; no contiene código ni
curvas opacas.

**Nodo estructural de IR**:
Secuencia, pista o clip público con ID, ruta, discriminante y payload serializable. Sus arrays
siempre están presentes y su orden es semántico. Una nota es un valor denso de un clip y no
un nodo estructural.

**ExecutionPlan**:
Representación serializable, versionada e inmutable que compila la IR a arrays densos y
ordenados de procesadores, rutas, regiones, eventos, automatizaciones y recursos. Usa índices
locales y frames enteros; no contiene buffers, handles ni estado DSP vivo.

**ProcessorIndex**:
Entero seguro no negativo cuya identidad es exclusivamente la posición de un procesador en
`ExecutionPlan.processors`. Solo es válido dentro del plan que lo contiene y no se serializa
también dentro del payload del procesador.

**ProcessorPlan**:
Procesador ejecutable con payload cerrado. En v1 es un sumador, `PolySynth`, `Gain` o
`Delay`. Ocupa la posición que lo identifica dentro del plan y no conserva IDs ni paths de
la IR.

**SignalRoute**:
Conexión dirigida entre dos índices de procesador. Siempre avanza en el orden topológico del
plan; el orden de las rutas que llegan a un sumador determina el orden de suma `Float32`.

**ResourceIndex**:
Entero seguro no negativo que referencia la posición de un recurso dentro de
`ExecutionPlan.resources`. Es local al plan y no sustituye su hash de contenido.

**ResolvedResourcePlan**:
Descriptor ejecutable de un WAV resuelto. Contiene hash SHA-256 de los bytes fuente, canales,
sample rate y cantidad de frames, pero no paths, URLs ni el buffer decodificado.

**AudioRegionPlan**:
Colocación ejecutable de un recurso sobre el sumador de una pista de audio. Expresa inicio,
duración y offset en frames, además de la política explícita de loop.

**Validación previa al recorte**:
Fase que valida toda la `CompositionIR` y resuelve sus referencias antes de omitir contenido
sin contribución ejecutable. Un límite temporal nunca convierte una declaración inválida en
una composición válida.

**NoteOccurrenceIndex**:
Identidad densa y local al plan que enlaza el attack y el release producidos desde una misma
`NoteIR`. Se deriva de la ruta canónica del clip y el ordinal original de la nota.

**InstrumentEventPlan**:
Evento ejecutable `note-attack` o `note-release` dirigido a un `PolySynth`. Contiene frame e
identidad de ocurrencia; el attack agrega pitch y velocity.

**AutomationPointPlan**:
Punto de automatización ejecutable con frame, valor e interpolación `hold` o `linear` hacia
el siguiente punto.

**AutomationLanePlan**:
Curva ejecutable de gain dirigida por índice a un procesador `Gain`. Usa el valor base del
procesador antes del primer punto y congela el último valor durante la cola.

**PlanTrace**:
Entrada opcional y no operativa que enlaza una fila de `ExecutionPlan` con uno o más orígenes
de `CompositionIR`. Cuando la tabla existe, su cobertura es completa; nunca afecta identidad
musical ni ejecución.

**Variante resuelta**:
Una composición bajo inputs concretos ya validados, con su metadata, recursos y
configuración final determinados. Es inmutable para una ejecución.

**Preparación de composición**:
Callback público opcional conectado mediante la prop `prepare`. Recibe ID, inputs
profundamente inmutables, cancelación y un resolver restringido; puede calcular duración,
tempo y metadata antes de evaluar TSX. No conoce el modo ni construye la variante resuelta.

**Metadata resuelta**:
Resultado inmutable de combinar metadata estática y dinámica por claves de primer nivel. Las
claves devueltas por `prepare` tienen precedencia; valores anidados y arrays se reemplazan
completos. Cada campo conserva su procedencia.

**Opción de render resuelta**:
Valor de una opción junto con su procedencia: invocación explícita, configuración del
proyecto o default de Resona, en ese orden de precedencia. API, CLI y Studio derivan esta
resolución del mismo descriptor.

**RenderSpec**:
Descripción serializable y versionada de todos los datos que pueden cambiar las muestras de
un render. Su serialización canónica determina el fingerprint del trabajo.

**RenderJob**:
Trabajo inmutable que combina una `RenderSpec` con el `ExecutionPlan` y los recursos
preparados necesarios para ejecutarla. Los controles operativos que no cambian el audio no
forman parte de su identidad de contenido.

**Publicación de render**:
Paso final que valida y renombra un temporal al destino autorizado. Un trabajo no tiene
éxito ni expone un WAV válido antes de completar esta publicación.

**Fingerprint de render**:
Identificador derivado de una `RenderSpec`. No incluye ruta de salida, callbacks, progreso
ni cancelación. La versión inicial usa SHA-256 sobre JSON sin espacios, con claves de objeto
ordenadas lexicográficamente y arrays en orden semántico.

**Dirección aleatoria**:
Tupla versionada de seed, path estable de nodo y clave explícita. Produce un valor puro en
`[0, 1)` sin avanzar estado global ni depender del orden de otras consultas.

**Evento de CLI**:
Envelope JSON versionado y discriminado por `type` que comunica progreso, diagnóstico o
resultado final durante una operación en streaming.

**Agent Skill de Resona**:
Instrucción versionada que enseña a un agente de código externo a crear, inspeccionar,
previsualizar o renderizar proyectos Resona usando las mismas superficies públicas. No es
un agente embebido en el runtime.

**Seed**:
Input explícito que controla aleatoriedad reproducible. Cada valor se deriva además de la
ruta estable del nodo y una clave declarada, sin depender de un generador global mutable.
