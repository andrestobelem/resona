# Trunk-based development

## Readiness

- Status: `partial`.
- Evidence captured: 2026-08-04T22:58:50-03:00.
- Integration line: `main`.
- Baseline commit: `327e1b4c184efdf7b6fdfd0e8b0e6234d00d2fcf`.
- Worktree condition: dirty with T01 on `feat/engine-compile-note-plan`.
- Local runtime: Node.js `24.15.0` and pnpm `11.20.0`; pnpm reports the Node version is below
  the declared `>=24.18.0 <25` range.
- Reason: local fast and full gates pass with a non-vacuous integration test. GitHub Actions
  also passed both gates for PR #22. Remote enforcement has not been inspected.

The current gates verify the repository scaffold, documentation, exact rational
nearest-even rounding, and the first source-project-to-plan vertical slice. They do not yet
verify DSP output, browser playback, or release artifacts.

## Integration and review model

- `main` is the only integration line across all workspaces.
- Short-lived pull requests are the default while readiness is not `ready`.
- A direct commit is allowed only for low-risk work after the verified fast gate passes.
- Andrés Tobelem and future maintainers explicitly authorized in GitHub may integrate
  changes.
- Every author self-reviews the complete diff and verifies the fast gate.
- Changes to public APIs, DSP behavior, CI, security, or dependencies also require an
  independent human or review-agent review.
- The author classifies risk and the integrator confirms it. Uncertainty means high risk.
- Work integrates the same day and may not remain on a branch or pull request for more
  than 24 hours.
- `$trunk-based-development` is the single source of truth for selecting how incomplete
  behavior remains hidden. This contract does not duplicate that strategy hierarchy.

## Stop the line

When `main` becomes newly red:

1. Stop further integrations.
2. Identify the smallest responsible batch.
3. Repair it immediately or revert that atomic batch.
4. Run the verified fast gate again.
5. Resume integration only after the baseline is restored.

The recovery-time target is p95 at or below ten minutes.

## Gate contract

### Verified fast gate

Command:

```bash
pnpm check:fast
```

Expansion:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
```

Recorded result:

- Run date: 2026-08-04.
- Exit code: `0`.
- Observed wall duration: 5.29 seconds.
- Baseline commit: `327e1b4c184efdf7b6fdfd0e8b0e6234d00d2fcf`.
- Worktree: dirty with T01 on `feat/engine-compile-note-plan`.
- Formatting, ESLint, and Markdown validation passed.
- Typecheck compiled the `@resona/engine` workspace without emitting files.
- Vitest ran one unit suite containing seven passing tests.

The fast gate runs after every integration batch. Its duration target is p95 at or below
five minutes.

### Verified full gate

Command:

```bash
pnpm check:full
```

Expansion:

```bash
pnpm check:fast
pnpm build
pnpm test:integration
```

Recorded result:

- Run date: 2026-08-04.
- Exit code: `0`.
- Observed wall duration: 7.41 seconds.
- Baseline commit: `327e1b4c184efdf7b6fdfd0e8b0e6234d00d2fcf`.
- Worktree: dirty with T01 on `feat/engine-compile-note-plan`.
- The embedded fast gate passed.
- Build emitted the private `@resona/engine` workspace successfully.
- Vitest ran the source-project integration suite with six passing tests.

The full gate runs before handoff or release. There is currently no executable release
workflow.

### Available gates

None. Every currently executable project gate has a recorded local result.

### Setup validations

The following setup validations passed:

```bash
pnpm exec prettier --check . --ignore-unknown
pnpm exec eslint .
pnpm exec markdownlint-cli2
git diff --check
```

Markdownlint checked 92 files and reported zero issues.

The first Prettier run detected only missing trailing commas in
`.markdownlint-cli2.jsonc`. The setup-owned configuration was corrected and the complete
check passed on rerun.

### Proposed future checks

The following checks remain proposed until the relevant implementation exists:

- broader product-code typechecking, builds, and unit coverage beyond the first vertical
  slice;
- additional integration coverage for audio clips, effects, automation, and source maps;
- browser and Player tests;
- deterministic render tests;
- audio compatibility fixtures;
- package-export validation beyond package build scripts;
- Agent Skill validation;
- release and rollback verification.

### Recorded failures

No current gate failure remains.

The first fast-gate run for the engine batch stopped on formatting in the two new TypeScript
files. Prettier corrected only those files, the focused unit test passed again, and the fast
and full gates then passed. The later T01 full gate passed with six integration tests.
Missing historical results remain unavailable evidence, not passing evidence.

## Bootstrap limitations

The first engine workspace retires the empty-workspace allowances for build, typecheck, unit
tests, and integration tests:

- recursive `build` and `typecheck` fail when no workspace matches;
- unit tests fail when no test file exists;
- integration tests fail when no test file exists.

Every production workspace must expose `build` and `typecheck` scripts.

## Missing prerequisites

The current batch satisfies the first local prerequisite: a real workspace exposes
non-vacuous `typecheck` and `build` scripts and runs a meaningful unit suite.

Readiness cannot move to `ready` until:

- product coverage extends beyond the first vertical slice;
- browser, Player, DSP, and deterministic-render coverage exist;
- remote protection is reconsidered against a stable passing check.

## CI and enforcement

The local workflow exists at `.github/workflows/ci.yml`.

Provider-verified check names:

- `CI / Fast gate`;
- `CI / Full gate`.

Both jobs are configured for pull requests targeting `main`, pushes to `main`, and manual
workflow dispatch. The full job depends on the fast job.

The GitHub repository setting `delete_branch_on_merge` is enabled. GitHub removes the head
branch after a pull request merges, so CI does not run a separate cleanup job or require write
permissions for `contents`.

PR #22 passed both `CI / Fast gate` and `CI / Full gate` on 2026-08-05 UTC. Neither check
has yet been approved as required branch protection.

No Git hook is configured. Hooks remain deferred until repository behavior demonstrates a
need for one.

No remote protection or ruleset mutation is approved by this contract. Provider evidence
for pull-request history, required checks, protection, and rulesets was unavailable during
exploration and must not be interpreted as disabled.

After the workflow has passed in GitHub and its exact check name is observed, rerun this
setup before proposing any required check, force-push restriction, deletion restriction, or
ruleset.

## Recovery and rollback

There is no automated deployment or rollback workflow. For repository regressions, revert
the smallest responsible atomic batch. A future release system must define how to preserve
and restore the last valid build before readiness can cover releases.

## Metrics

| Metric | Source and calculation | Window | Target | Initial evidence |
| --- | --- | --- | --- | --- |
| Active development branches | GitHub branch refs and open PR heads; count non-`main` branches carrying unintegrated work | Point-in-time at each review | At most 3 | Deferred until provider branch data is available |
| Integration cadence | Timestamps of commits or merges reaching `main`; measure gaps during active development | Rolling 30 days | Integrate at least daily | No usable history yet |
| Branch or PR lifetime | GitHub PR `createdAt` to `mergedAt`; this is the documented proxy because GitHub does not expose reliable branch creation time | Rolling 30 days | p95 below 24 hours | Deferred until PR history exists |
| Fast-gate duration | GitHub Actions start and completion timestamps for `CI / Fast gate` | Rolling 30 days | p95 at most 5 minutes | Deferred until the job runs |
| Red-main recovery | First failing fast-gate result on `main` to the first succeeding run or revert restoring the baseline | Rolling 30 days | p95 at most 10 minutes | Deferred until CI history exists |
| Integration freezes | GitHub incidents or issues explicitly recording an integration freeze; count qualifying events | Rolling 30 days | 0 | Deferred until an incident-recording mechanism exists |
| Feature-flag ownership | Active flags with both an owner and removal condition divided by all active flags | Current repository snapshot | 100% | Deferred until a flag registry exists |

No metric is currently reported as passing. The required data does not exist yet.

## Review cadence

Review this contract:

- 30 days after the first successful GitHub CI run;
- monthly after that;
- whenever the integration model, gate commands, provider, CI, or protection policy changes.

`$trunk-based-development` reads this file during daily delivery. Rerun
`$setup-trunk-based-development` when the contract itself must change.
