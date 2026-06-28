---
title: Morph-default compaction with native fallback
date: 2026-06-27
category: architecture-patterns
module: morph-plugin
problem_type: architecture_pattern
component: compaction
severity: high
related_components:
  - extension-lifecycle
  - config
applies_when:
  - Routing transcript compaction through Morph or another backend
  - Supporting snapcompact alongside a custom session_before_compact hook
  - Preserving native host fallback when an extension backend fails
  - Keeping session-local extension state out of module scope
symptoms:
  - Automatic and manual /compact should use the same backend contract
  - snapcompact must keep ownership of the snapcompact strategy
  - Focus text from /compact needs to reach the compaction backend
  - Session or subagent state must not leak through module globals
root_cause: scope_issue
resolution_type: code_fix
tags:
  - morph
  - oh-my-pi
  - compaction
  - extension-lifecycle
  - closure-scope
  - snapcompact
  - routing
---

# Morph-default compaction with native fallback

## Context

The Morph plugin hooks omp's `session_before_compact` event to replace transcript summarization with Morph Compact. The current contract is deliberately uniform: automatic compaction and manual `/compact` both route through Morph when the hook is enabled and Morph is configured.

That uniform contract removes the old trigger matrix. There is no manual opt-in flag, no snapcompact override flag, no dedicated `/morph-compact` command, and no auto/forced route state. The hook either returns a Morph compaction result or returns `undefined` so the host runs its configured native strategy.

One host strategy remains special. `snapcompact` is host-owned image-archive compaction, not a normal LLM summary path. The Morph hook must yield when the resolved strategy is `snapcompact` and no focus text is present.

## Guidance

Keep one Morph-default `session_before_compact` hook:

- Register the hook only when `MORPH_COMPACT_ENABLED` is true.
- Yield when `event.preparation.settings.strategy === "snapcompact"` and no focus text is present.
- Yield when `event.preparation.settings.remoteEnabled === false` (the `/compact soft` local-only path); a local-only compaction must not egress the transcript to Morph.
- Serialize the selected messages and return `undefined` on empty history or empty serialized input.
- Fold the inputs the native summarizer owns: prepend `previousSummary` as a synthetic leading message and append split-turn `turnPrefixMessages`, since the host applies the hook summary verbatim and keeps only entries from `firstKeptEntryId` onward.
- Forward `/compact <focus>` by passing the trimmed focus text as Morph's `query` field, including when configured snapcompact would otherwise fall back to a native LLM summary.
- Return `undefined` on missing Morph credentials, empty Morph summaries, and Morph API errors.
- Re-throw abort-after-response failures so cancellation is not mistaken for a native-fallback case.

The extension wiring stays simple:

```ts
export default function morphPlugin(pi: ExtensionAPI): void {
  if (MORPH_COMPACT_ENABLED) {
    pi.on("session_before_compact", makeBeforeCompact(pi));
  }
}
```

The hook owns the routing rule directly:

```ts
if (!morphReady() || !compactClient) return undefined;

const focus = event.customInstructions?.trim() || undefined;
if (!focus && event.preparation.settings.strategy === "snapcompact") return undefined;

const result = await compactClient.compact({
  messages: input,
  compressionRatio: COMPACT_RATIO,
  preserveRecent: 0,
  query: focus,
});
```

Keep any future session-mutable state inside `morphPlugin(pi)`, not module scope. omp invokes the extension factory once per session and subagent, so closure state is the boundary that prevents one session from leaking into another. The current consolidated compaction path does not need route state, but the lifecycle rule still matters for future session-local behavior.

## Why this matters

A per-trigger policy table was extra state for a contract that no longer needs it. Plain `/compact` and automatic compaction now share the same Morph-default behavior, so auto-depth counters and command force flags would only preserve a deleted distinction.

Returning `undefined` is still the right fallback boundary. It lets omp run the configured native strategy when Morph is unavailable, when the selected transcript has no serializable text, or when the Morph API fails. That keeps the host in charge of recovery without adding a second policy layer inside the plugin.

`snapcompact` preserves image context through a host image-archive strategy, so Morph should not replace it for unfocused compaction. Focus text changes the host path into a directed LLM summary rather than an image archive, so Morph should receive the query there.

## When to apply

- A compaction hook should provide one default backend across automatic and manual triggers.
- A host strategy such as `snapcompact` has behavior the extension must not override.
- A custom backend can fail cleanly by returning `undefined` and letting the host continue.
- A manual command or env override has become redundant with the default behavior.
- Any future mutable state tracks session lifecycle or subagent behavior.

## Examples

Wrong shape:

```ts
let autoCompactionDepth = 0;
let morphCompactForced = false;

pi.on("auto_compaction_start", async () => {
  autoCompactionDepth++;
});
pi.registerCommand("morph-compact", { handler: async (_args, ctx) => ctx.compact() });

pi.on("session_before_compact", makeBeforeCompact(pi, {
  isAutoCompacting: () => autoCompactionDepth > 0,
  isMorphCompactForced: () => morphCompactForced,
}));
```

That shape preserves old trigger gates after manual `/compact` and automatic compaction have the same contract. It also leaves a removed command surface in the extension.

Correct shape:

```ts
pi.on("session_before_compact", makeBeforeCompact(pi));
```

Tests should cover the remaining contract:

- `snapcompact` strategy yields and does not call Morph.
- Non-snapcompact compaction calls Morph by default.
- `/compact <focus>` forwards the focus as `query`.
- No `/morph-compact` command is registered.
- No `auto_compaction_start` or `auto_compaction_end` route handlers are registered.
- Failure cases still return `undefined`, while in-flight aborts and abort-after-response failures still reject.
- A `remoteEnabled: false` preparation yields and does not call Morph.
- `previousSummary` and split-turn `turnPrefixMessages` are included in the Morph input.

## Related

- `src/config.ts` defines the registration flag and compact ratio.
- `src/compaction.ts` applies the snapcompact yield, Morph request, focus query, and fallback behavior.
- `src/index.ts` registers the single compaction hook without route state.
- `test/morph.test.ts` covers the consolidated routing and wiring behavior.
- `README.md` documents the user-facing contract for `/compact` and snapcompact compatibility.
- `CHANGELOG.md` records the removal of the manual opt-in env vars and dedicated command.
