# Morph Tool Selection Policy

This reference mirrors the always-on routing policy embedded by the omp extension. The active extension injects a concise version automatically unless `MORPH_ROUTING_HINT=false`.

## Code Editing Tool Selection

Use the right editing tool for the job. `fast_edit` is not the default for all edits, but it should be preferred for edits where partial-snippet merging is faster or more reliable than exact-string replacement.

### First-Action Policy

| Editing task | First tool | Why |
|---|---|---|
| Large file edits (300+ lines) | `fast_edit` | Avoids fragile exact-string matching |
| Multiple scattered changes in one file | `fast_edit` | Batch edits efficiently |
| Whitespace-sensitive edits | `fast_edit` | More forgiving with formatting/context |
| Complex refactors inside an existing file | `fast_edit` | Better partial-file merge behavior |
| Small exact replacement | native `edit` | Faster, local, no API call |
| Single-line rename/fix | native `edit` | Simpler exact replacement |
| New file creation | native `write` | `fast_edit` is for edits and guarded file creation only |
| Codebase search/exploration | `codebase_warpsearch` | Multi-turn agentic search with ripgrep |
| Public GitHub repo exploration | `github_warpsearch` | Grounded context from indexed public repos |
| Exact keyword/function name search | native search | Direct lookup, no API call |

## When NOT to Use `fast_edit`

- The change is a small exact replacement.
- You are creating a brand new file from scratch.
- `MORPH_API_KEY` is not configured; fall back to native tools.
- The change needs full-file replacement; use native `write`.

## WarpGrep Usage

Use `codebase_warpsearch` for natural-language exploratory searches:

- "Find the authentication flow"
- "How does error handling work in the API layer?"
- "Where is the database connection configured?"

Do not use it for exact keyword lookups such as function names, variable names, or error strings.

## Public Repo Context Usage

Prefer `github_warpsearch` over web search or docs fetching when the question is about how an open-source library or SDK works internally. Provide exactly one repository locator:

- `owner_repo` for values like `owner/repo`
- `github_url` for full GitHub URLs

Use `codebase_warpsearch` for the checked-out local repo.

## Fallback Policy

- If `fast_edit` fails due to API error or timeout, use native `edit`.
- If the change requires replacing the entire file, use native `write`.
- If `codebase_warpsearch` fails, fall back to native search and read tools.
- If `github_warpsearch` fails, clone the repo only if the task justifies local setup cost.
- If `fastcompact` fails or `MORPH_API_KEY` is unset, read the location with native read tools.

## Location Compaction

Use `fastcompact` to condense a specific file or artifact into shorter, query-focused text. It is for supplied locations, not the conversation transcript.

- Pass a single `location` (a repo-relative file path or an `artifact://<id>` locator), or a `locations` array compacted in order.
- Use the optional `query` to focus the digest and `compression_ratio` to override the configured ratio.
- It returns compacted text only and never writes to disk, overwrites inputs, saves artifacts, or mutates session history.
- Reach for `/morph-compact` or the `session_before_compact` hook to compact conversation history; reach for `fastcompact` to compact supplied locations.

## Tool Exposure Requirement

Instruction policy is necessary but not sufficient. The active agent or sub-agent must also expose the tools in its manifest. The write-capable `fast_edit` tool uses omp's `write` approval tier; `codebase_warpsearch`, `github_warpsearch`, and `fastcompact` use the `read` tier.

Registering a tool is not the same as exposing it to an agent. Recommended manifest allowlists:

- Write-capable agents: `fast_edit`, `codebase_warpsearch`, `github_warpsearch`, and `fastcompact`.
- Read-only agents: `codebase_warpsearch` and `github_warpsearch` only, since `fastcompact` sends supplied file or artifact contents to Morph.
