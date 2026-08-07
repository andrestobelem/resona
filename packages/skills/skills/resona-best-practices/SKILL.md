---
name: resona-best-practices
description: Route coding agents through Resona's canonical source, CLI, Studio, and renderer workflows.
resona-release: 0.0.0
---

# Resona best practices

Use this skill as the entry point for work on a Resona project. Resona treats TypeScript/TSX,
configuration, validated JSON, and WAV references as source. `CompositionIR`, `ExecutionPlan`,
render specs, previews, and WAV files are derived artifacts.

## Workflow

1. Read `AGENTS.md`, `CONTEXT-MAP.md`, the shared `CONTEXT.md`, and the context document for
   the package you will change.
2. Read accepted ADRs named by that context before changing a public seam or DSP behavior.
3. Choose one specialist skill: `resona-compositions`, `resona-audio-midi`, `resona-studio`,
   or `resona-rendering`.
4. Make the smallest source change, add a test at the observable seam, and run
   `pnpm check:fast` before presenting the result.
5. Run `pnpm test:integration` when the change crosses CLI, Studio, renderer, or fixture
   boundaries. Keep commits atomic and use a scoped Conventional Commit.

## References

- [Resona context map](https://github.com/andrestobelem/resona/blob/main/CONTEXT-MAP.md)
- [Resona architecture](https://github.com/andrestobelem/resona/blob/main/docs/architecture.md)
- [Agent Skills ADR](https://github.com/andrestobelem/resona/blob/main/docs/adr/0054-versioned-agent-skills-for-coding-agents.md)
- [Remotion Agent Skills research](https://github.com/andrestobelem/resona/blob/main/docs/research/remotion-agent-skills.md)

## Guardrails

- Never invent a second project manifest, musical model, renderer, or Studio protocol.
- Direct durable edits to source and tests; do not edit generated artifacts.
- No edites artefactos derivados: modificá la fuente, los tests o la documentación canónica.
- Do not claim a capability unless its command, API, or test exists in this release.
- Never add a co-author trailer to a commit.
