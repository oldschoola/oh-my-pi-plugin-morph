---
title: Trigger-gated Morph compaction routing with closure-scoped per-session state
date: 2026-06-27
category: architecture-patterns
module: morph-plugin
problem_type: architecture_pattern
component: compaction
severity: high
related_components:
  - extension-lifecycle
  - commands
  - config
applies_when:
  - Building omp extension state that distinguishes session events
  - Routing transcript compaction through Morph or another backend
  - Supporting snapcompact alongside a custom session_before_compact hook
  - Adding a command that forces one compaction backend for a single invocation
symptoms:
  - Manual /compact and automatic compaction need different backend defaults
  - snapcompact must keep ownership of the snapcompact strategy unless overridden
  - Session or subagent state must not leak through module globals
root_cause: scope_issue
resolution_type: code_fix
tags:
  - morph
  - oh-my-pi
  - compaction
  - extension-lifecycle
  - closure-scope
  - session-state
  - snapcompact
  - routing
---

# Trigger-gated Morph compaction routing with closure-scoped per-session state

## Context

The Morph plugin hooks omp's `session_before_compact` event to replace selected transcript summarization with Morph Compact. That event is shared by multiple host paths: automatic context maintenance, plain manual `/compact`, `/compact snapcompact`, and the dedicated `/morph-compact` command.

A hook that always returns a compaction is too broad. It hijacks plain manual `/compact`, and it disables omp's `snapcompact` strategy because the host treats a hook result as `fromHook`. The extension also needs per-session route state, because omp invokes the extension factory once per session or subagent while module globals are shared process-wide.

## Guidance

Gate the compaction hook by trigger, not by hook presence alone.

- Auto-compaction uses Morph by default when Morph is enabled and configured.
- Plain manual `/compact` uses Morph only when `MORPH_COMPACT_MANUAL=true`.
- An active `snapcompact` strategy keeps ownership unless `MORPH_COMPACT_OVERRIDE_SNAPCOMPACT=true`.
- `/morph-compact` forces Morph for that invocation.
- Custom focus instructions still yield to native compaction because Morph's transcript bridge does not carry omp's custom instruction parameter.

Keep route state inside the extension factory closure:

```ts
export default function morphPlugin(pi: ExtensionAPI): void {
  let autoCompactionDepth = 0;
  let morphCompactForced = false;

  pi.on("auto_compaction_start", async () => {
    autoCompactionDepth++;
  });
  pi.on("auto_compaction_end", async () => {
    if (autoCompactionDepth > 0) autoCompactionDepth--;
  });

  pi.on(
    "session_before_compact",
    makeBeforeCompact(pi, {
      isAutoCompacting: () => autoCompactionDepth > 0,
      isMorphCompactForced: () => morphCompactForced,
    }),
  );

  pi.registerCommand("morph-compact", {
    description: "Compact the session now using Morph",
    handler: async (_args, ctx) => {
      morphCompactForced = true;
      try {
        await ctx.compact();
      } finally {
        morphCompactForced = false;
      }
    },
  });
}
```

Then keep the Morph hook conservative unless the route state allows it:

```ts
const isAutoCompacting = routeState.isAutoCompacting();
const isForced = routeState.isMorphCompactForced() && !isAutoCompacting;
if (!isAutoCompacting && !isForced && !morphCompactManualEnabled()) return undefined;

if (
  event.preparation.settings.strategy === "snapcompact" &&
  !isForced &&
  !morphCompactOverridesSnapcompact()
) {
  return undefined;
}
```

## Why this matters

The omp host already tells extensions when auto-compaction starts and ends. A depth counter is safer than a boolean because an aborted auto pass can overlap the next start/end pair. A boolean can clear the new pass accidentally; a counter preserves the bracket count.

The `/morph-compact` force flag is safe only because omp serializes compaction within one session. `ctx.compact()` sets the host compaction guard before it emits `session_before_compact`, and another same-session compaction is rejected before it can emit a second hook. If the host ever allows concurrent same-session compactions, replace the boolean with an invocation token that is consumed by the matching hook call.

Factory-closure state is the boundary that matters. A module-scope `let` would be shared by the main session and subagents in one process, so one subagent's auto-compaction could misclassify the main session's later manual `/compact` as auto. Closure state is scoped to that `morphPlugin(pi)` binding.

The policy gates also have different default semantics than registration flags. Registration flags are import-time opt-out switches such as `MORPH_COMPACT !== "false"`. Per-compaction override gates are live opt-in switches such as `MORPH_COMPACT_MANUAL === "true"`, because their job is to override host behavior only when explicitly requested.

## When to apply

- An omp extension hook fires for multiple host triggers, but only some triggers should use the extension's backend.
- A plugin command must force behavior for one host call without changing global config.
- The extension needs to distinguish automatic maintenance from manual user commands.
- The code must coexist with omp strategies such as `snapcompact` that have their own host-side behavior.
- Any mutable state tracks session lifecycle, auto-compaction lifecycle, command force mode, or subagent behavior.

## Examples

Wrong shape:

```ts
let autoCompacting = false;
let forced = false;

export default function morphPlugin(pi: ExtensionAPI): void {
  pi.on("session_before_compact", makeBeforeCompact(pi));
}
```

That shape has two bugs: module-scope state can leak across sessions, and the hook has no trigger context, so it tends to replace every compaction path.

Correct shape:

```ts
export default function morphPlugin(pi: ExtensionAPI): void {
  let autoCompactionDepth = 0;
  let forced = false;

  pi.on("auto_compaction_start", async () => {
    autoCompactionDepth++;
  });
  pi.on("auto_compaction_end", async () => {
    if (autoCompactionDepth > 0) autoCompactionDepth--;
  });

  pi.on("session_before_compact", makeBeforeCompact(pi, {
    isAutoCompacting: () => autoCompactionDepth > 0,
    isMorphCompactForced: () => forced,
  }));
}
```

Tests should cover the policy table, not only successful Morph output:

- Manual `/compact` yields when `MORPH_COMPACT_MANUAL` is unset.
- Manual `/compact` uses Morph when `MORPH_COMPACT_MANUAL=true`.
- Auto-compaction uses Morph without manual opt-in.
- Auto-compaction yields to `snapcompact` unless `MORPH_COMPACT_OVERRIDE_SNAPCOMPACT=true`.
- `/morph-compact` forces Morph under `snapcompact` without global env changes.
- `auto_compaction_start` and `auto_compaction_end` flip the route and restore it.

## Related

- `src/config.ts` defines live opt-in policy gates.
- `src/compaction.ts` applies manual, auto, forced, custom-instruction, and snapcompact routing gates.
- `src/index.ts` owns closure-scoped auto-depth and force state.
- `test/morph.test.ts` covers the trigger matrix and closure wiring.
- `README.md` documents the user-facing contract for `/compact`, `/morph-compact`, and snapcompact compatibility.
- `CHANGELOG.md` records the manual `/compact` behavior change.
