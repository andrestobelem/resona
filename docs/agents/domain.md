# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring
the codebase.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — it points at the shared glossary and each
  context's `CONTEXT.md`. Read every entry relevant to the topic.
- **`docs/adr/`** — read system-wide ADRs that touch the area you're about to work in.
- **Context-scoped `docs/adr/` directories** — when working inside a workspace, also read
  the ADRs alongside that workspace's `CONTEXT.md`.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't
suggest creating them upfront. The `/domain-modeling` skill (reached via
`/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or
decisions actually get resolved.

## File structure

This repository uses a multi-context layout. Workspace locations are defined by the
monorepo configuration rather than assumed to live under a particular root directory.

```text
/
├── CONTEXT-MAP.md
├── CONTEXT.md                         ← shared Resona vocabulary during the transition
├── docs/adr/                          ← system-wide decisions
└── <workspace>/
    ├── CONTEXT.md
    └── docs/adr/                      ← context-specific decisions
```

As workspaces are introduced, add each context and its domain-documentation path to
`CONTEXT-MAP.md`. A workspace needs its own context files only when it owns distinct
domain vocabulary or decisions.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a
hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift
to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're
inventing language the project doesn't use (reconsider) or there's a real gap (note it for
`/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently
overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
