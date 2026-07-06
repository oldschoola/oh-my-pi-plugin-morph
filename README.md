# oh-my-pi-plugin-morph

An [oh-my-pi](https://omp.sh) extension for [Morph](https://morphllm.com):

- `fast_edit` — Morph Fast Apply for large or scattered edits inside existing files
- `codebase_warpsearch` — agentic natural-language search over the current workspace
- `github_warpsearch` — grounded source search for public GitHub repositories
- `fastcompact` — Morph Compact digest of a supplied file or artifact location, returned as text
- Morph Compact API bridge for omp `session_before_compact`

## Quick start

### 1. Set a Morph API key

```bash
export MORPH_API_KEY="sk-..."
```

Get a key at <https://morphllm.com/dashboard/api-keys>.

### 2. Install or link the plugin

Installed npm/git specs use omp's plugin installer [Recommended]:

```bash
omp plugin install https://github.com/metaphorics/oh-my-pi-plugin-morph
```

For local development from this checkout:

```bash
omp plugin link .
```

For a one-off smoke test without installing:

```bash
MORPH_API_KEY=sk-... omp -e ./src/index.ts -p "List the Morph tools you can call."
```

The package manifest loads the extension from `omp.extensions: ["./src/index.ts"]`.
Marketplace installs do not load manifest extension modules; use `omp plugin install` or `omp plugin link` for this package.

## Configuration

Configuration is editable through OMP plugin settings. The same environment
variables are still supported as fallbacks for scriptable setups.

```bash
omp plugin config list oh-my-pi-plugin-morph
omp plugin config set oh-my-pi-plugin-morph warpgrepEnabled true
omp plugin config set oh-my-pi-plugin-morph warpgrepGithubEnabled true
```

| Setting | Environment fallback | Default | Description |
|---|---|---:|---|
| `apiKey` | `MORPH_API_KEY` | required | Morph API key. Tools stay registered without it, but return setup guidance. |
| `editEnabled` | `MORPH_EDIT` | `true` | Set `false` to disable `fast_edit`. |
| `warpgrepEnabled` | `MORPH_WARPGREP` | `false` | Set `true` to enable local WarpGrep. |
| `warpgrepGithubEnabled` | `MORPH_WARPGREP_GITHUB` | `false` | Set `true` to enable public GitHub search. |
| `compactEnabled` | `MORPH_COMPACT` | `true` | Set `false` to disable the compaction hook. |
| `fastcompactEnabled` | `MORPH_FASTCOMPACT` | `true` | Set `false` to disable the `fastcompact` tool. |
| `routingHintEnabled` | `MORPH_ROUTING_HINT` | `true` | Set `false` to skip per-turn tool-selection system hints. |
| `compactRatio` | `MORPH_COMPACT_RATIO` | `0.2` | Target fraction to keep for Morph compaction. Valid range: `0.05` to `1`. |

## Tools

### `fast_edit`

Prefer this for edits inside existing files — large files, multiple scattered edits, whitespace-sensitive changes, and complex refactors where exact old-string matching is brittle. Native `edit` stays the choice for trivial single-line or exact-string replacements, and native `write` for new files.

The model supplies a partial snippet with `// ... existing code ...` markers. The tool reads the full file from `ctx.cwd`, calls `morph.fastApply.applyEdit`, validates marker leakage and catastrophic truncation, then writes the merged file.

Approval tier: `write`.

### `codebase_warpsearch`

Prefer this over manual grep-and-read loops for exploratory questions about the checked-out workspace, such as "Find the auth flow" or "Where is retry logic handled?" Exact symbol or string lookup should use native search tools.

Approval tier: `read`.

### `github_warpsearch`

Use for implementation-level questions about public libraries or SDKs. Provide exactly one of:

- `owner_repo`, for example `vercel/next.js`
- `github_url`, for example `https://github.com/vercel/next.js`

Approval tier: `read`.

### `fastcompact`

Use to condense a specific file or artifact into shorter, query-focused text before reasoning over it. Pass a single `location` (a repo-relative file path or an `artifact://<id>` locator) or a `locations` array compacted in order. Optional `query` focuses the digest and `compression_ratio` overrides the configured ratio.

The tool reads each location, calls Morph Compact with the raw text, and returns the compacted result. It never writes to disk, overwrites inputs, saves artifacts, or mutates session history, and it does not compact the conversation.

Approval tier: `read`.

## Compaction

This extension hooks omp's `session_before_compact` event. Morph Compact handles automatic compaction and manual `/compact` by default when `MORPH_COMPACT` is enabled and Morph is configured.

- If the resolved omp strategy is `snapcompact` and no focus text is present, Morph yields so the host keeps image-archive compaction.
- For non-snapcompact strategies and focused compactions, Morph compacts the selected history and returns the hook result to omp.
- `/compact <focus text>` forwards the focus text to Morph as the compaction query.

When Morph runs, the serialized selected history and any focus text are sent to Morph's API. Leave `MORPH_API_KEY` unset, set `MORPH_COMPACT=false`, or use unfocused `snapcompact` when transcript egress is not acceptable.

If Morph is unavailable, the selected history is empty, serialization produces no input, Morph returns an empty summary, or the API errors, the handler returns `undefined` so omp runs its configured native strategy.

`fastcompact` is a separate tool, not part of this hook. The `session_before_compact` hook compacts conversation history; `fastcompact` compacts a supplied file or artifact location and returns text without touching the session.

## Routing hint

By default the extension appends a concise tool-selection policy through `before_agent_start`. With `MORPH_API_KEY` configured, the policy leads with a Morph-first preference (favor Morph-backed tools over native equivalents when a task fits one). Without a key, it tells the agent Morph tools are unavailable and to use native edit/write/search instead. Set `MORPH_ROUTING_HINT=false` to disable it. Tool descriptions also include runtime notes, including missing-key guidance.

## Agent access

Registering these tools makes them available to the session, but each agent still controls which tools it exposes through its own manifest allowlist. Recommended allowlists:

- Write-capable agents: `fast_edit`, `codebase_warpsearch`, `github_warpsearch`, and `fastcompact`.
- Read-only agents: `codebase_warpsearch` and `github_warpsearch` only.

## Development

```bash
bun install
bun run typecheck
bun test ./test
```

The `opencode-morph-plugin/` directory is a read-only reference source and is intentionally excluded from this package's typecheck and scoped test script.

## License

MIT. See [LICENSE](LICENSE).
