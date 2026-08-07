---
name: resona-studio
description: Use Resona Studio for protected preview, transport, inspection, diagnostics, and canonical render.
resona-release: 0.0.0
---

# Resona Studio

Studio is a loopback-only Node service with a token-bound browser shell. Node evaluates source
and prepares a variant; the browser receives serializable IR, `ExecutionPlan`, authorized
resources, and diagnostics. The AudioWorklet owns the sample cursor and shares the DSP core.

## Workflow

1. Read `packages/cli/CONTEXT.md`, `docs/architecture.md`, and the Studio ADRs.
2. Start the service with `resona studio --json` from the project root.
3. Use the session token and exact loopback origin for discovery, variant preparation, and
   authorized resource requests. Prepare a variant before enabling transport or render.
4. Inspect the read-only timeline, chains, meters, `CompositionIR`, `ExecutionPlan`, and
   diagnostics. Use play, pause, seek, and loop to exercise state reconstruction.
5. To publish, provide an explicit output path through the Studio render action; it delegates
   the prepared variant to the canonical Node publisher. Run `pnpm test:integration` after
   changing Studio protocol or UI behavior.

## References

- [CLI and Studio context](https://github.com/andrestobelem/resona/blob/main/packages/cli/CONTEXT.md)
- [Studio architecture](https://github.com/andrestobelem/resona/blob/main/docs/architecture.md)
- [Canonical render ADR](https://github.com/andrestobelem/resona/blob/main/docs/adr/0022-node-render-api-is-canonical.md)
- [Loopback security ADR](https://github.com/andrestobelem/resona/blob/main/docs/adr/0051-loopback-token-protected-studio.md)

## Guardrails

- Never expose the authoring bundle, bearer token, or physical resource paths to unrelated origins.
- Do not implement a second renderer or musical expectation in the browser.
- No edites artefactos derivados: modificá la fuente, los tests o la documentación canónica.
- Keep Studio read-only with respect to project source; durable edits belong in source files.
- Treat a stale variant, underrun, or parity failure as a diagnostic, not as successful playback.
