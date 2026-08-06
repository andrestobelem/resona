---
name: resona-rendering
description: Create, validate, render, and publish reproducible Resona variants through the Node capability.
resona-release: 0.0.0
---

# Resona rendering

`createRenderJob()` resolves project source, inputs, seed, resources, IR, plan, spec, and
fingerprint once. `renderAudio(job)` executes that immutable job; `renderAudioToFile()` adds
validated atomic WAV publication. CLI and Studio are adapters, not alternate renderers.

## Workflow

1. Read `packages/renderer/CONTEXT.md`, `packages/cli/CONTEXT.md`, `docs/architecture.md`,
   and the render ADRs before changing output or option semantics.
2. Validate a variant with `resona validate --composition <id> --json`.
3. Render an explicit output with `resona render <entry> <composition-id> <path> --json`.
4. Use `--start-frame`, `--end-frame`, `--tail-frames`, `--block-frames`, and `--overwrite`
   only when the contract requires them. Preserve the fingerprint/spec identity and inspect
   diagnostics instead of parsing human output.
5. Verify the WAV and collision behavior through the existing renderer tests. Run
   `pnpm check:fast`, `pnpm build`, and `pnpm test:integration` before integration.

## References

- [Renderer context](https://github.com/andrestobelem/resona/blob/main/packages/renderer/CONTEXT.md)
- [CLI context](https://github.com/andrestobelem/resona/blob/main/packages/cli/CONTEXT.md)
- [Render API ADR](https://github.com/andrestobelem/resona/blob/main/docs/adr/0022-node-render-api-is-canonical.md)
- [Atomic publication ADR](https://github.com/andrestobelem/resona/blob/main/docs/adr/0053-explicit-atomic-output-publication.md)
- [Option precedence ADR](https://github.com/andrestobelem/resona/blob/main/docs/adr/0023-render-option-precedence-and-provenance.md)

## Guardrails

- Render only an immutable prepared job; never reinterpret source or defaults in the renderer.
- Require an explicit output path and preserve an existing destination without overwrite authorization.
- No edites artefactos derivados: modificá la fuente, los tests o la documentación canónica.
- Do not publish a partial, invalid, non-finite, or unverified WAV.
- Do not edit generated artifacts or confuse a render range/tail control with musical identity.
