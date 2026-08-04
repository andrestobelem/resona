# Repository instructions

## Commits

- Use Conventional Commits for every commit.
- A scope is mandatory. Commit subjects must use the form `type(scope): description`.
- Keep commits atomic: each commit must contain one coherent change and nothing unrelated.
- Review the staged diff before committing and split independent changes into separate
  commits.
- Never add a `Co-authored-by` trailer, any capitalization variant of it, or any other
  co-author attribution. There are no exceptions.

Examples:

```text
docs(product): document the initial product vision
feat(renderer): add composition discovery
fix(engine): preserve delay state during playback
```

## Agent skills

### Trunk-based development

- Treat `main` as the only integration line for every workspace.
- Use short-lived pull requests by default while repository readiness is not `ready`.
  Direct commits are allowed only for low-risk changes after the verified fast gate passes.
- Andrés Tobelem and future maintainers explicitly authorized in GitHub may integrate
  changes.
- Every author must review the complete diff and obtain a passing fast gate. Changes to
  public APIs, DSP behavior, CI, security, or dependencies also require an independent
  human or review-agent review.
- The author classifies risk and the integrator confirms it. Treat uncertainty as high
  risk.
- Integrate work the same day. A branch or pull request must never remain open longer
  than 24 hours.
- A newly red `main` stops integration. Repair it immediately or revert the responsible
  atomic batch.
- Use `$trunk-based-development` for daily delivery and exposure strategy. Its integration
  contract lives in `docs/agents/trunk-based-development.md`.

### Issue tracker

Issues and PRDs are tracked in GitHub Issues using the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the default `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, and `wontfix` labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses a multi-context layout with a root `CONTEXT-MAP.md` pointing to
the relevant context documentation. System-wide ADRs live in `docs/adr/`. See
`docs/agents/domain.md`.
