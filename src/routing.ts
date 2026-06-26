import {
  MORPH_API_KEY,
  MORPH_EDIT_ENABLED,
  MORPH_ROUTING_HINT_HEADER,
  MORPH_WARPGREP_ENABLED,
  MORPH_WARPGREP_GITHUB_ENABLED,
} from "./config.js";

function appendRuntimeNotes(description: string, notes: string[]): string {
  if (notes.length === 0) return description;

  return `${description}\n\nRuntime notes:\n${notes.map((note) => `- ${note}`).join("\n")}`;
}

export function buildToolNote(toolID: string): string {
  const notes: string[] = [];

  switch (toolID) {
    case "morph_edit":
      notes.push("Relative paths resolve from the active session directory.");
      break;
    case "warpgrep_codebase_search":
      notes.push("Searches the current project worktree, not just the immediate cwd.");
      break;
    case "warpgrep_github_search":
      notes.push("Use this for public GitHub source questions, not the current checked-out repo.");
      break;
    default:
      break;
  }

  if (notes.length > 0 && !MORPH_API_KEY) {
    notes.push("Currently unavailable until MORPH_API_KEY is configured.");
  }

  return appendRuntimeNotes("", notes).trim();
}

export function withToolNote(description: string, toolID: string): string {
  const note = buildToolNote(toolID);
  return note ? `${description}\n\n${note}` : description;
}

export function buildMorphSystemRoutingHint(): string | null {
  if (!MORPH_API_KEY) {
    return [
      MORPH_ROUTING_HINT_HEADER,
      "- Morph remote tools are currently unavailable because MORPH_API_KEY is not configured.",
      "- Use native edit/write/grep tools until Morph credentials are configured.",
    ].join("\n");
  }

  const lines = [MORPH_ROUTING_HINT_HEADER];

  if (MORPH_EDIT_ENABLED) {
    lines.push(
      "- Prefer morph_edit for large or scattered edits inside existing files.",
    );
    lines.push("- Use native edit for small exact replacements.");
    lines.push("- Use write for brand new files.");
  }

  if (MORPH_WARPGREP_ENABLED) {
    lines.push(
      "- Use warpgrep_codebase_search for exploratory local codebase questions.",
    );
  }

  if (MORPH_WARPGREP_GITHUB_ENABLED) {
    lines.push(
      "- Use warpgrep_github_search for public GitHub source questions.",
    );
  }

  return lines.length > 1 ? lines.join("\n") : null;
}
