# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added a `fastcompact` tool that compacts supplied file or `artifact://<id>` locations with Morph Compact and returns text only, without writing to disk or mutating session history.
- Added the `MORPH_FASTCOMPACT` environment variable to toggle the `fastcompact` tool.
- Documented recommended agent manifest allowlists: write-capable agents get all Morph tools; read-only agents get the WarpGrep search tools only.

### Changed

- Renamed the Morph extension tools to `fast_edit`, `codebase_warpsearch`, and `github_warpsearch`. The previous names `morph_edit`, `warpgrep_codebase_search`, and `warpgrep_github_search` are no longer registered.

## [0.1.0] - 2026-06-26

### Added

- Initial oh-my-pi extension port of the OpenCode Morph plugin.
- Registered `morph_edit`, `warpgrep_codebase_search`, and `warpgrep_github_search` on `ExtensionAPI`.
- Added Morph Compact bridge via `session_before_compact` with native fallback on Morph errors.
- Added `before_agent_start` routing hints and a `/morph-compact` command.
- Added Bun tests for helper behavior, compaction serialization, and extension wiring.
