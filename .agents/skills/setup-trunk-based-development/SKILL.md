---
name: setup-trunk-based-development
description: Set up or refresh a repository for Trunk-Based Development.
---

# Setup Trunk-Based Development

Establish or refresh the integration contract so daily work can use
`$trunk-based-development` with current repository evidence. Explore, present evidence,
confirm each material choice, then write.

Read `docs/research/dave-farley-trunk-based-development.md` when it exists. Keep Dave Farley's
direct-to-trunk preference, DORA's short-lived-branch definition, and repo-specific
recommendations distinct.

## 1. Explore

Inspect the repository without changing local or remote state:

- `git status`, remotes, default branch, branch list, recent merge history, and contributors;
- `AGENTS.md` and `CLAUDE.md`, including any existing skills or delivery policy;
- package manifests, workspaces, lockfiles, build scripts, test scripts, and task runners;
- CI workflows, required check names, pre-commit hooks, release workflows, and rollback paths;
- open PR count, PR age, review delay, and branch protection through the provider's read-only
  CLI or API when available;
- existing `docs/agents/trunk-based-development.md` and the daily
  `$trunk-based-development` skill.

Inspect command definitions but do not run tests, builds, formatters, generators, package
scripts, or other commands that may create caches or artifacts. Before confirmation, execute
only commands that repository documentation explicitly identifies as read-only and
artifact-free.

Classify each gate command as:

- **verified** — the exact command has a current local or provider result;
- **available** — the exact executable command exists but has no current result;
- **proposed** — the repository has no exact executable command for the useful check.

Treat missing history as unavailable evidence rather than a passing signal.

**Complete when:** every signal above has evidence or is marked unavailable, and every gate
is classified as verified, available, or proposed without exploratory side effects.

## 2. Present readiness and confirm choices

Summarize the current integration line, executable safety net, review latency, enforcement,
and missing prerequisites. Classify preliminary readiness as:

- **ready** — a repeatable, currently verified gate protects a green integration line;
- **partial** — executable checks exist but results, contract, or enforcement have gaps;
- **policy-only** — the repository can record the target, but no executable gate exists yet.

Take these sections one at a time, with a recommendation first. Ask one bundled initial
question for section A, one for section B, and one for section C. If the answer is incomplete
or ambiguous, follow up only on unresolved fields before moving to the next section.

### A. Integration and review

Recommend short-lived PRs when the gate or team practice is still maturing. Recommend direct
to trunk only when fast checks, immediate broken-build repair, and review expectations are
already credible. Confirm:

- the integration line;
- direct commits, short-lived PRs, or both by risk;
- who may merge and how review happens;
- the maximum branch or PR lifetime.

### B. Gate contract

Present verified, available, and proposed checks separately for:

- **fast gate** — run after every integration batch;
- **full gate** — establish releasability before handoff or release.

Show exact commands only when discovered in the repository. When executable commands are
missing, recommend policy-only setup. Offer toolchain or CI scaffolding as a separate scope;
its package manager, commands, and dependencies require explicit confirmation.

### C. Enforcement

Present local files separately from remote provider changes. Recommend branch protection only
after a stable required check has an exact name. Ask for explicit confirmation before applying
rulesets, required checks, force-push restrictions, or other remote mutations.

Confirm the agent-instruction target before drafting. Update the active `AGENTS.md` or
`CLAUDE.md` when its audience is unambiguous. If neither exists or both are active, ask the
user which file to create or update.

Use these initial metric targets in the draft unless repository evidence supports tighter
ones:

- at most three active development branches;
- integration at least daily, with branch lifetime p95 below 24 hours;
- fast-gate p95 at most five minutes;
- newly red integration line repaired or reverted within ten minutes at p95;
- zero integration freezes;
- every feature flag has an owner and removal condition.

For every measurable metric, define its data source, calculation, observation window, and
target. When a policy-only repository has no viable source, defer the metric with its target
and the prerequisite for measuring it; do not invent observations or calculations.

**Complete when:** the agent-instruction target is confirmed; integration style, gate
contract, local scaffolding scope, remote enforcement, metrics, and which available commands
may run are confirmed or explicitly deferred.

## 3. Draft before writing

Show the user the complete proposed contents of:

- the `### Trunk-based development` block for the confirmed agent-instruction file;
- `docs/agents/trunk-based-development.md`;
- each confirmed toolchain manifest, configuration, script, dependency change, and generation
  command, including the expected paths of generated artifacts;
- each CI or hook file included in the confirmed scope;
- the exact remote protection request, when confirmed.

The integration contract must keep verified commands, unverified available commands, and
proposed checks visibly separate. Point to `$trunk-based-development` as the single source of
truth for choosing how to hide incomplete work instead of duplicating its strategy hierarchy.

Let the user edit and approve the draft before any mutation.

**Complete when:** every planned local and remote mutation appears in an approved draft.

## 4. Verify the draft contract

Run only the available gate commands approved in section B. Record each exact command and
result, promote it to verified whether it passes or fails, and recompute readiness. A failing
result cannot support ready status.

If a result changes the proposed readiness, gate contract, CI configuration, or enforcement,
show the affected revised draft and obtain approval before writing. Leave unapproved or
unexecutable checks available or proposed as appropriate.

**Complete when:** approved executable checks have recorded results and the final readiness
and draft agree with that evidence.

## 5. Write, validate, and hand off

Materialize the approved local draft in this order:

1. Create confirmed toolchain manifests, configuration, scripts, and dependency changes. Run
   only approved generation commands and inspect that they changed only the expected paths.
   Stop on any unexpected generated change. Before continuing, either revert only artifacts
   proven to come from that command or add them to a revised draft and obtain approval.
2. Create CI or hooks only from the approved gate contract.
3. Run structural and syntax validation for every setup-authored artifact. Repair or revert
   only the setup change when one fails; do not retain a newly invalid artifact.
4. Run every approved gate affected by the scaffolding, including pre-existing and newly
   created gates, and compare each result with its baseline. Repair or revert the setup change
   that causes a new regression. Record the final results and recompute readiness. If the
   evidence changes the policy draft, CI, or remote enforcement request, show every affected
   revision and obtain explicit approval before writing or applying it. Do not enforce a
   required check whose exact name and passing behavior are not verified.
5. Edit the confirmed agent-instruction file, updating an existing trunk-based development
   block in place. Write `docs/agents/trunk-based-development.md` with every field required by
   the daily skill's **Load the integration contract** section. Add only setup-owned evidence:
   the last result for each verified command, available commands, metric definitions or
   deferrals and review cadence, and deferred enforcement. Keep available and proposed gates
   visibly separate.
6. Run Markdown validation for the policy files and inspect the final local diff against the
   approved draft. Repair or revert only the policy change when either check fails.

Apply remote protection only after local files validate and the user has confirmed the exact
request. Then query the provider and compare the resulting rules to the approved request.
Leave commits and publishing to the user's explicit request.

Report:

- readiness state and integration model;
- verified, available, and proposed gates;
- toolchain, policy, CI, and hook files changed or deferred, with validation results;
- remote rules changed or deferred;
- metrics and next review point;
- the first prerequisite that will move the repo to the next readiness state.

Tell the user that `$trunk-based-development` reads this contract during daily delivery.
Re-run this setup only when the integration model, gate commands, provider, or protection
policy changes.

**Complete when:** approved files match the final draft, every setup-authored artifact passes
its validation, project gate failures are reported under a non-ready status and were not
caused by invalid setup configuration, remote state is verified when changed, and the daily
skill has an unambiguous integration contract to consume.
