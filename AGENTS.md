# AGENTS.md

## Release discipline

- Rule: Any shipped update must bump `package.json` `version` and `src/config.ts` `PLUGIN_VERSION` together, then cut `CHANGELOG.md` from `[Unreleased]` to a dated heading for the same version before commit or push.
- Why: `package.json` is the package metadata, `src/config.ts` exports a runtime plugin version constant, and `CHANGELOG.md` declares Keep a Changelog plus Semantic Versioning as the release contract.

## Routing and compaction contracts

- Rule: If `MORPH_API_KEY` is absent, routing hints and runtime notes must say Morph tools are unavailable and route agents to native edit/write/search. Only configured-key guidance may prefer Morph-backed tools.
- Why: `README.md` documents tools staying registered without a key, but unavailable tools should not be recommended at runtime.

- Rule: Keep the native floor when strengthening Morph prompts: native `edit` for trivial exact replacements, native `write` for new files, and native search for exact symbol or string lookups.
- Why: The routing policy and tool docs intentionally prefer Morph where it fits without wasting remote calls on cheap local operations.

- Rule: Morph drives automatic and manual `/compact` compaction by default. It yields to an active `snapcompact` strategy when no focus text is present, and forwards `/compact <focus>` to Morph as a query. The bridge returns `undefined` for native-fallback cases — no key, empty history, empty serialized input, empty summary, or API error — so the host runs its native strategy; an abort after Morph responds re-throws instead of falling back.
- Why: `snapcompact` remains a valid host image-archive strategy the plugin must not override for unfocused compaction. Focused compaction is a directed LLM summary path, so Morph receives the focus query.

- Rule: The compaction bridge yields to native when `event.preparation.settings.remoteEnabled === false` (the `/compact soft` local-only path), and folds the inputs the native summarizer owns into the Morph request: `previousSummary` as a synthetic leading message and split-turn `turnPrefixMessages`.
- Why: The host applies a hook-provided summary verbatim and keeps only entries from `firstKeptEntryId` onward, so a local-only request must not egress to Morph and previously summarized or split-turn-prefix history would otherwise be silently dropped.

## Extension lifecycle state

- Rule: Session mutable state belongs inside `morphPlugin(pi)`, not module scope.
- Why: omp invokes the extension factory separately per session and subagent; if future session-specific state is needed, closure state prevents one session from leaking into another.

## Verification gates

- Rule: For code changes, run `bun run typecheck` and `bun test ./test`. There is no repo lint script in `package.json`.
- Why: These are the repo-native gates exposed by package scripts; inventing a lint command creates false process.

- Rule: For markdown changes under `docs`, run `omp ttsr scan --json docs`. For root docs like `README.md` or `CHANGELOG.md`, use a repo-root scan filtered for `md-ai-formatting-tells` rather than trusting direct single-file scans.
- Why: Direct single-file TTSR scans for root markdown have selected zero files in this repo; the filtered root scan catches the formatting rule that has blocked markdown edits before.
