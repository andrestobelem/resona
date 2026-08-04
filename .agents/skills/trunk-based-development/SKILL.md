---
name: trunk-based-development
description: Deliver software with Trunk-Based Development. Use when implementing or planning a change in small integration-safe batches while keeping the repository's integration line green.
---

# Trunk-Based Development

Use a **tight loop**: one small, integration-safe batch at a time. Treat trunk-based
development as a Continuous Integration discipline whose Git topology serves continuous
integration.

Read `docs/research/dave-farley-trunk-based-development.md` only when the user asks for
rationale or evidence.

## 1. Load the integration contract

Read the repository instructions, relevant context and ADRs, current Git status, and
`docs/agents/trunk-based-development.md`. If the contract does not exist, stop and recommend
that the user invoke `$setup-trunk-based-development`. Do not discover gates or create a
shadow contract in this skill.

From the contract, identify:

- readiness status: ready, partial, or policy-only;
- integration line and review model;
- verified fast- and full-gate commands;
- proposed gates and missing prerequisites;
- recorded failures and stop-the-line expectations.

Use the current checkout as the working line. Change branches only with user authorization.
Use only verified gate commands from the contract. For a partial contract, mark every missing
gate unavailable. For a policy-only contract, keep proposed checks visibly proposed:

- a planning request may use them as future acceptance criteria;
- before implementation, ask the user to establish an executable gate through setup or to
  authorize explicitly unintegrated work;
- never describe policy-only or unintegrated work as integrated or green.

Choose the least complex strategy that keeps incomplete behavior safe: prefer a direct safe
change; otherwise choose dark release or branch by abstraction according to the problem. Use
a feature flag only when runtime selection is necessary, and give it an owner and removal
condition.

**Complete when:** the contract status, working baseline, available gates, missing gates, and
exposure strategy are explicit without inventing repository policy.

## 2. Slice trunk-sized batches

Split the requested behavior into the smallest coherent sequence where every batch:

- leaves existing behavior safe;
- has one observable outcome and one matching verification;
- can be reviewed and integrated the same day when executable gates exist;
- uses the selected exposure strategy to hide incomplete behavior;
- can be fixed or reverted independently.

Keep incomplete public APIs private until their contract is coherent. Use one development
line across all monorepo workspaces, and let a coherent vertical batch cross workspace
boundaries.

**Complete when:** every requested behavior belongs to one independently reviewable batch and
each batch names the evidence that will verify it.

## 3. Choose the request path

For a **planning request**, report the ordered batches, observable outcomes, checks, exposure
strategy, and gate availability, then stop. Do not edit files, run commands that may create
caches or artifacts, change branches, stage, or commit.

For an **implementation request**, continue only after resolving the policy-only choice from
step 1. Run the verified fast gate before the first batch when one exists, and record any
pre-existing failures as the baseline.

**Complete for planning when:** the user has an integration-safe batch plan and the repository
is unchanged. **Complete for implementation when:** the executable baseline is recorded, or
the lack of one and the user's authorization for unintegrated work are explicit.

## 4. Implement each batch

For each batch, in order:

1. Add or identify the smallest check that can reject an incorrect implementation.
2. Implement only that batch.
3. Run the focused check and the verified fast gate when available.
4. Treat a newly broken verified gate as **stop the line**: repair it immediately or revert
   only this batch while preserving pre-existing work.
5. Inspect the diff for one coherent change and accidental exposure.
6. When commits are authorized, review the staged diff and commit the batch. Otherwise,
   preserve and report the batch boundary in the handoff.

Apply repository commit conventions instead of restating them here.

**Complete each batch when:** its focused check passes and its diff is independently
reviewable. When a verified fast gate exists, it must also match or improve the recorded
baseline. Otherwise, label the batch unintegrated instead of claiming a green result.

## 5. Prove the resulting state

Run the verified full gate once after the final batch when it exists. If it newly regresses,
stop the line: repair it in the smallest coherent batch or revert the responsible batch, then
run it again. If it does not exist, report it as unavailable; do not substitute a newly
discovered command. Inspect the complete diff and working-tree status. Verify that every
abstraction or flag has an explicit retirement condition and that incomplete behavior remains
safely hidden.

Report the batches, focused checks, verified gates run, pre-existing failures, unavailable or
proposed gates, remaining exposure mechanisms, and work that could not be integrated.

**Complete when:** every batch and requested behavior is accounted for, all focused checks
pass, every executed gate matches or improves its baseline, unavailable verification is
explicit, and the repository state is unambiguous.
