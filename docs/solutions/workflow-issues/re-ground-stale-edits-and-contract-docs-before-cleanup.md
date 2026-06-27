---
title: Re-ground stale edits and discover contract docs before cleanup
date: 2026-06-27
category: workflow-issues
module: development-workflow
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - Resuming edits after a patch failed or a snapshot or line-number tag went stale
  - Editing a file by line numbers captured in an earlier read
  - A change alters user-visible contracts documented in README or CHANGELOG
root_cause: missing_workflow_step
resolution_type: workflow_improvement
related_components:
  - documentation
  - testing_framework
tags:
  - edit-discipline
  - re-read
  - stale-snapshot
  - readback
  - verification
  - documentation-discovery
  - agent-workflow
---

# Re-ground stale edits and discover contract docs before cleanup

## Context

This lesson comes from the Morph plugin session that produced the trigger-gated compaction routing change. The code fix worked, but the path to it exposed two separate workflow gaps: stale edit targets after a failed patch, and late discovery of user-contract documentation.

First, a patch failed to apply because it was anchored on a stale snapshot. The next edit reused that pre-failure anchor and landed in the wrong file, `src/config.ts`, instead of the file that was actually meant to change. Acting on stale line numbers and tags, rather than on a fresh read, put the edit in the wrong place.

Second, the change altered a user-visible contract, the behavior of manual `/compact`, yet the user-facing surfaces that document that contract, README and CHANGELOG, were expanded only after the test suite was already green. The documentation was treated as trailing cleanup instead of being discovered when the contract change was first planned.

Both rules generalize beyond this plugin: re-ground edits before changing files, and find contract docs before cleanup starts.

## Guidance

Ground every edit in a fresh read after anything invalidates your view of the file.

After a failed patch, stale snapshot, or stale tag, re-read the intended file and the exact target lines immediately before issuing the next edit. Do not reuse line numbers, anchors, or tags captured before the failure, because they describe a file state that may no longer exist.

Confirm the path you are about to edit is the file you mean. A wrong-file edit usually comes from carrying an old anchor into a different file's context.

Once the edit applies, read the changed region back before moving on. Confirm the new content is what you intended and that nothing adjacent was clobbered.

Discover the documentation that records a contract before the work is done, not after.

When a change alters a user-visible contract, such as command behavior, flags, defaults, a public type, or an output format, find the user-facing surfaces that document that contract while planning the change. In this repo those surfaces were README and CHANGELOG. Fold their updates into the definition of done up front rather than appending them once tests pass.

Two supporting practices reinforce both habits. Validate the upstream or host contract you depend on before relying on it, for example how the host emits and serializes the events your code hooks. Enumerate the edge cases of the changed behavior and verify them, not only the happy path.

## Why this matters

A stale anchor is the common cause of a wrong-file or wrong-line edit. Line numbers and tags that were valid before a failed patch point at a file state that has moved, or at a different file entirely. Re-reading immediately before the edit costs one lookup and removes that class of mistake. The read-back afterward catches the quieter failure where an edit reports success but lands somewhere unintended. Without it, that error survives until something downstream breaks, usually far from where it was introduced.

Discovering contract documentation late is cheap when nothing goes wrong and expensive when something does. If README and CHANGELOG are an afterthought, a change can ship with documentation that contradicts its own behavior, and the gap surfaces only in review or in a confused user's report. Pulling the discovery forward means the behavior and its documentation are designed together, so the docs describe what was actually built instead of being reconstructed from a passing test run.

## When to apply

- Re-read before the next edit whenever a patch fails to apply, a snapshot goes stale, or a tag stops matching.
- Carry the same habit into any multi-edit session where earlier edits shift the line numbers that later edits depend on.
- Find the documenting surfaces first whenever a change touches a user-visible contract: command behavior, flags, defaults, public types, or serialized output.
- Validate assumed guarantees first whenever you integrate against a host or upstream API whose ordering or serialization you are taking on faith.

## Examples

A wrong-file edit from a stale anchor, drawn from the originating session:

```text
# Anti-pattern
patch intended-file        # fails because the anchor is stale
edit  <stale anchor>       # reuses the old anchor, lands in src/config.ts

# Pattern
read  intended-file:target-lines    # fresh anchor, confirmed path
edit  intended-file:target-lines    # edit against current state
read  intended-file:changed-region  # verify the result
```

Late contract-doc discovery, also from that session: the manual `/compact` behavior change altered a user-visible contract, but README and CHANGELOG were expanded only after the tests were green. Locating those two surfaces during planning would have folded them into the change rather than appending them at the end, and the docs would have tracked the behavior as it was built.

## Related

- `docs/solutions/architecture-patterns/morph-compaction-routing-and-closure-scoped-state.md` documents the architecture this session produced. This document captures the process discipline learned while producing it. Content overlap is low: `src/config.ts`, README, and CHANGELOG appear in both docs, but for unrelated reasons.
- `README.md` and `CHANGELOG.md` are the user-contract surfaces to discover when a change alters a user-visible contract.
- `src/config.ts` was the wrong-file edit target in the originating session, unrelated to the change that was actually intended at that moment.
