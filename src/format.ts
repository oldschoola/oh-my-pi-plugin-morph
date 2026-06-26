import { isAbsolute, resolve as resolvePath } from "node:path";
import type { WarpGrepResult } from "@morphllm/morphsdk";
import { EXISTING_CODE_MARKER } from "./config.js";

export { EXISTING_CODE_MARKER };

export function normalizeCodeEditInput(codeEdit: string): string {
  const trimmed = codeEdit.trim();
  const lines = trimmed.split("\n");

  if (lines.length < 3) return codeEdit;

  const firstLine = lines[0];
  const lastLine = lines[lines.length - 1];

  if (/^```[\w-]*$/.test(firstLine) && /^```$/.test(lastLine)) {
    return lines.slice(1, -1).join("\n");
  }

  return codeEdit;
}

export function resolveFilepath(targetFilepath: string, cwd: string): string {
  return isAbsolute(targetFilepath)
    ? targetFilepath
    : resolvePath(cwd, targetFilepath);
}

export function detectMarkerLeakage(
  originalCode: string,
  mergedCode: string,
  hasMarkers: boolean,
): boolean {
  return (
    hasMarkers &&
    !originalCode.includes(EXISTING_CODE_MARKER) &&
    mergedCode.includes(EXISTING_CODE_MARKER)
  );
}

export type TruncationCheck = {
  triggered: boolean;
  charLoss: number;
  lineLoss: number;
};

export function detectCatastrophicTruncation(
  originalCode: string,
  mergedCode: string,
  hasMarkers: boolean,
): TruncationCheck {
  const originalLineCount = originalCode.split("\n").length;
  const mergedLineCount = mergedCode.split("\n").length;
  const charLoss =
    (originalCode.length - mergedCode.length) / originalCode.length;
  const lineLoss = (originalLineCount - mergedLineCount) / originalLineCount;

  return {
    triggered: hasMarkers && charLoss > 0.6 && lineLoss > 0.5,
    charLoss,
    lineLoss,
  };
}

export const PLAUSIBLE_PATH_RE = /[/\\]|\.[\w]+$/;

export function isValidContext(ctx: { file: string; content: string }): boolean {
  return Boolean(ctx.file) && PLAUSIBLE_PATH_RE.test(ctx.file) && ctx.content.length > 0;
}

export function formatWarpGrepResult(result: WarpGrepResult): string {
  if (!result.success) {
    return `Search failed: ${result.error || "search returned no error details."}`;
  }

  if (!result.contexts || result.contexts.length === 0) {
    return "No relevant code found. Try rephrasing your search term.";
  }

  const valid = result.contexts.filter(isValidContext);

  if (valid.length === 0) {
    const sample = result.contexts.slice(0, 3).map((c) => c.file);
    return `Search returned malformed file contexts (file values: ${JSON.stringify(sample)}).
Fallback: use \`grep\` + \`read\` for local code search.`;
  }

  const parts: string[] = [];
  parts.push("Relevant context found:");

  for (const ctx of valid) {
    const rangeStr =
      !ctx.lines || ctx.lines === "*"
        ? "*"
        : ctx.lines.map(([s, e]) => `${s}-${e}`).join(",");
    parts.push(`- ${ctx.file}:${rangeStr}`);
  }

  parts.push("\nFile contents:\n");

  for (const ctx of valid) {
    const rangeStr =
      !ctx.lines || ctx.lines === "*"
        ? ""
        : ` lines="${ctx.lines.map(([s, e]) => `${s}-${e}`).join(",")}"`;
    parts.push(`<file path="${ctx.file}"${rangeStr}>`);
    parts.push(ctx.content);
    parts.push("</file>\n");
  }

  return parts.join("\n");
}
