import type { CompactResult } from "@morphllm/morphsdk";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  SessionBeforeCompactEvent,
  SessionBeforeCompactResult,
} from "@oh-my-pi/pi-coding-agent/extensibility/extensions/types";
import { throwIfAborted } from "@oh-my-pi/pi-coding-agent/tools/tool-errors";
import { COMPACT_RATIO } from "./config.js";
import { compactClient, morphReady } from "./morph-clients.js";

export function formatCompressionPercent(result: CompactResult): number {
  return Math.round(result.usage.compression_ratio * 100);
}

export function compactResultText(result: CompactResult): string {
  const output = result.output?.trim();
  if (output) return output;

  return (result.messages || [])
    .map((message) => `[${message.role}] ${message.content}`)
    .join("\n\n")
    .trim();
}

type MorphCompactMessage = { role: string; content: string };
type MessageWithRole = { role?: string; content?: unknown; toolName?: string };
type ContentPart = {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: Record<string, unknown>;
};

function serializeContentPart(part: ContentPart): string {
  switch (part.type) {
    case "text":
      return part.text || "";
    case "toolCall": {
      const inputStr = JSON.stringify(part.arguments || {}).slice(0, 500);
      return `[Tool: ${part.name || "unknown"}] ${inputStr}`;
    }
    case "thinking":
    case "redactedThinking":
    case "image":
      return "";
    default:
      return "";
  }
}

function serializeMessageContent(message: MessageWithRole): string {
  if (typeof message.content === "string") return message.content;

  if (Array.isArray(message.content)) {
    const parts = message.content
      .map((part) => serializeContentPart(part as ContentPart))
      .filter((text) => text.length > 0);

    if (message.role === "toolResult" && message.toolName && parts.length > 0) {
      return `[Tool: ${message.toolName}]\nOutput: ${parts.join("\n").slice(0, 2000)}`;
    }

    return parts.join("\n");
  }

  return "";
}

export function serializeAgentMessagesForMorph(
  messages: MessageWithRole[],
): MorphCompactMessage[] {
  return messages
    .map((message) => {
      const msg = message as MessageWithRole;
      return {
        role: msg.role || "user",
        content: serializeMessageContent(msg),
      };
    })
    .filter((message) => message.content.length > 0);
}

export function textToolResult(text: string, isError = false): AgentToolResult {
  return { content: [{ type: "text", text }], isError: isError || undefined };
}

export function makeBeforeCompact(pi: ExtensionAPI) {
  return async function beforeCompact(
    event: SessionBeforeCompactEvent,
    ctx: ExtensionContext,
  ): Promise<SessionBeforeCompactResult | undefined> {
    if (!morphReady() || !compactClient) return undefined;

    const msgs = [...event.preparation.messagesToSummarize];
    if (msgs.length === 0) return undefined;

    if (event.customInstructions?.trim()) return undefined;

    throwIfAborted(event.signal);
    const input = serializeAgentMessagesForMorph(msgs as MessageWithRole[]);
    if (input.length === 0) return undefined;

    try {
      // Morph Compact has no custom-instruction parameter. Instructed compactions
      // fall back above so omp native compaction can honor the user's focus.
      const result = await compactClient.compact({
        messages: input,
        compressionRatio: COMPACT_RATIO,
        preserveRecent: 0,
      });
      throwIfAborted(event.signal);

      const summary = compactResultText(result);
      if (!summary) return undefined;

      if (ctx.hasUI) {
        ctx.ui.notify(`Morph compacted (${formatCompressionPercent(result)}% kept)`, "info");
      }

      const compaction = {
        summary,
        firstKeptEntryId: event.preparation.firstKeptEntryId,
        tokensBefore: event.preparation.tokensBefore,
      };
      return { compaction };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pi.logger.warn("Morph compaction failed; falling back to native compaction", { error: message });
      return undefined;
    }
  };
}
