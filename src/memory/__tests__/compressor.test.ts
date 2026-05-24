import { describe, it, expect } from "vitest";
import { compress } from "../compressor.js";
import type { ModelMessage } from "ai";

describe("compress", () => {
  it("returns identity when message count <= preserveRecent", async () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ];
    const result = await compress(messages, 5, "/tmp/test");
    expect(result.messages).toBe(messages);
    expect(result.tokensSaved).toBe(0);
  });

  it("compresses older messages into a summary", async () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "What is the flag?" },
      { role: "assistant", content: "Let me check. flag{test123} found." },
      { role: "user", content: "Great, submit it." },
    ];
    const result = await compress(messages, 1, "/tmp/test");
    expect(result.messages.length).toBe(2); // summary + 1 preserved
    expect(result.summary).toContain("Actions Taken");
    expect(result.summary).toContain("Key Findings");
    expect(result.tokensSaved).toBeGreaterThanOrEqual(0);
  });

  it("preserves flags in summary", async () => {
    const messages: ModelMessage[] = [
      { role: "assistant", content: "I found HTB{admin_access}" },
      { role: "user", content: "and also CTF{final_flag}" },
    ];
    const result = await compress(messages, 0, "/tmp/test");
    expect(result.summary).toContain("HTB{admin_access}");
    expect(result.summary).toContain("CTF{final_flag}");
  });

  it("handles empty messages gracefully", async () => {
    const result = await compress([], 1, "/tmp/test");
    expect(result.messages).toEqual([]);
    expect(result.summary).toBe("");
    expect(result.tokensSaved).toBe(0);
  });

  it("adds stats section to summary", async () => {
    const messages: ModelMessage[] = Array.from({ length: 5 }, (_, i) => ({
      role: "user" as const,
      content: `message ${i}`,
    }));
    const result = await compress(messages, 2, "/tmp/test");
    expect(result.summary).toContain("Stats");
    expect(result.summary).toContain("Older messages compressed: 3");
    expect(result.summary).toContain("Recent messages preserved: 2");
  });
});
