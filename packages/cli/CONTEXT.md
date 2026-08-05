# CLI context

`@resona/cli` is a thin Node adapter over the engine and renderer. It discovers a project root,
translates flags and JSON inputs, and delegates composition enumeration, variant validation,
and audio publication to the same registry, `createRenderJob()`, and `renderAudioToFile()` used
by the programmatic API. It never evaluates TSX in the terminal process and never implements
DSP itself.

`compositions` and `validate` emit human-readable text by default. With `--json`, stdout is a
single versioned protocol document; `render --json` emits versioned JSON Lines envelopes for
progress, diagnostics, errors, and the final result. Incidental diagnostics stay in stderr.
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
