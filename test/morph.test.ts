import { beforeEach, describe, expect, test } from "bun:test";
import type { CompactResult } from "@morphllm/morphsdk";
import type {
  ExtensionAPI,
  SessionBeforeCompactEvent,
  ToolDefinition,
} from "@oh-my-pi/pi-coding-agent/extensibility/extensions/types";
import * as zod from "zod/v4";
import { COMPACT_RATIO, EXISTING_CODE_MARKER, MORPH_ROUTING_HINT_HEADER, setMorphApiKey } from "../src/config.js";
import { compactClient, initMorphClients } from "../src/morph-clients.js";
import { makeBeforeCompact, serializeAgentMessagesForMorph } from "../src/compaction.js";
import {
  detectCatastrophicTruncation,
  detectMarkerLeakage,
  formatWarpGrepResult,
  normalizeCodeEditInput,
  resolveFilepath,
} from "../src/format.js";
import { resolvePublicRepoLocator } from "../src/github.js";
import morphPlugin from "../src/index.js";

function fakePi() {
  const tools: ToolDefinition[] = [];
  const handlers: Record<string, Function[]> = {};
  const commands: Record<string, unknown> = {};
  const pi = {
    zod,
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    registerTool(tool: ToolDefinition) {
      tools.push(tool);
    },
    on(event: string, handler: Function) {
      handlers[event] ??= [];
      handlers[event]!.push(handler);
    },
    registerCommand(name: string, options: unknown) {
      commands[name] = options;
    },
  } as unknown as ExtensionAPI;

  return { pi, tools, handlers, commands };
}

function textMsg(role: string, content: string) {
  return { role, content, timestamp: 0 };
}

function compactEvent(messagesToSummarize: unknown[], customInstructions?: string): SessionBeforeCompactEvent {
  return {
    type: "session_before_compact",
    preparation: {
      firstKeptEntryId: "e1",
      messagesToSummarize,
      turnPrefixMessages: [],
      recentMessages: [],
      isSplitTurn: false,
      tokensBefore: 1234,
      fileOps: { readFiles: [], modifiedFiles: [] },
      settings: {
        enabled: true,
        reserveTokens: 0,
        keepRecentTokens: 0,
      },
    },
    branchEntries: [],
    signal: new AbortController().signal,
    customInstructions,
  } as unknown as SessionBeforeCompactEvent;
}

beforeEach(() => {
  setMorphApiKey(undefined);
  initMorphClients();
});

describe("format helpers", () => {
  test("normalizes a single outer markdown fence", () => {
    expect(normalizeCodeEditInput("```typescript\nconst x = 1;\n```")).toBe("const x = 1;");
    expect(normalizeCodeEditInput("line1\nline2")).toBe("line1\nline2");
  });

  test("detects marker leakage and destructive truncation", () => {
    expect(detectMarkerLeakage("const x = 1", `${EXISTING_CODE_MARKER}\nconst x = 1`, true)).toBe(true);
    expect(detectMarkerLeakage(`${EXISTING_CODE_MARKER}\nconst x = 1`, `${EXISTING_CODE_MARKER}\nconst x = 2`, true)).toBe(false);

    const originalCode = "x".repeat(900) + "\n".repeat(100);
    const mergedCode = "x".repeat(341) + "\n".repeat(49);
    expect(detectCatastrophicTruncation(originalCode, mergedCode, true).triggered).toBe(true);
    expect(detectCatastrophicTruncation(originalCode, mergedCode, false).triggered).toBe(false);
  });

  test("formats WarpGrep results and malformed contexts", () => {
    expect(formatWarpGrepResult({ success: false, error: undefined })).toBe("Search failed: search returned no error details.");
    expect(formatWarpGrepResult({ success: true, contexts: [{ file: "src/auth.ts", content: "code", lines: [[1, 5]] }] })).toContain('<file path="src/auth.ts" lines="1-5">');
    expect(formatWarpGrepResult({ success: true, contexts: [{ file: "noextension", content: "code", lines: "*" }] })).toContain("malformed");
  });

  test("resolves file paths with source-compatible absolute path behavior", () => {
    expect(resolveFilepath("src/a.ts", "/repo")).toBe("/repo/src/a.ts");
    expect(resolveFilepath("/tmp/a.ts", "/repo")).toBe("/tmp/a.ts");
  });
});

describe("GitHub locator", () => {
  test("validates exactly one public repo locator", () => {
    expect(resolvePublicRepoLocator({ search_term: "auth", owner_repo: "owner/repo" })).toEqual({ repo: "owner/repo" });
    expect(resolvePublicRepoLocator({ search_term: "auth", github_url: "https://github.com/owner/repo.git" })).toEqual({ repo: "owner/repo" });
    expect("error" in resolvePublicRepoLocator({ search_term: "auth" })).toBe(true);
    expect("error" in resolvePublicRepoLocator({ search_term: "auth", owner_repo: "bad", github_url: "https://github.com/a/b" })).toBe(true);
  });
});

describe("compaction bridge", () => {
  test("serializes pi-ai message shapes for Morph", () => {
    const result = serializeAgentMessagesForMorph([
      textMsg("user", "hi"),
      { role: "assistant", content: [{ type: "text", text: "yo" }, { type: "thinking", thinking: "skip" }, { type: "toolCall", name: "read", arguments: { path: "a.ts" } }] },
      { role: "toolResult", toolName: "read", content: [{ type: "text", text: "file output" }] },
      { role: "assistant", content: [{ type: "image", data: "x", mimeType: "image/png" }] },
    ]);

    expect(result).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "yo\n[Tool: read] {\"path\":\"a.ts\"}" },
      { role: "toolResult", content: "[Tool: read]\nOutput: file output" },
    ]);
  });

  test("returns Morph compaction result and falls back on empty/error/unset", async () => {
    setMorphApiKey("sk-test");
    initMorphClients();
    expect(compactClient).not.toBeNull();
    const originalCompact = compactClient!.compact.bind(compactClient!);
    compactClient!.compact = async (input) => {
      expect(input.compressionRatio).toBe(COMPACT_RATIO);
      return {
        id: "c1",
        output: "SUMMARY",
        messages: [],
        usage: { input_tokens: 10, output_tokens: 3, compression_ratio: 0.3, processing_time_ms: 5 },
        model: "morph-compact",
      } satisfies CompactResult;
    };

    const { pi } = fakePi();
    const ctx = { hasUI: true, ui: { notify() {} } };
    const handler = makeBeforeCompact(pi);
    await expect(handler(compactEvent([textMsg("user", "hi"), textMsg("assistant", "yo")]), ctx as never)).resolves.toEqual({
      compaction: { summary: "SUMMARY", firstKeptEntryId: "e1", tokensBefore: 1234 },
    });
    await expect(handler(compactEvent([]), ctx as never)).resolves.toBeUndefined();
    await expect(handler(compactEvent([textMsg("user", "hi")], "focus on files"), ctx as never)).resolves.toBeUndefined();

    compactClient!.compact = async () => {
      throw new Error("boom");
    };
    await expect(handler(compactEvent([textMsg("user", "hi")]), ctx as never)).resolves.toBeUndefined();

    compactClient!.compact = originalCompact;
    setMorphApiKey(undefined);
    initMorphClients();
    await expect(handler(compactEvent([textMsg("user", "hi")]), ctx as never)).resolves.toBeUndefined();
  });
});

describe("extension wiring", () => {
  test("registers tools, routing hook, compaction hook, and command", async () => {
    const { pi, tools, handlers, commands } = fakePi();
    morphPlugin(pi);

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "morph_edit",
      "warpgrep_codebase_search",
      "warpgrep_github_search",
    ]);
    expect(handlers.before_agent_start).toHaveLength(1);
    expect(handlers.session_before_compact).toHaveLength(1);
    expect(commands["morph-compact"]).toBeTruthy();

    const result = await handlers.before_agent_start![0]!({
      type: "before_agent_start",
      prompt: "hi",
      systemPrompt: [],
    }, {});
    expect(result.systemPrompt.join("\n")).toContain(MORPH_ROUTING_HINT_HEADER);

    const idempotent = await handlers.before_agent_start![0]!({
      type: "before_agent_start",
      prompt: "hi",
      systemPrompt: result.systemPrompt,
    }, {});
    expect(idempotent.systemPrompt).toHaveLength(result.systemPrompt.length);
  });
});
