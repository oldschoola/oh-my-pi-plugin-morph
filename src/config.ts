export let MORPH_API_KEY = process.env.MORPH_API_KEY;

export function setMorphApiKey(apiKey: string | undefined): void {
  MORPH_API_KEY = apiKey;
}

export const MORPH_API_URL = "https://api.morphllm.com";
export const MORPH_TIMEOUT = 30_000;
export const MORPH_WARP_GREP_TIMEOUT = 60_000;
export const MORPH_COMPACT_TIMEOUT = 60_000;
export const GITHUB_RESOLVER_TIMEOUT = 10_000;
export const GITHUB_REPO_API_URL = "https://api.github.com/repos";
export const GITHUB_REPO_SEARCH_URL = "https://api.github.com/search/repositories";
export const GITHUB_REPO_SUGGESTION_LIMIT = 5;

export const EXISTING_CODE_MARKER = "// ... existing code ...";
export const MORPH_ROUTING_HINT_HEADER = "Morph plugin routing hints:";
export const PLUGIN_VERSION = "0.1.0";

const parsedCompactRatio = Number.parseFloat(
  process.env.MORPH_COMPACT_RATIO || "0.3",
);
export const COMPACT_RATIO =
  Number.isFinite(parsedCompactRatio) && parsedCompactRatio >= 0.05 && parsedCompactRatio <= 1
    ? parsedCompactRatio
    : 0.3;

export const MORPH_EDIT_ENABLED = process.env.MORPH_EDIT !== "false";
export const MORPH_WARPGREP_ENABLED = process.env.MORPH_WARPGREP !== "false";
export const MORPH_WARPGREP_GITHUB_ENABLED =
  process.env.MORPH_WARPGREP_GITHUB !== "false";
export const MORPH_COMPACT_ENABLED = process.env.MORPH_COMPACT !== "false";
export const MORPH_ROUTING_HINT_ENABLED =
  process.env.MORPH_ROUTING_HINT !== "false";
