import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent/extensibility/extensions/types";
import {
  MORPH_COMPACT_ENABLED,
  MORPH_EDIT_ENABLED,
  MORPH_ROUTING_HINT_ENABLED,
  MORPH_ROUTING_HINT_HEADER,
  MORPH_WARPGREP_ENABLED,
  MORPH_WARPGREP_GITHUB_ENABLED,
} from "./config.js";
import { makeBeforeCompact } from "./compaction.js";
import { buildMorphSystemRoutingHint } from "./routing.js";
import { makeMorphEdit } from "./tools/morph-edit.js";
import { makeWarpgrepCodebase, makeWarpgrepGithub } from "./tools/warpgrep.js";

export default function morphPlugin(pi: ExtensionAPI): void {
  if (MORPH_EDIT_ENABLED) pi.registerTool(makeMorphEdit(pi));
  if (MORPH_WARPGREP_ENABLED) pi.registerTool(makeWarpgrepCodebase(pi));
  if (MORPH_WARPGREP_GITHUB_ENABLED) pi.registerTool(makeWarpgrepGithub(pi));

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
    pi.registerCommand("morph-compact", {
      description: "Compact the session now using Morph",
      handler: async (_args, ctx) => {
        await ctx.compact();
      },
    });
  }
}
