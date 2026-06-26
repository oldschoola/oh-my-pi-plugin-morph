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

type BoundedBuffer = { out: string; limit: number };

function bufferFull(buf: BoundedBuffer): boolean {
  return buf.out.length >= buf.limit;
}

function appendBounded(buf: BoundedBuffer, text: string): void {
  if (buf.out.length >= buf.limit) return;
  const remaining = buf.limit - buf.out.length;
  buf.out += text.length > remaining ? text.slice(0, remaining) : text;
}

// Serialize a JSON value into `buf`, stopping once the output budget is spent.
// Result is byte-identical to JSON.stringify(value).slice(0, limit) for inputs
// that fit, but large values are never fully stringified: strings are sliced
// before escaping (escaped length >= raw length, so `remaining` raw chars always
// cover the remaining budget) and the walk halts as soon as the budget is full.
function appendBoundedJson(buf: BoundedBuffer, value: unknown): void {
  if (bufferFull(buf)) return;

  if (value === null || typeof value !== "object") {
    if (typeof value === "string") {
      const remaining = buf.limit - buf.out.length;
      const slice = value.length > remaining ? value.slice(0, remaining) : value;
      appendBounded(buf, JSON.stringify(slice));
      return;
    }
    if (value === undefined || typeof value === "function" || typeof value === "symbol") {
      appendBounded(buf, "null");
      return;
    }
    appendBounded(buf, JSON.stringify(value as number | boolean));
    return;
  }

  if (Array.isArray(value)) {
    appendBounded(buf, "[");
    for (let i = 0; i < value.length; i++) {
      if (bufferFull(buf)) break;
      if (i > 0) appendBounded(buf, ",");
      const el = value[i];
      if (el === undefined || typeof el === "function" || typeof el === "symbol") {
        appendBounded(buf, "null");
      } else {
        appendBoundedJson(buf, el);
      }
    }
    appendBounded(buf, "]");
    return;
  }

  appendBounded(buf, "{");
  let first = true;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (bufferFull(buf)) break;
    if (v === undefined || typeof v === "function" || typeof v === "symbol") continue;
    if (!first) appendBounded(buf, ",");
    first = false;
    appendBounded(buf, JSON.stringify(key));
    appendBounded(buf, ":");
    appendBoundedJson(buf, v);
  }
  appendBounded(buf, "}");
}

function boundedJsonStringify(value: unknown, limit: number): string {
  const buf: BoundedBuffer = { out: "", limit };
  appendBoundedJson(buf, value);
  return buf.out;
}

function serializeContentPart(part: ContentPart): string {
  switch (part.type) {
    case "text":
      return part.text || "";
    case "toolCall": {
      const inputStr = boundedJsonStringify(part.arguments || {}, 500);
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
  if (!Array.isArray(message.content)) return "";

  // Tool results are capped at 2000 chars. Append non-empty serialized parts
  // straight into a bounded buffer and stop once it is full, so a large
  // multi-part tool result is never fully materialized before the cap applies.
  if (message.role === "toolResult" && message.toolName) {
    const buf: BoundedBuffer = { out: "", limit: 2000 };
    let appended = false;
    for (const part of message.content) {
      if (bufferFull(buf)) break;
      const text = serializeContentPart(part as ContentPart);
      if (text.length === 0) continue;
      if (appended) appendBounded(buf, "\n");
      appendBounded(buf, text);
      appended = true;
    }
    if (!appended) return "";
    return `[Tool: ${message.toolName}]\nOutput: ${buf.out}`;
  }

  const parts = message.content
    .map((part) => serializeContentPart(part as ContentPart))
    .filter((text) => text.length > 0);
  return parts.join("\n");
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
      if (event.signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      pi.logger.warn("Morph compaction failed; falling back to native compaction", { error: message });
      return undefined;
    }
  };
}
