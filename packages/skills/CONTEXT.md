# Agent Skills context

`@resona/skills` is the canonical source and deterministic quality gate for Resona's
first-party Agent Skills. It does not install skills, mutate `.agents/skills`, or run an AI
model. The package publishes Markdown documents for coding agents and validates the contract
those documents describe against the current Resona release.

The source corpus lives in `packages/skills/skills/<skill-name>/SKILL.md`. The initial names
are `resona-best-practices`, `resona-compositions`, `resona-audio-midi`, `resona-studio`, and
`resona-rendering`. Every document declares `resona-release: 0.0.0`, has a workflow,
references, and guardrails, and links to canonical repository documentation or public
contracts. The router skill points agents to one specialist rather than inventing a second
project model or renderer.

`pnpm --filter @resona/skills validate` checks frontmatter, the exact corpus, release
identity, required sections, executable command examples, same-repository GitHub links, and
the guardrail against editing generated artifacts. The integration test uses an isolated
fixture to exercise the equivalent CLI and Studio workflows, including source modification,
render publication, cancellation, and cleanup. A deterministic failure blocks publication;
model evaluations remain complementary metrics as recorded by ADR 0056.

The package is intentionally separate from the existing `.agents/skills` directory, which is
an installed third-party Matt Pocock corpus tracked by `skills-lock.json`. T20/#21 owns
install/update/status commands and synchronization to an external skills repository; this
package must not overwrite that installation or edit generated artifacts.
