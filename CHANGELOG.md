# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.6] - 2026-07-06

### Added

- Added the `editModel`/`MORPH_EDIT_MODEL` fast_edit model selector with `auto`, `morph-v3-fast`, and `morph-v3-large` support.

## [0.3.5] - 2026-07-06

### Added

- Declared editable OMP plugin settings for all Morph configuration values while preserving the existing `MORPH_*` environment variables as fallbacks.

### Changed

- Disabled local WarpGrep and GitHub WarpGrep tools by default; set `warpgrepEnabled`/`MORPH_WARPGREP` and `warpgrepGithubEnabled`/`MORPH_WARPGREP_GITHUB` to `true` to opt in.

## [0.3.4] - 2026-07-01

### Fixed

- Made `fastcompact`'s transient-overload retry budget span the whole tool call: the per-attempt counter is now shared across every compacted location alongside the existing shared timeout clock, matching the documented whole-call budget instead of granting each later location a fresh retry allowance against an already-overloaded Morph.
- Stopped GitHub and repository preflight latency from consuming WarpGrep's Morph retry budget: each retry loop now measures its backoff window from the first Morph attempt rather than from before the repo lookup, so a slow preflight no longer eats the retry allowance.

## [0.3.3] - 2026-07-01

### Added

- Extended bounded transient-overload retry (previously WarpGrep-only) to `fast_edit`, `fastcompact`, and Morph session compaction: each surface now retries a 429/rate-limited/service-overloaded Morph failure up to 3 times (250ms/500ms/1s backoff, bounded by the surface's existing timeout) before surfacing the original failure through its existing error path.
- Added `src/retry.ts`, centralizing the transient-failure classifier and backoff helpers previously private to `src/tools/warpgrep.ts`; WarpGrep now consumes the shared module, whose classifier also gained the `rate limited` match described below.

### Fixed

- Widened the transient-failure classifier to match the Morph Fast Apply SDK's actual rate-limit message text (`"Rate limited: You've exceeded your Morph API usage limits..."`), which contains no `429` substring; `fast_edit`'s retry previously never fired for real rate limiting.
- Wrapped `fast_edit`'s Morph Fast Apply call in the same abort-race used by the other three Morph call sites, so a cancelled `fast_edit` request rejects promptly instead of blocking until the (now-retrying) remote call settles.

## [0.3.2] - 2026-07-01

### Fixed

- Added bounded transient-overload retries for WarpGrep searches so 429 Morph overload responses do not fail a tool call before the retry budget is exhausted.

## [0.3.1] - 2026-06-28

### Changed

- Morph compaction yields to the host's native summary when `remoteEnabled` is false (the `/compact soft` local-only path), so a local-only request never egresses the transcript to Morph.
- Morph compaction folds the previous compaction summary and split-turn prefix messages into the Morph request, matching the native summarizer so iterative and split-turn history is not dropped.

## [0.3.0] - 2026-06-27

### Changed

- Morph compaction now drives all automatic and manual `/compact` compaction by default when Morph is configured. Previously only automatic compaction defaulted to Morph, while manual `/compact` required `MORPH_COMPACT_MANUAL=true`.
- `/compact <focus>` now forwards the focus text to Morph as a compaction query, including when the configured strategy is `snapcompact`; unfocused `snapcompact` still yields to the host image-archive path.
- Morph compaction races the in-flight Morph request against the compaction abort signal, so a cancelled compaction rejects promptly instead of blocking on the remote round-trip.

### Removed

- Removed the `MORPH_COMPACT_MANUAL` and `MORPH_COMPACT_OVERRIDE_SNAPCOMPACT` environment variables.
- Removed the `/morph-compact` command. Morph now yields to an unfocused active `snapcompact` strategy, and native compaction remains the fallback on failure.

## [0.2.0] - 2026-06-27

### Added

- Added a `fastcompact` tool that compacts supplied file or `artifact://<id>` locations with Morph Compact and returns text only, without writing to disk or mutating session history.
- Added the `MORPH_FASTCOMPACT` environment variable to toggle the `fastcompact` tool.
- Documented recommended agent manifest allowlists: write-capable agents get all Morph tools; read-only agents get the WarpGrep search tools only.
- Added the `MORPH_COMPACT_MANUAL` environment variable to opt plain manual `/compact` into Morph compaction (default off).
- Added the `MORPH_COMPACT_OVERRIDE_SNAPCOMPACT` environment variable to let Morph override an active `snapcompact` strategy (default off).

### Changed

- Renamed the Morph extension tools to `fast_edit`, `codebase_warpsearch`, and `github_warpsearch`. The previous names `morph_edit`, `warpgrep_codebase_search`, and `warpgrep_github_search` are no longer registered.
- Changed Morph session compaction to gate by trigger instead of running on every compaction: automatic compaction still defaults to Morph, plain manual `/compact` now uses Morph only when `MORPH_COMPACT_MANUAL=true`, Morph yields to an active `snapcompact` strategy unless `MORPH_COMPACT_OVERRIDE_SNAPCOMPACT=true`, and `/morph-compact` always forces Morph. Existing users who relied on plain `/compact` substituting Morph must now opt in or use `/morph-compact`.
- Strengthened the tool-selection system hint and tool descriptions to prefer Morph-backed tools (`fast_edit`, `codebase_warpsearch`, `github_warpsearch`, `fastcompact`) over their native equivalents, while keeping native `edit`/`write`/search for trivial edits, new files, and exact lookups.

## [0.1.0] - 2026-06-26

### Added

- Initial oh-my-pi extension port of the OpenCode Morph plugin.
- Registered `morph_edit`, `warpgrep_codebase_search`, and `warpgrep_github_search` on `ExtensionAPI`.
- Added Morph Compact bridge via `session_before_compact` with native fallback on Morph errors.
- Added `before_agent_start` routing hints and a `/morph-compact` command.
- Added Bun tests for helper behavior, compaction serialization, and extension wiring.
