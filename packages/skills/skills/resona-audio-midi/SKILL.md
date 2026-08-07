---
name: resona-audio-midi
description: Work with WAV resources, normalized MIDI events, PolySynth, Gain, Delay, routing, and automation.
resona-release: 0.0.0
---

# Resona audio and MIDI

MIDI is a boundary format. Normalize it to Resona event data before planning. WAV resources
are resolved by the static-audio reference, verified at 48 kHz, and identified by their byte
hash. The shared TypeScript DSP core is used by Node and the AudioWorklet.

## Workflow

1. Read `CONTEXT.md`, `packages/renderer/CONTEXT.md`, and the accepted DSP ADRs before
   changing a processor, resource, or event boundary.
2. Add or update a fixture that exercises the public seam: static WAV resolution, normalized
   MIDI, PolySynth state, Gain/Delay order, routing, or sample-accurate automation.
3. Keep channel count, frame positions, `Float32` boundaries, and deterministic event order
   explicit. Use the existing helpers rather than a parallel MIDI or DSP representation.
4. Build the affected package with `pnpm --filter @resona/renderer build` and run
   `pnpm --filter @resona/renderer typecheck`.
5. Run `pnpm test:integration` for resource, render, seek, loop, or parity changes and
   `pnpm check:fast` before integration.

## References

- [Shared audio vocabulary](https://github.com/andrestobelem/resona/blob/main/CONTEXT.md)
- [Renderer context](https://github.com/andrestobelem/resona/blob/main/packages/renderer/CONTEXT.md)
- [Reference composition](https://github.com/andrestobelem/resona/blob/main/packages/engine/src/fixtures/reference-project/src/index.tsx)
- [Preview parity budget](https://github.com/andrestobelem/resona/blob/main/docs/adr/0058-studio-render-numeric-parity-budget.md)

## Guardrails

- Do not reimplement DSP in the UI, CLI, or a test-only musical expectation.
- Preserve the same `ExecutionPlan` and core between preview and offline render.
- No edites artefactos derivados: modificá la fuente, los tests o la documentación canónica.
- Reject non-finite samples and never hide a routing or timing mismatch with a tolerance.
- Do not edit generated artifacts, commit WAV outputs, or use an unverified resource path.
