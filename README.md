# oh-my-pi-plugin-morph

An [oh-my-pi](https://omp.sh) extension for [Morph](https://morphllm.com):

- `morph_edit` — Morph Fast Apply for large or scattered edits inside existing files
- `warpgrep_codebase_search` — agentic natural-language search over the current workspace
- `warpgrep_github_search` — grounded source search for public GitHub repositories
- Morph Compact API bridge for omp `session_before_compact`

## Quick start

### 1. Set a Morph API key

```bash
export MORPH_API_KEY="sk-..."
```

Get a key at <https://morphllm.com/dashboard/api-keys>.

### 2. Install or link the plugin

For local development from this checkout:

```bash
omp plugin link .
```

For a one-off smoke test without installing:

```bash
MORPH_API_KEY=sk-... omp -e ./src/index.ts -p "List the Morph tools you can call."
```

Installed npm/git specs use omp's plugin installer:

```bash
omp plugin install <git-or-npm-spec>
```

The package manifest loads the extension from `omp.extensions: ["./src/index.ts"]`.
Marketplace installs do not load manifest extension modules; use `omp plugin install` or `omp plugin link` for this package.

## Configuration

All configuration is via environment variables.

| Variable | Default | Description |
|---|---:|---|
| `MORPH_API_KEY` | required | Morph API key. Tools stay registered without it, but return setup guidance. |
| `MORPH_EDIT` | `true` | Set `false` to disable `morph_edit`. |
| `MORPH_WARPGREP` | `true` | Set `false` to disable local WarpGrep. |
| `MORPH_WARPGREP_GITHUB` | `true` | Set `false` to disable public GitHub search. |
| `MORPH_COMPACT` | `true` | Set `false` to disable the compaction hook and command. |
| `MORPH_ROUTING_HINT` | `true` | Set `false` to skip per-turn tool-selection system hints. |
| `MORPH_COMPACT_RATIO` | `0.3` | Target fraction to keep for Morph compaction. Valid range: `0.05` to `1`. |

## Tools

### `morph_edit`

Use for large files, multiple scattered edits in one file, whitespace-sensitive edits, and complex refactors where exact old-string matching is brittle.

The model supplies a partial snippet with `// ... existing code ...` markers. The tool reads the full file from `ctx.cwd`, calls `morph.fastApply.applyEdit`, validates marker leakage and catastrophic truncation, then writes the merged file.

Approval tier: `write`.

### `warpgrep_codebase_search`

Use for exploratory questions about the checked-out workspace, such as "Find the auth flow" or "Where is retry logic handled?" Exact symbol or string lookup should use native search tools.

Approval tier: `read`.

### `warpgrep_github_search`

Use for implementation-level questions about public libraries or SDKs. Provide exactly one of:

- `owner_repo`, for example `vercel/next.js`
- `github_url`, for example `https://github.com/vercel/next.js`

Approval tier: `read`.

## Compaction

When omp starts native compaction, this extension handles `session_before_compact`, serializes the messages selected for summarization, calls Morph Compact with `preserveRecent: 0`, and returns a `CompactionResult` containing Morph's summary. If Morph is unavailable, the selected history is empty, or the API errors, the handler returns `undefined` so omp falls back to its native summarizer.

Manual trigger:

```text
/morph-compact
```

The command calls `ctx.compact()`; the Morph bridge runs if enabled.

## Routing hint

By default the extension appends a concise tool-selection policy through `before_agent_start`. Set `MORPH_ROUTING_HINT=false` to disable it. Tool descriptions also include runtime notes, including missing-key guidance.

## Development

```bash
bun install
bun run typecheck
bun test ./test
```

The `opencode-morph-plugin/` directory is a read-only reference source and is intentionally excluded from this package's typecheck and scoped test script.

## License

MIT. See [LICENSE](LICENSE).
