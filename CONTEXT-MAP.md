# Context Map

Read the shared Resona glossary first, followed by the context documentation relevant
to the workspace being changed.

| Context              | Domain documentation              | Scope                                  |
| -------------------- | --------------------------------- | -------------------------------------- |
| Shared Resona domain | `CONTEXT.md`                      | System-wide musical domain vocabulary  |
| Engine               | `CONTEXT.md`                      | IR, execution planning, and DSP terms  |
| CLI                  | `packages/cli/CONTEXT.md`         | Discovery, validation, protocol output |
| Renderer             | `packages/renderer/CONTEXT.md`    | Offline DSP execution and WAV encoding |
| Zod input adapter    | `packages/zod/CONTEXT.md`         | Zod validation and schema description  |
| Agent Skills         | `packages/skills/CONTEXT.md`      | Skills source and quality gate         |

As workspaces are introduced, add each context and its `CONTEXT.md` to this map.
Context-specific ADRs live alongside that context; system-wide decisions remain in
`docs/adr/`.
