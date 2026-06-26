# Morph Tool Selection Policy

This reference mirrors the always-on routing policy embedded by the omp extension. The active extension injects a concise version automatically unless `MORPH_ROUTING_HINT=false`.

## Code Editing Tool Selection

Use the right editing tool for the job. `morph_edit` is not the default for all edits, but it should be preferred for edits where partial-snippet merging is faster or more reliable than exact-string replacement.

### First-Action Policy

| Editing task | First tool | Why |
|---|---|---|
| Large file edits (300+ lines) | `morph_edit` | Avoids fragile exact-string matching |
| Multiple scattered changes in one file | `morph_edit` | Batch edits efficiently |
| Whitespace-sensitive edits | `morph_edit` | More forgiving with formatting/context |
| Complex refactors inside an existing file | `morph_edit` | Better partial-file merge behavior |
| Small exact replacement | native `edit` | Faster, local, no API call |
| Single-line rename/fix | native `edit` | Simpler exact replacement |
| New file creation | native `write` | `morph_edit` is for edits and guarded file creation only |
| Codebase search/exploration | `warpgrep_codebase_search` | Multi-turn agentic search with ripgrep |
| Public GitHub repo exploration | `warpgrep_github_search` | Grounded context from indexed public repos |
| Exact keyword/function name search | native search | Direct lookup, no API call |

## When NOT to Use `morph_edit`

- The change is a small exact replacement.
- You are creating a brand new file from scratch.
- `MORPH_API_KEY` is not configured; fall back to native tools.
- The change needs full-file replacement; use native `write`.

## WarpGrep Usage

Use `warpgrep_codebase_search` for natural-language exploratory searches:

- "Find the authentication flow"
- "How does error handling work in the API layer?"
- "Where is the database connection configured?"

Do not use it for exact keyword lookups such as function names, variable names, or error strings.

## Public Repo Context Usage

Prefer `warpgrep_github_search` over web search or docs fetching when the question is about how an open-source library or SDK works internally. Provide exactly one repository locator:

- `owner_repo` for values like `owner/repo`
- `github_url` for full GitHub URLs

Use `warpgrep_codebase_search` for the checked-out local repo.

## Fallback Policy

- If `morph_edit` fails due to API error or timeout, use native `edit`.
- If the change requires replacing the entire file, use native `write`.
- If `warpgrep_codebase_search` fails, fall back to native search and read tools.
- If `warpgrep_github_search` fails, clone the repo only if the task justifies local setup cost.

## Tool Exposure Requirement

Instruction policy is necessary but not sufficient. The active agent or sub-agent must also expose the tools in its manifest. The write-capable `morph_edit` tool uses omp's `write` approval tier; both WarpGrep tools use the `read` tier.
