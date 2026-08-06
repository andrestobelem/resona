# CLI context

`@resona/cli` is a thin Node adapter over the engine and renderer. It discovers a project root,
translates flags and JSON inputs, and delegates composition enumeration, variant validation,
and audio publication to the same registry, `createRenderJob()`, and `renderAudioToFile()` used
by the programmatic API. It never evaluates TSX in the terminal process and never implements
DSP itself.

`studio`, `compositions`, and `validate` emit human-readable text by default. With `--json`,
`studio`, `compositions`, and `validate` emit a versioned startup/result document;
`render --json` emits versioned JSON Lines envelopes for progress, diagnostics, errors, and the
final result. Incidental diagnostics stay in stderr.
Exit codes are stable: `0` success, `1` domain failure, `2` usage or configuration failure, and
`130` cancellation.

The CLI resolves a project root from an explicit `--config`, the nearest `resona.config.ts`,
or the initial working directory. The engine API continues to require an absolute root.

`render` accepts either `[entry] <composition-id> <output.wav>` (with the entry optional when
the project can be discovered) or `--composition`/`--output`. Inputs and render options can be
provided with `--input`, `--input-file`, and `--options` (or `--render-options`); explicit flags
override values from the JSON object, which overrides project defaults. Range and execution
flags are `--start-frame`, `--end-frame`, `--tail-frames`, `--block-frames`, and
`--overwrite`. A render JSONL stream uses `format: "resona/render-event"`,
`schemaVersion: 1`, and `type: "progress" | "diagnostic" | "error" | "result"`.

`studio` starts a loopback-only HTTP service on a dynamic port and keeps it alive until SIGINT.
The static shell is served at `/`; authenticated API requests use a bearer session token and
the versioned `/api/v1/session`, `/api/v1/compositions`, `/api/v1/variants`,
`/api/v1/variants/:variantId/plan`, `/api/v1/variants/:variantId/render`, and
`/api/v1/variants/:variantId/resources/:sha256-hash` routes. Host and Origin are checked
against the exact loopback URL, and resource requests are authorized against hashes already
resolved by that variant. The browser receives serializable IR, plans, metadata, diagnostics,
and resource samples; it never receives or evaluates the authoring bundle.

`POST /api/v1/variants/:variantId/render` renders the already prepared variant through
`renderAudioToFile()`. It requires an explicit `outputPath` (relative paths resolve from the
project root; absolute paths are accepted), defaults `overwrite` to `false`, and accepts the
same operational range fields as the CLI: `startFrame`, `endFrame`, `tailFrames`, and
`blockFrames`. The `render` envelope reports the variant's unchanged fingerprint and spec,
the resolved `effectiveOptions`, output dimensions, diagnostics, and an output path redacted
to `<project>` when it is inside the project. Studio does not create a second render job or
renderer; atomic publication and collision handling remain in the renderer package.

The first Studio shell also loads the private same-origin `/studio/audio-worklet.js` and
`/studio/audio-engine.js` modules. It converts authorized JSON resource samples into
`Float32Array` buffers, transfers them with the plan through the `load` command, and enables
transport controls only after a 48 kHz stereo `AudioContext` and the worklet report `ready`.
The worklet owns the authoritative sample cursor and reports snapshots, per-processor peak
meter levels, and end-of-playback state; the shell exposes play/pause, seek, and loop controls
without duplicating DSP state. A seek reconstructs the
engine from frame zero and prerolls to the requested frame. A loop reconstructs the same state
at each nominal boundary. If the engine cannot produce the requested quantum, playback pauses
and the shell displays the structured `audio.underrun` diagnostic instead of advancing silently.
