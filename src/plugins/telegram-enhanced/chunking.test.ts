import { describe, it, expect, vi, beforeEach } from "vitest";
import { smartChunkTelegramText } from "./chunking";
import * as telegramPlugin from "@elizaos/plugin-telegram";

// Mock the dependency
vi.mock("@elizaos/plugin-telegram", () => ({
  markdownToTelegramChunks: vi.fn(),
}));

describe("smartChunkTelegramText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return an empty array for empty input", () => {
    expect(smartChunkTelegramText("")).toEqual([]);
    expect(smartChunkTelegramText("   ")).toEqual([]);
    // @ts-expect-error - testing invalid input
    expect(smartChunkTelegramText(null)).toEqual([]);
    // @ts-expect-error - testing invalid input
    expect(smartChunkTelegramText(undefined)).toEqual([]);
  });

  it("should return chunks when markdownToTelegramChunks returns valid chunks", () => {
    const mockChunks = [
      { text: "chunk 1", html: "<b>chunk 1</b>" },
      { text: "chunk 2", html: "<i>chunk 2</i>" },
    ];

    vi.mocked(telegramPlugin.markdownToTelegramChunks).mockReturnValue(mockChunks);

    const result = smartChunkTelegramText("some text");

    expect(result).toEqual(mockChunks);
    expect(telegramPlugin.markdownToTelegramChunks).toHaveBeenCalledWith("some text", 4096 - 120);
  });

  it("should handle custom maxChars", () => {
    const mockChunks = [{ text: "chunk", html: "chunk" }];
    vi.mocked(telegramPlugin.markdownToTelegramChunks).mockReturnValue(mockChunks);

    smartChunkTelegramText("some text", 1000);

    expect(telegramPlugin.markdownToTelegramChunks).toHaveBeenCalledWith("some text", 1000);
  });

  it("should fallback to single chunk if markdownToTelegramChunks returns empty array", () => {
    vi.mocked(telegramPlugin.markdownToTelegramChunks).mockReturnValue([]);

    const result = smartChunkTelegramText("fallback text");

    expect(result).toEqual([{ text: "fallback text", html: "fallback text" }]);
  });

  it("should fallback to single chunk if markdownToTelegramChunks returns null/undefined", () => {
    // @ts-expect-error - testing invalid return from dependency
    vi.mocked(telegramPlugin.markdownToTelegramChunks).mockReturnValue(null);

    const result = smartChunkTelegramText("fallback text");

    expect(result).toEqual([{ text: "fallback text", html: "fallback text" }]);
  });

  it("should handle chunks with missing properties gracefully", () => {
    const mockChunks = [
      { text: "text only" }, // html missing
      { html: "<b>html only</b>" }, // text missing
    ];
    // @ts-expect-error - testing partial return from dependency
    vi.mocked(telegramPlugin.markdownToTelegramChunks).mockReturnValue(mockChunks);

    const result = smartChunkTelegramText("some text");

    expect(result).toEqual([
      { text: "text only", html: "" },
      { text: "", html: "<b>html only</b>" },
    ]);
  });
});
