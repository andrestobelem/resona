---
name: resona-compositions
description: Author and inspect Resona projects, compositions, inputs, sequences, tracks, and clips.
resona-release: 0.0.0
---

# Resona compositions

Use the project source as the only durable representation. A root registers compositions with
stable IDs; `createRenderJob()` derives the validated variant, `CompositionIR`, and
`ExecutionPlan` used by CLI, Studio, and renderer.

## Workflow

1. Read `CONTEXT-MAP.md`, `CONTEXT.md`, and `docs/product.md` before editing authoring code.
2. Inspect the existing entry point and config. Preserve `resona.config.ts`, the static
   directory contract, explicit IDs, typed positions, and validated input defaults.
3. Make one source change in the project's TypeScript/TSX entry point. Keep sequences,
   tracks, clips, instruments, and effects declarative; do not mutate generated IR or plans.
4. Discover the registry with `resona compositions --json` and inspect the versioned JSON
   document rather than parsing human output.
5. Validate the chosen variant with `resona validate --composition <id> --json`.
6. Run `pnpm check:fast`; use `pnpm test:integration` when the source change crosses the
   project loader, fixture, or CLI seam.

## References

- [Shared domain vocabulary](https://github.com/andrestobelem/resona/blob/main/CONTEXT.md)
- [Product contract](https://github.com/andrestobelem/resona/blob/main/docs/product.md)
- [Composition and planning architecture](https://github.com/andrestobelem/resona/blob/main/docs/architecture.md)

## Guardrails

- Keep composition IDs and node paths stable so diagnostics remain actionable.
- Do not put filesystem paths, mutable runtime state, or hidden defaults into the musical model.
- No edites artefactos derivados: modificá la fuente, los tests o la documentación canónica.
- Do not bypass input validation or infer widgets from private schema internals.
- Do not edit generated artifacts or claim a source change from an IR/plan snapshot.
