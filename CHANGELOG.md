# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-26

### Added

- Initial oh-my-pi extension port of the OpenCode Morph plugin.
- Registered `morph_edit`, `warpgrep_codebase_search`, and `warpgrep_github_search` on `ExtensionAPI`.
- Added Morph Compact bridge via `session_before_compact` with native fallback on Morph errors.
- Added `before_agent_start` routing hints and a `/morph-compact` command.
- Added Bun tests for helper behavior, compaction serialization, and extension wiring.
