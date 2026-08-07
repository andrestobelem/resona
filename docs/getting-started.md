# Getting started

Esta guía lleva una instalación limpia desde el monorepo hasta el proyecto de ejemplo
`CantataDeLasEstaciones`. La documentación de arquitectura, producto y ADR sigue siendo la
fuente canónica de contratos; esta página solo ordena el recorrido.

## Requisitos

- Git.
- Un gestor de versiones de Node que lea `.node-version`.
- Node.js `24.18.0` como baseline (`>=24.18.0 <25`).
- pnpm `11.20.0`, provisto por el `packageManager` del repositorio y Corepack.

Node.js 26 no es todavía el baseline. Si tu shell usa otra versión, selecciona la versión de
`.node-version` antes de ejecutar gates, compilar o usar el CLI. Resona no instala Node ni
binarios globales automáticamente.

## Instalar y verificar

Ejecuta desde la raíz del repositorio:

```sh
pnpm install
pnpm check:environment
```

El preflight muestra la versión detectada y termina con un diagnóstico accionable si Node o
pnpm no coinciden con el contrato. El mismo preflight forma parte de los gates y de
`pnpm resona`.

## Construir

La compilación es explícita:

```sh
pnpm build
```

Los comandos de Resona no compilan silenciosamente. Si el artefacto del CLI no existe,
`pnpm resona -- ...` indica que debes volver a ejecutar `pnpm build`.

## Recorrido de la cantata

Define una variable para no repetir la configuración en tu shell, o copia los comandos tal
cual:

```sh
CONFIG=examples/cantata-de-las-estaciones/resona.config.ts
```

### 1. Listar composiciones

```sh
pnpm resona -- compositions --config "$CONFIG"
```

Debe aparecer una única composición pública: `CantataDeLasEstaciones`.

### 2. Validar

```sh
pnpm resona -- validate --config "$CONFIG" --composition CantataDeLasEstaciones
```

La validación evalúa la fuente TSX, resuelve la variante y comprueba la estructura sin
crear un archivo de audio.

### 3. Abrir Studio

```sh
pnpm resona -- studio --config "$CONFIG"
```

Studio escucha solo en loopback. Copia la URL que imprime el proceso y ábrela en el navegador.
Para detenerlo, vuelve a la terminal y pulsa `Ctrl-C`.

### 4. Renderizar un WAV

Después de detener Studio, publica el render en la salida ignorada del ejemplo:

```sh
pnpm resona -- render --config "$CONFIG" CantataDeLasEstaciones \
  examples/cantata-de-las-estaciones/dist/cantata-de-las-estaciones.wav --overwrite
```

`--overwrite` es explícito: sin esa opción, un destino existente se conserva y el comando
falla. El archivo es WAV float estéreo a 48 kHz. Para un smoke rápido puedes agregar
`--end-frame 4800`; el recorrido completo usa la duración nominal de la cantata.

## Atajo desde el paquete del ejemplo

Con el workspace construido también puedes ejecutar los scripts del proyecto de ejemplo:

```sh
pnpm --filter @resona/example-cantata-de-las-estaciones typecheck
pnpm --filter @resona/example-cantata-de-las-estaciones compositions
pnpm --filter @resona/example-cantata-de-las-estaciones studio
pnpm --filter @resona/example-cantata-de-las-estaciones render
```

Esos scripts delegan al wrapper raíz; no dependen de un binario global `resona`.

## Modelo musical del ejemplo

La cantata registra una composición y organiza seis movimientos con `Sequence`. Las pistas
usan `EventClip` con eventos de nota tipados y `PolySynth`; la obertura demuestra una cadena
lineal `Gain → Delay`. El texto del libreto es documentación musical, no una entrada de voz
para el renderer.

No hay importación de `.mid` en este recorrido. El modelo público de una nota contiene
inicio, duración, pitch y velocity; MIDI, cuando se incorpore en un borde, se adapta a ese
modelo en lugar de definirlo.

## Problemas frecuentes

- **Node fuera de rango**: selecciona `.node-version` con tu gestor de versiones y vuelve a
  ejecutar `pnpm check:environment`.
- **pnpm incorrecto**: habilita Corepack y usa la versión `11.20.0` declarada por el
  repositorio.
- **CLI no construido**: ejecuta `pnpm build`; `pnpm resona` no lo hace por ti.
- **Composición no encontrada**: ejecuta desde la raíz y pasa `--config` con la configuración
  del proyecto que quieres usar.
- **Destino de render existente**: agrega `--overwrite` solo cuando quieras reemplazarlo.
