import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { ExtensionAPI, ToolDefinition } from "@oh-my-pi/pi-coding-agent/extensibility/extensions/types";
import {
  applyMorphSettings,
  MORPH_COMPACT_ENABLED,
  MORPH_EDIT_ENABLED,
  MORPH_FASTCOMPACT_ENABLED,
  MORPH_ROUTING_HINT_ENABLED,
  MORPH_ROUTING_HINT_HEADER,
  MORPH_WARPGREP_ENABLED,
  MORPH_WARPGREP_GITHUB_ENABLED,
  PLUGIN_PACKAGE_NAME,
} from "./config.js";
import { makeBeforeCompact } from "./compaction.js";
import { buildMorphSystemRoutingHint } from "./routing.js";
import { makeFastCompact } from "./tools/fastcompact.js";
import { makeMorphEdit } from "./tools/morph-edit.js";
import { makeWarpgrepCodebase, makeWarpgrepGithub } from "./tools/warpgrep.js";

export default async function morphPlugin(pi: ExtensionAPI): Promise<void> {
  applyMorphSettings(await readMorphPluginSettings());
  const morphEditTool: ToolDefinition = makeMorphEdit(pi);
  const warpgrepCodebaseTool: ToolDefinition = makeWarpgrepCodebase(pi);
  const warpgrepGithubTool: ToolDefinition = makeWarpgrepGithub(pi);
  const fastCompactTool: ToolDefinition = makeFastCompact(pi);
  if (MORPH_EDIT_ENABLED) pi.registerTool(morphEditTool);
  if (MORPH_WARPGREP_ENABLED) pi.registerTool(warpgrepCodebaseTool);
  if (MORPH_WARPGREP_GITHUB_ENABLED) pi.registerTool(warpgrepGithubTool);
  if (MORPH_FASTCOMPACT_ENABLED) pi.registerTool(fastCompactTool);

  if (MORPH_ROUTING_HINT_ENABLED) {
    const hint = buildMorphSystemRoutingHint();
    if (hint) {
      pi.on("before_agent_start", async (event) => ({
        systemPrompt: event.systemPrompt.some((entry) =>
          entry.includes(MORPH_ROUTING_HINT_HEADER),
        )
          ? event.systemPrompt
          : [...event.systemPrompt, hint],
      }));
    }
  }

  if (MORPH_COMPACT_ENABLED) {
    pi.on("session_before_compact", makeBeforeCompact(pi));
  }
}

async function readMorphPluginSettings(): Promise<Record<string, unknown>> {
  const lockfilePath = join(homedir(), ".omp", "plugins", "omp-plugins.lock.json");
  try {
    const text = await readFile(lockfilePath, "utf8");
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) return {};
    const allSettings = parsed.settings;
    if (!isRecord(allSettings)) return {};
    const pluginSettings = allSettings[PLUGIN_PACKAGE_NAME];
    return isRecord(pluginSettings) ? pluginSettings : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
